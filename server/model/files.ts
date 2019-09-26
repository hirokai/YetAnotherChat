

import * as fs from "fs";
import { shortid, pool } from './utils'
import { groupBy, map } from 'lodash';
import * as util from 'util';
const unlink = util.promisify(fs.unlink);

export async function save_user_file(user_id: string, path: string, kind: string, session_id?: string): Promise<{ file_id: string, path: string }> {
    const timestamp: number = new Date().getTime();
    const file_id = shortid();
    const abs_path = '/' + path;
    // resolve({ file_id: null, path: null });
    await pool.query('insert into files (id,user_id,path,timestamp,kind) values ($1,$2,$3,$4,$5);', [file_id, user_id, abs_path, timestamp, kind]);
    return { file_id, path };
}

export async function update_user_file(user_id: string, file_id: string, new_path: string): Promise<{ file_id: string, path: string }> {
    const timestamp: number = new Date().getTime();
    await pool.query('update files set path=$1,timestamp=$2 where id=$3 and user_id=$4;', [new_path, timestamp, file_id, user_id]);
    return { file_id, path: new_path };
}

export async function list_user_files(kind: string): Promise<{ [key: string]: { url: string }[] }> {
    const rows = (await pool.query('select * from files where kind=$1;', [kind])).rows;
    const files: { [key: string]: { url: string }[] } = groupBy(map(rows || [], (row): { url: string } => {
        return row;
    }), 'user_id');
    return files;
}

export async function get(file_id: string): Promise<{ url: string }> {
    const row = (await pool.query('select path from files where id=$1;', [file_id])).rows[0];
    return { url: row ? row['path'] : null };
}

export async function delete_file({ user_id, file_id }): Promise<{ ok: boolean, data?: DeleteFileData }> {
    const row1 = (await pool.query('select path from files where id=$1 and user_id=$2;', [file_id, user_id])).rows[0];
    await pool.query('delete from files where id=$1 and user_id=$2;', [file_id, user_id]);
    const data: DeleteFileData = { file_id, user_id };
    const path = row1 ? row1['path'] : null;
    if (path) {
        try {
            await unlink(path);
            return { ok: true, data };
        } catch{
            return { ok: false };
        }
    } else {
        return { ok: false };
    }
}