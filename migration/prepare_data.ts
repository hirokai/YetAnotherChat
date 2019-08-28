/// <reference path="../common/types.d.ts" />

import * as model from '../server/model';
const _ = require('lodash');
import { db } from '../server/model/utils'

import * as mail_algo from '../server/model/mail_algo';
import * as user_info from '../server/private/user_info';

function mk_default_user() {
    db.serialize(() => {
        const { username, email, fullname, password } = user_info.test_myself;
        (async () => {
            const r = await model.users.register({ username, password, email, fullname, source: 'preset' });
            console.log(r);
        })();
    });
}

function _import_from_slack() {
    const messages_stub = require("../private/slack_data.json");
    const user_list = require('../private/user_list');
    db.serialize(() => {
        _.map(messages_stub, (obj) => {
            obj.ts = Math.floor(obj.ts * 1000);
            const user_id = user_list.user_list[obj.user] || obj.user;
            db.run('insert into comments (comment,timestamp,user_id) values (?,?,?);', obj.text, obj.ts, user_id);
        });
    });
}

mk_default_user();
