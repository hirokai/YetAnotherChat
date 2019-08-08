const path = require('path');
const _ = require('lodash');
const sqlite3 = require('sqlite3');
const db = new sqlite3.Database(path.join(__dirname, '../server/private/db.sqlite3'));

function migrate_add_column_users() {
    db.serialize(() => {
        db.run('alter table users add column source text;')
    });
}

migrate_add_column_users();
