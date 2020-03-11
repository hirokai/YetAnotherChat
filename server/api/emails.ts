/// <reference path="../../common/types.d.ts" />
import * as model from '../model'
import { Router } from 'express'
export const router: any = Router();
import { io } from '../socket'
import * as _ from 'lodash';

import * as bunyan from 'bunyan';
const log = bunyan.createLogger({ name: "api.emails", src: true, level: 1 });


router.get('/:id', (req: GetAuthRequest, res, next) => {
    (async () => {
        log.debug('/api/emails/id');
        const data = await model.email.get({ user_id: req.decoded.user_id, message_id: req.params.id });
        if (data) {
            res.json({ ok: true, data });
        } else {
            res.status(404).send('Not found');
        }
    })().catch(next);
});

router.post('/:id/replies', (req: MyPostRequest<PostEmailReplyData>, res: JsonResponse<any>, next) => {
    (async () => {
        const message = req.body.message;
        const reply_to = req.params.id;
        const r = await model.email.reply({ user_id: req.decoded.user_id, message, reply_to });
        res.json({ ok: r.ok });
    })().catch(next);
});

router.get('/', (req: GetAuthRequest, res: JsonResponse<GetEmailsResponse>, next) => {
    (async () => {
        const limit = req.query.limit ? parseInt(req.query.limit) : undefined;
        const offset = req.query.offset ? parseInt(req.query.offset) : undefined;
        const r = await model.email.list({ user_id: req.decoded.user_id, limit, offset });
        res.json({ ok: true, data: r });
    })().catch(next);
});