function ab2str(buf: ArrayBuffer): string {
    var result = '';
    if (buf) {
        var bytes = new Uint8Array(buf);
        for (var i = 0; i < bytes.byteLength; i++) {
            result = result + String.fromCharCode(bytes[i]);
        }
    }
    return result;
}
function str2ab(str: string): Uint8Array {
    var bytes = new Uint8Array(str.length);
    for (var iii = 0; iii < str.length; iii++) {
        bytes[iii] = str.charCodeAt(iii);
    }
    return bytes;
}

const encodingFunc: (a: Uint8Array) => string = encodeBase64URL2;
const decodingFunc: (a: string) => Uint8Array = decodeBase64URL2;

export const encode = encodingFunc
export const decode = decodingFunc

// https://qiita.com/tomoyukilabs/items/eac94fdb2d0ca92f443a
export async function generateKeyPair(exportable = false): Promise<CryptoKeyPair> {
    return crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, exportable, ['deriveKey', 'deriveBits']);
}

type ExportedFormat = JsonWebKey;

export async function exportKey(key: CryptoKey): Promise<ExportedFormat> {
    return crypto.subtle.exportKey('jwk', key);
}

export async function importKey(data: ExportedFormat, is_publicKey: boolean, exportable = false): Promise<CryptoKey> {
    return new Promise((resolve, reject) => {
        crypto.subtle.importKey(
            'jwk',
            data,
            { name: 'ECDH', namedCurve: 'P-256' },
            exportable,
            // https://gist.github.com/pedrouid/b4056fd1f754918ddae86b32cf7d803e#ecdh---importkey
            // Usages must be empty for public keys
            (is_publicKey ? [] : ['deriveKey', 'deriveBits'])
        ).then(key => {
            // console.info('importKey() success', data, key);
            resolve(key);
        }, (err) => {
            // console.error('importKey() error', err, data);
            reject(err);
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
    return new Promise((resolve, reject) => {
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
            reject(err);
        });
    });
}

function getEncryptionKey(remotePublicKey: CryptoKey, localPrivateKey: CryptoKey): Promise<CryptoKey> {
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
            console.log('Importing with digest: ', digest)
            const key = crypto.subtle.importKey(
                'raw',
                digest.slice(0, 16),
                { name: 'AES-GCM', length: 128 },
                true,
                ['encrypt', 'decrypt']
            );
            return key;
        }).then(key => {
            console.log('Key obtained: ', key);
            resolve(key);
        });
    });
}

export async function generateKeyAndEncryptString(input: string): Promise<{ secret: string, result: string }> {
    const { secret, iv, data } = await generateKeyAndEncrypt(toUint8Array(input));
    return { secret: encodeBase64URL(new Uint8Array(secret)), result: encodeBase64URL(iv) + ':' + encodeBase64URL(new Uint8Array(data)) };
}

export async function generateKeyAndEncrypt(input: Uint8Array): Promise<{ secret: ArrayBuffer, iv: Uint8Array, data: ArrayBuffer }> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const bits = crypto.getRandomValues(new Uint8Array(12));
    let secret;
    return new Promise((resolve) => {
        crypto.subtle.digest(
            { name: 'SHA-256' },
            bits
        ).then(digest => {        // ハッシュ値の先頭16オクテットから128ビットAES-GCMの鍵を生成
            secret = digest;
            return crypto.subtle.importKey(
                'raw',
                digest.slice(0, 16),
                { name: 'AES-GCM', length: 128 },
                true,
                ['encrypt', 'decrypt']
            );
        }).then(encryptionKey => {
            return crypto.subtle.encrypt(
                { name: 'AES-GCM', iv, tagLength: 128 },
                encryptionKey,
                input
            );
        }).then(data => {
            resolve({ secret, iv, data });
        });
    });
}

export async function decryptWithEncryptionKey(input: Uint8Array, iv_str: string, encryptionKey: CryptoKey): Promise<Uint8Array> {
    const kp1 = await generateKeyPair(true);
    const kp2 = await generateKeyPair(true);
    const iv = decodingFunc(iv_str);
    return crypto.subtle.decrypt(
        { name: 'AES-GCM', iv, tagLength: 128 },
        encryptionKey,
        input
    ).then(data => {
        return (new Uint8Array(data));
    });
}


export async function importEncryptionKey(key_str: string, exportable = false): Promise<CryptoKey> {
    const digest = decodingFunc(key_str);
    return crypto.subtle.importKey(
        'raw',
        digest.slice(0, 16),
        { name: 'AES-GCM', length: 128 },
        exportable,
        ['encrypt', 'decrypt']
    );
}

export async function encrypt(remotePublicKey: CryptoKey, localPrivateKey: CryptoKey, input: Uint8Array): Promise<EncryptedData> {
    const fp1 = await fingerPrint1(remotePublicKey);
    const fp2 = await fingerPrint1(localPrivateKey);
    let iv = crypto.getRandomValues(new Uint8Array(12));
    console.log('encrypt() start', iv, fromUint8Array(input), { remote_pub: fp1, self_prv: fp2, remotePublicKey });

    return new Promise((resolve, reject) => {
        if (!remotePublicKey || !localPrivateKey) {
            console.error('encrypt(): Keys must be non-null.')
            reject();
        }
        getEncryptionKey(remotePublicKey, localPrivateKey).then((encryptionKey) => {
            return crypto.subtle.encrypt(
                { name: 'AES-GCM', iv, tagLength: 128 },
                encryptionKey,
                input
            );
        }).then(data => {
            // このresult(iv, data)を相手に渡す
            const result = {
                iv: encodingFunc(new Uint8Array(iv)),
                data: encodingFunc(new Uint8Array(data))
            };
            resolve(result);
        });
    });
}

export async function encrypt_str(remotePublicKey: CryptoKey, localPrivateKey: CryptoKey, input: string): Promise<string> {
    const encrypted = await encrypt(remotePublicKey, localPrivateKey, toUint8Array(input));
    const fp1 = await fingerPrint1(remotePublicKey);
    console.log('Encrypted for remote pub', fp1, encrypted);
    return encrypted.iv + ':' + encrypted.data;
}

export async function decrypt_str(remotePublicKey: CryptoKey, localPrivateKey: CryptoKey, encrypted: string, info?: any): Promise<string> {
    const cs = encrypted.split(':');
    const data = { iv: cs[0], data: cs[1] };
    const decrypted = await decrypt(remotePublicKey, localPrivateKey, data, info);
    return fromUint8Array(decrypted);
}

export async function decrypt(remotePublicKey: CryptoKey, localPrivateKey: CryptoKey, encrypted: EncryptedData, info?: any): Promise<Uint8Array> {
    const fp1 = await fingerPrint1(remotePublicKey);
    const fp2 = await fingerPrint1(localPrivateKey);

    return new Promise((resolve, reject) => {
        getEncryptionKey(remotePublicKey, localPrivateKey).then((encryptionKey) => {
            // console.log('getEncryptionKey', { remotePublicKey, localPrivateKey, encryptionKey })
            console.log('decrypt start', decodingFunc(encrypted.iv), encryptionKey, remotePublicKey, localPrivateKey, encrypted);
            // AES-GCMによる復号
            return crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: decodingFunc(encrypted.iv), tagLength: 128 },
                encryptionKey,
                decodingFunc(encrypted.data)
            );
        }).then(data => {
            resolve(new Uint8Array(data));
        }, (err) => {
            console.log('decrypt() error', { remote_pub: fp1, self_prv: fp2 }, encrypted, err);
            reject();
        });
    });
}

function encode2(buf_: ArrayBuffer): string {
    const buf = new Uint8Array(buf_);
    let str = '';
    for (let i = 0; i < buf.byteLength; i++) {
        const s = buf[i].toString(16);
        str += buf[i] >= 16 ? ('0' + s) : s;
    }
    return str;
}

function decode2(str: string): Uint8Array {
    const buf = new Uint8Array(str.length / 2);
    for (let i = 0; i < str.length; i++) {
        const n = parseInt(str.slice(i * 2, i * 2 + 2), 16);
        buf[i] = n;
    }
    return buf;
}

// https://qiita.com/isyumi_net/items/23926604d7d6ccf9a8a5
function encode1(encMessage: ArrayBuffer): string {
    return btoa(String.fromCharCode.apply(null, new Uint8Array(encMessage)))
}

function decode1(src: string): Uint8Array {
    return new Uint8Array((new Uint16Array([].map.call(src, function (c) {
        return c.charCodeAt(0)
    }))).buffer);
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

export function decodeBase64URL2(data: string): Uint8Array {
    let decoded = atob(data);
    let buffer = new Uint8Array(decoded.length);
    for (let i = 0; i < data.length; i++)
        buffer[i] = decoded.charCodeAt(i);
    return buffer;
}

export function encodeBase64URL2(data: Uint8Array): string {
    let output = '';
    for (let i = 0; i < data.length; i++)
        output += String.fromCharCode(data[i]);
    return btoa(output);
}


export async function fingerPrint1(key: CryptoKey): Promise<string> {
    const jwk = await exportKey(key);
    return fingerPrint(jwk);
}

// https://stackoverflow.com/a/42590106
// Extended for private key
export async function fingerPrint(jwk: JsonWebKey): Promise<string> {
    let s;
    if (jwk["d"]) {
        s = '{"crv":"' + jwk.crv + '","d":"' + jwk.d + '","kty":"' + jwk.kty + '","x":"' + jwk.x + '","y":"' + jwk.y + '"}';
    } else {
        s = '{"crv":"' + jwk.crv + '","kty":"' + jwk.kty + '","x":"' + jwk.x + '","y":"' + jwk.y + '"}';
    }
    // console.log('fingerPrint(): json', s);
    const arr = new TextEncoder().encode(s);
    const hash_arr = await crypto.subtle.digest('SHA-256', arr);
    return encodingFunc(new Uint8Array(hash_arr));
}

// https://stackoverflow.com/questions/34946642/convert-string-to-uint8array-in-javascript
export function toUint8Array(s: string): Uint8Array {
    return new TextEncoder().encode(s);
}

export function fromUint8Array(arr: Uint8Array): string {
    return new TextDecoder().decode(arr);
}

