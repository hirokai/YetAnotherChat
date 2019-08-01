const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const sqlite3 = require('sqlite3');
const db = new sqlite3.Database(path.join(__dirname, '../private/db.sqlite3'));
const glob = require('glob');
const model = require('../model')

glob.glob('mailgun/*.json', (err, files) => {
    _.map(files, (f) => {
        const s = fs.readFileSync(f, 'utf8');
        const data = model.parseMailgunWebhook(JSON.parse(s));
        model.post_comment(data.user_id, data.session_id, data.timestamp, data.comment, data.original_url).then(() => {

        });
    })
});



