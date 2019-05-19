const express = require("express");
const app = express();
const fs = require("fs");
const bodyParser = require("body-parser");
const emojis = require("./emojis.json").emojis;
const _ = require('lodash');
const path = require('path');
const sqlite3 = require('sqlite3');
const db = new sqlite3.Database(path.join(__dirname, './private/db.sqlite3'));

const port = 3000;

const pretty = require('express-prettify');

app.use(pretty({ query: 'pretty' }));


app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// db.run('drop table if exists comments;')
db.run('create table  if not exists comments (user_id text, comment text, timestamp integer);')

app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

const emoji_dict = _.keyBy(emojis, 'shortname');

app.get('/get_slack', (req, res) => {
    db.serialize(() => {
        db.all('select * from comments;', (err, rows) => {
            const messages = _.map(rows, (row) => {
                return { text: row.comment, ts: row.timestamp, user: row.user_id };
            });
            res.json(_.map(messages, (obj) => {
                obj.text = obj.text.replace(/(:.+?:)/g, function (m, $1) {
                    const r = emoji_dict[$1];
                    return r ? r.emoji : $1;
                });
                return obj;
            }));
        });
    })
});

app.post('/comment', (req, res) => {
    db.serialize(() => {
        const ts = new Date().getTime();
        db.run('insert into comments (user_id,comment,timestamp) values (?,?,?);', req.body.user, req.body.comment, ts)
    });
    res.json({ ok: true });
});

app.listen(port, () => {
    console.log("server is running at port " + port);
})