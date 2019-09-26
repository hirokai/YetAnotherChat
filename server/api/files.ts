/// <reference path="../../common/types.d.ts" />
import * as model from '../model'
import { Router } from 'express'
export const router: any = Router();
import { io } from '../socket'
import * as _ from 'lodash';
import multer from 'multer';

import * as bunyan from 'bunyan';
const log = bunyan.createLogger({ name: "api.files", src: true, level: 1 });

const upload = multer({
    dest: './uploads/',
    limits: {
        fieldNameSize: 1000,
        files: 100,
        fileSize: 1000 * 1000 * 10
    }
}).single('user_image');

router.get('/api/files', (req, res, next) => {
    (async () => {
        const files = await model.files.list_user_files(req.query.kind);
        res.json({ ok: true, files: files });
    })().catch(next);
});

router.post('/api/files', (req, res, next) => {
    (async () => {
        const { kind, session_id } = req.query;
        const err = await new Promise((resolve) => {
            upload(req, res, function (e) {
                resolve(e);
            });
        });
        log.info('/api/files', err, req.file);
        if (!err) {
            const { file_id } = await model.files.save_user_file(req.decoded.user_id, req.file.path, kind, session_id);
            log.info('save_user_file done', file_id)
            const file = {
                path: '/' + req.file.path,
                file_id,
            }
            res.json({ ok: true, files: [file] });
        } else {
            res.json({ ok: false });
        }
    })().catch(next);
});

router.patch('/api/files/:id', (req, res: JsonResponse<PostFileResponse>, next) => {
    (async () => {
        const err = await new Promise((resolve) => {
            upload(req, <any>res, function (e) {
                resolve(e);
            });
        });
        log.info('/api/files', err, req.file);
        if (!err) {
            const r = await model.files.update_user_file(req.decoded.user_id, req.params.id, req.file.path);
            if (r != null) {
                const data: PostFileResponseData = {
                    path: '/' + req.file.path,
                    file_id: r.file_id,
                    user_id: req.decoded.user_id
                };
                res.json({ ok: true, data });
                const obj = _.extend({}, { __type: "new_file" }, data);
                log.info('/api/files/:id emitting', obj);
                io.emit("message", obj);
            }
        } else {
            res.json({ ok: false });
        }
    })().catch(next);
});

router.delete('/api/files/:id', (req: DeleteRequest<DeleteFileRequestParam, DeleteFileRequestData>, res: JsonResponse<DeleteFileResponse>, next) => {
    (async () => {
        log.info('delete comment');
        const file_id = req.params.id;
        const user_id = req.body.user_id;
        const r = await model.files.delete_file({ user_id, file_id });
        res.json(r);
        if (r.ok) {
            const obj: FilesDeleteSocket = {
                __type: 'files.delete'
            };
            io.emit("files.delete", obj);
        }
    })().catch(next);
});
