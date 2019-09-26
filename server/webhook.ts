/// <reference path="../common/types.d.ts" />
import * as model from './model'
import { Router } from 'express'
export const router: any = Router();
import { io } from './socket'
import * as _ from 'lodash';
import request from 'request';
import multer from 'multer';
import * as mail_algo from './model/mail_algo'
import * as fs from 'fs';
import * as credential from './private/credential';
import { db } from './model/utils'
import * as bunyan from 'bunyan';
const log = bunyan.createLogger({ name: "webhook", src: true, level: 1 });


router.post('/webhook/mailgun', multer().none(), (req, res, next) => {
    (async () => {
        res.json({ status: "ok" });
        log.info('Received email from: ', req.body['From']);
        await mail_algo.update_db_on_mailgun_webhook({ body: req.body, db, myio: io });
        log.info('Parsing done.');
    })().catch(next);
});


const shortid_ = require('shortid');
shortid_.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$_');
const shortid = shortid_.generate;

router.post('/webhook/slack', (req, res) => {
    log.debug(req.body);
    res.send(req.body.challenge || '');
    fs.writeFile('imported_data/slack/' + req.body['event_id'] + '.json', JSON.stringify(req.body, null, 2), (err) => {
        console.log('write file ', err);
    });
    const channel = req.body.event.channel;
    const url: string = 'https://slack.com/api/conversations.history';
    const token = credential.slack_token;
    const event = req.body.event;
    const timestamp_us = event.ts;
    const oldest = timestamp_us - 0.01;
    request({ url, method: 'GET', qs: { channel, token, oldest }, json: true }, (err, res1, html) => {
        console.log(err, res1.body);
        const msg = _.find(res1.body.messages, (m) => { return m.client_msg_id == event.client_msg_id });
        if (msg != null) {
            const session_id = 'gsTeps7Y8';
            const user_id = 'tRX3JzQEv';
            const id = shortid();
            const comment = msg.text;
            const timestamp = Math.floor(timestamp_us * 1000);
            console.log({ id, session_id, user_id, timestamp, comment });
            const url = 'slack://channel?team=' + event.team + '&id=' + channel + '&message_ts=' + timestamp_us;
            return; //Stub
            /*
            const rs = await model.sessions.post_comment_for_session_members(user_id, session_id, timestamp, comments, encrypt);
            model.sessions.post_comment({ user_id, session_id, timestamp, comment, url, "", "slack:channel:" + channel }).then((r) => {
                if (r.data) {
                    const obj = _.extend({}, { __type: "new_comment", temporary_id: "" }, r.data);
                    axios.post('http://localhost:3000/internal/emit_socket', obj).then((r2) => {
                        console.log(r2);
                    });
                }
            })
            */
        }
    });
})