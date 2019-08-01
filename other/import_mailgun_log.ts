/// <reference path="../types.d.ts" />

const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const sqlite3 = require('sqlite3');
const db = new sqlite3.Database(path.join(__dirname, '../private/db.sqlite3'));
const glob = require('glob');
const model = require('../model')

glob.glob('mailgun/*.json', (err, files) => {
    const datas = _.map(files, (f) => {
        const s = fs.readFileSync(f, 'utf8');
        return model.parseMailgunWebhook(JSON.parse(s));
    });
    const sessions: string[][] = model.find_email_sessions(datas);
    console.log(sessions);
    _.map(_.zip(datas, sessions), ([data, [session_id, session_name]]) => {
        model.create_session_with_id(session_id, session_name, []).then(() => {
            model.post_comment(data.user_id, session_id, data.timestamp, data.comment, data.original_url).then((id) => {
                console.log("Added " + id + " in session " + session_id);
            }).catch((err) => {
                console.log(err);
            });
        });

    });
});



