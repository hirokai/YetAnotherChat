const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const emojis = require("./emojis.json").emojis;
const _ = require('lodash');
const path = require('path');
const sqlite3 = require('sqlite3');
const db = new sqlite3.Database(path.join(__dirname, './private/db.sqlite3'));
const model = require('./model');
const fs = require('fs');

const port = 3000;

const pretty = require('express-prettify');

app.use(pretty({ query: 'pretty' }));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use('/public', express.static(path.join(__dirname, 'public')))

// db.run('drop table if exists comments;')
db.run('create table  if not exists comments (user_id text, comment text, timestamp integer);')

app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

const emoji_dict = _.keyBy(emojis, 'shortname');

app.get('/matrix', (req, res) => {
    res.set('Content-Type', 'application/json')
    res.send(fs.readFileSync('private/slack_matrix.json', 'utf8'));
});

app.get('/users', (req, res) => {
    // res.set('Content-Type', 'application/json');
    const users = JSON.parse(fs.readFileSync('private/slack_users.json', 'utf8'));
    res.json(_.map(users, (u) => {
        const ts = u.real_name.split(" ");
        const letter = ts[ts.length - 1][0].toLowerCase();
        return { id: u.id, name: u.real_name, username: u.name, avatar: '/public/img/letter/' + letter + '.png' };
    }));
});

const glob = require("glob");

app.get('/comments_by_date_user', (req, res) => {
    const date = req.query.date;
    const user = req.query.user;
    try {
        var files;
        if (user == "__all") {
            files = glob.sync('private/slack_matrix/' + date + "-*.json");
            console.log(files);
        } else {
            const filename = "private/slack_matrix/" + date + "-" + user + ".json";
            files = [path.join(__dirname, filename)];
        }
        const comments = _.flatMap(files, (filename) => {
            console.log('Reading: ' + filename);
            return JSON.parse(fs.readFileSync(filename, 'utf8'));
        });
        res.json(_.map(comments, (c) => {
            const ts_str = "" + (c.ts * 1000000)
            return _.extend({ source: "Slack" }, c)
        }));
    } catch (e) {
        res.status(404);
        res.json({ error: "File not found" })
    }
});


app.get('/comments', (req, res) => {
    db.serialize(() => {
        db.all('select * from comments order by timestamp;', (err, rows) => {
            const messages = _.map(rows, (row) => {
                console.log(row);
                return { text: row.comment, ts: row.timestamp, user: row.user_id, original_url: row.url_original, sent_to: row.sent_to };
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


app.get('/sent_email', (req, res) => {
    model.get_sent_mail(req.query.q).then((data) => {
        res.header("Content-Type", "application/json; charset=utf-8");
        res.json(data);
    });
});


app.post('/comments', (req, res) => {
    db.serialize(() => {
        const ts = new Date().getTime();
        db.run('insert into comments (user_id,comment,timestamp) values (?,?,?);', req.body.user, req.body.comment, ts)
    });
    res.json({ ok: true });
});

app.listen(port, () => {
    console.log("server is running at port " + port);
})