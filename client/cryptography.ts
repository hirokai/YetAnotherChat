// https://qiita.com/tomoyukilabs/items/eac94fdb2d0ca92f443a

export async function generatePublicKey(): Promise<{ publicKey: JsonWebKey, privateKey: JsonWebKey }> {
    return new Promise((resolve) => {
        let privateKey;
        crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits'])
            .then((keyPair: CryptoKeyPair) => {   // 鍵ペアを生成
                crypto.subtle.exportKey('jwk', keyPair.privateKey).then((r) => {
                    console.log('private key', r);
                    privateKey = r;
                }, (e) => {
                    console.log('private key error', e);
                });
                return crypto.subtle.exportKey('jwk', keyPair.publicKey);
            }).then(jwk => { // 公開鍵をJWKとしてエクスポート
                resolve({ publicKey: jwk, privateKey });
            });
    });

}

export async function importKey(jwk: JsonWebKey): Promise<CryptoKey> {
    return new Promise((resolve) => {
        console.log('importing', jwk);
        crypto.subtle.importKey(
            'jwk',
            jwk,
            { name: 'ECDH', namedCurve: 'P-256' },
            false,
            []
        ).then(key => {
            console.log(key);
            resolve(key);
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

type EncryptedData = {
    iv: string,
    data: string
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

export async function decrypt(remotePublicKey: CryptoKey, localPrivateKey: CryptoKey, encrypted: EncryptedData): Promise<Uint8Array> {
    return new Promise((resolve) => {
        getEncryptionKey(remotePublicKey, localPrivateKey).then((encryptionKey) => {
            console.log('encryptionKey', encryptionKey);
            // AES-GCMによる復号
            return crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: decodeBase64URL(encrypted.iv), tagLength: 128 },
                encryptionKey,
                decodeBase64URL(encrypted.data)
            );
        }).then(data => {
            resolve(new Uint8Array(data));
        });
    });
}

// JavaScriptのatob(), btoa()ではURL-safe Base64が扱えないため変換が必要
function decodeBase64URL(data: string): Uint8Array {
    let decoded = atob(data.replace(/\-/g, '+').replace(/_/g, '/'));
    let buffer = new Uint8Array(decoded.length);
    for (let i = 0; i < data.length; i++)
        buffer[i] = decoded.charCodeAt(i);
    return buffer;
}

function encodeBase64URL(data: Uint8Array): string {
    let output = '';
    for (let i = 0; i < data.length; i++)
        output += String.fromCharCode(data[i]);
    return btoa(output.replace(/\+/g, '-').replace(/\//g, '_')).replace(/=+$/, '');
}

// https://stackoverflow.com/questions/34946642/convert-string-to-uint8array-in-javascript
function toUint8Aarray(s: string): Uint8Array {
    let uint8Array = new TextEncoder().encode(s);
    return Uint8Array.from(uint8Array)
}

function fromUint8Aarray(arr: Uint8Array): string {
    return new TextDecoder().decode(arr);
}

//Encrypt at A side with A's secret and B's public key.
async function test_encrypt(input, lk_a, pk_b) {
    const imported_a = await importKey(lk_a);
    const imported_b = await importKey(pk_b);
    const encrypted = await encrypt(imported_b, imported_a, input);
    return encrypted;
}

//Decrypt at B side with B's secret and A's public key.
async function test_decrypt(input, lk_b, pk_a) {
    const imported_a = await importKey(pk_a);
    const imported_b = await importKey(lk_b);
    const decrypted = await decrypt(imported_a, imported_b, input);
    return decrypted;
}

export function test_crypto() {
    (async () => {
        const input_string = "いいね";
        const input_array = toUint8Aarray(input_string);
        const { publicKey: pk_a, privateKey: lk_a } = await generatePublicKey();
        const { publicKey: pk_b, privateKey: lk_b } = await generatePublicKey();

        //Encrypt at A side with A's secret and B's public key.
        const encrypted = await test_encrypt(input_array, lk_a, pk_b);
        //Decrypt at B side with B's secret and A's public key.
        const decrypted = await test_decrypt(encrypted, lk_b, pk_a);

        const decrypted_string = fromUint8Aarray(decrypted);
        console.log(input_string, decrypted_string);
    })();
}
