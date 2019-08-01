/// <reference path="../types.d.ts" />
{

    const fs = require('fs');
    const path = require('path');
    const sqlite3 = require('sqlite3');
    const db = new sqlite3.Database(path.join(__dirname, '../private/db.sqlite3'));
    const glob = require('glob');
    const model = require('../model')
    const mail_algo = require('../mail_algo');
    const _ = require('lodash');
    const shortid = require('shortid').generate;

    glob.glob('mailgun/*.json', (err, files) => {
        const datas = _.map(files, (f) => {
            const s = fs.readFileSync(f, 'utf8');
            return model.parseMailgunWebhook(JSON.parse(s));
        });
        const sessions: string[][] = mail_algo.group_email_sessions(datas);
        console.log(sessions);
        _.map(_.zip(datas, sessions), ([data1, [session_id, session_name]]) => {
            const data = <MailgunParsed>data1;
            model.create_session_with_id(session_id, session_name, []).then(() => {
                model.post_comment(data.user_id, session_id, data.timestamp, data.comment, data.message_id).then((id) => {
                    console.log("Added " + id + " in session " + session_id);
                }).catch((err) => {
                    console.log(err);
                });
            });

        });
    });

}