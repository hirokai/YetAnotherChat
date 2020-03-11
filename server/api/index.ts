import * as model from '../model'
import { Router } from 'express'
import { router as users } from './users'
import { router as sessions } from './sessions'
import { router as workspaces } from './workspaces'
import { router as files } from './files'
import { router as keys } from './keys'
import { router as emails } from './emails'
export const router: any = Router();
import { io } from '../socket'

router.use('/users', users);
router.use('/sessions', sessions);
router.use('/workspaces', workspaces);
router.use('/files', files);
router.use('/keys', keys);
router.use('/emails', emails);


router.post('/logout', (req, res, next) => {
    (async () => {
        const user_id = req.decoded.user_id;
        const { timestamp } = await model.delete_connection_of_user(user_id);
        const obj: UsersUpdateSocket = { __type: 'users.update', action: 'online', user_id, online: false, timestamp };
        // ToDo: Add logout for all clients of the same user.
        io.emit('users.update', obj);
        res.json({ ok: true, user_id });
    })().catch(next);
})

router.get('/config', (req: GetAuthRequest, res: JsonResponse<GetConfigResponse>, next) => {
    (async () => {
        const configs = await model.users.get_user_config(req.decoded.user_id);
        res.json({ ok: configs != null, data: configs || undefined });
    })().catch(next);
});

router.post('/config', (req: MyPostRequest<PostConfigData>, res, next) => {
    (async () => {
        const key = req.body.key;
        const value = req.body.value;
        const r = await model.users.set_user_config(req.decoded.user_id, key, value);
        res.json(r);
    })().catch(next);
});

