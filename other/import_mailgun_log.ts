/// <reference path="../types.d.ts" />
/// <reference path="../model.ts" />

const fs = require('fs');
const glob = require('glob');
import * as _ from 'lodash';
const path = require('path');
const sqlite3 = require('sqlite3');
const db = new sqlite3.Database(path.join(__dirname, '../private/db.sqlite3'));
import * as model from '../model';
import { update_db_on_mailgun_webhook } from '../mail_algo';


glob.glob('mailgun/*.json', (err, files) => {
    Promise.all(_.map(files, async (filename: string) => {
        const s = fs.readFileSync(filename, 'utf8');
        const body = JSON.parse(s);
        return await update_db_on_mailgun_webhook(body, db);
    })).then((rss1: { added_users: User[] }[]) => {
        db.serialize(() => {
            const rss = _.compact(rss1);
            const users: User[] = _.flatMap(rss, ({ added_users }) => {
                return _.compact(added_users);
            });
            const grouped = _.groupBy(users, u => u.emails[0]);
            console.log(grouped);
            _.map(grouped, async (vs, email) => {
                if (vs && vs.length > 1) {
                    model.merge_users(db, vs);
                }
            });
        });
        db.close();
    });
});
