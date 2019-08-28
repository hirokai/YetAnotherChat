import { db } from '../server/model/utils'
import * as _ from 'lodash';
import * as model from '../server/model';

db.all("select group_concat(user_id),email,group_concat(users.name,'####'),group_concat(users.fullname,'####') from user_emails join users on users.id=user_emails.user_id group by email;", (err, rows) => {
    if (err || !rows) {
        return;
    }
    const datas = rows.map((row) => {
        const user_ids_r = row['group_concat(user_id)'];
        const user_ids: string[] = user_ids_r ? user_ids_r.split(',') : [];
        const fullnames_r = row["group_concat(users.fullname,'####')"];
        const fullnames: string[] = fullnames_r ? fullnames_r.split('####') : [];
        const names_r = row["group_concat(users.name,'####')"];
        const names: string[] = names_r ? names_r.split('####') : [];
        const email: string = row['email'];
        return { user_ids, names, fullnames, email };
    });
    datas.forEach(({ user_ids, names, fullnames, email }) => {
        console.log('user_ids', user_ids);
        if (email && email != '' && user_ids.length > 1) {
            const users: UserSubset[] = _.zipWith(user_ids, names, fullnames, (id: string, username: string, fullname: string) => {
                return { id, username, fullname };
            });
            console.log(users);
            model.users.merge(db, users);
        }
    });
});