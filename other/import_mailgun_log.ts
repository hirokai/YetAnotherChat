/// <reference path="../types.d.ts" />
/// <reference path="../model.ts" />
module import_mailgun {

    const fs = require('fs');
    const glob = require('glob');
    const model = require('../model')
    const mail_algo = require('../mail_algo');
    const _ = require('lodash');
    const user_info: PrivateUserInfo = require('../private/user_info');

    glob.glob('mailgun/*.json', async (err, files) => {
        // files = files.slice(0, 1);
        const datas: MailgunParsed[][] = _.map(files, (f) => {
            const s = fs.readFileSync(f, 'utf8');
            return model.parseMailgunWebhookThread(JSON.parse(s));
        });

        const user_table: UserTableFromEmail = mail_algo.mkUserTableFromEmails(_.flatten(datas));


        //https://gist.github.com/jcsrb/c9fd5d2928b4341b120d6db375679095
        const mapValuesAsync = (obj, asyncFn) => {
            const keys = Object.keys(obj);
            const promises = keys.map(k => {
                return asyncFn(obj[k]).then(newValue => {
                    return { key: k, value: newValue };
                });
            });
            return Promise.all(promises).then(values => {
                const newObj = {};
                values.forEach(v => {
                    newObj[v.key] = v.value;
                });
                return newObj;
            });
        }


        var user_table_with_id: UserTableFromEmail = await mapValuesAsync(user_table, async ({ name, email, names }) => {
            const name1 = name ? name : email;
            const { user_id } = await model.register_user(name1, email);
            console.log(user_id);
            return { name, email, names, id: user_id };
        });

        const groups: MailGroup[] = mail_algo.group_email_sessions(datas);

        _.map(groups, ({ session_id, session_name, data }: MailGroup) => {
            (async () => {
                await model.create_session_with_id(session_id, session_name, []);
                const data_sorted = _.sortBy(data, (d: MailgunParsed) => { return d.timestamp < 0 ? new Date(2100, 1, 1).valueOf() : d.timestamp });
                data_sorted.forEach((mail: MailgunParsed) => {
                    (async () => {
                        const email = mail_algo.parse_email_address(mail.from).email;
                        const user_id: string = (user_table_with_id[email] || { id: '' }).id;
                        console.log('user_id', user_id, user_table_with_id[email]);
                        const data2: CommentTyp = await model.post_comment(user_id, session_id, mail.timestamp, mail.comment, mail.message_id, "", 'email');
                    })().catch((err) => console.log(err));
                });
                await model.join_session(session_id, user_info.test_myself, data_sorted[0].timestamp);
            })().catch((err) => {
                console.log(err);
            });
        });
    });
}