export interface Url {
    protocol?: string | null;
    slashes?: boolean | null;
    auth?: string | null;
    host?: string | null;
    port?: string | null;
    hostname?: string | null;
    hash?: string | null;
    search?: string | null;
    query?: string | Record<string, string | string[]> | null;
    pathname?: string | null;
    path?: string | null;
    href?: string;
}
export declare function parse(raw: string, parseQuery?: boolean, _slashesHost?: boolean): Url;
export declare function format(obj: Url): string;
export declare function resolve(base: string, target: string): string;
export declare const URL: {
    new (url: string | URL, base?: string | URL): URL;
    prototype: URL;
    canParse(url: string | URL, base?: string | URL): boolean;
    createObjectURL(obj: Blob | MediaSource): string;
    parse(url: string | URL, base?: string | URL): URL | null;
    revokeObjectURL(url: string): void;
};
export declare const URLSearchParams: {
    new (init?: string[][] | Record<string, string> | string | URLSearchParams): URLSearchParams;
    prototype: URLSearchParams;
};
export declare function fileURLToPath(input: string | URL): string;
export declare function pathToFileURL(fsPath: string): URL;
export declare function domainToASCII(domain: string): string;
export declare function domainToUnicode(domain: string): string;
declare const _default: {
    parse: typeof parse;
    format: typeof format;
    resolve: typeof resolve;
    URL: {
        new (url: string | URL, base?: string | URL): URL;
        prototype: URL;
        canParse(url: string | URL, base?: string | URL): boolean;
        createObjectURL(obj: Blob | MediaSource): string;
        parse(url: string | URL, base?: string | URL): URL | null;
        revokeObjectURL(url: string): void;
    };
    URLSearchParams: {
        new (init?: string[][] | Record<string, string> | string | URLSearchParams): URLSearchParams;
        prototype: URLSearchParams;
    };
    fileURLToPath: typeof fileURLToPath;
    pathToFileURL: typeof pathToFileURL;
    domainToASCII: typeof domainToASCII;
    domainToUnicode: typeof domainToUnicode;
};
export default _default;
