import { db_, shortid } from './utils'
import * as _ from 'lodash';
import * as users from './users'
import * as bunyan from 'bunyan';
const log = bunyan.createLogger({ name: "model.workspaces", src: true, level: 1 });

export async function list(user_id: string): Promise<Workspace[]> {
    const rows = await db_.all<{ id: string, user_id: string, name: string, metadata: string, visibility?: WorkspaceVisibility }>('select w.*,u2.user_id,u2.metadata from workspaces as w join users_in_workspaces as u on w.id=u.workspace_id join users_in_workspaces as u2 on w.id=u2.workspace_id where u.user_id=?;', user_id);
    const rows_public = await db_.all<{ id: string, user_id: string, name: string, metadata: string, visibility?: WorkspaceVisibility }>("select w.*,u.user_id,u.metadata from workspaces as w join users_in_workspaces as u on w.id=u.workspace_id where w.visibility='public';");
    const wss: Workspace[] = _.chain(rows.concat(rows_public)).groupBy('id').values().map((vs) => {
        const metadata: { [key: string]: UserInWorkspaceMetadata } = _.fromPairs(_.compact(_.map(vs, (v): [string, UserInWorkspaceMetadata] | null => {
            try {
                return [v.user_id, JSON.parse(v.metadata)];
            } catch{
                return null;
            }
        })));
        const owner: string = _.findKey(metadata, (m) => { return m && m.role == 'owner'; }) || 'N/A';
        return { id: vs[0].id, name: vs[0].name, members: _.uniq(_.map(vs, 'user_id')), owner, visibility: vs[0].visibility || 'private' };
    }).value();
    return wss;
}

export async function get(user_id: string, workspace_id: string): Promise<Workspace | null> {
    const rows = await db_.all<{ id: string, user_id: string, name: string, metadata: string, visibility?: WorkspaceVisibility }>('select w.*,u2.user_id,u2.metadata from workspaces as w join users_in_workspaces as u on w.id=u.workspace_id join users_in_workspaces as u2 on w.id=u2.workspace_id where u.user_id=? and w.id=?;', user_id, workspace_id);
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
        return { id: vs[0].id, name: vs[0].name, members: _.map(vs, 'user_id'), owner, visibility: vs[0].visibility || 'private' };
    }).value();
    return wss[0];
}

export async function create(user_id: string, name: string, members: string[]): Promise<{ ok: boolean, error?: string, data?: Workspace }> {
    const id = shortid();
    const timestamp = new Date().getTime();
    const visibility: WorkspaceVisibility = 'private';
    if (!_.includes(members, user_id)) {
        return { ok: false, error: 'Owner must be a member' }
    }
    await db_.run('insert into workspaces (id,name,timestamp,visibility) values (?,?,?,?);', id, name, timestamp, visibility);
    for (let uid of members) {
        const user = await users.get(uid);
        if (user != null) {
            log.debug({ user_id, uid, user });
            const metadata: UserInWorkspaceMetadata = { role: user_id == uid ? 'owner' : 'member' };
            log.info({ uid, metadata });
            await db_.run('insert into users_in_workspaces (user_id,workspace_id,timestamp,metadata) values (?,?,?,?);', uid, id, timestamp, JSON.stringify(metadata));
        }
    }
    const data: Workspace = { id, name, members, owner: user_id, visibility };
    return { ok: true, data }
}

export async function add_member(myself: string, workspace_id: string, added_user: string) {
    const user = await users.get(added_user);
    const timestamp = new Date().getTime();
    const ws = await get(myself, workspace_id);
    if (ws && user) {
        const metadata: UserInWorkspaceMetadata = { role: 'member' };
        await db_.run('insert into users_in_workspaces (user_id,workspace_id,timestamp,metadata) values (?,?,?,?);', user.id, workspace_id, timestamp, JSON.stringify(metadata));
    }
}

export async function remove_member(myself_id: string, workspace_id: string, removed_user: string) {
    const myself = await users.get(myself_id);
    const user = await users.get(removed_user);
    if (!myself || !user || myself.id != user.id) { //Can only remove myself
        return false;
    }
    const ws = await get(myself.id, workspace_id);
    if (ws) {
        await db_.run('delete from users_in_workspaces where user_id=? and workspace_id=?;', user.id, ws.id);
    }
}

export async function update(user_id: string, workspace_id: string, data: UpdateWorkspaceData): Promise<{ ok: boolean, data?: { name?: string } }> {
    let ok = true;
    let res = {};
    const ws = await get(user_id, workspace_id);
    if (ws && ws.owner == user_id) {
        if (data.name) {
            db_.run('update workspaces set name=? where id=?;', data.name, workspace_id);
            data = Object.assign({}, data, { name: data.name });
        }
        if (data.visibility) {
            db_.run('update workspaces set visibility=? where id=?;', data.visibility, workspace_id);
            data = Object.assign({}, data, { visibility: data.visibility });
        }
        return { ok, data };
    } else {
        return { ok: false };
    }
}

export async function remove(user_id: string, workspace_id: string): Promise<{ ok: boolean }> {
    const ws = await get(user_id, workspace_id);
    if (ws) {
        if (ws.owner == user_id) {
            db_.run('delete from users_in_workspaces where workspace_id=?;', workspace_id);
            db_.run('delete from workspaces where id=?;', workspace_id);
            return { ok: true };
        }
    }
    return { ok: false };
}