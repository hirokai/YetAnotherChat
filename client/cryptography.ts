import { reject } from "lodash-es";

// https://qiita.com/tomoyukilabs/items/eac94fdb2d0ca92f443a

const storeName = 'yacht.keyPair';

export async function saveMyKeys(keyPair: CryptoKeyPair): Promise<void> {
    return new Promise((resolve) => {
        const openReq = indexedDB.open(storeName);

        openReq.onupgradeneeded = function (event: any) {
            var db = event.target.result;
            const objectStore = db.createObjectStore(storeName, { keyPath: 'id' });
            console.log('objectStore', objectStore);

        }
        openReq.onsuccess = function (event: any) {
            // console.log('openReq.onsuccess');
            var db = event.target.result;
            var trans = db.transaction(storeName, 'readwrite');
            var store = trans.objectStore(storeName);
            var putReq = store.put({ id: 'myself', keyPair });

            putReq.onsuccess = function () {
                // console.log('put data success');
                resolve();
            }

            trans.oncomplete = function () {
                // console.log('transaction complete');
            }
        }
    });
}

export async function loadMyKeys(): Promise<CryptoKeyPair> {
    return new Promise((resolve) => {
        const openReq = indexedDB.open(storeName);

        openReq.onupgradeneeded = function (event: any) {
            var db = event.target.result;
            const objectStore = db.createObjectStore(storeName, { keyPath: 'id' });
            console.log('objectStore', objectStore);

        }
        openReq.onsuccess = function (event: any) {
            // console.log('openReq.onsuccess');
            var db = event.target.result;
            var trans = db.transaction(storeName, 'readonly');
            var store = trans.objectStore(storeName);
            var getReq = store.get('myself');

            getReq.onsuccess = function () {
                // console.log('get data success', getReq.result);
                resolve(getReq.result ? getReq.result.keyPair : null);
            }

            trans.oncomplete = function () {
                // トランザクション完了時(putReq.onsuccessの後)に実行
                // console.log('transaction complete');
            }
        }
    });
}

export async function savePublicKey(user_id: string, jwk: JsonWebKey): Promise<void> {
    const publicKey = await importKey(jwk);
    return new Promise((resolve) => {
        const openReq = indexedDB.open(storeName);

        openReq.onupgradeneeded = function (event: any) {
            var db = event.target.result;
            const objectStore = db.createObjectStore(storeName, { keyPath: 'id' });
            // console.log('objectStore', objectStore);

        }
        openReq.onsuccess = function (event: any) {
            // console.log('openReq.onsuccess');
            var db = event.target.result;
            var trans = db.transaction(storeName, 'readwrite');
            var store = trans.objectStore(storeName);
            var putReq = store.put({ id: user_id, publicKey });

            putReq.onsuccess = function () {
                // console.log('put data success');
                resolve();
            }

            trans.oncomplete = function () {
                // console.log('transaction complete');
            }
        }
    });
}

export async function loadPublicKey(user_id: string): Promise<CryptoKey> {
    return new Promise((resolve) => {
        const openReq = indexedDB.open(storeName);

        openReq.onupgradeneeded = function (event: any) {
            var db = event.target.result;
            const objectStore = db.createObjectStore(storeName, { keyPath: 'id' });
            console.log('objectStore', objectStore);

        }
        openReq.onsuccess = function (event: any) {
            // console.log('openReq.onsuccess');
            var db = event.target.result;
            var trans = db.transaction(storeName, 'readonly');
            var store = trans.objectStore(storeName);
            var getReq = store.get(user_id);

            getReq.onsuccess = function () {
                // console.log('get data success', getReq.result);
                resolve(getReq.result ? getReq.result.publicKey : null);
            }

            trans.oncomplete = function () {
                // トランザクション完了時(putReq.onsuccessの後)に実行
                // console.log('transaction complete');
            }
        }
    });
}

export async function removeSavedKeys() {
    return new Promise((resolve) => {
        const openReq = indexedDB.open(storeName);
        openReq.onsuccess = function (event: any) {
            var db = event.target.result;
            var trans = db.transaction(storeName, 'readwrite');
            var store = trans.objectStore(storeName);
            var deleteReq = store.clear();

            deleteReq.onsuccess = function () {
                console.log('delete data success');
                resolve();
            }
            trans.oncomplete = function () {
                // トランザクション完了時(putReq.onsuccessの後)に実行
                console.log('transaction complete');
            }
        }
    });
}


export async function generatePublicKey(): Promise<{ publicKey: JsonWebKey, localKey: CryptoKeyPair }> {
    return new Promise((resolve) => {
        let localKey;
        crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey', 'deriveBits'])
            .then((keyPair: CryptoKeyPair) => {   // 鍵ペアを生成
                console.log('keyPair', keyPair, JSON.stringify(keyPair));
                localKey = keyPair;
                return crypto.subtle.exportKey('jwk', keyPair.publicKey);
            }).then(jwk => { // 公開鍵をJWKとしてエクスポート
                resolve({ publicKey: jwk, localKey });
            });
    });

}

export async function exportKey(key: CryptoKey): Promise<JsonWebKey> {
    return crypto.subtle.exportKey('jwk', key);
}

export async function importKey(jwk: JsonWebKey): Promise<CryptoKey> {
    return new Promise((resolve) => {
        crypto.subtle.importKey(
            'jwk',
            jwk,
            { name: 'ECDH', namedCurve: 'P-256' },
            false,
            []
        ).then(key => {
            // console.log('Imported', jwk, key);
            resolve(key);
        }, (err) => {
            console.log('importKey error', err);
            resolve(null);
        });
    });
}

function getEncryptionKey(remotePublicKey: CryptoKey, localPrivateKey: CryptoKey): Promise<CryptoKey> {
    // console.log('getEncryptionKey', { remotePublicKey, localPrivateKey })
    return new Promise((resolve) => {
        crypto.subtle.deriveBits(  // 鍵共有による共有鍵生成
            { name: 'ECDH', public: remotePublicKey },
            localPrivateKey,
            128
        ).then(bits => {           // 共有鍵のSHA-256ハッシュ値を生成
            return crypto.subtle.digest(
                { name: 'SHA-256' },
                bits
            );
        }).then(digest => {        // ハッシュ値の先頭16オクテットから128ビットAES-GCMの鍵を生成
            return crypto.subtle.importKey(
                'raw',
                digest.slice(0, 16),
                { name: 'AES-GCM', length: 128 },
                false,
                ['encrypt', 'decrypt']
            );
        }).then(key => {
            resolve(key);
        });
    });
}

export async function encrypt(remotePublicKey: CryptoKey, localPrivateKey: CryptoKey, input: Uint8Array): Promise<EncryptedData> {
    return new Promise((resolve) => {
        let iv = crypto.getRandomValues(new Uint8Array(12));
        getEncryptionKey(remotePublicKey, localPrivateKey).then((encryptionKey) => {
            return crypto.subtle.encrypt(
                { name: 'AES-GCM', iv, tagLength: 128 },
                encryptionKey,
                input
            );
        }).then(data => {
            // このresult(iv, data)を相手に渡す
            const result = {
                iv: encodeBase64URL(new Uint8Array(iv)),
                data: encodeBase64URL(new Uint8Array(data))
            };
            resolve(result);
        });
    });
}

export async function encrypt_str(remotePublicKey: CryptoKey, localPrivateKey: CryptoKey, input: string): Promise<string> {
    const encrypted = await encrypt(remotePublicKey, localPrivateKey, toUint8Aarray(input));
    return encrypted.iv + ':' + encrypted.data;
}

export async function decrypt_str(remotePublicKey: CryptoKey, localPrivateKey: CryptoKey, encrypted: string, info?: any): Promise<string> {
    const cs = encrypted.split(':');
    const data = { iv: cs[0], data: cs[1] };
    const decrypted = await decrypt(remotePublicKey, localPrivateKey, data, info);
    return fromUint8Aarray(decrypted);
}

export async function decrypt(remotePublicKey: CryptoKey, localPrivateKey: CryptoKey, encrypted: EncryptedData, info?: any): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
        getEncryptionKey(remotePublicKey, localPrivateKey).then((encryptionKey) => {
            // console.log('decrypt start', encryptionKey, remotePublicKey, localPrivateKey, encrypted);
            // AES-GCMによる復号
            return crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: decodeBase64URL(encrypted.iv), tagLength: 128 },
                encryptionKey,
                decodeBase64URL(encrypted.data)
            );
        }).then(data => {
            resolve(new Uint8Array(data));
        }, (err) => {
            console.log('decrypt() error', info, err);
            reject();
        });
    });
}

// JavaScriptのatob(), btoa()ではURL-safe Base64が扱えないため変換が必要
export function decodeBase64URL(data: string): Uint8Array {
    let decoded = atob(data.replace(/-/g, '+').replace(/_/g, '/'));
    let buffer = new Uint8Array(decoded.length);
    for (let i = 0; i < data.length; i++)
        buffer[i] = decoded.charCodeAt(i);
    return buffer;
}

export function encodeBase64URL(data: Uint8Array): string {
    let output = '';
    for (let i = 0; i < data.length; i++)
        output += String.fromCharCode(data[i]);
    return btoa(output.replace(/\+/g, '-').replace(/\//g, '_')).replace(/=+$/, '');
}

// https://stackoverflow.com/questions/34946642/convert-string-to-uint8array-in-javascript
export function toUint8Aarray(s: string): Uint8Array {
    let uint8Array = new TextEncoder().encode(s);
    return Uint8Array.from(uint8Array)
}

export function fromUint8Aarray(arr: Uint8Array): string {
    return new TextDecoder().decode(arr);
}

//Encrypt at A side with A's secret and B's public key.
async function test_encrypt(input: string, lk_a: CryptoKey, pk_b: JsonWebKey): Promise<string> {
    const imported_b = await importKey(pk_b);
    return encrypt_str(imported_b, lk_a, input);
}

//Decrypt at B side with B's secret and A's public key.
async function test_decrypt(input: string, lk_b: CryptoKey, pk_a: JsonWebKey): Promise<string> {
    const imported_a = await importKey(pk_a);
    return decrypt_str(imported_a, lk_b, input);
}

export function test_crypto() {
    (async () => {
        console.log('test_crypto start');
        const input_string = "いいねこのアルゴリズムは。";
        const { publicKey: pk_a, localKey: lk_a } = await generatePublicKey();
        const { publicKey: pk_b, localKey: lk_b } = await generatePublicKey();

        //Encrypt at A side with A's secret and B's public key.
        const encrypted = await test_encrypt(input_string, lk_a.privateKey, pk_b);
        console.log('test_crypto', encrypted);
        //Decrypt at B side with B's secret and A's public key.
        const decrypted = await test_decrypt(encrypted, lk_b.privateKey, pk_a);

        console.log('test_crypto', input_string, decrypted);
    })();
}
