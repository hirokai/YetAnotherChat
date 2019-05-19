const app = Elm.Main.init();

function scrollToBottom() {
    window.setTimeout(() => {
        console.log('scrollToBottom');
        const el = $('#chat-entries')[0];
        el.scrollIntoView({ block: "end", inline: "nearest", behavior: "instant" });
    }, 10);
}

app.ports.scrollToBottom.subscribe(scrollToBottom);

const processData = (res) => {
    return _.orderBy(_.map(res, (m, i) => {
        return { user: user_list[m.user] || 'myself', comment: m.text, timestamp: moment(parseFloat(m.ts)).format('YYYY/M/D HH:mm:ss') };
    }), 'timestamp', 'asc');
};

app.ports.getMessages.subscribe(function () {
    console.log('getMessages called');
    $.get('http://localhost:3000/get_slack').then((res) => {
        app.ports.feedMessages.send(processData(res));
        scrollToBottom();
    });
});

app.ports.sendCommentToServer.subscribe(function (comment) {
    $.post('http://localhost:3000/comment', { comment: comment, user: 'myself' }).then((res) => {
        console.log(res);
    });
});