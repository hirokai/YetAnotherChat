const express = require("express");
const app = express();
const fs = require("fs");
const bodyParser = require("body-parser");
const messages = require("./private/slack_data.json");
const emojis = require("./emojis.json").emojis;
const _ = require('lodash');

app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

const emoji_dict = _.keyBy(emojis, 'shortname');
console.log(emoji_dict);
app.get('/get_slack', (req, res) => {
    res.json(_.map(messages, (obj) => {
        obj.text = obj.text.replace(/(:.+?:)/g, function (m, $1) {
            const r = emoji_dict[$1];
            return r ? r.emoji : $1;
        });
        return obj;
    }));
});

const port = 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.listen(port, () => {
    console.log("server is running at port " + port);
})