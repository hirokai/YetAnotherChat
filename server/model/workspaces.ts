import { db_, shortid } from './utils'
import * as _ from 'lodash';
import * as users from './users'

export async function list(user_id: string): Promise<Workspace[]> {
    const rows = await db_.all<{ id: string, user_id: string, name: string }>('select w.id,u2.user_id,w.name from workspaces as w join users_in_workspaces as u on w.id=u.workspace_id join users_in_workspaces as u2 on w.id=u2.workspace_id where u.user_id=?;', user_id);
    const wss: Workspace[] = _.chain(rows).groupBy('id').values().map((vs) => {
        return { id: vs[0].id, name: vs[0].name, members: _.uniq(_.map(vs, 'user_id')) };
    }).value();
    return wss;
}

export async function get(user_id: string, workspace_id: string): Promise<Workspace> {
    const rows = await db_.all<{ id: string, user_id: string, name: string }>('select w.id,u2.user_id,w.name from workspaces as w join users_in_workspaces as u on w.id=u.workspace_id join users_in_workspaces as u2 on w.id=u2.workspace_id where u.user_id=? and w.id=?;', user_id, workspace_id);
    const wss: Workspace[] = _.chain(rows).groupBy('id').values().map((vs) => {
        return { id: vs[0].id, name: vs[0].name, members: _.map(vs, 'user_id') };
    }).value();
    return wss[0];
}

export async function create(name: string, members: string[]): Promise<{ ok: boolean, data?: Workspace }> {
    const id = shortid();
    const timestamp = new Date().getTime();
    await db_.run('insert into workspaces (id,name,timestamp) values (?,?,?);', id, name, timestamp);
    for (let user_id of members) {
        const user = await users.get(user_id);
        if (user != null) {
            await db_.run('insert into users_in_workspaces (user_id,workspace_id,timestamp) values (?,?,?);', user.id, id, timestamp);
        }
    }
    const data: Workspace = { id, name, members };
    return { ok: true, data }
}