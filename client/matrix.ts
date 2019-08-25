import map from 'lodash/map';
import keyBy from 'lodash/keyBy';
const moment = require('moment');
import $ from 'jquery';
const { Elm } = require('./view/Matrix.elm');
const app = Elm.Main.init();

function scrollToBottom() {
    window.setTimeout(() => {
        const el = <HTMLDivElement>$('#chat-entries')[0];
        // const el = $('#chat-wrapper')[0];
        el.scrollTop = el.offsetHeight;
    }, 10);
}

app.ports.scrollToBottom.subscribe(scrollToBottom);

app.ports.getMessages.subscribe(function (obj) {
    $.get('/api/matrix', { timespan: obj.timespan }).then((res) => {
        app.ports.feedMatrix.send(res);
    });
});

const processComment = (comment) => {
    return comment.replace(/<@(.+?)>/g, (all, m1) => {
        const n = (users[m1] ? users[m1].name : null) || m1;
        return "@" + n + " "
    });
};

const processMessages = (res) => {
    return map(res, (m) => {
        return { user: m.user || 'myself', comment: processComment(m.text || ""), timestamp: moment(m.ts * 1000).format('YYYY/M/D HH:mm:ss'), originalUrl: m.original_url || "", sentTo: m.sent_to || "", source: m.source || "unknown" };
    });
};

var users = {};

console.log(app.ports);
app.ports.getUsers.subscribe(function () {
    $.get('/users').done((res) => {
        users = keyBy(res, 'id');
        app.ports.feedUsers.send(res);
    }).fail(() => {
        app.ports.feedUsers.send([]);
    });
});

app.ports.getMessageAt.subscribe(function (obj) {
    $.get('/comments_by_date_user', { date: obj[0], user: obj[1] != "" ? obj[1] : null, timespan: obj[2] }).done((res) => {
        app.ports.feedMessages.send(processMessages(res))
    }).fail(() => {
        app.ports.feedMessages.send([]);
    });
});

app.ports.sendCommentToServer.subscribe(function (comment) {
    $.post('/comments', { comment: comment, user: 'myself' }).then(() => {
        scrollToBottom();
    });
});

// https://stackoverflow.com/questions/11700927/horizontal-scrolling-with-mouse-wheel-in-a-div
$.fn['hScroll'] = function () {
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
    $('#matrix-wrapper')['hScroll']();
});
