const path = require('path');
const _ = require('lodash');
const sqlite3 = require('sqlite3');
const db = new sqlite3.Database(path.join(__dirname, '../server/private/db.sqlite3'));

function migrate_add_table_public_keys() {
    db.serialize(() => {
        db.run('drop table if exists private_key_temporary;');
        db.run('create table private_key_temporary (timestamp integer not null, user_id text not null, key text unique not null);');
        db.run('alter table comments add column comment_blob blob;');
        db.run('alter table files add column kind text;');
    });
}

migrate_add_table_public_keys();
