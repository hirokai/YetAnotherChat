import { db_, shortid } from './utils'
import * as _ from 'lodash';

export async function list(user_id: string): Promise<Workspace[]> {
    const rows = await db_.all<{ id: string, user_id: string, name: string }>('select w.id,u2.user_id,w.name from workspaces as w join users_in_workspaces as u on w.id=u.workspace_id join users_in_workspaces as u2 on w.id=u2.workspace_id where u.user_id=?;', user_id);
    const wss: Workspace[] = _.chain(rows).groupBy('id').values().map((vs) => {
        return { id: vs[0].id, name: vs[0].name, members: _.map(vs, 'user_id') };
    }).value();
    return wss;
}