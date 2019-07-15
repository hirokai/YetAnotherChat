const app = Elm.Main.init();

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
    $.post('http://localhost:3000/sessions', { name, members }).then((res) => {
        console.log(res.data);
        app.ports.receiveNewRoomInfo.send(res.data);
        $.get('http://localhost:3000/sessions').then((res) => {
            app.ports.feedRoomInfo.send(_.map(res, (r) => {
                return [r.id, r];
            }));
            // scrollToBottom();
        });
        $.get('http://localhost:3000/comments', { session: res.data.id }).then((res) => {
            app.ports.feedMessages.send(processData(res));
            // scrollToBottom();
        });
    });
});

app.ports.getMessages.subscribe(function (session) {
    $.get('http://localhost:3000/comments', { session }).then((res) => {
        app.ports.feedMessages.send(processData(res));
        // scrollToBottom();
    });
});

app.ports.getSessionsWithSameMembers.subscribe(function (members) {
    $.get('http://localhost:3000/sessions', { of_members: members.join(','), is_all: true }).then((res) => {
        app.ports.feedSessionsWithSameMembers.send(_.map(res, (r) => {
            return r.id;
        }));
    });
});

app.ports.getRoomInfo.subscribe(function () {
    $.get('http://localhost:3000/sessions').then((res) => {
        app.ports.feedRoomInfo.send(_.map(res, (r) => {
            return [r.id, r];
        }));
        // scrollToBottom();
    });
});


app.ports.sendCommentToServer.subscribe(function ({ comment, user, session }) {
    $.post('http://localhost:3000/comments', { comment, user, session }).then((res) => {
        console.log(res);
        scrollToBottom();
    });
});

app.ports.sendRoomName.subscribe(({ id, newName }) => {
    console.log(id, newName);
})