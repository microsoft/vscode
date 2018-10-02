// Type definitions for gulp-rename
// Project: https://github.com/hparra/gulp-rename
// Definitions by: Asana <https://asana.com>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

declare module "gulp-rename" {
    interface ParsedPath {
        dirname?: string;
        basename?: string;
        extname?: string;
    }

    interface Options extends ParsedPath {
        prefix?: string;
        suffix?: string;
    }

    function rename(name: string): NodeJS.ReadWriteStream;
    function rename(callback: (path: ParsedPath) => any): NodeJS.ReadWriteStream;
    function rename(opts: Options): NodeJS.ReadWriteStream;

    /**
     * This is required as per:
     * https://github.com/Microsoft/TypeScript/issues/5073
     */
    namespace rename {}

    export = rename;
}