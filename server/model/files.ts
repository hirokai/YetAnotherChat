

import * as fs from "fs";
import { shortid, db } from './utils'

export function save_user_file(user_id: string, path: string, kind: string, session_id?: string): Promise<{ file_id: string, path: string }> {
    return new Promise((resolve, reject) => {
        const timestamp: number = new Date().getTime();
        const file_id = shortid();
        const abs_path = '/' + path;
        // resolve({ file_id: null, path: null });
        console.log('save_user_file 1');
        db.run('insert into files (id,user_id,path,timestamp,kind) values (?,?,?,?,?);', file_id, user_id, abs_path, timestamp, kind, (err) => {
            console.log('save_user_file 2');
            if (err) {
                console.log('save_user_file error', err);
                reject();
            } else if (session_id != null) {
                console.log('save_user_file 3');
                if (!err) {
                    resolve({ file_id, path });
                } else {
                    reject(err);
                }
            } else {
                resolve({ file_id, path });
            }
        });
    });
}

export function update_user_file(user_id: string, file_id: string, new_path: string): Promise<{ file_id: string, path: string }> {
    return new Promise((resolve) => {
        const timestamp: number = new Date().getTime();
        db.run('update files set path=?,timestamp=? where id=? and user_id=?;', new_path, timestamp, file_id, user_id, (err) => {
            if (!err) {
                resolve({ file_id, path: new_path });
            } else {
                resolve(null);
            }
        });
    });
}

export function list_user_files(kind: string): Promise<{ [key: string]: { url: string } }> {
    return new Promise((resolve) => {
        db.all('select * from files where kind=?;', kind, (err, rows) => {
            //@ts-ignore
            const files: { [key: string]: { url: string } } = groupBy(map(rows || [], (row): { url: string } => {
                return row;
            }), 'user_id');
            resolve(files);
        });
    });
}

export function get(file_id: string): Promise<{ url: string }> {
    return new Promise((resolve) => {
        db.get('select path from files where id=?;', file_id, (err, row) => {
            const path = row ? row['path'] : null;
            resolve({ url: path });
        });
    });
}

export async function delete_file({ user_id, file_id }): Promise<{ ok: boolean, data?: DeleteFileData }> {
    return new Promise((resolve) => {
        db.get('select path from files where id=? and user_id=?;', file_id, user_id, (err1, row1) => {
            db.run('delete from files where id=? and user_id=?;', file_id, user_id, (err) => {
                if (!err1 && !err) {
                    const data: DeleteFileData = { file_id, user_id };
                    const path = row1 ? row1['path'] : null;
                    if (path) {
                        fs.unlink(path, (err2) => {
                            if (!err2) {
                                resolve({ ok: true, data });
                            } else {
                                resolve({ ok: false });
                            }
                        });
                    } else {
                        resolve({ ok: false });
                    }
                } else {
                    resolve({ ok: false });
                }
            });
        });
    });
}