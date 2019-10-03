/// <reference path="../common/types.d.ts" />

const fs = require('fs');
const glob = require('glob');
import * as _ from 'lodash';
import * as model from '../server/model';
import { update_db_on_mailgun_webhook } from '../server/model/mail_algo';


glob.glob('imported_data/mailgun/*.json', (err, files) => {
    Promise.all(_.map(files, async (filename: string) => {
        const s = fs.readFileSync(filename, 'utf8');
        const body = JSON.parse(s);
        return await update_db_on_mailgun_webhook({ body, db, myio: null, ignore_recipient: true });
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
                    model.users.merge(vs);
                }
            });
        });
        db.close();
    });
});
