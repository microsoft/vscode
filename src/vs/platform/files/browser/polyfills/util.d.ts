export declare function format(template: unknown, ...values: unknown[]): string;
export declare function inspect(target: unknown, opts?: {
    depth?: number;
    colors?: boolean;
}): string;
export declare function inherits(child: Function, parent: Function): void;
export declare function _extend(target: any, source: any): any;
export declare function deprecate<T extends Function>(fn: T, message: string, code?: string): T;
export declare function promisify<T>(fn: (...args: any[]) => void): (...args: any[]) => Promise<T>;
export declare function callbackify<T>(fn: (...args: any[]) => Promise<T>): (...args: any[]) => void;
export declare function isDeepStrictEqual(a: unknown, b: unknown): boolean;
export declare function isArray(val: unknown): val is unknown[];
export declare function isBoolean(val: unknown): val is boolean;
export declare function isNull(val: unknown): val is null;
export declare function isNullOrUndefined(val: unknown): val is null | undefined;
export declare function isNumber(val: unknown): val is number;
export declare function isString(val: unknown): val is string;
export declare function isUndefined(val: unknown): val is undefined;
export declare function isRegExp(val: unknown): val is RegExp;
export declare function isObject(val: unknown): val is object;
export declare function isDate(val: unknown): val is Date;
export declare function isError(val: unknown): val is Error;
export declare function isFunction(val: unknown): val is Function;
export declare function isPrimitive(val: unknown): boolean;
export declare function isBuffer(val: unknown): boolean;
export declare function isPromise(val: unknown): val is Promise<unknown>;
export declare function debuglog(section: string): (...args: unknown[]) => void;
export declare const debug: typeof debuglog;
export declare function stripVTControlCharacters(text: string): string;
export declare const types: {
    isArray: typeof isArray;
    isBoolean: typeof isBoolean;
    isNull: typeof isNull;
    isNullOrUndefined: typeof isNullOrUndefined;
    isNumber: typeof isNumber;
    isString: typeof isString;
    isUndefined: typeof isUndefined;
    isRegExp: typeof isRegExp;
    isObject: typeof isObject;
    isDate: typeof isDate;
    isError: typeof isError;
    isFunction: typeof isFunction;
    isPrimitive: typeof isPrimitive;
    isBuffer: typeof isBuffer;
    isPromise: typeof isPromise;
};
export declare function styleText(format: string | string[], text: string): string;
interface ParseArgsOptionConfig {
    type: "string" | "boolean";
    short?: string;
    multiple?: boolean;
    default?: string | boolean | string[] | boolean[];
}
interface ParseArgsConfig {
    args?: string[];
    options?: Record<string, ParseArgsOptionConfig>;
    strict?: boolean;
    allowPositionals?: boolean;
    tokens?: boolean;
}
interface ParseArgsResult {
    values: Record<string, string | boolean | (string | boolean)[] | undefined>;
    positionals: string[];
    tokens?: Array<{
        kind: string;
        name?: string;
        value?: string | boolean;
        index: number;
    }>;
}
export declare function parseArgs(config?: ParseArgsConfig): ParseArgsResult;
export declare const TextEncoder: {
    new (): TextEncoder;
    prototype: TextEncoder;
};
export declare const TextDecoder: {
    new (label?: string, options?: TextDecoderOptions): TextDecoder;
    prototype: TextDecoder;
};
declare const _default: {
    format: typeof format;
    inspect: typeof inspect;
    inherits: typeof inherits;
    _extend: typeof _extend;
    deprecate: typeof deprecate;
    promisify: typeof promisify;
    callbackify: typeof callbackify;
    isDeepStrictEqual: typeof isDeepStrictEqual;
    debuglog: typeof debuglog;
    debug: typeof debuglog;
    stripVTControlCharacters: typeof stripVTControlCharacters;
    isArray: typeof isArray;
    isBoolean: typeof isBoolean;
    isNull: typeof isNull;
    isNullOrUndefined: typeof isNullOrUndefined;
    isNumber: typeof isNumber;
    isString: typeof isString;
    isUndefined: typeof isUndefined;
    isRegExp: typeof isRegExp;
    isObject: typeof isObject;
    isDate: typeof isDate;
    isError: typeof isError;
    isFunction: typeof isFunction;
    isPrimitive: typeof isPrimitive;
    isBuffer: typeof isBuffer;
    isPromise: typeof isPromise;
    styleText: typeof styleText;
    parseArgs: typeof parseArgs;
    types: {
        isArray: typeof isArray;
        isBoolean: typeof isBoolean;
        isNull: typeof isNull;
        isNullOrUndefined: typeof isNullOrUndefined;
        isNumber: typeof isNumber;
        isString: typeof isString;
        isUndefined: typeof isUndefined;
        isRegExp: typeof isRegExp;
        isObject: typeof isObject;
        isDate: typeof isDate;
        isError: typeof isError;
        isFunction: typeof isFunction;
        isPrimitive: typeof isPrimitive;
        isBuffer: typeof isBuffer;
        isPromise: typeof isPromise;
    };
    TextEncoder: {
        new (): TextEncoder;
        prototype: TextEncoder;
    };
    TextDecoder: {
        new (label?: string, options?: TextDecoderOptions): TextDecoder;
        prototype: TextDecoder;
    };
};
export default _default;
