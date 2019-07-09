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

app.ports.getMessages.subscribe(function () {
    $.get('http://localhost:3000/matrix').then((res) => {
        console.log(res);
        app.ports.feedMatrix.send(res);
    });
});

const processData = (res) => {
    return _.map(res, (m, i) => {
        return { user: m.user || 'myself', comment: m.text || "", timestamp: moment(m.ts * 1000).format('YYYY/M/D HH:mm:ss'), originalUrl: m.original_url || "", sentTo: m.sent_to || "", source: m.source || "unknown" };
    });
};

var users = {};

app.ports.getUsers.subscribe(function () {
    $.get('http://localhost:3000/users').done((res) => {
        users = _.keyBy(res, 'id');
        console.log(res, users);
        app.ports.feedUsers.send(res);
    }).fail(() => {
        app.ports.feedUsers.send([]);
    });
});

app.ports.getMessageAt.subscribe(function (obj) {
    $.get('http://localhost:3000/comments_by_date_user', { date: obj[0], user: obj[1] }).done((res) => {
        console.log(processData(res));
        app.ports.feedMessages.send(processData(res))
    }).fail(() => {
        app.ports.feedMessages.send([]);
    });
});

app.ports.sendCommentToServer.subscribe(function (comment) {
    $.post('http://localhost:3000/comments', { comment: comment, user: 'myself' }).then((res) => {
        console.log(res);
        scrollToBottom();
    });
});

// https://stackoverflow.com/questions/11700927/horizontal-scrolling-with-mouse-wheel-in-a-div
$.fn.hScroll = function (options) {
    function scroll(obj, e) {
        var evt = e.originalEvent;
        var direction = evt.detail ? evt.detail * (-120) : evt.wheelDelta;

        if (direction > 0) {
            direction = $(obj).scrollLeft() - 120;
        }
        else {
            direction = $(obj).scrollLeft() + 120;
        }

        $(obj).scrollLeft(direction);

        e.preventDefault();
    }

    $(this).width($(this).find('div').width());

    $(this).bind('DOMMouseScroll mousewheel', function (e) {
        scroll(this, e);
    });
}

$(document).ready(function () {
    $('#matrix-wrapper').hScroll();
});
