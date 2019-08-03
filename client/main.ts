/// <reference path="../types.d.ts" />

// @ts-ignore
import { Elm } from './Main.elm';
import { map } from 'lodash-es';
import axios from 'axios';
import $ from 'jquery';
import moment from 'moment';
import 'bootstrap';
import io from "socket.io-client";

// @ts-ignore
const socket: SocketIOClient.Socket = io('');

require('moment/locale/ja');
moment.locale('ja');

const app = Elm.Main.init({ flags: { username: localStorage['yacht.username'] || "" } });

const token = localStorage.getItem('yacht.token') || "";

axios.get('/api/verify_token', { params: { token } }).then(({ data }) => {
    if (!data.valid) {
        location.href = '/login';
    }
});

socket.on("message", (msg: any) => {
    console.log(msg);
    if (msg.__type == "new_comment") {
        msg.timestamp = moment(msg.timestamp).format('YYYY/M/D HH:mm:ss');
        msg = <ChatEntryClient>msg;
    }
    app.ports.onSocket.send(msg);
});

function scrollTo(id) {
    console.log('scrollTo', id);
    window.setTimeout(() => {
        const el = document.getElementById(id);
        if (el) {
            console.log('scrollTo', id);
            el.scrollIntoView(true);
        }
    }, 50);
}

app.ports.scrollTo.subscribe(scrollTo);

type ChatEntry = CommentTyp | SessionEvent;

const processData = (res: ChatEntry[]): ChatEntryClient[] => {
    return map(res, (m1) => {
        console.log('processData', m1);
        const user: string = m1.user_id;
        var v: ChatEntryClient = { id: m1.id, user, comment: "", timestamp: moment(m1.timestamp).format('YYYY/M/D HH:mm:ss'), originalUrl: "", sentTo: "", session: m1.session_id, source: "", kind: m1.kind, action: "" };
        switch (m1.kind) {
            case "comment": {
                const m = <CommentTyp>m1;
                v.comment = m.comment;
                v.originalUrl = m.original_url || "";
                v.sentTo = m.sent_to || "";
                v.source = m.source;
                return v;
            }
            case "event": {
                const m = <SessionEvent>m1;
                v.comment = "（参加しました）";
                v.action = m.action;
                return v;
            }
        }
    });
};

app.ports.createNewSession.subscribe(async function (args: any[]) {
    var name: string = args[0];
    const members: string[] = args[1];
    if (name == "") {
        name = "会話: " + moment().format('MM/DD HH:mm')
    }
    const { data }: PostSessionsResponse = await $.post('/api/sessions', { name, members, token });
    app.ports.receiveNewRoomInfo.send(data);
    const p1 = axios.get('/api/sessions', { params: { token } });
    const p2 = axios.get('/api/comments', { params: { session: data.id, token } });
    const [{ data: { data: data1 } }, { data: { data: data2 } }] = await Promise.all([p1, p2]);
    app.ports.feedRoomInfo.send(data1);
    app.ports.feedMessages.send(processData(data2));
});

function getAndFeedMessages(session: string) {
    const params: GetCommentsParams = { session, token };
    axios.get('/api/comments', { params }).then(({ data }) => {
        const values = processData(data);
        console.log(values);
        app.ports.feedMessages.send(values);
        // scrollToBottom();
    });
}

app.ports.getUsers.subscribe(() => {
    axios.get('/api/users', { params: { token } }).then(({ data }: AxiosResponse<GetUsersResponse>) => {
        const users: string[] = data.data.users;
        console.log(users);
        app.ports.feedUsers.send(users);
    });
});

app.ports.getMessages.subscribe(getAndFeedMessages);

app.ports.getUserMessages.subscribe(async function (user: string) {
    const { data } = await axios.get('/api/comments', { params: { user, token } });
    app.ports.feedUserMessages.send(processData(data));
});

app.ports.getSessionsWithSameMembers.subscribe(function ({ members, is_all }: { members: Array<string>, is_all: boolean }) {
    axios.get('/api/sessions', { params: { of_members: members.join(','), is_all, token } }).then(({ data }: AxiosResponse<GetSessionsResponse>) => {
        app.ports.feedSessionsWithSameMembers.send(map(data.data, (r) => {
            return r.id;
        }));
    });
});

app.ports.getSessionsOf.subscribe(function (user: string) {
    const params: GetSessionsOfParams = { of_members: user, token };
    axios.get('/api/sessions', { params }).then(({ data }: AxiosResponse<GetSessionsResponse>) => {
        app.ports.feedSessionsOf.send(map(data.data, "id"));
    }).catch(() => {
        app.ports.feedSessionsOf.send([]);
    });
});

function getAndfeedRoolmInfo() {
    const params: AuthedParams = { token };
    axios.get('/api/sessions', { params }).then(({ data }: AxiosResponse<GetSessionsResponse>) => {
        app.ports.feedRoomInfo.send(data.data);
        // scrollToBottom();
    });
}

app.ports.getRoomInfo.subscribe(function () {
    getAndfeedRoolmInfo();
});


app.ports.sendCommentToServer.subscribe(function ({ comment, user, session }: { comment: string, user: string, session: string }) {
    $.post('/api/comments', { comment, user, session, token }).then((res: PostCommentResponse) => {
        getAndfeedRoolmInfo();
        scrollTo(res.data.id);
    });
});

app.ports.removeItemRemote.subscribe((comment_id: string) => {
    axios.delete('/api/comments/' + comment_id, { data: { token } }).then(({ data }: AxiosResponse<DeleteCommentResponse>) => {
        console.log(data);
    });
});

app.ports.sendRoomName.subscribe(({ id, new_name }: { id: string, new_name: string }) => {
    axios.patch('/api/sessions/' + id, { name: new_name, token }).then(({ data }: AxiosResponse<PatchSessionResponse>) => {
        console.log(data, data.ok, id, new_name);
    })
});

app.ports.setPageHash.subscribe(function (hash: string) {
    console.log(hash);
    location.hash = hash;
    recalcPositions(true);
});

var show_toppane = true;

function recalcPositions(show_toppane: boolean) {
    $(() => {
        $('#chat-outer').height(window.innerHeight - (show_toppane ? 260 : 100));
    });

    window.addEventListener('resize', () => {
        $('#chat-outer').height(window.innerHeight - (show_toppane ? 260 : 100));
        console.log(window.innerHeight);
    });
}

window.addEventListener('hashchange', () => {
    console.log('hashChange', location.hash, app.ports.hashChanged);
    app.ports.hashChanged.send(location.hash);
    recalcPositions(show_toppane);
    return null;
});

app.ports.hashChanged.send(location.hash);

app.ports.recalcElementPositions.subscribe((b: boolean) => {
    console.log("recalcElementPositions");
    show_toppane = b;
    recalcPositions(b);
});

app.ports.joinRoom.subscribe(({ session_id, user_id }) => {
    $.post('/api/join_session', { token, session_id, user_id }).then((res: JoinSessionResponse) => {
        console.log('join_session', res);
    });
});

// window.setTimeout(() => {
//     var test = document.getElementById("measure-width");
//     test.innerText = "hoge";
//     var height = (test.clientHeight + 1);
//     var width = (test.clientWidth + 1);

//     console.log(height, width);
// }, 1000);
