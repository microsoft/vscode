import { EventEmitter } from "./events.js";
export declare function randomBytes(count: number): Buffer;
export declare function randomFillSync(target: Uint8Array | Buffer, start?: number, size?: number): Uint8Array | Buffer;
export declare function randomUUID(): string;
export declare function randomInt(lo: number, hi?: number): number;
export declare function getRandomValues<T extends ArrayBufferView>(arr: T): T;
export interface Hash {
    update(input: string | Buffer | Uint8Array, enc?: string): Hash;
    digestAsync(enc?: string): Promise<string | Buffer>;
    digest(enc?: string): string | Buffer;
}
interface HashConstructor {
    new(alg: string): Hash;
    (this: any, alg: string): void;
    prototype: any;
}
export declare const Hash: HashConstructor;
export declare function createHash(alg: string): Hash;
export declare function hash(algorithm: string, data: string | Buffer | Uint8Array, outputEncoding?: string): string | Buffer;
export interface Hmac {
    update(input: string | Buffer | Uint8Array, enc?: string): Hmac;
    digestAsync(enc?: string): Promise<string | Buffer>;
    digest(enc?: string): string | Buffer;
}
interface HmacConstructor {
    new(alg: string, secret: string | Buffer): Hmac;
    (this: any, alg: string, secret: string | Buffer): void;
    prototype: any;
}
export declare const Hmac: HmacConstructor;
export declare function createHmac(alg: string, secret: string | Buffer): Hmac;
type BinaryInput = string | Buffer | Uint8Array;
export declare function pbkdf2(password: BinaryInput, salt: BinaryInput, rounds: number, keyLen: number, hashName: string, cb: (err: Error | null, key: Buffer) => void): void;
export declare function pbkdf2Sync(password: BinaryInput, salt: BinaryInput, rounds: number, keyLen: number, hashName: string): Buffer;
export declare function scrypt(password: BinaryInput, salt: BinaryInput, keyLen: number, _opts: unknown, cb: (err: Error | null, key: Buffer) => void): void;
export declare function scryptSync(password: BinaryInput, salt: BinaryInput, keyLen: number, _opts?: unknown): Buffer;
type KeyMaterial = string | Buffer | KeyObject | {
    key: string | Buffer;
    passphrase?: string;
};
export declare function sign(alg: string | null | undefined, data: Buffer | Uint8Array, key: KeyMaterial, cb?: (err: Error | null, sig: Buffer) => void): Buffer | void;
export declare function verify(alg: string | null | undefined, data: Buffer | Uint8Array, key: KeyMaterial, sig: Buffer | Uint8Array, cb?: (err: Error | null, ok: boolean) => void): boolean | void;
export interface SignStream extends EventEmitter {
    update(input: string | Buffer | Uint8Array, enc?: string): SignStream;
    sign(privKey: KeyMaterial, outEnc?: string): Buffer | string;
}
interface SignStreamConstructor {
    new(alg: string): SignStream;
    (this: any, alg: string): void;
    prototype: any;
}
export declare const SignStream: SignStreamConstructor;
export interface VerifyStream extends EventEmitter {
    update(input: string | Buffer | Uint8Array, enc?: string): VerifyStream;
    verify(pubKey: KeyMaterial, sig: Buffer | string, sigEnc?: string): boolean;
}
interface VerifyStreamConstructor {
    new(alg: string): VerifyStream;
    (this: any, alg: string): void;
    prototype: any;
}
export declare const VerifyStream: VerifyStreamConstructor;
export declare function createSign(alg: string): SignStream;
export declare function createVerify(alg: string): VerifyStream;
export declare function createCipheriv(_alg: string, _key: BinaryInput, _iv: BinaryInput | null): any;
export declare function createDecipheriv(_alg: string, _key: BinaryInput, _iv: BinaryInput | null): any;
export interface KeyObject {
    readonly type: string;
    readonly asymmetricKeyType: string | undefined;
    readonly symmetricKeySize: number | undefined;
    export(opts?: {
        type?: string;
        format?: string;
    }): Buffer | string;
}
interface KeyObjectConstructor {
    new(kind: "public" | "private" | "secret", data: CryptoKey | Uint8Array, alg?: string): KeyObject;
    (this: any, kind: "public" | "private" | "secret", data: CryptoKey | Uint8Array, alg?: string): void;
    prototype: any;
}
export declare const KeyObject: KeyObjectConstructor;
export declare function createSecretKey(key: Buffer | string, enc?: string): KeyObject;
export declare function createPublicKey(key: KeyMaterial): KeyObject;
export declare function createPrivateKey(key: KeyMaterial): KeyObject;
export declare function timingSafeEqual(a: Buffer | Uint8Array, b: Buffer | Uint8Array): boolean;
export declare function getCiphers(): string[];
export declare function getHashes(): string[];
export declare const constants: {
    SSL_OP_ALL: number;
    RSA_PKCS1_PADDING: number;
    RSA_PKCS1_OAEP_PADDING: number;
    RSA_PKCS1_PSS_PADDING: number;
};
export declare function generateKeySync(type: string, options?: {
    length?: number;
}): KeyObject;
export declare function generateKeyPairSync(type: string, options?: {
    modulusLength?: number;
    namedCurve?: string;
    publicKeyEncoding?: {
        type?: string;
        format?: string;
    };
    privateKeyEncoding?: {
        type?: string;
        format?: string;
    };
}): {
    publicKey: KeyObject | string;
    privateKey: KeyObject | string;
};
export declare function generatePrimeSync(size: number, _options?: {
    bigint?: boolean;
    safe?: boolean;
}): Buffer | bigint;
export declare function generatePrime(size: number, options: {
    bigint?: boolean;
    safe?: boolean;
} | undefined, cb: (err: Error | null, prime: Buffer | bigint) => void): void;
export declare function checkPrimeSync(_candidate: Buffer | bigint): boolean;
export declare function checkPrime(candidate: Buffer | bigint, cb: (err: Error | null, result: boolean) => void): void;
export declare function randomFill(buf: Uint8Array | Buffer, offsetOrCb: number | ((err: Error | null, buf: Uint8Array | Buffer) => void), sizeOrCb?: number | ((err: Error | null, buf: Uint8Array | Buffer) => void), cb?: (err: Error | null, buf: Uint8Array | Buffer) => void): void;
export declare function hkdfSync(hashAlg: string, ikm: BinaryInput, salt: BinaryInput, info: BinaryInput, keyLen: number): Buffer;
export declare function hkdf(hashAlg: string, ikm: BinaryInput, salt: BinaryInput, info: BinaryInput, keyLen: number, cb: (err: Error | null, derivedKey: Buffer) => void): void;
export declare function getDiffieHellman(_groupName: string): any;
export declare function createDiffieHellman(_sizeOrPrime: number | Buffer, _generator?: number | Buffer): any;
export declare function createECDH(_curveName: string): any;
export declare function getCurves(): string[];
export declare function setFips(_mode: number): void;
export declare function getFips(): number;
export declare function secureHeapUsed(): {
    total: number;
    min: number;
    used: number;
};
export declare const webcrypto: Crypto;
declare const _default: {
    randomBytes: typeof randomBytes;
    randomFill: typeof randomFill;
    randomFillSync: typeof randomFillSync;
    randomUUID: typeof randomUUID;
    randomInt: typeof randomInt;
    getRandomValues: typeof getRandomValues;
    createHash: typeof createHash;
    hash: typeof hash;
    createHmac: typeof createHmac;
    createSign: typeof createSign;
    createVerify: typeof createVerify;
    createCipheriv: typeof createCipheriv;
    createDecipheriv: typeof createDecipheriv;
    sign: typeof sign;
    verify: typeof verify;
    pbkdf2: typeof pbkdf2;
    pbkdf2Sync: typeof pbkdf2Sync;
    scrypt: typeof scrypt;
    scryptSync: typeof scryptSync;
    hkdf: typeof hkdf;
    hkdfSync: typeof hkdfSync;
    timingSafeEqual: typeof timingSafeEqual;
    getCiphers: typeof getCiphers;
    getHashes: typeof getHashes;
    getCurves: typeof getCurves;
    constants: {
        SSL_OP_ALL: number;
        RSA_PKCS1_PADDING: number;
        RSA_PKCS1_OAEP_PADDING: number;
        RSA_PKCS1_PSS_PADDING: number;
    };
    KeyObject: KeyObjectConstructor;
    createSecretKey: typeof createSecretKey;
    createPublicKey: typeof createPublicKey;
    createPrivateKey: typeof createPrivateKey;
    generateKeySync: typeof generateKeySync;
    generateKeyPairSync: typeof generateKeyPairSync;
    generatePrimeSync: typeof generatePrimeSync;
    generatePrime: typeof generatePrime;
    checkPrimeSync: typeof checkPrimeSync;
    checkPrime: typeof checkPrime;
    createDiffieHellman: typeof createDiffieHellman;
    getDiffieHellman: typeof getDiffieHellman;
    createECDH: typeof createECDH;
    setFips: typeof setFips;
    getFips: typeof getFips;
    secureHeapUsed: typeof secureHeapUsed;
    webcrypto: Crypto;
    Hash: HashConstructor;
    Hmac: HmacConstructor;
};
export default _default;
