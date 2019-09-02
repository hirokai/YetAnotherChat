import { connectToDB, shortid, db, db_ } from './utils'
import { exec as exec_ } from 'child_process'
import * as model from './index'
import * as util from 'util'
import * as _ from 'lodash';
import * as sessions from './sessions'
import { userInfo } from 'os';
import { register } from './test_utils'

const exec = util.promisify(exec_);

jest.setTimeout(1000);

const random_str = (N) => {
    const S = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    return Array.from(Array(N)).map(() => S[Math.floor(Math.random() * S.length)]).join('');
};

beforeEach(done => {
    return new Promise(async (resolve, reject) => {
        await exec('sqlite3 server/private/db_test.sqlite3 < server/schema.sql');
        connectToDB('server/private/db_test.sqlite3');
        done();
    });
});

describe('Sessions', () => {

    test('Create and list', async done => {
        const myself = await register();
        const other = await register();
        var s = await sessions.create(random_str(30), [myself.id]);
        expect(s).not.toBeNull();
        var ss = await sessions.get_session_list({ user_id: myself.id, of_members: [], is_all: false });
        expect(ss).toHaveLength(1)
        s = await sessions.create(random_str(30), [myself.id]);
        const ms = await sessions.get_member_ids({ myself: myself.id, session_id: s.id });
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

    test('Create and delete session', async done => {
        const myself = await register();
        const other = await register();
        var s = await sessions.create(random_str(30), [myself.id, other.id]);
        let r = await db_.all('select * from sessions;');
        expect(r).toHaveLength(1);

        var timestamp = new Date().getTime();
        const comments = _.map([myself.id], (uid) => { return { for_user: uid, content: 'Hoge' } });
        const p: PostCommentModelParams = {
            user_id: myself.id,
            session_id: s.id,
            timestamp,
            encrypt: 'none',
            comments: [{
                for_user: myself.id,
                content: random_str(16),
            }]
        }
        const ms = await sessions.post_comment(p);

        const r1 = await sessions.delete_session(s.id);
        expect(r1).toBe(true);
        r = await db_.all('select * from sessions;');
        expect(r).toHaveLength(0);
        r = await db_.all('select * from comments;');
        expect(r).toHaveLength(0);

        done();
    });

    test('Create and get members', async done => {
        const myself = await register();
        const other = await register();

        var s = await sessions.create(random_str(30), [myself.id]);
        var timestamp = new Date().getTime();
        await sessions.join({ session_id: s.id, user_id: other.id, timestamp, source: 'manual_join' });
        const ms = await sessions.get_members({ myself: myself.id, session_id: s.id });
        expect(ms).toHaveLength(2);
        done();
    });

    test('List comments', async done => {
        const myself = await register();
        var s = await sessions.create(random_str(30), [myself.id]);
        var timestamp = new Date().getTime();
        const comments = _.map([myself.id], (uid) => { return { for_user: uid, content: 'Hoge' } });
        const p: PostCommentModelParams = {
            user_id: myself.id,
            session_id: s.id,
            timestamp,
            encrypt: 'none',
            comments
        }
        const ms = await sessions.post_comment(p);
        const cs = await sessions.list_comments(myself.id, s.id);
        expect(cs).toHaveLength(1);
        done();
    });

    test('Add and delete comments', async done => {
        const myself = await register();

        var s = await sessions.create(random_str(30), [myself.id]);
        var timestamp = new Date().getTime();
        const comments = _.map([myself.id], (uid) => { return { for_user: uid, content: 'Hoge' } });
        const p: PostCommentModelParams = {
            user_id: myself.id,
            session_id: s.id,
            timestamp,
            encrypt: 'none',
            comments
        }
        const cs = await sessions.post_comment(p);
        if (cs[0].data && cs[0].data.id) {
            const r = await sessions.delete_comment(myself.id, cs[0].data.id);
            expect(r.ok).toBe(true);
            const cs2 = await sessions.list_comments(myself.id, s.id);
            expect(cs2).toHaveLength(0);
            const cs3 = await db_.all('select * from comments;');
            expect(cs3).toHaveLength(0);
        } else {
            throw new Error('Error')
        }
        done();
    });

});