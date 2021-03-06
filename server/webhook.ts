/// <reference path="../common/types.d.ts" />
import { Router } from 'express'
export const router: any = Router();
import { io } from './socket'
import * as _ from 'lodash';
import * as model from './model'
import request from 'request';
import multer from 'multer';
import * as mail_algo from './model/mail_algo'
import * as fs from 'fs';
import * as credential from './private/credential';
import { pool } from './model/utils'
import * as bunyan from 'bunyan';
const log = bunyan.createLogger({ name: "webhook", src: true, level: 1 });


router.post('/mailgun', multer().none(), (req, res, next) => {
    (async () => {
        res.json({ status: "ok" });
        log.info('Received email from: ', req.body['From']);
        await mail_algo.update_db_on_mailgun_webhook({ body: req.body, pool, myio: io });
        log.info('Parsing done.');
    })().catch(next);
});

router.post('/aws_ses', (req, res, next) => {
    (async () => {
        res.json({ status: "ok" });
        fs.writeFileSync('uploads/email/' + req.body.key, req.body.data, "utf8");
        const parsed = await model.email.parseEmail(req.body.data);
        log.info('Received email.');
        const r = await model.email.add(parsed);
        log.debug(r);
    })().catch(next);
});

router.get('/aws_ses/debug/parse_all', (req, res, next) => {
    (async () => {
        try {
            const files = fs.readdirSync('uploads/email');
            log.debug(files);
            const parsed_all: any[] = await Promise.all(files.map((id) => {
                return new Promise((resolve) => {
                    try {
                        const data = fs.readFileSync('uploads/email/' + id, "utf8");
                        model.email.parseEmail(data).then((parsed) => {
                            resolve({ ...parsed, id });
                        });
                    } catch (e) {
                        log.debug(e);
                        resolve(null);
                    }
                });
            }));
            var messageIds: string[] = parsed_all.filter((p) => p).map(p => {
                fs.writeFile('uploads/email/parsed/' + p.id + '.json', JSON.stringify(p, null, 2), (err) => { if (err) log.debug(err) });
                log.info('Parsed email: ' + p.id);
                model.email.add(p).then(() => { });
                return p.messageId;
            });
            res.json({ ok: true, messageIds: messageIds });
        } catch (e) {
            log.debug(e);
            res.json({ ok: false });
        }
    })().catch(next);
});


router.get('/aws_ses/debug/:email_id', (req, res, next) => {
    (async () => {
        try {
            const data = fs.readFileSync('uploads/email/' + req.params.email_id, "utf8");
            const parsed = await model.email.parseEmail(data);
            log.info('Parsed email.');
            const r = await model.email.add(parsed);
            log.debug(r);
            res.json({ ...r, ok: true, messageId: parsed.messageId });
        } catch (e) {
            log.debug(e);
            res.json({ ok: false });
        }
    })().catch(next);
});



const shortid_ = require('shortid');
shortid_.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$_');
const shortid = shortid_.generate;

router.post('/slack', (req, res) => {
    log.debug(req.body);
    res.send(req.body.challenge || '');
    fs.writeFile('imported_data/slack/' + req.body['event_id'] + '.json', JSON.stringify(req.body, null, 2), (err) => {
        log.debug('write file ', err);
    });
    const channel = req.body.event.channel;
    const url: string = 'https://slack.com/api/conversations.history';
    const token = credential.slack_token;
    const event = req.body.event;
    const timestamp_us = event.ts;
    const oldest = timestamp_us - 0.01;
    request({ url, method: 'GET', qs: { channel, token, oldest }, json: true }, (err, res1, html) => {
        log.debug(err, res1.body);
        const msg = _.find(res1.body.messages, (m) => { return m.client_msg_id == event.client_msg_id });
        if (msg != null) {
            const session_id = 'gsTeps7Y8';
            const user_id = 'tRX3JzQEv';
            const id = shortid();
            const comment = msg.text;
            const timestamp = Math.floor(timestamp_us * 1000);
            log.debug({ id, session_id, user_id, timestamp, comment });
            const url = 'slack://channel?team=' + event.team + '&id=' + channel + '&message_ts=' + timestamp_us;
            return; //Stub
            /*
            const rs = await model.sessions.post_comment_for_session_members(user_id, session_id, timestamp, comments, encrypt);
            model.sessions.post_comment({ user_id, session_id, timestamp, comment, url, "", "slack:channel:" + channel }).then((r) => {
                if (r.data) {
                    const obj = _.extend({}, { __type: "new_comment", temporary_id: "" }, r.data);
                    axios.post('http://localhost:3000/internal/emit_socket', obj).then((r2) => {
                        log.debug(r2);
                    });
                }
            })
            */
        }
    });
})