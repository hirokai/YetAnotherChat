/// <reference path="../common/types.d.ts" />
const fs = require('fs');
import * as model from '../server/model'
import * as mail_algo from '../server/mail_algo'
import * as _ from 'lodash';

function main(): void {
    const s = fs.readFileSync(process.argv[2], 'utf8');
    const ms: MailgunParsed[] = model.parseMailgunWebhookThread(JSON.parse(s));
    console.log(_.map(ms, (m) => {
        m.body = '';
        return m;
    }));
}

function test_parse_email_address() {
    const s = '<kai@tohoku.ac.jp>'
    console.log(mail_algo.parse_email_address(s));
}

main();
