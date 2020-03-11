/// <reference path="../common/types.d.ts" />

// @ts-ignore
import { Elm } from './view/EmailList.elm';
import axios from 'axios';
import 'bootstrap';
import moment from 'moment';

import * as shortid_ from 'shortid';
shortid_.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$_');
const shortid = shortid_.generate;

const token: string = localStorage.getItem('yacht.token') || "";
const user_id: string = localStorage['yacht.user_id'] || "";
const password: string = localStorage['yacht.db_password'] || "";

axios.defaults.headers.common['x-access-token'] = token;

const app: ElmMail = Elm.EmailList.init({});

const params: GetEmailsParams = {};
axios.get('/api/emails', { params }).then(({ data }: AxiosResponse<GetEmailsResponse>) => {
    const es: EmailClient[] = data.data.map((e: Email) => { console.log(e); return { from: e.from || "", subject: e.subject || "", date: moment(e.timestamp).format(), timestamp: e.timestamp, message_id: e.message_id } });
    console.log(es);
    app.ports.feedEmails.send(es);
}).catch(() => {
});
