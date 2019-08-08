const path = require('path');
const _ = require('lodash');
const sqlite3 = require('sqlite3');
const db = new sqlite3.Database(path.join(__dirname, '../server/private/db.sqlite3'));

function migrate_add_files_table() {
    db.serialize(() => {
        db.run('drop table if exists files;')
        db.run('create table files (id text not null, user_id text not null, path text not null,timestamp integer not null);');
    });
}

migrate_add_files_table();
