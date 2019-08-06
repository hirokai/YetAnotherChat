/// <reference path="../types.d.ts" />
/// <reference path="../model.ts" />

const fs = require('fs');
const glob = require('glob');
import * as _ from 'lodash';
import { update_db_on_mailgun_webhook } from '../mail_algo';
import { sumBy } from 'lodash-es';
const path = require('path');
const sqlite3 = require('sqlite3');
const db = new sqlite3.Database(path.join(__dirname, '../private/db.sqlite3'));
import * as model from '../model';


glob.glob('mailgun/*.json', async (err, files) => {
    db.serialize(() => {
        Promise.all(_.map(files, async (filename: string) => {
            const s = fs.readFileSync(filename, 'utf8');
            const body = JSON.parse(s);
            return await update_db_on_mailgun_webhook(body, db);
        })).then((rss) => {
            const users: { user_id: string, name: string, fullname: string, email: string }[] = _.flatMap(rss, 'added_users');
            const grouped = _.groupBy(users, 'email');
            console.log(grouped);
            _.map(grouped, async (vs, email) => {
                if (vs && vs.length > 1) {
                    model.merge_users(db, vs);
                }
            });
        });
    });
});
