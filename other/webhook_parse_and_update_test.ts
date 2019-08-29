import { update_db_on_mailgun_webhook } from '../server/model/mail_algo';
import * as fs from 'fs';

import { db, connectToDB } from '../server/model/utils'

const filename = process.argv[2];

// If ignore_recipient is true, all emails are saved to test account.
const ignore_recipient = true;

connectToDB('server/private/db.sqlite3');

fs.readFile(filename, 'utf8', (err, s) => {
    if (!err) {
        const body: object = JSON.parse(s);
        // console.log(body);
        update_db_on_mailgun_webhook({ body, db, myio: null, ignore_recipient }).then((res) => {
            console.log(res);
        }).catch((e) => {
            console.log(e);
        })
    } else {
        console.log('Loading failed', err);
    }
});
