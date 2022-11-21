/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// ESM-comment-begin
import * as _crypto from 'crypto';
// ESM-comment-end

// ESM-uncomment-begin
// const _crypto = globalThis._VSCODE_NODE_MODULES.crypto;
// ESM-uncomment-end


export type Certificate = import('crypto').Certificate;
export type Cipher = import('crypto').Cipher;
export type Decipher = import('crypto').Decipher;
export type DiffieHellman = import('crypto').DiffieHellman;
export type DiffieHellmanGroup = import('crypto').DiffieHellmanGroup;
export type ECDH = import('crypto').ECDH;
export type Hash = import('crypto').Hash;
export type Hmac = import('crypto').Hmac;
export type KeyObject = import('crypto').KeyObject;
export type Sign = import('crypto').Sign;
export type Verify = import('crypto').Verify;
export type X509Certificate = import('crypto').X509Certificate;
export const checkPrime = _crypto.checkPrime;
export const checkPrimeSync = _crypto.checkPrimeSync;
export const constants = _crypto.constants;
export const createCipheriv = _crypto.createCipheriv;
export const createDecipheriv = _crypto.createDecipheriv;
export const createDiffieHellman = _crypto.createDiffieHellman;
export const createDiffieHellmanGroup = _crypto.createDiffieHellmanGroup;
export const createECDH = _crypto.createECDH;
export const createHash = _crypto.createHash;
export const createHmac = _crypto.createHmac;
export const createPrivateKey = _crypto.createPrivateKey;
export const createPublicKey = _crypto.createPublicKey;
export const createSecretKey = _crypto.createSecretKey;
export const createSign = _crypto.createSign;
export const createVerify = _crypto.createVerify;
export const diffieHellman = _crypto.diffieHellman;
export const generateKey = _crypto.generateKey;
export const generateKeyPair = _crypto.generateKeyPair;
export const generateKeyPairSync = _crypto.generateKeyPairSync;
export const generateKeySync = _crypto.generateKeySync;
export const generatePrime = _crypto.generatePrime;
export const generatePrimeSync = _crypto.generatePrimeSync;
export const getCipherInfo = _crypto.getCipherInfo;
export const getCiphers = _crypto.getCiphers;
export const getCurves = _crypto.getCurves;
export const getDiffieHellman = _crypto.getDiffieHellman;
export const getFips = _crypto.getFips;
export const getHashes = _crypto.getHashes;
export const hkdf = _crypto.hkdf;
export const hkdfSync = _crypto.hkdfSync;
export const pbkdf2 = _crypto.pbkdf2;
export const pbkdf2Sync = _crypto.pbkdf2Sync;
export const privateDecrypt = _crypto.privateDecrypt;
export const privateEncrypt = _crypto.privateEncrypt;
export const pseudoRandomBytes = _crypto.pseudoRandomBytes;
export const publicDecrypt = _crypto.publicDecrypt;
export const publicEncrypt = _crypto.publicEncrypt;
export const randomBytes = _crypto.randomBytes;
export const randomFill = _crypto.randomFill;
export const randomFillSync = _crypto.randomFillSync;
export const randomInt = _crypto.randomInt;
export const randomUUID = _crypto.randomUUID;
export const scrypt = _crypto.scrypt;
export const scryptSync = _crypto.scryptSync;
export const secureHeapUsed = _crypto.secureHeapUsed;
export const setEngine = _crypto.setEngine;
export const setFips = _crypto.setFips;
export const sign = _crypto.sign;
export const timingSafeEqual = _crypto.timingSafeEqual;
export const verify = _crypto.verify;
export const webcrypto = _crypto.webcrypto;
export const DEFAULT_ENCODING = _crypto.DEFAULT_ENCODING;
export const createCipher = _crypto.createCipher;
export const createDecipher = _crypto.createDecipher;
export const fips = _crypto.fips;
