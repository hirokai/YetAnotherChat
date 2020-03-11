import * as path from 'path'
import { shortid, pool, connectToDB } from './utils'
import * as model from './index'
import { exec as exec_ } from 'child_process'
import * as util from 'util'
import * as _ from 'lodash';
import { random_str, register } from './test_utils'
const exec = util.promisify(exec_);
import crypto from 'crypto'
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
import baseX from 'base-x';
const bs58 = baseX(BASE58);
jest.setTimeout(3000);
import * as bunyan from 'bunyan';
const log = bunyan.createLogger({ name: "model.workspaces.test", level: 1 });

beforeAll(async done => {
    await exec('psql -d test < server/schema.sql');
    await connectToDB('test');
    done();
});

describe('Create/remove workspaces and add/remove members', () => {
    let myself: User;
    let users: User[];
    const num_users = 10;
    let user_ids: string[];
    beforeAll(async done => {
        myself = await register();
        users = _.shuffle(await Promise.all(_.map(_.range(num_users), () => register())));
        user_ids = _.map(users, 'id');
        done();
    });
    test('Create, get, update, and remove', async done => {
        const u2 = await register();
        const u3 = await register();
        const { ok, data: ws } = await model.workspaces.create(myself.id, random_str(16), [myself.id, u2.id]);
        expect(ok).toBe(true);
        expect(ws).not.toBeUndefined();
        if (myself && ws) {
            let ws_found = await model.workspaces.get(myself.id, ws.id);
            expect(ws_found).toEqual(ws);
            expect(model.workspaces.get(u3.id, ws.id)).resolves.toBeNull();
            const new_name = random_str(20);
            const new_visibility = 'public';
            const ud: UpdateWorkspaceData = { name: new_name, visibility: new_visibility };
            await model.workspaces.update(myself.id, ws.id, ud);
            ws_found = await model.workspaces.get(myself.id, ws.id);
            expect(ws_found).not.toBeNull();
            if (ws_found) {
                expect(ws_found.name).toEqual(new_name);
                expect(ws_found.visibility).toEqual(new_visibility);
            }
            expect(model.workspaces.get(u3.id, ws.id)).resolves.not.toBeNull();
            await model.workspaces.remove(myself.id, ws.id);
            expect(model.workspaces.get(myself.id, ws.id)).resolves.toBeNull();
        } else {
            throw new Error('Null')
        }
        done();
    });
    test('A member can add and remove members', async done => {
        const added_users = user_ids.slice(0, 5);
        const not_added_users = user_ids.slice(5, 10);
        const { ok, data: ws } = await model.workspaces.create(myself.id, random_str(16), [myself.id]);
        if (myself && ws) {
            for (let u of added_users) {
                await model.workspaces.add_member(myself.id, ws.id, u);
            }
            for (let u of added_users) {
                let ws_found = await model.workspaces.get(u, ws.id);
                expect(ws_found).not.toBeNull();
                if (ws_found) {
                    expect(_.sortBy(ws_found.members)).toEqual(_.sortBy(added_users.concat([myself.id])));
                }
            }
            for (let u of not_added_users) {
                let ws_found = await model.workspaces.get(u, ws.id);
                expect(ws_found).toBeNull();
            }
            for (let u of added_users) {
                await model.workspaces.remove_member(u, ws.id, u);
            }
            for (let u of added_users) {
                let ws_found = await model.workspaces.get(u, ws.id);
                expect(ws_found).toBeNull();
            }
        } else {
            throw new Error('Null')
        }
        done();
    });
    test('A non-member cannot add and remove members', async done => {
        const added_users = user_ids.slice(0, 5);
        const not_added_users = user_ids.slice(5, 10);
        const { ok, data: ws } = await model.workspaces.create(myself.id, random_str(16), [myself.id]);
        if (myself && ws) {
            for (let u of added_users) {
                await model.workspaces.add_member(myself.id, ws.id, u);
            }
            for (let u of added_users) {
                let ws_found = await model.workspaces.get(u, ws.id);
                expect(ws_found).not.toBeNull();
                if (ws_found) {
                    expect(_.sortBy(ws_found.members)).toEqual(_.sortBy(added_users.concat([myself.id])));
                }
            }
            for (let u of not_added_users) {
                let ws_found = await model.workspaces.get(u, ws.id);
                expect(ws_found).toBeNull();
            }
            for (let u of added_users) {
                await model.workspaces.remove_member(u, ws.id, u);
            }
            for (let u of added_users) {
                let ws_found = await model.workspaces.get(u, ws.id);
                expect(ws_found).toBeNull();
            }
        } else {
            throw new Error('Null')
        }
        done();
    });

    test('A member can add and remove members', async done => {
        const added_users = user_ids.slice(0, 5);
        const not_added_users = user_ids.slice(5, 10);
        const { ok, data: ws } = await model.workspaces.create(myself.id, random_str(16), [myself.id]);
        if (myself && ws) {
            for (let u of added_users) {
                await model.workspaces.add_member(myself.id, ws.id, u);
            }
            for (let u of added_users) {
                let ws_found = await model.workspaces.get(u, ws.id);
                expect(ws_found).not.toBeNull();
                if (ws_found) {
                    expect(_.sortBy(ws_found.members)).toEqual(_.sortBy(added_users.concat([myself.id])));
                }
            }
            for (let u of not_added_users) {
                let ws_found = await model.workspaces.get(u, ws.id);
                expect(ws_found).toBeNull();
            }
            for (let u of added_users) {
                await model.workspaces.remove_member(u, ws.id, u);
            }
            for (let u of added_users) {
                let ws_found = await model.workspaces.get(u, ws.id);
                expect(ws_found).toBeNull();
            }
        } else {
            throw new Error('Null')
        }
        done();
    });
})
describe('Visibility of workspaces', () => {
    let myself: User;
    let users: User[];
    const num_users = 10;
    let user_ids: string[];
    beforeAll(async done => {
        myself = await register();
        users = await Promise.all(_.map(_.range(num_users), () => register()));
        user_ids = _.shuffle(_.map(users, 'id'));
        done();
    });
    test('Public workspaces are visible to everyone', async done => {
        await model.workspaces.remove_all(myself.id);
        const wss = _.compact(_.map(await Promise.all(_.map(_.range(num_users), (i) => model.workspaces.create(myself.id, random_str(16), [user_ids[i]], 'public'))), 'data'));
        let wss2 = await model.workspaces.list(myself.id);
        expect(wss2).toHaveLength(num_users);
        for (let ws of wss) {
            let ws2 = await model.workspaces.get(myself.id, ws.id);
            expect(ws2).toEqual(ws)
        }
        for (let uid of user_ids) {
            wss2 = await model.workspaces.list(uid);
            expect(wss2).toHaveLength(num_users);
            for (let ws of wss) {
                let ws2 = await model.workspaces.get(uid, ws.id);
                expect(ws2).toEqual(ws)
            }
        }
        done();
    });

    test('Workspaces shared by url are visible to everyone but listed only to members', async done => {
        await model.workspaces.remove_all(myself.id);
        const wss = _.compact(_.map(await Promise.all(_.map(_.range(num_users), (i) => model.workspaces.create(myself.id, random_str(16), [user_ids[i]], 'url'))), 'data'));
        let wss2 = await model.workspaces.list(myself.id);
        for (let ws of wss) {
            let ws2 = await model.workspaces.get(myself.id, ws.id);
            expect(ws2).toEqual(ws)
        }
        expect(wss2).toHaveLength(num_users);
        for (let uid of user_ids) {
            wss2 = await model.workspaces.list(uid);
            expect(wss2).toHaveLength(1);
            for (let ws of wss) {
                let ws2 = await model.workspaces.get(uid, ws.id);
                expect(ws2).toEqual(ws)
            }
        }
        done();
    });
    test('Private workspaces are only visible to members', async done => {
        await model.workspaces.remove_all(myself.id);
        const wss = _.compact(_.map(await Promise.all(_.map(_.range(num_users), (i) => model.workspaces.create(myself.id, random_str(16), [user_ids[i]], 'private'))), 'data'));
        let wss2 = await model.workspaces.list(myself.id);
        expect(wss2).toHaveLength(num_users);
        for (let ws of wss) {
            let ws2 = await model.workspaces.get(myself.id, ws.id);
            expect(ws2).toEqual(ws)
        }
        for (let [i, uid] of user_ids.entries()) {
            wss2 = await model.workspaces.list(uid);
            expect(wss2).toHaveLength(1);
            for (let [j, ws] of wss.entries()) {
                let ws2 = await model.workspaces.get(uid, ws.id);
                if (i == j) {
                    expect(ws2).toEqual(ws);
                } else {
                    expect(ws2).toBe(null);
                }
            }
        }
        done();
    });
});


describe('Sessions in workspace', () => {
    let added_users: string[];
    let not_added_users: string[];
    let ok: boolean;
    let ws: Workspace | undefined;
    let myself: User | undefined;
    beforeAll(async () => {
        myself = await register();
        const users = await Promise.all(_.map(_.range(10), () => register()));
        const user_ids = _.shuffle(_.map(users, 'id'));
        added_users = user_ids.slice(0, 5);
        not_added_users = user_ids.slice(5, 10);
        const r = await model.workspaces.create(myself.id, random_str(16), [myself.id]);
        ok = r.ok;
        ws = r.data;
    })
    test('A non-member cannot add another', async done => {
        if (myself && ws) {
            const session = await model.sessions.create(myself.id, random_str(Math.floor(Math.random() * 16)), added_users, 'private', ws.id);
            const r = await model.sessions.add_member({ user_id: not_added_users[0], session_id: session.id, added_user: not_added_users[0], timestamp: new Date().getTime(), source: 'added_by_member' });
            expect(r.ok).toBe(false);
        }
        done()
    });
    test('A member can add another', async done => {
        if (myself && ws) {
            const session = await model.sessions.create(myself.id, random_str(Math.floor(Math.random() * 16)), added_users, 'private', ws.id);
            const r = await model.sessions.add_member({ user_id: myself.id, session_id: session.id, added_user: not_added_users[0], timestamp: new Date().getTime(), source: 'added_by_member' });
            expect(r.ok).toBe(true);
        }
        done()
    });

    test('Public session is visible to non-members, even in a list', async done => {
        if (myself && ws) {
            const session = await model.sessions.create(myself.id, random_str(Math.floor(Math.random() * 16)), added_users, 'public', ws.id);
            let s1 = await model.sessions.get(myself.id, session.id);
            expect(s1).toEqual(expect.anything());
            if (s1) {
                for (let u of added_users.concat(not_added_users)) {
                    let s2 = await model.sessions.get(u, session.id);
                    expect(s2).toEqual(s1);
                    if (s2) {
                        let ss = _.map(await model.sessions.list({ user_id: u, workspace_id: ws.id }), 'id');
                        expect(ss).toContain(s2.id);
                    }
                    let ss = _.map(await model.sessions.list({ user_id: u, workspace_id: ws.id }), 'id');
                    expect(ss).toContain(s1.id);
                }
            }
        }
        done()
    });
    test('Session shared in workspace is visible only to workspace members', async done => {
        if (myself && ws) {
            const session = await model.sessions.create(myself.id, random_str(Math.floor(Math.random() * 16)), added_users, 'workspace', ws.id);
            let s1 = await model.sessions.get(myself.id, session.id);
            log.debug(s1, ws, added_users);
            for (let u of added_users) {
                let s2 = await model.sessions.get(u, session.id);
                expect(s2).toEqual(s1);
            }
            for (let u of not_added_users) {
                let s2 = await model.sessions.get(u, session.id);
                expect(s2).toBeNull();
            }
        }
        done()
    });
}); 