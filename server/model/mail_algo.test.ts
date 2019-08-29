import { connectToDB, shortid, db, db_ } from './utils'
import { exec as exec_ } from 'child_process'
import * as model from './index'
import * as util from 'util'
import * as _ from 'lodash';
import * as sessions from './sessions'
import { userInfo } from 'os';
import * as mail_algo from './mail_algo'

const exec = util.promisify(exec_);

jest.setTimeout(1000);

beforeEach(done => {
    return new Promise(async (resolve, reject) => {
        await exec('sqlite3 server/private/db_test.sqlite3 < server/schema.sql');
        connectToDB('server/private/db_test.sqlite3');
        done();
    });
});

describe('Mail algo', () => {
    test('Remove quote', () => {
        const input = '> > >';
        const output = mail_algo.remove_quote_marks(input, 3);
        expect(output).toEqual('');
    })
})