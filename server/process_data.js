const path = require('path');
const _ = require('lodash');
const messages_stub = require("./private/slack_data.json");
const sqlite3 = require('sqlite3');
const db = new sqlite3.Database(path.join(__dirname, './private/db.sqlite3'));

db.serialize(() => {
    _.map(messages_stub, (obj) => {
        obj.ts = Math.floor(obj.ts * 1000);
        db.run('insert into comments (comment,timestamp,user_id) values (?,?,?);', obj.text, obj.ts, obj.user);
    });
});
