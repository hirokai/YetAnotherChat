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

socket.on("message", (msg: any) => {
    console.log(msg);
    if (msg.__type == "new_comment") {
        msg.timestamp = moment(msg.timestamp).format('YYYY/M/D HH:mm:ss');
        msg = <CommentTypClient>msg;
    }
    app.ports.onSocket.send(msg);
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

const processData = (res: CommentTyp[]): CommentTypClient[] => {
    return map(res, (m) => {
        const user: string = m.user_id || 'myself'
        const v: CommentTypClient = { user, comment: m.comment, timestamp: moment(m.timestamp).format('YYYY/M/D HH:mm:ss'), originalUrl: m.original_url || "", sentTo: m.sent_to || "", session: m.session_id };
        return v;
    });
};

app.ports.createNewSession.subscribe(async function (args: any[]) {
    var name: string = args[0];
    const members: string[] = args[1];
    if (name == "") {
        name = "会話: " + moment().format('MM/DD HH:mm')
    }
    const { data }: PostSessionsResponse = await $.post('http://localhost:3000/api/sessions', { name, members, token });
    console.log('newsession', data);
    app.ports.receiveNewRoomInfo.send(data);
    const p1 = axios.get('http://localhost:3000/api/sessions', { params: { token } });
    const p2 = axios.get('http://localhost:3000/api/comments', { params: { session: data.id, token } });
    const [{ data: { data: data1 } }, { data: { data: data2 } }] = await Promise.all([p1, p2]);
    console.log(data1, data2);
    app.ports.feedRoomInfo.send(data1);
    app.ports.feedMessages.send(processData(data2));
});

function getAndFeedMessages(session: string) {
    const params: GetCommentsParams = { session, token };
    axios.get('http://localhost:3000/api/comments', { params }).then(({ data }) => {
        const values = processData(data);
        console.log(values);
        app.ports.feedMessages.send(values);
        // scrollToBottom();
    });
}

app.ports.getMessages.subscribe(getAndFeedMessages);

app.ports.getUserMessages.subscribe(async function (user: string) {
    const { data } = await axios.get('http://localhost:3000/api/comments', { params: { user, token } });
    app.ports.feedUserMessages.send(processData(data));
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
