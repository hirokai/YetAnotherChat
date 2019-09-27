/// <reference path="../../common/types.d.ts" />
import * as model from '../model'
import { Router } from 'express'
export const router: any = Router();
import { io } from '../socket'
import { post_session } from './sessions'
import * as _ from 'lodash';

import * as bunyan from 'bunyan';
const log = bunyan.createLogger({ name: "api.workspaces", src: true, level: 1 });


router.post('/', (req: PostRequest<any>, res, next) => {
    (async () => {
        const r = await model.workspaces.create(req.decoded.user_id, req.body.name, req.body.members)
        res.json(r);
    })().catch(next);
})

router.get('/', (req: GetAuthRequest, res: JsonResponse<GetWorkspacesResponse>, next) => {
    (async () => {
        const user_id = req.decoded.user_id;
        const wss = await model.workspaces.list(user_id);
        res.json({ ok: true, data: wss });
    })().catch(next);
});

router.get('/:id', (req: GetAuthRequest, res: JsonResponse<GetWorkspaceResponse>, next) => {
    (async () => {
        if (req.params) {
            const user_id = req.decoded.user_id;
            const workspace_id = req.params.id;
            const ws = await model.workspaces.get(user_id, workspace_id);
            res.json({ ok: ws != null, data: ws || undefined });
        } else {
            res.json({ ok: false });
        }
    })().catch(next);
});

router.post('/:id/join', (req: GetAuthRequest, res: JsonResponse<OkResponse>, next) => {
    (async () => {
        if (req.params) {
            log.info('/:id/join')
            const user_id = req.decoded.user_id;
            const workspace_id = req.params.id;
            const ok = await model.workspaces.add_member(user_id, workspace_id, user_id);
            res.json({ ok });
        } else {
            res.json({ ok: false });
        }
    })().catch(next);
});

router.post('/:id/quit', (req: GetAuthRequest, res: JsonResponse<any>, next) => {
    (async () => {
        if (req.params) {
            log.info('/:id/quit')
            const user_id = req.decoded.user_id;
            const workspace_id = req.params.id;
            const ok = await model.workspaces.remove_member(user_id, workspace_id, user_id);
            res.json({ ok });
        } else {
            res.json({ ok: false });
        }
    })().catch(next);
});

router.get('/:id/sessions', (req: GetAuthRequest, res: JsonResponse<GetSessionsResponse>, next) => {
    (async () => {
        if (req.params) {

            const user_id = req.decoded.user_id;
            const workspace_id = req.params.id;
            const data = await model.sessions.list({ user_id, workspace_id });
            res.json({ ok: data != null, data });
        } else {
            res.json({ ok: false });
        }
    })().catch(next);
});

router.post('/:id/sessions', (req: PostRequest<PostSessionsParam>, res: JsonResponse<PostSessionsResponse>, next) => {
    (async () => {
        const body = req.body;
        const members = _.uniq(body.members.concat([req.decoded.user_id]));
        const name = body.name;
        const temporary_id = body.temporary_id;
        const r = await post_session(req.decoded.user_id, temporary_id, name, members, req.params.id);
        log.debug(r);
        res.json(r);
    })().catch(next);
});

router.patch('/:id', (req: MyPostRequest<UpdateWorkspaceData>, res: JsonResponse<UpdateWorkspaceResponse>, next) => {
    (async () => {
        if (req.params) {
            const user_id = req.decoded.user_id;
            const workspace_id = req.params.id;
            const timestamp = new Date().getTime();
            const { ok, data } = await model.workspaces.update(user_id, workspace_id, req.body);
            if (ok && data) {
                const obj: WorkspacesUpdateSocket = {
                    __type: 'workspaces.update',
                    timestamp,
                    data
                };
                io.emit('workspaces.update', obj);
            }
            res.json({ ok });
        } else {
            res.json({ ok: false });
        }
    })().catch(next);
});

router.delete('/:id', (req: GetAuthRequest, res: JsonResponse<DeleteWorkspaceResponse>, next) => {
    (async () => {
        if (req.params) {
            const user_id = req.decoded.user_id;
            const workspace_id = req.params.id;
            const { ok } = await model.workspaces.remove(user_id, workspace_id);
            res.json({ ok });
        } else {
            res.json({ ok: false });
        }
    })().catch(next);
});
