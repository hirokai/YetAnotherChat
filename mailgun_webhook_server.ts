/// <reference path="./types.d.ts" />

{
    const express = require('express');
    const app = express();
    const fs = require('fs');
    const multer = require('multer');
    const mail_algo = require('./mail_algo');
    const model = require('./model');
    const path = require('path');
    const sqlite3 = require('sqlite3');
    const db = new sqlite3.Database(path.join(__dirname, 'private/db.sqlite3'));
    const io = require('socket.io')(http);
    const _ = require('lodash');

    const port = 8000;
    var http = require('http').createServer(app);

    app.post('/mailgun_webhook', multer().none(), (req, res) => {
        fs.writeFile('mailgun/' + req.body['Message-Id'] + '.json', JSON.stringify(req.body, null, 2), () => {
            res.json({ status: "ok" });
            const data: MailgunParsed = model.parseMailgunWebhook(req.body);
            mail_algo.find_email_session(db, data).then((session_id: string) => {
                model.post_comment(data.user_id, session_id, data.timestamp, data.comment, data.message_id).then((data1: CommentTyp) => {
                    const obj = _.extend({ __type: "new_comment" }, data1);
                    io.emit("message", obj);
                    console.log("emitted", obj);
                });
                console.log('Received email from: ', req.body['From']);
            });
        });
    });

    http.listen(port, () => {
        console.log("server is running at port " + port);
    })
}