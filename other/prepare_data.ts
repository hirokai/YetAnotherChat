/// <reference path="../types.d.ts" />

import * as model from '../model';
const path = require('path');
const _ = require('lodash');
const sqlite3 = require('sqlite3');
const db = new sqlite3.Database(path.join(__dirname, '../private/db.sqlite3'));
const mail_algo = require('../mail_algo');
// const user_info: PrivateUserInfo = require('../private/user_info');

function initialize() {
    db.serialize(() => {
        db.run('drop table if exists users;');
        db.run('create table users (id text not null unique, name text not null, fullname text,password text);');
        db.run('drop table if exists user_emails;');
        db.run('create table user_emails (user_id text not null, email text not null);');
        db.run('drop table if exists comments;');
        db.run('create table comments (id text not null unique, comment text, timestamp integer not null, user_id text not null, session_id text, original_url text, sent_to text, source text);');
        db.run('drop table if exists sessions;')
        db.run('create table sessions (id text not null unique, timestamp integer not null, name text not null);');
        db.run('drop table if exists session_current_members;')
        db.run('create table session_current_members (session_id text, user_id text not null, unique(session_id,user_id));');
        db.run('drop table if exists session_events;')
        db.run('create table session_events (id text not null, session_id text, user_id text not null, timestamp integer, action text);');
        db.run('drop table if exists user_connections;')
        db.run('create table user_connections (user_id text not null, socket_id text,timestamp integer not null);');
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

initialize();
    // import_from_gmail();
