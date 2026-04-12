"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.randomUUID = randomUUID;
exports.generateCodeVerifier = generateCodeVerifier;
exports.generateCodeChallenge = generateCodeChallenge;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const buffer_1 = require("./node/buffer");
function randomUUID() {
    return crypto.randomUUID();
}
function dec2hex(dec) {
    return ('0' + dec.toString(16)).slice(-2);
}
function generateCodeVerifier() {
    const array = new Uint32Array(56 / 2);
    crypto.getRandomValues(array);
    return Array.from(array, dec2hex).join('');
}
function sha256(plain) {
    const encoder = new TextEncoder();
    const data = encoder.encode(plain);
    return crypto.subtle.digest('SHA-256', data);
}
function base64urlencode(a) {
    let str = '';
    const bytes = new Uint8Array(a);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        str += String.fromCharCode(bytes[i]);
    }
    return (0, buffer_1.base64Encode)(str)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}
async function generateCodeChallenge(v) {
    const hashed = await sha256(v);
    const base64encoded = base64urlencode(hashed);
    return base64encoded;
}
//# sourceMappingURL=cryptoUtils.js.map