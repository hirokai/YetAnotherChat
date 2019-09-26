import { shortid, pool, client } from './utils'
import * as _ from 'lodash';
import * as users from './users'
import * as bunyan from 'bunyan';
const log = bunyan.createLogger({ name: "model.workspaces", src: true, level: 1 });

export async function list(user_id: string): Promise<Workspace[]> {
    const rows = (await pool.query<{ id: string, user_id: string, name: string, metadata: string, visibility?: WorkspaceVisibility }>('select w.*,u2.user_id,u2.metadata from workspaces as w join users_in_workspaces as u on w.id=u.workspace_id join users_in_workspaces as u2 on w.id=u2.workspace_id where u.user_id=$1;', [user_id])).rows;
    const rows_public = (await pool.query<{ id: string, user_id: string, name: string, metadata: string, visibility?: WorkspaceVisibility }>("select w.*,u.user_id,u.metadata from workspaces as w join users_in_workspaces as u on w.id=u.workspace_id where w.visibility='public';")).rows;
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
    const rows = (await pool.query<{ id: string, user_id: string, name: string, metadata: string, visibility?: WorkspaceVisibility }>('select w.*,u2.user_id,u2.metadata from workspaces as w join users_in_workspaces as u on w.id=u.workspace_id join users_in_workspaces as u2 on w.id=u2.workspace_id where u.user_id=$1 and w.id=$2;', [user_id, workspace_id])).rows;
    const public_rows = (await pool.query<{ id: string, user_id: string, name: string, metadata: string, visibility?: WorkspaceVisibility }>(`select * from workspaces as w join users_in_workspaces as u on w.id=u.workspace_id where w.visibility in ('url','public') and id=$1;`, [workspace_id])).rows;
    const all_rows = _.uniqBy(rows.concat(public_rows), 'user_id');
    log.info(all_rows);
    const metadata: { [key: string]: UserInWorkspaceMetadata } = _.fromPairs(_.compact(_.map(all_rows, (v): [string, UserInWorkspaceMetadata] | null => {
        try {
            log.debug(v);
            return [v.user_id, JSON.parse(v.metadata)];
        } catch{
            return null;
        }
    })));
    log.info(metadata);
    const owner: string = _.findKey(metadata, (m) => { return m && m.role == 'owner'; }) || 'N/A';
    const wss: Workspace[] = _.chain(all_rows).groupBy('id').values().map((vs) => {
        return { id: vs[0].id, name: vs[0].name, members: _.map(vs, 'user_id'), owner, visibility: vs[0].visibility || 'private' };
    }).value();
    log.info(wss);
    return wss[0];
}

export async function create(user_id: string, name: string, members: string[]): Promise<{ ok: boolean, error?: string, data?: Workspace }> {
    const id = shortid();
    const timestamp = new Date().getTime();
    const visibility: WorkspaceVisibility = 'private';
    if (!_.includes(members, user_id)) {
        return { ok: false, error: 'Owner must be a member' }
    }
    await pool.query('insert into workspaces (id,name,timestamp,visibility) values ($1,$2,$3,$4);', [id, name, timestamp, visibility]);
    for (let uid of members) {
        const user = await users.get(uid);
        if (user != null) {
            log.debug({ user_id, uid, user });
            const metadata: UserInWorkspaceMetadata = { role: user_id == uid ? 'owner' : 'member' };
            log.info({ uid, metadata });
            await pool.query('insert into users_in_workspaces (user_id,workspace_id,timestamp,metadata) values ($1,$2,$3,$4);', [uid, id, timestamp, JSON.stringify(metadata)]);
        }
    }
    const data: Workspace = { id, name, members, owner: user_id, visibility };
    return { ok: true, data }
}

export async function add_member(myself: string, workspace_id: string, added_user: string): Promise<boolean> {
    const user = await users.get(added_user);
    const timestamp = new Date().getTime();
    const ws = await get(myself, workspace_id);
    if (ws && user) {
        const metadata: UserInWorkspaceMetadata = { role: 'member' };
        await pool.query('insert into users_in_workspaces (user_id,workspace_id,timestamp,metadata) values ($1,$2,$3,$4);', [user.id, workspace_id, timestamp, JSON.stringify(metadata)]);
        return true;
    } else {
        return false;
    }
}

export async function remove_member(myself_id: string, workspace_id: string, removed_user: string) {
    const myself = await users.get(myself_id);
    const user = await users.get(removed_user);
    if (!myself || !user || myself.id != user.id) { //Can only remove myself for now
        return false;
    }
    const ws = await get(myself.id, workspace_id);
    if (ws) {
        await pool.query('delete from users_in_workspaces where user_id=$1 and workspace_id=$2;', [user.id, ws.id]);
        return true;
    }
    return false;
}

export async function update(user_id: string, workspace_id: string, data: UpdateWorkspaceData): Promise<{ ok: boolean, data?: { name?: string } }> {
    let ok = true;
    let res = {};
    const ws = await get(user_id, workspace_id);
    if (ws && ws.owner == user_id) {
        if (data.name) {
            await pool.query('update workspaces set name=$1 where id=$2;', [data.name, workspace_id]);
            data = Object.assign({}, data, { name: data.name });
        }
        if (data.visibility) {
            await pool.query('update workspaces set visibility=$1 where id=$2;', [data.visibility, workspace_id]);
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
            try {
                await client.query('begin');
                await client.query('delete from users_in_workspaces where workspace_id=$1;', [workspace_id]);
                await client.query('delete from workspaces where id=$1;', [workspace_id]);
                await client.query('commit');
            } catch{
                await client.query('rollback');
            }
            return { ok: true };
        }
    }
    return { ok: false };
}