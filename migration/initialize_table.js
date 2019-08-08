
const path = require('path');
const sqlite3 = require('sqlite3');
const db = new sqlite3.Database(path.join(__dirname, '../server/private/db.sqlite3'));

function initialize() {
    db.serialize(() => {
        db.run('drop table if exists users;');
        db.run('create table users (id text not null unique, name text not null, fullname text,password text,timestamp integer not null);');

        db.run('drop table if exists user_emails;');
        db.run('create table user_emails (user_id text not null, email text not null);');

        db.run('drop table if exists comments;');
        db.run('create table comments (id text not null unique, comment text, timestamp integer not null, user_id text not null, session_id text, original_url text, sent_to text, source text);');

        db.run('drop table if exists sessions;');
        db.run('create table sessions (id text not null unique, timestamp integer not null, name text not null);');

        db.run('drop table if exists session_current_members;')
        db.run('create table session_current_members (session_id text, user_id text not null, source text, unique(session_id,user_id));');

        db.run('drop table if exists session_events;')
        db.run('create table session_events (id text not null, session_id text, user_id text not null, timestamp integer, action text);');

        db.run('drop table if exists user_connections;')
        db.run('create table user_connections (user_id text not null, socket_id text,timestamp integer not null);');
    });
}

initialize();
