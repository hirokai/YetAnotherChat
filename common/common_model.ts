var crypto = require("crypto");

// https://stackoverflow.com/a/42590106
// Extended for private key
export async function fingerPrint(jwk: JsonWebKey): Promise<string> {
    if (jwk == null) {
        return null;
    } else {
        let s;
        if (jwk["d"]) {
            s = '{"crv":"' + jwk.crv + '","d":"' + jwk.d + '","kty":"' + jwk.kty + '","x":"' + jwk.x + '","y":"' + jwk.y + '"}';
        } else {
            s = '{"crv":"' + jwk.crv + '","kty":"' + jwk.kty + '","x":"' + jwk.x + '","y":"' + jwk.y + '"}';
        }
        var sha256 = crypto.createHash('sha256');
        sha256.update(s)
        var hash = sha256.digest('base64');
        return hash;
    }
}

export function encodeBase64URL(data: Uint8Array): string {
    let output = '';
    for (let i = 0; i < data.length; i++)
        output += String.fromCharCode(data[i]);
    return btoa(output.replace(/\+/g, '-').replace(/\//g, '_')).replace(/=+$/, '');
}
