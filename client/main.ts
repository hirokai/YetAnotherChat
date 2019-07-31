/// <reference path="../types.d.ts" />

// @ts-ignore
import { Elm } from './dist/main.elm.js';
import { map } from 'lodash-es';
import axios from 'axios';
import $ from 'jquery';
import moment from 'moment';
import 'bootstrap';
import io from "socket.io-client";

// @ts-ignore
const socket: SocketIOClient.Socket = io('http://localhost:3000');

const a = 1;
require('moment/locale/ja');
moment.locale('ja');

const app = Elm.Main.init({ flags: { username: localStorage['yacht.username'] || "" } });

const token = localStorage.getItem('yacht.token') || "";

socket.on("new_comment", (msg: any) => {
    console.log(msg);
    getAndFeedMessages(msg.session_id);
});

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
    var name: string = args[0];
    const members: string[] = args[1];
    if (name == "") {
        name = "会話: " + moment().format('MM/DD HH:mm')
    }
    $.post('http://localhost:3000/api/sessions', { name, members, token }).then(({ data }: PostSessionsResponse) => {
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

function getAndFeedMessages(session: string) {
    const params: GetCommentsParams = { session, token };
    axios.get('http://localhost:3000/api/comments', { params }).then(({ data }) => {
        app.ports.feedMessages.send(processData(data));
        // scrollToBottom();
    });
}

app.ports.getMessages.subscribe(getAndFeedMessages);

app.ports.getUserMessages.subscribe(function (user: string) {
    axios.get('http://localhost:3000/api/comments', { params: { user, token } }).then(({ data }) => {
        app.ports.feedUserMessages.send(processData(data));
        // scrollToBottom();
    });
});

app.ports.getSessionsWithSameMembers.subscribe(function ({ members, is_all }: { members: Array<string>, is_all: boolean }) {
    axios.get('http://localhost:3000/api/sessions', { params: { of_members: members.join(','), is_all, token } }).then(({ data }: AxiosResponse<GetSessionsResponse>) => {
        app.ports.feedSessionsWithSameMembers.send(map(data.data, (r) => {
            return r.id;
        }));
    });
});

interface AxiosResponse<T> {
    data: T
}

app.ports.getSessionsOf.subscribe(function (user: string) {
    const params: GetSessionsOfParams = { of_members: user, token };
    axios.get('http://localhost:3000/api/sessions', { params }).then(({ data }: AxiosResponse<GetSessionsResponse>) => {
        console.log(data);
        app.ports.feedSessionsOf.send(map(data.data, (r) => {
            return r.id;
        }));
    }).catch(() => {
        app.ports.feedSessionsOf.send([]);
    });
});

function getAndfeedRoolmInfo() {
    const params: AuthedParams = { token };
    axios.get('http://localhost:3000/api/sessions', { params }).then(({ data }: AxiosResponse<GetSessionsResponse>) => {
        app.ports.feedRoomInfo.send(data.data);
        // scrollToBottom();
    });
}

app.ports.getRoomInfo.subscribe(function () {
    getAndfeedRoolmInfo();
});


app.ports.sendCommentToServer.subscribe(function ({ comment, user, session }: { comment: string, user: string, session: string }) {
    $.post('http://localhost:3000/api/comments', { comment, user, session, token }).then((res: PostCommentResponse) => {
        getAndfeedRoolmInfo();
        scrollToBottom();
    });
});

app.ports.sendRoomName.subscribe(({ id, new_name }: { id: string, new_name: string }) => {
    axios.patch('http://localhost:3000/api/sessions/' + id, { name: new_name, token }).then(({ data }: AxiosResponse<PatchSessionResponse>) => {
        console.log(data, data.ok, id, new_name);
    })
});

app.ports.setPageHash.subscribe(function (hash: string) {
    console.log(hash);
    location.hash = hash;
});

window.addEventListener('hashchange', (ev: HashChangeEvent) => {
    console.log('hashChange', location.hash, app.ports.hashChanged);
    app.ports.hashChanged.send(location.hash);
    return null;
});

app.ports.hashChanged.send(location.hash);
