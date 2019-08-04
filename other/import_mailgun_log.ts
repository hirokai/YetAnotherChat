/// <reference path="../types.d.ts" />
{

    const fs = require('fs');
    const glob = require('glob');
    const model = require('../model')
    const mail_algo = require('../mail_algo');
    const _ = require('lodash');
    const user_info: PrivateUserInfo = require('../private/user_info');

    glob.glob('mailgun/*.json', (err, files) => {
        const datas: MailgunParsed[][] = _.map(files, (f) => {
            const s = fs.readFileSync(f, 'utf8');
            return model.parseMailgunWebhookThread(JSON.parse(s));
        });
        const sessions: string[][] = mail_algo.group_email_sessions(datas);
        console.log(sessions);
        console.log(datas.length, sessions.length)
        _.map(_.zip(datas, sessions), ([data1, [session_id, session_name]]) => {
            (async () => {
                const data = <MailgunParsed>data1;
                await model.create_session_with_id(session_id, session_name, []);
                const data2: CommentTyp = await model.post_comment(data.user_id, session_id, data.timestamp, data.comment, data.message_id, "", 'email');
                await model.join_session(session_id, user_info.test_myself);
                console.log("Added " + data2.id + ":" + data2.user_id + ' ' + data2.original_url + " in session " + session_id);
            })();
        });

    });
}