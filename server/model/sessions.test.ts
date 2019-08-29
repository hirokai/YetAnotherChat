import { connectToDB, shortid, db } from './utils'
import { exec as exec_ } from 'child_process'
import * as model from './index'
import * as util from 'util'
import * as _ from 'lodash';
import * as sessions from './sessions'

const exec = util.promisify(exec_);

jest.setTimeout(1000);

const random_str = (N) => {
    const S = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    return Array.from(Array(N)).map(() => S[Math.floor(Math.random() * S.length)]).join('');
};

export async function register(opt?: { basename?: string, username?: string, fullname?: string, password?: string, email?: string, source?: string }) {
    opt = opt || {};
    const username = (opt.basename || random_str(4)) + Math.floor(Math.random() * 100000);
    const fullname = opt.fullname;
    const password = opt.password || random_str(16);
    const source = opt.source || 'self_register';
    const email = opt.email || ('' + Math.floor(Math.random() * 100000) + '@gmail.com');
    return await model.users.register({ username, password, fullname, email, source });
}

beforeEach(done => {
    return new Promise(async (resolve, reject) => {
        await exec('sqlite3 server/private/db_test.sqlite3 < server/schema.sql');
        connectToDB('server/private/db_test.sqlite3');
        done();
    });
});

test('Create and get members', async done => {
    const { user: myself } = await register();
    const { user: other } = await register();
    var s = await sessions.create(random_str(30), [myself.id]);
    expect(s).not.toBeNull();
    var ss = await sessions.get_session_list({ user_id: myself.id, of_members: [], is_all: false });
    expect(ss).toHaveLength(1)
    s = await sessions.create(random_str(30), [myself.id]);
    const ms = await sessions.get_member_ids({ session_id: s.id });
    expect(ms).toContain(myself.id);
    ss = await sessions.get_session_list({ user_id: myself.id, of_members: [], is_all: false });
    expect(ss).toHaveLength(2)
    s = await sessions.create(random_str(30), [other.id]);
    ss = await sessions.get_session_list({ user_id: myself.id, of_members: [], is_all: false });
    expect(ss).toHaveLength(2)
    ss = await sessions.get_session_list({ user_id: other.id, of_members: [], is_all: false });
    expect(ss).toHaveLength(1);
    done();
});