const axios = require('axios');
const slack_token = require('./private/credential').slack_token;
const url = 'https://slack.com/api/channels.history?token=&channel=C66HX38F9&pretty=1';

axios.defaults.params = {}
axios.defaults.params['token'] = slack_token;

axios.get(url).then((r) => {
    const data = r.data;
    if (data.ok) {
        console.log(JSON.stringify(data.messages, null, "  "));
    }
});
