/// <reference path="../common/types.d.ts" />

// @ts-ignore
import { Elm } from './view/Email.elm';
import map from 'lodash/map';
import values from 'lodash/values';
import includes from 'lodash/includes';
import compact from 'lodash/compact'
import axios from 'axios';
import $ from 'jquery';
import 'bootstrap';
import io from "socket.io-client";
import { Model, processData, formatTime2 } from './model';
import * as crypto from './model/cryptography';
import * as video from './video';

import * as shortid_ from 'shortid';
import { test_crypto } from './model/test_crypto';
shortid_.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$_');
const shortid = shortid_.generate;

const token: string = localStorage.getItem('yacht.token') || "";
const user_id: string = localStorage['yacht.user_id'] || "";
const password: string = localStorage['yacht.db_password'] || "";

axios.defaults.headers.common['x-access-token'] = token;

const app: any = Elm.Email.init({});

const params: GetEmailsParams = {};
const paths = new URL(location.href).pathname.split('/');
const message_id = paths[paths.length - 1];

const formatData = (d) => {
    return { from: d.from, text: d.text || "", subject: d.subject };
}

axios.get('/api/emails/' + message_id, { params }).then(({ data }: AxiosResponse<GetEmailResponse>) => {
    const d = formatData(data.data);
    console.log(d);
    app.ports.feedEmail.send(d);
    document.title = d.subject;
}).catch((e) => {
    console.log(e);
});
