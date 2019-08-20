const path = require('path');
const _ = require('lodash');
const sqlite3 = require('sqlite3');
const db = new sqlite3.Database(path.join(__dirname, '../server/private/db.sqlite3'));

function migrate_add_table_public_keys() {
    db.serialize(() => {
        db.run('alter table comments add column encrypt_group text;');
    });
}

migrate_add_table_public_keys();
