const { Elm } = require('client/dist/main.elm.js');
const app = Elm.Main.init({ flags: { username: localStorage['yacht.username'] || "" } });

const token = localStorage.getItem('yacht.token');

function scrollToBottom() {
    window.setTimeout(() => {
        const el = $('#chat-entries')[0];
        // const el = $('#chat-wrapper')[0];
        el.scrollIntoView({ block: "end", inline: "nearest", behavior: "instant" });
        el.scrollTop = el.height;
        console.log('scrollToBottom', el.clientHeight);
    }, 10);
}

app.ports.scrollToBottom.subscribe(scrollToBottom);

const processData = (res) => {
    return _.map(res, (m, i) => {
        return { user: m.user || 'myself', comment: m.text, timestamp: moment(parseInt(m.ts)).format('YYYY/M/D HH:mm:ss'), originalUrl: m.original_url || "", sentTo: m.sent_to || "" };
    });
};

app.ports.createNewSession.subscribe(function (args) {
    var name = args[0];
    const members = args[1];
    if (name == "") {
        name = "会話: " + moment().format('MM/DD HH:mm')
    }
    $.post('http://localhost:3000/api/sessions', { name, members, token }).then(({ data }) => {
        app.ports.receiveNewRoomInfo.send(data);
        axios.get('http://localhost:3000/api/sessions', { params: { token } }).then(({ data }) => {
            app.ports.feedRoomInfo.send(_.map(data, (r) => {
                return [r.id, r];
            }));
        });
        axios.get('http://localhost:3000/api/comments', { params: { session: res.data.id, token } }).then(({ data }) => {
            app.ports.feedMessages.send(processData(data));
        });
    });
});

app.ports.getMessages.subscribe(function (session) {
    axios.get('http://localhost:3000/api/comments', { params: { session, token } }).then(({ data }) => {
        app.ports.feedMessages.send(processData(data));
        // scrollToBottom();
    });
});

app.ports.getUserMessages.subscribe(function (user) {
    axios.get('http://localhost:3000/api/comments', { params: { user, token } }).then(({ data }) => {
        app.ports.feedUserMessages.send(processData(data));
        // scrollToBottom();
    });
});

app.ports.getSessionsWithSameMembers.subscribe(function ({ members, is_all }) {
    axios.get('http://localhost:3000/api/sessions', { params: { of_members: members.join(','), is_all, token } }).then(({ data }) => {
        app.ports.feedSessionsWithSameMembers.send(_.map(data, (r) => {
            return r.id;
        }));
    });
});

app.ports.getSessionsOf.subscribe(function (user) {
    axios.get('http://localhost:3000/api/sessions', { params: { of_members: user, token } }).then(({ data }) => {
        console.log(data);
        app.ports.feedSessionsOf.send(_.map(data, (r) => {
            return r.id;
        }));
    }).catch(() => {
        app.ports.feedSessionsOf.send([]);
    });
});

app.ports.getRoomInfo.subscribe(function () {
    axios.get('http://localhost:3000/api/sessions', { params: { token } }).then(({ data }) => {
        app.ports.feedRoomInfo.send(_.map(data, (r) => {
            return [r.id, r];
        }));
        // scrollToBottom();
    });
});


app.ports.sendCommentToServer.subscribe(function ({ comment, user, session }) {
    $.post('http://localhost:3000/api/comments', { comment, user, session, token }).then(({ data }) => {
        scrollToBottom();
    });
});

app.ports.sendRoomName.subscribe(({ id, new_name }) => {
    axios.patch('http://localhost:3000/api/sessions/' + id, { name: new_name, token }).then(({ data }) => {
        console.log(data, id, new_name);
    })
});