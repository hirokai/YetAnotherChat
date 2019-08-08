/// <reference path="../types.d.ts" />


const express = require('express');
const app = express();
const fs = require('fs');
const multer = require('multer');
import * as mail_algo from '../mail_algo';
import * as model from '../model';
const path = require('path');
const sqlite3 = require('sqlite3');
const db = new sqlite3.Database(path.join(__dirname, '../private/db.sqlite3'));
import * as _ from 'lodash';
import axios from 'axios';
const bodyParser = require("body-parser");
import * as credential from '../private/credential';
import request from 'request';
import Axios from 'axios';
const shortid_ = require('shortid');
shortid_.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$_');
const shortid = shortid_.generate;

const port = 8000;
var http = require('http').createServer(app);
const myio: SocketIO.Server = require('socket.io')(http);

app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(bodyParser.json());

app.post('/mailgun_webhook', multer().none(), (req, res) => {
    fs.writeFile('mailgun/' + req.body['Message-Id'] + '.json', JSON.stringify(req.body, null, 2), () => {
        res.json({ status: "ok" });
        console.log('Received email from: ', req.body['From']);
        mail_algo.update_db_on_mailgun_webhook(req.body, db, myio).then(() => {
            console.log('Parsing done.');
        })
    });
});

app.post('/slack_endpoint', (req, res) => {
    console.log('/slack_endpoint', req.body);
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
            const url = 'slack://channel?team=' + event.team + '&id=' + channel + '&message_ts=' + timestamp_us
            model.post_comment(user_id, session_id, timestamp, comment, url, "", "slack:channel:" + channel).then((r) => {
                if (r.data) {
                    const obj = _.extend({}, { __type: "new_comment", temporary_id: "" }, r.data);
                    axios.post('http://localhost:3000/internal/emit_socket', obj).then((r2) => {
                        console.log(r2);
                    });
                }
            })

            // db.run('insert into comments (id,session_id,user_id,timestamp,comment) values (?,?,?,?,?)', id, session_id, user_id, timestamp, model.cipher(comment));
        }
    });
})

http.listen(port, () => {
    console.log("server is running at port " + port);
});

