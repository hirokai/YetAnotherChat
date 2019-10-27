/// <reference path="../../common/types.d.ts" />
import * as model from '../model'
import { Router } from 'express'
export const router: any = Router();
import { io } from '../socket'
import * as _ from 'lodash';

import * as bunyan from 'bunyan';
const log = bunyan.createLogger({ name: "api.sessions", src: true, level: 1 });


router.patch('/:id', (req, res: JsonResponse<PatchSessionResponse>, next) => {
    (async () => {
        const session_id = req.params.id;
        const { name, members } = req.body;
        log.info(name, members);
        const { ok, timestamp } = await model.sessions.update({ session_id, name });
        if (ok && timestamp) {
            const data: SessionsUpdateSocket = {
                __type: 'sessions.update',
                id: session_id,
                name,
                timestamp
            };
            io.emit('sessions.update', data);
            res.json({ ok });
        } else {
            req.json({ ok: false });
        }
    })().catch(next);
});

router.delete('/:id', (req: MyPostRequest<any>, res: JsonResponse<CommentsDeleteResponse>, next) => {
    (async () => {
        const id = req.params.id;
        const ok = await model.sessions.delete_session(req.decoded.user_id, id);
        if (ok) {
            res.json({ ok: true });
            const obj: SessionsDeleteSocket = { __type: 'sessions.delete', id };
            io.emit('sessions.delete', obj);
        } else {
            res.json({ ok: false });
        }
    })().catch(next);
});

router.get('/', (req: GetAuthRequest, res: JsonResponse<GetSessionsResponse>, next) => {
    (async () => {
        console.log(req);
        const ms: string = req.query.of_members;
        const of_members: string[] | undefined = ms ? ms.split(",") : undefined;
        const user_id: string = req.decoded.user_id;
        const limit = req.query.limit ? parseInt(req.query.limit) : undefined;
        const offset = req.query.offset ? parseInt(req.query.offset) : undefined;
        const r = await model.sessions.list({ user_id, of_members, limit, offset });
        res.json({ ok: true, data: r });
    })().catch(next);
});

router.post('/', (req: PostRequest<PostSessionsParam>, res: JsonResponse<PostSessionsResponse>, next) => {
    (async () => {
        const body = req.body;
        const members = _.uniq(body.members.concat([req.decoded.user_id]));
        const name = body.name;
        const temporary_id = body.temporary_id;
        const r = await post_session(req.decoded.user_id, temporary_id, name, members);
        res.json(r);
    })().catch(next);
});

router.post('/join', (req: PostRequest<JoinSessionParam>, res: JsonResponse<JoinSessionResponse>, next) => {
    (async () => {
        const session_id = req.body.session_id;
        const myself = req.decoded.user_id;
        const source = 'self_manual';
        const timestamp = new Date().getTime();
        const user_id = req.decoded.user_id;
        const r: JoinSessionResponse = await model.sessions.add_member({ session_id, user_id, added_user: user_id, source, timestamp });
        res.json(r);
        if (r.ok && r.data) {
            _.map(r.data.members.concat([myself]), async (m: string) => {
                const socket_ids: string[] = await model.users.get_socket_ids(m);
                const data1 = { session_id, user_id: myself };
                socket_ids.forEach(socket_id => {
                    io.to(socket_id).emit("message", _.extend({}, { __type: "new_member" }, data1));
                })
            });
            const socket_ids_newmember: string[] = await model.users.get_socket_ids(myself);
            log.info('emitting to new member', socket_ids_newmember);

            const data2 = await model.sessions.get(myself, session_id);
            if (data2) {
                socket_ids_newmember.forEach(socket_id => {
                    io.to(socket_id).emit("message", _.extend({}, { __type: "new_session" }, data2));
                });
            }
        }
    })().catch(next);
});

router.post('/:session_id/comments/delta', (req: MyPostRequest<GetCommentsDeltaData>, res, next) => {
    // https://qiita.com/yukin01/items/1a36606439123525dc6d
    (async () => {
        const session_id = req.params.session_id;
        const last_updated = req.body.last_updated;
        const cached_ids = req.body.cached_ids;
        // log.info(session_id, last_updated, cached_ids);
        const deltas: CommentChange[] = await model.list_comment_delta({ session_id, cached_ids, for_user: req.decoded.user_id, last_updated });
        res.json(deltas);
    })().catch(next);
});

router.get('/:session_id/comments', (req: GetAuthRequest1<GetCommentsParams>, res: JsonResponse<GetCommentsResponse>, next) => {
    (async () => {
        const session_id = req.params.session_id;
        const by_user = req.query.by_user;
        const after = req.query.after;
        const comments = await model.sessions.list_comments(req.decoded.user_id, session_id, by_user, after);
        res.json({ ok: comments != null, data: comments ? comments : undefined });
    })().catch(next);
});

router.delete('/:session_id/comments/:id', (req: GetAuthRequest, res: JsonResponse<DeleteCommentResponse>, next) => {
    (async () => {
        if (req.params) {
            const comment_id = req.params.id;
            const r = await model.sessions.delete_comment(req.decoded.user_id, comment_id);
            res.json(r);
            if (r.data) {
                const obj: CommentsDeleteSocket = {
                    __type: 'comments.delete',
                    id: comment_id,
                    session_id: r.data.session_id
                };
                io.emit("comments.delete", obj);
            }
        } else {
            res.json({ ok: false });
        }
    })().catch(next);
});

router.get('/:id', (req: GetAuthRequest1<any>, res: JsonResponse<GetSessionResponse>, next) => {
    (async () => {
        const data = await model.sessions.get(req.decoded.user_id, req.params.id);
        if (data) {
            res.json({ ok: true, data });
        } else {
            res.status(404).json({ ok: false });
        }
    })().catch(next);
});

router.patch('/:id', (req: MyPostRequest<UpdateSessionsBody>, res: JsonResponse<UpdateSessionsResponse>, next) => {
    (async () => {
        let ok = true;
        if (req.body.visibility) {
            const ok_ = await model.sessions.set_visibility(req.decoded.user_id, req.body.id, req.body.visibility);
            ok = ok && ok_
        }
        if (ok) {
            res.json({ ok: true });
        } else {
            res.json({ ok: false });
        }
    })().catch(next);
});


router.post('/:session_id/comments', (req: MyPostRequest<PostCommentData>, res: JsonResponse<PostCommentResponse>) => {
    (async () => {
        const timestamp = new Date().getTime();
        const user_id = req.decoded.user_id;
        const comments = req.body.comments;
        const session_id = req.params.session_id;
        const temporary_id = req.body.temporary_id;
        const encrypt = req.body.encrypt;
        log.info('/api/comments');

        if (encrypt == 'ecdh.v1' || encrypt == 'none') {
            const p: PostCommentModelParams = {
                user_id, session_id, timestamp, comments, encrypt
            }
            const rs = await model.sessions.post_comment(p);
            res.json({ ok: true });
            for (let r of rs) {
                const { data: d, for_user, ok, error } = r;
                if (d) {
                    // await email.send_emails_to_session_members({ session_id, user_id, comment: model.make_email_content(d) });
                    const obj: CommentsNewSocket = {
                        __type: 'comment.new',
                        temporary_id,
                        entry: d
                    };
                    const socket_ids = await model.users.get_socket_ids(for_user);
                    log.info('Emitting comments.new', obj);
                    for (let sid of socket_ids) {
                        io.to(sid).emit("comments.new", obj);
                    }
                }
            }
        }
    })().catch(() => {
        res.json({ ok: false, error: "DB error." })
    });
});


export async function post_session(user_id: string, temporary_id: string, name: string, members: string[], workspace?: string) {
    try {
        if (name && members) {
            log.debug(name, members);
            const data = await model.sessions.create(user_id, name, members, 'private', workspace);
            const obj: SessionsNewSocket = {
                __type: 'sessions.new',
                temporary_id,
                id: data.id
            };
            log.debug(data);
            io.emit("sessions.new", obj);
            _.map(members, async (m: string) => {
                const socket_ids: string[] = await model.users.get_socket_ids(m);
                log.info('emitting to', socket_ids);
                socket_ids.forEach(socket_id => {
                    log.info('sessions.new socket', obj);
                    io.to(socket_id).emit("sessions.new", obj);
                })
            });
            return ({ ok: true, data });
        } else {
            return ({ ok: false, error: 'Name and members are necessary' });
        }
    } catch (error) {
        return ({ ok: false, error });
    }
}

