const fs = require("fs");
const path = require('path');
const _ = require('lodash');

const get_sent_mail = (q) => {
    return new Promise((resolve, reject) => {
        fs.readFile(path.join(process.env.HOME, 'repos/gmail-import/sent_gmail_list.json'), 'utf8', (err, data) => {
            const list = JSON.parse(data);
            const res = _.filter(list, (a) => { return a.to.indexOf(q) != -1; });
            resolve(res);
        });
    });
};

const get_mail_from = (q) => {
    return new Promise((resolve, reject) => {
        fs.readFile(path.join(process.env.HOME, 'repos/gmail-import/all_mail_summary.json'), 'utf8', (err, data) => {
            const list = JSON.parse(data);
            const res = _.filter(list, (a) => { return a.to && (a.to.indexOf("kai@biomems.mech.tohoku.ac.jp") != -1 || a.to.indexOf("kai@tohoku.ac.jp") != -1 || a.to.indexOf("hk.biomems@gmail.com") != -1) && a.from && a.from.indexOf(q) != -1; });
            resolve(res);
        });
    });
};

const get_mail_to = (q) => {
    return new Promise((resolve, reject) => {
        fs.readFile(path.join(process.env.HOME, 'repos/gmail-import/all_mail_summary.json'), 'utf8', (err, data) => {
            const list = JSON.parse(data);
            const res = _.filter(list, (a) => { return a.from && (a.from.indexOf("kai@biomems.mech.tohoku.ac.jp") != -1 || a.from.indexOf("kai@tohoku.ac.jp") != -1 || a.from.indexOf("hk.biomems@gmail.com") != -1) && a.to && a.to.indexOf(q) != -1; });
            resolve(res);
        });
    });
};

module.exports = {
    get_sent_mail,
    get_mail_from,
    get_mail_to
};
