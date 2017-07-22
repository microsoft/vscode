// Type definitions for gulp-concat
// Project: http://github.com/wearefractal/gulp-concat
// Definitions by: Keita Kagurazaka <https://github.com/k-kagurazaka>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

declare module "gulp-concat" {

    interface IOptions {
        newLine: string;
    }

    interface IFsStats {
        dev?: number;
        ino?: number;
        mode?: number;
        nlink?: number;
        uid?: number;
        gid?: number;
        rdev?: number;
        size?: number;
        blksize?: number;
        blocks?: number;
        atime?: Date;
        mtime?: Date;
        ctime?: Date;
    }

    interface IVinylOptions {
        cwd?: string;
        base?: string;
        path?: string;
        stat?: IFsStats;
        contents?: NodeJS.ReadableStream | Buffer;
    }

    interface IConcat {
        (filename: string, options?: IOptions): NodeJS.ReadWriteStream;
        (options: IVinylOptions): NodeJS.ReadWriteStream;
    }

    var _tmp: IConcat;
    export = _tmp;
}