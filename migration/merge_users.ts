import * as _ from 'lodash';
import * as model from '../server/model';
import { pool } from '../server/model/utils'

(async () => {
    const rows = (await pool.query<{ user_ids: string, users_fullname: string, users_name: string, email: string }>("select array_to_string(ARRAY(SELECT unnest(array_agg(distinct user_id))), '####') as user_ids,email,array_to_string(ARRAY(SELECT unnest(array_agg(distinct users.name))), '####') as users_name,array_to_string(ARRAY(SELECT unnest(array_agg(distinct users.fullname))), '####') as users_fullname from user_emails join users on users.id=user_emails.user_id group by email;")).rows;
    const datas = rows.map((row) => {
        const user_ids_r = row.user_ids;
        const user_ids: string[] = user_ids_r ? user_ids_r.split(',') : [];
        const fullnames_r = row.users_fullname;
        const fullnames: string[] = fullnames_r ? fullnames_r.split('####') : [];
        const names_r = row.users_name;
        const names: string[] = names_r ? names_r.split('####') : [];
        const email: string = row.email;
        return { user_ids, names, fullnames, email };
    });
    datas.forEach(({ user_ids, names, fullnames, email }) => {
        console.log('user_ids', user_ids);
        if (email && email != '' && user_ids.length > 1) {
            const users: UserSubset[] = _.zipWith(user_ids, names, fullnames, (id: string, username: string, fullname: string) => {
                return { id, username, fullname };
            });
            console.log(users);
            model.users.merge(users);
        }
    });
});
