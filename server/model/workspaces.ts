import { db_, shortid } from './utils'
import * as _ from 'lodash';
import * as users from './users'
import * as bunyan from 'bunyan';
const log = bunyan.createLogger({ name: "model.workspaces", src: true, level: 1 });

export async function list(user_id: string): Promise<Workspace[]> {
    const rows = await db_.all<{ id: string, user_id: string, name: string, metadata: string }>('select w.id,u2.user_id,w.name,u2.metadata from workspaces as w join users_in_workspaces as u on w.id=u.workspace_id join users_in_workspaces as u2 on w.id=u2.workspace_id where u.user_id=?;', user_id);
    const wss: Workspace[] = _.chain(rows).groupBy('id').values().map((vs) => {
        const metadata: { [key: string]: UserInWorkspaceMetadata } = _.fromPairs(_.compact(_.map(vs, (v): [string, UserInWorkspaceMetadata] | null => {
            try {
                return [v.user_id, JSON.parse(v.metadata)];
            } catch{
                return null;
            }
        })));
        const owner: string = _.findKey(metadata, (m) => { return m && m.role == 'owner'; }) || 'N/A';
        return { id: vs[0].id, name: vs[0].name, members: _.uniq(_.map(vs, 'user_id')), owner };
    }).value();
    return wss;
}

export async function get(user_id: string, workspace_id: string): Promise<Workspace> {
    const rows = await db_.all<{ id: string, user_id: string, name: string, metadata: string }>('select w.id,u2.user_id,w.name,u2.metadata from workspaces as w join users_in_workspaces as u on w.id=u.workspace_id join users_in_workspaces as u2 on w.id=u2.workspace_id where u.user_id=? and w.id=?;', user_id, workspace_id);
    const metadata: { [key: string]: UserInWorkspaceMetadata } = _.fromPairs(_.compact(_.map(rows, (v): [string, UserInWorkspaceMetadata] | null => {
        try {
            log.debug(v);
            return [v.user_id, JSON.parse(v.metadata)];
        } catch{
            return null;
        }
    })));
    log.info(metadata);
    const owner: string = _.findKey(metadata, (m) => { return m && m.role == 'owner'; }) || 'N/A';
    const wss: Workspace[] = _.chain(rows).groupBy('id').values().map((vs) => {
        return { id: vs[0].id, name: vs[0].name, members: _.map(vs, 'user_id'), owner };
    }).value();
    return wss[0];
}

export async function create(user_id: string, name: string, members: string[]): Promise<{ ok: boolean, data?: Workspace }> {
    const id = shortid();
    const timestamp = new Date().getTime();
    await db_.run('insert into workspaces (id,name,timestamp) values (?,?,?);', id, name, timestamp);
    for (let uid of members) {
        const user = await users.get(uid);
        if (user != null) {
            log.debug({ user_id, uid, user })
            const metadata: UserInWorkspaceMetadata = { role: user_id == uid ? 'owner' : 'member' };
            log.info({ uid, metadata });
            await db_.run('insert into users_in_workspaces (user_id,workspace_id,timestamp,metadata) values (?,?,?,?);', uid, id, timestamp, JSON.stringify(metadata));
        }
    }
    const data: Workspace = { id, name, members, owner: user_id };
    return { ok: true, data }
}