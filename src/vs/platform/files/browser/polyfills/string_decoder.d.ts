export interface StringDecoder {
    encoding: string;
    write(buf: Uint8Array | Buffer): string;
    end(buf?: Uint8Array | Buffer): string;
}
export declare const StringDecoder: {
    new (encoding?: string): StringDecoder;
    prototype: any;
};
declare const _default: {
    StringDecoder: {
        new (encoding?: string): StringDecoder;
        prototype: any;
    };
};
export default _default;
