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
import { Socket } from 'net';
const bodyParser = require("body-parser");


function main() {
    const port = 8000;
    var http = require('http').createServer(app);
    const myio: SocketIO.Server = require('socket.io')(http);

    app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
    app.use(bodyParser.json());

    app.post('/mailgun_webhook', multer().none(), (req, res) => {
        fs.writeFile('mailgun/' + req.body['Message-Id'] + '.json', JSON.stringify(req.body, null, 2), () => {
            res.json({ status: "ok" });
            console.log('Received email from: ', req.body['From']);
            mail_algo.update_db_on_mailgun_webhook(req.body, myio).then(() => {
                console.log('Parsing done.');
            })
        });
    });

    http.listen(port, () => {
        console.log("server is running at port " + port);
    });
}

if (require.main === module) {
    main();
}
