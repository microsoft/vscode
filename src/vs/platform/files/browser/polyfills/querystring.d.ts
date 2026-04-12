export type ParsedQuery = Record<string, string | string[]>;
export declare function parse(input: string, pairSep?: string, kvSep?: string, options?: {
    maxKeys?: number;
}): ParsedQuery;
export declare function stringify(obj: Record<string, string | string[] | number | boolean | undefined>, pairSep?: string, kvSep?: string): string;
export declare function escape(text: string): string;
export declare function unescape(text: string): string;
export declare const encode: typeof stringify;
export declare const decode: typeof parse;
declare const _default: {
    parse: typeof parse;
    stringify: typeof stringify;
    escape: typeof escape;
    unescape: typeof unescape;
    encode: typeof stringify;
    decode: typeof parse;
};
export default _default;
