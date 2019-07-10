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
    const name = args[0];
    const members = args[1];
    $.post('http://localhost:3000/sessions', { name, members }).then((res) => {
        console.log(res.data);
        app.ports.receiveNewRoomInfo.send(res.data);
    });
});

app.ports.getMessages.subscribe(function () {
    console.log('getMessages called');
    $.get('http://localhost:3000/comments').then((res) => {
        app.ports.feedMessages.send(processData(res));
        // scrollToBottom();
    });
});

app.ports.sendCommentToServer.subscribe(function (comment) {
    $.post('http://localhost:3000/comments', { comment: comment, user: 'myself' }).then((res) => {
        console.log(res);
        scrollToBottom();
    });
});