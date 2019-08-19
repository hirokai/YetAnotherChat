const path = require('path');
const _ = require('lodash');
const sqlite3 = require('sqlite3');
const db = new sqlite3.Database(path.join(__dirname, '../server/private/db.sqlite3'));

function migrate_add_table_public_keys() {
    db.serialize(() => {
        db.run('drop table if exists public_keys;');
        db.run('create table public_keys (timestamp integer, user_id text, for_user text, key text);');
        db.run('alter table comments add column encrypt text;');
    });
}

migrate_add_table_public_keys();
