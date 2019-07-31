/// <reference path="../types.d.ts" />

import { Elm } from './dist/main.elm.js';
import { map } from 'lodash-es';
import axios from 'axios';
import $ from 'jquery';
import moment from 'moment';
import 'bootstrap';
require('moment/locale/ja');
moment.locale('ja');

const app = Elm.Main.init({ flags: { username: localStorage['yacht.username'] || "" } });

const token = localStorage.getItem('yacht.token') || "";

function scrollToBottom() {
    window.setTimeout(() => {
        const el = <HTMLDivElement>$('#chat-entries')[0];
        // const el = $('#chat-wrapper')[0];
        // el.scrollIntoView({ block: "end", inline: "nearest", behavior: "instant" });
        el.scrollTop = el.offsetHeight;
        const a = 1;
        console.log('scrollToBottom', el.clientHeight);
    }, 10);
}

app.ports.scrollToBottom.subscribe(scrollToBottom);

const processData = (res: any[]) => {
    return map(res, (m) => {
        return { user: m.user || 'myself', comment: m.text, timestamp: moment(parseInt(m.ts)).format('YYYY/M/D HH:mm:ss'), originalUrl: m.original_url || "", sentTo: m.sent_to || "" };
    });
};

app.ports.createNewSession.subscribe(function (args: any[]) {
    var name = args[0];
    const members = args[1];
    if (name == "") {
        name = "会話: " + moment().format('MM/DD HH:mm')
    }
    $.post('http://localhost:3000/api/sessions', { name, members, token }).then(({ data }) => {
        app.ports.receiveNewRoomInfo.send(data);
        axios.get('http://localhost:3000/api/sessions', { params: { token } }).then(({ data }) => {
            app.ports.feedRoomInfo.send(map(data, (r) => {
                return [r.id, r];
            }));
        });
        axios.get('http://localhost:3000/api/comments', { params: { session: data.id, token } }).then(({ data }) => {
            app.ports.feedMessages.send(processData(data));
        });
    });
});

app.ports.getMessages.subscribe(function (session: string) {
    axios.get('http://localhost:3000/api/comments', { params: { session, token } }).then(({ data }) => {
        app.ports.feedMessages.send(processData(data));
        // scrollToBottom();
    });
});

app.ports.getUserMessages.subscribe(function (user: string) {
    axios.get('http://localhost:3000/api/comments', { params: { user, token } }).then(({ data }) => {
        app.ports.feedUserMessages.send(processData(data));
        // scrollToBottom();
    });
});

app.ports.getSessionsWithSameMembers.subscribe(function ({ members, is_all }: { members: Array<string>, is_all: boolean }) {
    axios.get('http://localhost:3000/api/sessions', { params: { of_members: members.join(','), is_all, token } }).then(({ data }) => {
        app.ports.feedSessionsWithSameMembers.send(map(data, (r) => {
            return r.id;
        }));
    });
});

app.ports.getSessionsOf.subscribe(function (user: string) {
    axios.get('http://localhost:3000/api/sessions', { params: { of_members: user, token } }).then(({ data: { data } }) => {
        console.log(data);
        app.ports.feedSessionsOf.send(map(data, (r) => {
            return r.id;
        }));
    }).catch(() => {
        app.ports.feedSessionsOf.send([]);
    });
});

app.ports.getRoomInfo.subscribe(function () {
    axios.get('http://localhost:3000/api/sessions', { params: { token } }).then(({ data }: { data: { ok: boolean, data: RoomInfo[] } }) => {
        console.log('getRoomInfo', data.data);
        app.ports.feedRoomInfo.send(map(data.data, function (r: RoomInfo): (string | RoomInfo)[] {
            console.log('getRoomInfo loop', r);
            return [r.id, r];
        }));
        // scrollToBottom();
    });
});


app.ports.sendCommentToServer.subscribe(function ({ comment, user, session }: { comment: string, user: string, session: string }) {
    $.post('http://localhost:3000/api/comments', { comment, user, session, token }).then((res: CommentPostResponse) => {
        console.log(res);
        scrollToBottom();
    });
});

app.ports.sendRoomName.subscribe(({ id, new_name }: { id: string, new_name: string }) => {
    axios.patch('http://localhost:3000/api/sessions/' + id, { name: new_name, token }).then(({ data }) => {
        console.log(data, id, new_name);
    })
});