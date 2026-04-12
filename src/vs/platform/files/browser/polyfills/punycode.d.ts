export declare function decode(input: string): string;
export declare function encode(input: string): string;
export declare function toUnicode(domain: string): string;
export declare function toASCII(domain: string): string;
export declare const ucs2: {
    decode: (str: string) => number[];
    encode: (codePoints: number[]) => string;
};
export declare const version = "2.3.1";
declare const _default: {
    decode: typeof decode;
    encode: typeof encode;
    toUnicode: typeof toUnicode;
    toASCII: typeof toASCII;
    ucs2: {
        decode: (str: string) => number[];
        encode: (codePoints: number[]) => string;
    };
    version: string;
};
export default _default;
