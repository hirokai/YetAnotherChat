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
const myio = require('socket.io')(http);
import * as _ from 'lodash';
const bodyParser = require("body-parser");

const port = 8000;
var http = require('http').createServer(app);

app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(bodyParser.json());

app.post('/mailgun_webhook', multer().none(), (req, res) => {
    fs.writeFile('mailgun/' + req.body['Message-Id'] + '.json', JSON.stringify(req.body, null, 2), () => {
        res.json({ status: "ok" });

        const data: MailgunParsed = model.parseMailgunWebhook(req.body);
        mail_algo.find_email_session(db, data).then(async (session_id: string) => {
            const { email } = mail_algo.parse_email_address(data.from);
            const user = await model.find_user_from_email(email);
            model.post_comment(data.from, session_id, data.timestamp, data.comment, data.message_id).then((data1: CommentTyp) => {
                const obj = _.extend({ __type: "new_comment" }, data1);
                myio.emit("message", obj);
                console.log("emitted", obj);
            });
            console.log('Received email from: ', req.body['From']);
        });
    });
});

http.listen(port, () => {
    console.log("server is running at port " + port);
})