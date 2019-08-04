/// <reference path="../types.d.ts" />
{

    const fs = require('fs');
    const glob = require('glob');
    const model = require('../model')
    const mail_algo = require('../mail_algo');
    const _ = require('lodash');
    const user_info: PrivateUserInfo = require('../private/user_info');

    glob.glob('mailgun/*.json', (err, files) => {
        // files = files.slice(0, 1);
        const datas: MailgunParsed[][] = _.map(files, (f) => {
            const s = fs.readFileSync(f, 'utf8');
            return model.parseMailgunWebhookThread(JSON.parse(s));
        });

        const groups: MailGroup[] = mail_algo.group_email_sessions(datas);

        console.log('group_email_sessions result', groups);

        _.map(groups, ({ session_id, session_name, data }: MailGroup) => {
            (async () => {
                await model.create_session_with_id(session_id, session_name, []);
                const data_sorted = _.sortBy(data, (d: MailgunParsed) => { return d.timestamp < 0 ? new Date(2100, 1, 1).valueOf() : d.timestamp });
                data_sorted.forEach((mail: MailgunParsed) => {
                    (async () => {
                        const obj = _.cloneDeep(mail);
                        delete obj['comment'];
                        delete obj['body'];
                        // console.log(obj);
                        const data2: CommentTyp = await model.post_comment(mail.user_id, session_id, mail.timestamp, mail.comment, mail.message_id, "", 'email');
                    })().catch((err) => console.log(err));
                });
                await model.join_session(session_id, user_info.test_myself, data_sorted[0].timestamp);
            })().catch((err) => {
                console.log(err);
            });
        });

    });
}