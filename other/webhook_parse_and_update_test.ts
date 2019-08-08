import { update_db_on_mailgun_webhook } from '../server/mail_algo';
import * as fs from 'fs';

const path = require('path');
const sqlite3 = require('sqlite3');
const db = new sqlite3.Database(path.join(__dirname, '../server/private/db.sqlite3'));

const filename = process.argv[2];

fs.readFile(filename, 'utf8', (err, s) => {
    if (!err) {
        const body: object = JSON.parse(s);
        // console.log(body);
        update_db_on_mailgun_webhook({ body, db, myio: null }).then((res) => {
            console.log(res);
        }).catch((e) => {
            console.log(e);
        })
    } else {
        console.log('Loading failed', err);
    }
});
