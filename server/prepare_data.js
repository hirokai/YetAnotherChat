const path = require('path');
const _ = require('lodash');
const messages_stub = require("./private/slack_data.json");
const sqlite3 = require('sqlite3');
const db = new sqlite3.Database(path.join(__dirname, './private/db.sqlite3'));
const model = require('./model');
const user_list = require('./private/user_list');

function initialize() {
    db.serialize(() => {
        db.run('drop table if exists comments;');
        db.run('create table comments (comment text, timestamp integer not null, user_id text not null, sent_to text, url_original text);');
    });
}

function import_from_slack() {
    db.serialize(() => {
        _.map(messages_stub, (obj) => {
            obj.ts = Math.floor(obj.ts * 1000);
            const user_id = user_list.user_list[obj.user] || obj.user;
            db.run('insert into comments (comment,timestamp,user_id) values (?,?,?);', obj.text, obj.ts, user_id);
        });
    });
}

function import_from_gmail() {
    _.map(user_list.gmail_list, (from_user_email, from_user) => {
        model.get_mail_from(from_user_email).then((list) => {
            console.log('' + list.length + ' emails from: ' + from_user);
            _.map(list, (m) => {
                const ts = new Date(m.date).getTime();
                const url = 'https://mail.google.com/mail/u/0/#inbox/' + m.id;
                db.run('insert into comments (comment,timestamp,user_id,url_original) values (?,?,?,?);', m.text, ts, from_user, url);
                // console.log();
            });
        });
        model.get_mail_to(from_user_email).then((list) => {
            console.log('' + list.length + ' emails to: ' + from_user);
            _.map(list, (m) => {
                const ts = new Date(m.date).getTime();
                const url = 'https://mail.google.com/mail/u/0/#inbox/' + m.id;
                db.run('insert into comments (comment,timestamp,user_id,sent_to,url_original) values (?,?,?,?,?);', m.text, ts, 'myself', from_user, url);
                // console.log();
            });
        });
    });
}

initialize();
import_from_gmail();

