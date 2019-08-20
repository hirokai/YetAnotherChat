// https://qiita.com/tomoyukilabs/items/eac94fdb2d0ca92f443a

const storeName = 'yacht.keyPair';


export async function saveMyKeys(keyPair: CryptoKeyPair): Promise<void> {
    console.log('saveMyKeys()', keyPair);
    return new Promise((resolve) => {

        const prv_e_p = exportKey(keyPair.privateKey);
        const pub_e_p = exportKey(keyPair.publicKey);
        Promise.all([prv_e_p, pub_e_p]).then((ks) => {
            return Promise.all([fingerPrint(ks[0]), fingerPrint(ks[1])]);
        }).then((fps) => {
            const openReq = indexedDB.open(storeName);
            const fp = { privateKey: fps[0], publicKey: fps[1] };

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
                var putReq = store.put({ id: 'myself', keyPair, fingerPrint: fp });
                putReq.onsuccess = function () {
                    // console.log('put data success');
                    resolve();
                }
                trans.oncomplete = function () {
                    // console.log('transaction complete');
                }
            }
        });
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

export async function savePublicKey(user_id: string, jwk: ExportedFormat): Promise<void> {
    console.log('savePublicKey() 1')
    const publicKey = await importKey(jwk, true);
    console.log('savePublicKey() 2')
    return new Promise((resolve) => {
        const openReq = indexedDB.open(storeName);

        openReq.onupgradeneeded = function (event: any) {
            var db = event.target.result;
            db.createObjectStore(storeName, { keyPath: 'id' });
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


export async function generatePublicKey(exportable = false): Promise<CryptoKeyPair> {
    return crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, exportable, ['deriveKey', 'deriveBits']);
}

type ExportedFormat = JsonWebKey;

export async function exportKey(key: CryptoKey): Promise<ExportedFormat> {
    return crypto.subtle.exportKey('jwk', key);
}

export async function importKey(data: ExportedFormat, is_publicKey: boolean, exportable = false): Promise<CryptoKey> {
    return new Promise((resolve) => {
        crypto.subtle.importKey(
            'jwk',
            data,
            { name: 'ECDH', namedCurve: 'P-256' },
            exportable,
            // https://gist.github.com/pedrouid/b4056fd1f754918ddae86b32cf7d803e#ecdh---importkey
            // Usages must be empty for public keys
            (is_publicKey ? [] : ['deriveKey', 'deriveBits'])
        ).then(key => {
            console.info('importKey() success', data, key);
            resolve(key);
        }, (err) => {
            console.error('importKey() error', err, data);
            resolve(null);
        });
    });
}

//For private key
export async function exportKeyPKCS8(key: CryptoKey): Promise<ArrayBuffer> {
    return crypto.subtle.exportKey('pkcs8', key);
}

//For public key
export async function exportKeySPKI(key: CryptoKey): Promise<ArrayBuffer> {
    return crypto.subtle.exportKey('spki', key);
}

export async function importKeyPKCS8(data: ArrayBuffer, is_publicKey: boolean, exportable = false): Promise<CryptoKey> {
    return new Promise((resolve) => {
        crypto.subtle.importKey(
            'pkcs8',
            data,
            { name: 'ECDH', namedCurve: 'P-256' },
            exportable,
            (is_publicKey ? [] : ['deriveKey', 'deriveBits'])
        ).then(key => {
            // console.log('Imported', jwk, key);
            resolve(key);
        }, (err) => {
            console.error('importKey() error', err);
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
    return new Promise((resolve, reject) => {
        if (!remotePublicKey || !localPrivateKey) {
            console.error('encrypt(): Keys must be non-null.')
            reject();
        }
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
            console.log('getEncryptionKey', { remotePublicKey, localPrivateKey, encryptionKey })
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

// https://stackoverflow.com/a/42590106
export async function fingerPrint(jwk: JsonWebKey): Promise<string> {
    const s = '{"crv":"' + jwk.crv + '","kty":"' + jwk.kty + '","x":"' + jwk.x + '","y":"' + jwk.y + '"}';
    const arr = new TextEncoder().encode(s);
    const hash_arr = await crypto.subtle.digest('SHA-256', arr);
    return encodeBase64URL(new Uint8Array(hash_arr));
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
async function test_encrypt(lk_a: CryptoKey, pk_b: ExportedFormat, input: string): Promise<string> {
    try {
        const imported_b = await importKey(pk_b, true);
        return encrypt_str(imported_b, lk_a, input);
    } catch (e) {
        console.log(e);
    }
}

//Decrypt at B side with B's secret and A's public key.
async function test_decrypt(lk_b: CryptoKey, pk_a: ExportedFormat, input: string): Promise<string> {
    const imported_a = await importKey(pk_a, true);
    return decrypt_str(imported_a, lk_b, input);
}

//Encrypt at A side with A's secret and B's public key.
async function test_encrypt2(lk_a: CryptoKey, lk_b: CryptoKey, input: string): Promise<string> {
    try {
        return encrypt_str(lk_b, lk_a, input);
    } catch (e) {
        console.log(e);
    }
}

//Decrypt at B side with B's secret and A's public key.
async function test_decrypt2(lk_b: CryptoKey, lk_a: CryptoKey, input: string): Promise<string> {
    return decrypt_str(lk_a, lk_b, input);
}

// This works
export function test_crypto() {
    (async () => {
        console.log('test_crypto start');
        const input_string = "暗号化する文字列１";

        const lk_a = await generatePublicKey(true);
        const exported = await exportKey(lk_a.privateKey);
        console.log('test_crypto(): Exported', exported, JSON.stringify(exported));
        const imported_a = await importKey(exported, false);
        console.log('test_crypto(): Imported', imported_a)

        const lk_b = await generatePublicKey(true);

        //Encrypt at A side with A's secret and B's public key.
        const encrypted = await test_encrypt2(imported_a, lk_b.publicKey, input_string);
        console.log('test_crypto', encrypted);
        //Decrypt at B side with B's secret and A's public key.
        const decrypted = await test_decrypt2(lk_b.privateKey, lk_a.publicKey, encrypted);

        console.log('test_crypto', input_string, decrypted);
    })();
}

// This works
export function test_crypto1() {
    (async () => {
        console.log('test_crypto start');
        const input_string = "２番めの暗号化試験";

        const lk_a = await generatePublicKey(true);
        const exported_a = await exportKey(lk_a.publicKey);

        const lk_b = await generatePublicKey(true);
        const exported_b = await exportKey(lk_b.publicKey);

        //Encrypt at A side with A's secret and B's public key.
        const encrypted = await test_encrypt(lk_a.privateKey, exported_b, input_string);
        console.log('test_crypto', encrypted);
        //Decrypt at B side with B's secret and A's public key.
        const decrypted = await test_decrypt(lk_b.privateKey, exported_a, encrypted);

        console.log('test_crypto', input_string, decrypted);
    })();
}

// This works now
export function test_crypto2() {
    (async () => {
        console.log('test_crypto start');
        const input_string = "暗号化する文字列3";

        const lk_a = await generatePublicKey(true);
        const exported = await exportKeyPKCS8(lk_a.privateKey);
        console.log('test_crypto2(): Exported', exported, JSON.stringify(exported));
        const imported_a = await importKeyPKCS8(exported, false);
        console.log('test_crypto2(): Imported', imported_a)

        const lk_b = await generatePublicKey(true);

        //Encrypt at A side with A's secret and B's public key.
        const encrypted = await test_encrypt2(imported_a, lk_b.publicKey, input_string);
        console.log('test_crypto', encrypted);
        //Decrypt at B side with B's secret and A's public key.
        const decrypted = await test_decrypt2(lk_b.privateKey, lk_a.publicKey, encrypted);

        console.log('test_crypto', input_string, decrypted);
    })();
}

// This does NOT work. imported_a cannot be got.
export function test_crypto3() {
    (async () => {
        console.log('test_crypto start');
        const input_string = "4番めの暗号化試験";

        const lk_a = await generatePublicKey(true);
        const exported_a = await exportKeyPKCS8(lk_a.publicKey);
        const imported_a = await importKeyPKCS8(exported_a, true);

        const lk_b = await generatePublicKey(true);
        // const exported_b = await exportKeyPKCS8(lk_b.publicKey);
        // const imported_b = await importKeyPKCS8(exported_b, true);

        //Encrypt at A side with A's secret and B's public key.
        const encrypted = await test_encrypt2(lk_a.privateKey, lk_b.publicKey, input_string);
        console.log('test_crypto', encrypted);
        //Decrypt at B side with B's secret and A's public key.
        const decrypted = await test_decrypt2(lk_b.privateKey, lk_a.publicKey, encrypted);

        console.log('test_crypto', input_string, decrypted);
    })();
}
