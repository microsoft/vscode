import type { Transform } from "./stream.d.ts";

type CompressCallback = (err: Error | null, result: Buffer) => void;
export declare function gzip(input: Buffer | string, cb: CompressCallback): void;
export declare function gunzip(input: Buffer, cb: CompressCallback): void;
export declare function deflate(input: Buffer | string, cb: CompressCallback): void;
export declare function inflate(input: Buffer, cb: CompressCallback): void;
export declare function deflateRaw(input: Buffer | string, cb: CompressCallback): void;
export declare function inflateRaw(input: Buffer, cb: CompressCallback): void;
export declare function brotliCompress(input: Buffer | string, optsOrCb: unknown, cb?: CompressCallback): void;
export declare function brotliDecompress(input: Buffer, optsOrCb: unknown, cb?: CompressCallback): void;
export declare function gzipSync(input: Buffer | string): Buffer;
export declare function gunzipSync(input: Buffer): Buffer;
export declare function deflateSync(input: Buffer | string): Buffer;
export declare function inflateSync(input: Buffer): Buffer;
export declare function deflateRawSync(input: Buffer | string): Buffer;
export declare function inflateRawSync(input: Buffer): Buffer;
export declare function brotliCompressSync(input: Buffer | string, _opts?: unknown): Buffer;
export declare function brotliDecompressSync(input: Buffer, _opts?: unknown): Buffer;
export interface ZlibTransform extends Transform {
    _opts: any;
    bytesWritten: number;
    _handle: {
        close: () => void;
    };
    close(cb?: () => void): void;
    flush(cb?: (err: Error | null) => void): void;
    reset(): void;
    params(_level: number, _strategy: number, cb?: (err: Error | null) => void): void;
    _processChunk(chunk: Buffer | Uint8Array, flushFlag: number): Buffer | null;
}
export interface Gzip extends ZlibTransform {
    _engine: any;
}
interface GzipConstructor {
    new(opts?: any): Gzip;
    (this: any, opts?: any): void;
    prototype: any;
}
export declare const Gzip: GzipConstructor;
export interface Gunzip extends ZlibTransform {
    _engine: any;
}
interface GunzipConstructor {
    new(opts?: any): Gunzip;
    (this: any, opts?: any): void;
    prototype: any;
}
export declare const Gunzip: GunzipConstructor;
export interface Deflate extends ZlibTransform {
    _engine: any;
}
interface DeflateConstructor {
    new(opts?: any): Deflate;
    (this: any, opts?: any): void;
    prototype: any;
}
export declare const Deflate: DeflateConstructor;
export interface Inflate extends ZlibTransform {
    _engine: any;
}
interface InflateConstructor {
    new(opts?: any): Inflate;
    (this: any, opts?: any): void;
    prototype: any;
}
export declare const Inflate: InflateConstructor;
export interface DeflateRaw extends ZlibTransform {
    _engine: any;
}
interface DeflateRawConstructor {
    new(opts?: any): DeflateRaw;
    (this: any, opts?: any): void;
    prototype: any;
}
export declare const DeflateRaw: DeflateRawConstructor;
export interface InflateRaw extends ZlibTransform {
    _engine: any;
}
interface InflateRawConstructor {
    new(opts?: any): InflateRaw;
    (this: any, opts?: any): void;
    prototype: any;
}
export declare const InflateRaw: InflateRawConstructor;
export interface Unzip extends ZlibTransform {
    _engine: any;
}
interface UnzipConstructor {
    new(opts?: any): Unzip;
    (this: any, opts?: any): void;
    prototype: any;
}
export declare const Unzip: UnzipConstructor;
export interface BrotliCompressStream extends ZlibTransform {
}
interface BrotliCompressStreamConstructor {
    new(opts?: any): BrotliCompressStream;
    (this: any, opts?: any): void;
    prototype: any;
}
export declare const BrotliCompressStream: BrotliCompressStreamConstructor;
export interface BrotliDecompressStream extends ZlibTransform {
}
interface BrotliDecompressStreamConstructor {
    new(opts?: any): BrotliDecompressStream;
    (this: any, opts?: any): void;
    prototype: any;
}
export declare const BrotliDecompressStream: BrotliDecompressStreamConstructor;
export declare const BrotliCompress: BrotliCompressStreamConstructor;
export declare const BrotliDecompress: BrotliDecompressStreamConstructor;
export declare function createGzip(opts?: any): Gzip;
export declare function createGunzip(opts?: any): Gunzip;
export declare function createDeflate(opts?: any): Deflate;
export declare function createInflate(opts?: any): Inflate;
export declare function createDeflateRaw(opts?: any): DeflateRaw;
export declare function createInflateRaw(opts?: any): InflateRaw;
export declare function createUnzip(opts?: any): Unzip;
export declare function createBrotliCompress(opts?: any): BrotliCompressStream;
export declare function createBrotliDecompress(opts?: any): BrotliDecompressStream;
export declare const constants: {
    Z_NO_FLUSH: number;
    Z_PARTIAL_FLUSH: number;
    Z_SYNC_FLUSH: number;
    Z_FULL_FLUSH: number;
    Z_FINISH: number;
    Z_BLOCK: number;
    Z_OK: number;
    Z_STREAM_END: number;
    Z_NEED_DICT: number;
    Z_ERRNO: number;
    Z_STREAM_ERROR: number;
    Z_DATA_ERROR: number;
    Z_MEM_ERROR: number;
    Z_BUF_ERROR: number;
    Z_VERSION_ERROR: number;
    Z_NO_COMPRESSION: number;
    Z_BEST_SPEED: number;
    Z_BEST_COMPRESSION: number;
    Z_DEFAULT_COMPRESSION: number;
    Z_FILTERED: number;
    Z_HUFFMAN_ONLY: number;
    Z_RLE: number;
    Z_FIXED: number;
    Z_DEFAULT_STRATEGY: number;
    ZLIB_VERNUM: number;
    Z_MIN_WINDOWBITS: number;
    Z_MAX_WINDOWBITS: number;
    Z_DEFAULT_WINDOWBITS: number;
    Z_MIN_CHUNK: number;
    Z_MAX_CHUNK: number;
    Z_DEFAULT_CHUNK: number;
    Z_MIN_MEMLEVEL: number;
    Z_MAX_MEMLEVEL: number;
    Z_DEFAULT_MEMLEVEL: number;
    Z_MIN_LEVEL: number;
    Z_MAX_LEVEL: number;
    Z_DEFAULT_LEVEL: number;
    BROTLI_DECODE: number;
    BROTLI_ENCODE: number;
    BROTLI_OPERATION_PROCESS: number;
    BROTLI_OPERATION_FLUSH: number;
    BROTLI_OPERATION_FINISH: number;
    BROTLI_OPERATION_EMIT_METADATA: number;
    BROTLI_PARAM_MODE: number;
    BROTLI_MODE_GENERIC: number;
    BROTLI_MODE_TEXT: number;
    BROTLI_MODE_FONT: number;
    BROTLI_PARAM_QUALITY: number;
    BROTLI_MIN_QUALITY: number;
    BROTLI_MAX_QUALITY: number;
    BROTLI_DEFAULT_QUALITY: number;
    BROTLI_PARAM_LGWIN: number;
    BROTLI_MIN_WINDOW_BITS: number;
    BROTLI_MAX_WINDOW_BITS: number;
    BROTLI_DEFAULT_WINDOW: number;
    BROTLI_PARAM_LGBLOCK: number;
    BROTLI_MIN_INPUT_BLOCK_BITS: number;
    BROTLI_MAX_INPUT_BLOCK_BITS: number;
};
declare const _default: {
    gzip: typeof gzip;
    gunzip: typeof gunzip;
    deflate: typeof deflate;
    inflate: typeof inflate;
    deflateRaw: typeof deflateRaw;
    inflateRaw: typeof inflateRaw;
    brotliCompress: typeof brotliCompress;
    brotliDecompress: typeof brotliDecompress;
    gzipSync: typeof gzipSync;
    gunzipSync: typeof gunzipSync;
    deflateSync: typeof deflateSync;
    inflateSync: typeof inflateSync;
    deflateRawSync: typeof deflateRawSync;
    inflateRawSync: typeof inflateRawSync;
    brotliCompressSync: typeof brotliCompressSync;
    brotliDecompressSync: typeof brotliDecompressSync;
    Gzip: GzipConstructor;
    Gunzip: GunzipConstructor;
    Deflate: DeflateConstructor;
    Inflate: InflateConstructor;
    DeflateRaw: DeflateRawConstructor;
    InflateRaw: InflateRawConstructor;
    Unzip: UnzipConstructor;
    BrotliCompress: BrotliCompressStreamConstructor;
    BrotliDecompress: BrotliDecompressStreamConstructor;
    createGzip: typeof createGzip;
    createGunzip: typeof createGunzip;
    createDeflate: typeof createDeflate;
    createInflate: typeof createInflate;
    createDeflateRaw: typeof createDeflateRaw;
    createInflateRaw: typeof createInflateRaw;
    createUnzip: typeof createUnzip;
    createBrotliCompress: typeof createBrotliCompress;
    createBrotliDecompress: typeof createBrotliDecompress;
    constants: {
        Z_NO_FLUSH: number;
        Z_PARTIAL_FLUSH: number;
        Z_SYNC_FLUSH: number;
        Z_FULL_FLUSH: number;
        Z_FINISH: number;
        Z_BLOCK: number;
        Z_OK: number;
        Z_STREAM_END: number;
        Z_NEED_DICT: number;
        Z_ERRNO: number;
        Z_STREAM_ERROR: number;
        Z_DATA_ERROR: number;
        Z_MEM_ERROR: number;
        Z_BUF_ERROR: number;
        Z_VERSION_ERROR: number;
        Z_NO_COMPRESSION: number;
        Z_BEST_SPEED: number;
        Z_BEST_COMPRESSION: number;
        Z_DEFAULT_COMPRESSION: number;
        Z_FILTERED: number;
        Z_HUFFMAN_ONLY: number;
        Z_RLE: number;
        Z_FIXED: number;
        Z_DEFAULT_STRATEGY: number;
        ZLIB_VERNUM: number;
        Z_MIN_WINDOWBITS: number;
        Z_MAX_WINDOWBITS: number;
        Z_DEFAULT_WINDOWBITS: number;
        Z_MIN_CHUNK: number;
        Z_MAX_CHUNK: number;
        Z_DEFAULT_CHUNK: number;
        Z_MIN_MEMLEVEL: number;
        Z_MAX_MEMLEVEL: number;
        Z_DEFAULT_MEMLEVEL: number;
        Z_MIN_LEVEL: number;
        Z_MAX_LEVEL: number;
        Z_DEFAULT_LEVEL: number;
        BROTLI_DECODE: number;
        BROTLI_ENCODE: number;
        BROTLI_OPERATION_PROCESS: number;
        BROTLI_OPERATION_FLUSH: number;
        BROTLI_OPERATION_FINISH: number;
        BROTLI_OPERATION_EMIT_METADATA: number;
        BROTLI_PARAM_MODE: number;
        BROTLI_MODE_GENERIC: number;
        BROTLI_MODE_TEXT: number;
        BROTLI_MODE_FONT: number;
        BROTLI_PARAM_QUALITY: number;
        BROTLI_MIN_QUALITY: number;
        BROTLI_MAX_QUALITY: number;
        BROTLI_DEFAULT_QUALITY: number;
        BROTLI_PARAM_LGWIN: number;
        BROTLI_MIN_WINDOW_BITS: number;
        BROTLI_MAX_WINDOW_BITS: number;
        BROTLI_DEFAULT_WINDOW: number;
        BROTLI_PARAM_LGBLOCK: number;
        BROTLI_MIN_INPUT_BLOCK_BITS: number;
        BROTLI_MAX_INPUT_BLOCK_BITS: number;
    };
};
export default _default;
