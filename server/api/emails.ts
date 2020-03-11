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
        res.json({ ok: true, data });
    })().catch(next);
});

router.get('/', (req: GetAuthRequest, res, next) => {
    (async () => {
        const limit = req.query.limit ? parseInt(req.query.limit) : undefined;
        const offset = req.query.offset ? parseInt(req.query.offset) : undefined;
        const r = await model.email.list({ user_id: req.decoded.user_id, limit, offset });
        res.json({ ok: true, data: r });
    })().catch(next);
});