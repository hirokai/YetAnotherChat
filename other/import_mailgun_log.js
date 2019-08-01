const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const sqlite3 = require('sqlite3');
const db = new sqlite3.Database(path.join(__dirname, '../private/db.sqlite3'));
const user_info_private = require('../private/user_info');
const glob = require('glob');

glob.glob('mailgun/*.json', (err, files) => {
    _.map(files, (f) => {
        const s = fs.readFileSync(f, 'utf8');
        const obj = JSON.parse(s);
        const ts = new Date(obj['Date']).getTime();
        const comment = obj['body-plain'];
        const id = obj['Message-Id'];
        const user_id = user_info_private.find_user(obj['From']);
        db.run('insert into comments (timestamp,user_id,session_id,comment,url_original) values (?,?,?,?,?);', ts, user_id, 'N3PheJEZN', comment, id);
    })
});



