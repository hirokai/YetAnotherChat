const path = require('path');
const _ = require('lodash');
const sqlite3 = require('sqlite3');
const db = new sqlite3.Database(path.join(__dirname, '../server/private/db.sqlite3'));

function migrate_add_table_public_keys() {
    db.serialize(() => {
        db.run('drop table if exists user_configs;');
        db.run('create table user_configs (timestamp integer not null, user_id text not null, config_name text not null, config_value text not null);');
    });
}

migrate_add_table_public_keys();
