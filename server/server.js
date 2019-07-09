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
const moment = require('moment');

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
    res.send(fs.readFileSync('public/html/matrix.html', 'utf8'));
});

app.get('/api/matrix', (req, res) => {
    const span = req.query.timespan;
    console.log(span);
    res.set('Content-Type', 'application/json')
    res.send(fs.readFileSync('private/slack_count_' + span + '.json', 'utf8'));
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

function expandSpan(date, span) {
    console.log('expandSpan', span);
    if (span == "day") {
        return [date];
    } else if (span == "week") {
        const m = moment(date, "YYYYMMDD");
        return _.map(_.range(1, 8), (i) => {
            const m1 = _.clone(m);
            m1.isoWeekday(i);
            return m1.format("YYYYMMDD");
        });
    } else if (span == "month") {
        const m = moment(date, "YYYYMMDD");
        const daysList = [31, m.isLeapYear() ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        return _.map(_.range(1, daysList[m.month()] + 1), (i) => {
            const m1 = _.clone(m);
            m1.date(i);
            return m1.format("YYYYMMDD");
        });
    }
}

app.get('/comments_by_date_user', (req, res) => {
    const date_ = req.query.date;
    const user = req.query.user;
    const span = req.query.timespan;
    try {
        const dates = expandSpan(date_, span);
        const all_files = _.flatMap(dates, (date) => {
            if (user == "__all") {
                files = glob.sync('private/slack_matrix/' + date + "-*.json");
            } else {
                const filename = "private/slack_matrix/" + date + "-" + user + ".json";
                files = [path.join(__dirname, filename)];
            }
            return files;
        });
        const comments = _.sortBy(_.compact(_.flatMap(all_files, (filename) => {
            if (fs.existsSync(filename)) {
                return JSON.parse(fs.readFileSync(filename, 'utf8'));
            } else {
                return null;
            }
        })), (e) => { return parseFloat(e.ts); });
        res.json(_.map(comments, (c) => {
            const ts_str = "" + (c.ts * 1000000)
            return _.extend({ source: "Slack" }, c)
        }));
    } catch (e) {
        console.log(e);
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
    return [date];
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