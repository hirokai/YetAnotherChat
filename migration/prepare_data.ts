/// <reference path="../common/types.d.ts" />

import * as model from '../server/model';
const path = require('path');
const _ = require('lodash');
const sqlite3 = require('sqlite3');
const db = new sqlite3.Database(path.join(__dirname, '../server/private/db.sqlite3'));
import * as mail_algo from '../server/mail_algo';
import * as user_info from '../server/private/user_info';

function mk_default_user() {
    db.serialize(() => {
        const { username, email, fullname, password } = user_info.test_myself;
        (async () => {
            const r = await model.register_user({ username, password, email, fullname, source: 'preset' });
            console.log(r);
        })();
    });
}

function _import_from_slack() {
    const messages_stub = require("../private/slack_data.json");
    const user_list = require('../private/user_list');
    db.serialize(() => {
        _.map(messages_stub, (obj) => {
            obj.ts = Math.floor(obj.ts * 1000);
            const user_id = user_list.user_list[obj.user] || obj.user;
            db.run('insert into comments (comment,timestamp,user_id) values (?,?,?);', obj.text, obj.ts, user_id);
        });
    });
}

function _import_from_gmail() {
    const user_list = require('../private/user_list');
    _.map(user_list.gmail_list, (from_user_email, from_user) => {
        model.get_mail_from(from_user_email).then((list) => {
            console.log('' + list.length + ' emails from: ' + from_user);
            _.map(list, (m) => {
                const ts = new Date(m.date).getTime();
                const url = 'https://mail.google.com/mail/u/0/#inbox/' + m.id;
                db.run('insert into comments (comment,timestamp,user_id,original_url) values (?,?,?,?);', m.text, ts, from_user, url);
                // console.log();
            });
        });
        model.get_mail_to(from_user_email).then((list) => {
            console.log('' + list.length + ' emails to: ' + from_user);
            _.map(list, (m) => {
                const ts = new Date(m.date).getTime();
                const url = 'https://mail.google.com/mail/u/0/#inbox/' + m.id;
                db.run('insert into comments (comment,timestamp,user_id,sent_to,original_url) values (?,?,?,?,?);', m.text, ts, 'myself', from_user, url);
                // console.log();
            });
        });
    });
}

mk_default_user();
