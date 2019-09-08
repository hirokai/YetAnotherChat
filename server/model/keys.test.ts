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

describe('Keys', () => {
    test('Stub', () => {

    });
});