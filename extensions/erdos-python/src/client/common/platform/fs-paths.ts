// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as nodepath from 'path';
import { getSearchPathEnvVarNames } from '../utils/exec';
import * as fs from 'fs-extra';
import * as os from 'os';
import { getOSType, OSType } from '../utils/platform';
import { IExecutables, IFileSystemPaths, IFileSystemPathUtils } from './types';

// The parts of node's 'path' module used by FileSystemPaths.
interface INodePath {
    sep: string;
    join(...filenames: string[]): string;
    dirname(filename: string): string;
    basename(filename: string, ext?: string): string;
    normalize(filename: string): string;
}

export class FileSystemPaths implements IFileSystemPaths {
    constructor(
        // "true" if targeting a case-insensitive host (like Windows)
        private readonly isCaseInsensitive: boolean,
        // (effectively) the node "path" module to use
        private readonly raw: INodePath,
    ) {}
    // Create a new object using common-case default values.
    // We do not use an alternate constructor because defaults in the
    // constructor runs counter to our typical approach.
    public static withDefaults(
        // default: use "isWindows"
        isCaseInsensitive?: boolean,
    ): FileSystemPaths {
        if (isCaseInsensitive === undefined) {
            isCaseInsensitive = getOSType() === OSType.Windows;
        }
        return new FileSystemPaths(
            isCaseInsensitive,
            // Use the actual node "path" module.
            nodepath,
        );
    }

    public get sep(): string {
        return this.raw.sep;
    }

    public join(...filenames: string[]): string {
        return this.raw.join(...filenames);
    }

    public dirname(filename: string): string {
        return this.raw.dirname(filename);
    }

    public basename(filename: string, suffix?: string): string {
        return this.raw.basename(filename, suffix);
    }

    public normalize(filename: string): string {
        return this.raw.normalize(filename);
    }

    public normCase(filename: string): string {
        filename = this.raw.normalize(filename);
        return this.isCaseInsensitive ? filename.toUpperCase() : filename;
    }
}

export class Executables {
    constructor(
        // the $PATH delimiter to use
        public readonly delimiter: string,
        // the OS type to target
        private readonly osType: OSType,
    ) {}
    // Create a new object using common-case default values.
    // We do not use an alternate constructor because defaults in the
    // constructor runs counter to our typical approach.
    public static withDefaults(): Executables {
        return new Executables(
            // Use node's value.
            nodepath.delimiter,
            // Use the current OS.
            getOSType(),
        );
    }

    public get envVar(): string {
        return getSearchPathEnvVarNames(this.osType)[0];
    }
}

// The dependencies FileSystemPathUtils has on node's path module.
interface IRawPaths {
    relative(relpath: string, rootpath: string): string;
}

export class FileSystemPathUtils implements IFileSystemPathUtils {
    constructor(
        // the user home directory to use (and expose)
        public readonly home: string,
        // the low-level FS path operations to use (and expose)
        public readonly paths: IFileSystemPaths,
        // the low-level OS "executables" to use (and expose)
        public readonly executables: IExecutables,
        // other low-level FS path operations to use
        private readonly raw: IRawPaths,
    ) {}
    // Create a new object using common-case default values.
    // We do not use an alternate constructor because defaults in the
    // constructor runs counter to our typical approach.
    public static withDefaults(
        // default: a new FileSystemPaths object (using defaults)
        paths?: IFileSystemPaths,
    ): FileSystemPathUtils {
        if (paths === undefined) {
            paths = FileSystemPaths.withDefaults();
        }
        return new FileSystemPathUtils(
            // Use the current user's home directory.
            os.homedir(),
            paths,
            Executables.withDefaults(),
            // Use the actual node "path" module.
            nodepath,
        );
    }

    public arePathsSame(path1: string, path2: string): boolean {
        path1 = this.paths.normCase(path1);
        path2 = this.paths.normCase(path2);
        return path1 === path2;
    }

    public getDisplayName(filename: string, cwd?: string): string {
        if (cwd && isParentPath(filename, cwd)) {
            return `.${this.paths.sep}${this.raw.relative(cwd, filename)}`;
        } else if (isParentPath(filename, this.home)) {
            return `~${this.paths.sep}${this.raw.relative(this.home, filename)}`;
        } else {
            return filename;
        }
    }
}

export function normCasePath(filePath: string): string {
    return normCase(nodepath.normalize(filePath));
}

export function normCase(s: string): string {
    return getOSType() === OSType.Windows ? s.toUpperCase() : s;
}

/**
 * Returns true if given file path exists within the given parent directory, false otherwise.
 * @param filePath File path to check for
 * @param parentPath The potential parent path to check for
 */
export function isParentPath(filePath: string, parentPath: string): boolean {
    if (!parentPath.endsWith(nodepath.sep)) {
        parentPath += nodepath.sep;
    }
    if (!filePath.endsWith(nodepath.sep)) {
        filePath += nodepath.sep;
    }
    return normCasePath(filePath).startsWith(normCasePath(parentPath));
}

export function arePathsSame(path1: string, path2: string): boolean {
    return normCasePath(path1) === normCasePath(path2);
}

export async function copyFile(src: string, dest: string): Promise<void> {
    const destDir = nodepath.dirname(dest);
    if (!(await fs.pathExists(destDir))) {
        await fs.mkdirp(destDir);
    }

    await fs.copy(src, dest, {
        overwrite: true,
    });
}

// These function exist so we can stub them out in tests. We can't stub out the fs module directly
// because of the way that sinon does stubbing, so we have these intermediaries instead.
export { Stats, WriteStream, ReadStream, PathLike, Dirent, PathOrFileDescriptor } from 'fs-extra';

export function existsSync(path: string): boolean {
    return fs.existsSync(path);
}

export function readFileSync(filePath: string, encoding: BufferEncoding): string;
export function readFileSync(filePath: string): Buffer;
export function readFileSync(filePath: string, options: { encoding: BufferEncoding }): string;
export function readFileSync(
    filePath: string,
    options?: { encoding: BufferEncoding } | BufferEncoding | undefined,
): string | Buffer {
    if (typeof options === 'string') {
        return fs.readFileSync(filePath, { encoding: options });
    }
    return fs.readFileSync(filePath, options);
}

export function readJSONSync(filePath: string): any {
    return fs.readJSONSync(filePath);
}

export function readdirSync(path: string): string[];
export function readdirSync(
    path: string,
    options: fs.ObjectEncodingOptions & {
        withFileTypes: true;
    },
): fs.Dirent[];
export function readdirSync(
    path: string,
    options: fs.ObjectEncodingOptions & {
        withFileTypes: false;
    },
): string[];
export function readdirSync(
    path: fs.PathLike,
    options?: fs.ObjectEncodingOptions & {
        withFileTypes: boolean;
        recursive?: boolean | undefined;
    },
): string[] | fs.Dirent[] {
    if (options === undefined || options.withFileTypes === false) {
        return fs.readdirSync(path);
    }
    return fs.readdirSync(path, { ...options, withFileTypes: true });
}

export function readlink(path: string): Promise<string> {
    return fs.readlink(path);
}

export function unlink(path: string): Promise<void> {
    return fs.unlink(path);
}

export function symlink(target: string, path: string, type?: fs.SymlinkType): Promise<void> {
    return fs.symlink(target, path, type);
}

export function symlinkSync(target: string, path: string, type?: fs.SymlinkType): void {
    return fs.symlinkSync(target, path, type);
}

export function unlinkSync(path: string): void {
    return fs.unlinkSync(path);
}

export function statSync(path: string): fs.Stats {
    return fs.statSync(path);
}

export function stat(path: string): Promise<fs.Stats> {
    return fs.stat(path);
}

export function lstat(path: string): Promise<fs.Stats> {
    return fs.lstat(path);
}

export function chmod(path: string, mod: fs.Mode): Promise<void> {
    return fs.chmod(path, mod);
}

export function createReadStream(path: string): fs.ReadStream {
    return fs.createReadStream(path);
}

export function createWriteStream(path: string): fs.WriteStream {
    return fs.createWriteStream(path);
}

export function pathExistsSync(path: string): boolean {
    return fs.pathExistsSync(path);
}

export function pathExists(absPath: string): Promise<boolean> {
    return fs.pathExists(absPath);
}

export function createFile(filename: string): Promise<void> {
    return fs.createFile(filename);
}

export function rmdir(path: string, options?: fs.RmDirOptions): Promise<void> {
    return fs.rmdir(path, options);
}

export function remove(path: string): Promise<void> {
    return fs.remove(path);
}

export function readFile(filePath: string, encoding: BufferEncoding): Promise<string>;
export function readFile(filePath: string): Promise<Buffer>;
export function readFile(filePath: string, options: { encoding: BufferEncoding }): Promise<string>;
export function readFile(
    filePath: string,
    options?: { encoding: BufferEncoding } | BufferEncoding | undefined,
): Promise<string | Buffer> {
    if (typeof options === 'string') {
        return fs.readFile(filePath, { encoding: options });
    }
    return fs.readFile(filePath, options);
}

export function readJson(filePath: string): Promise<any> {
    return fs.readJson(filePath);
}

export function writeFile(filePath: string, data: any, options?: { encoding: BufferEncoding }): Promise<void> {
    return fs.writeFile(filePath, data, options);
}

export function mkdir(dirPath: string): Promise<void> {
    return fs.mkdir(dirPath);
}

export function mkdirp(dirPath: string): Promise<void> {
    return fs.mkdirp(dirPath);
}

export function rename(oldPath: string, newPath: string): Promise<void> {
    return fs.rename(oldPath, newPath);
}

export function ensureDir(dirPath: string): Promise<void> {
    return fs.ensureDir(dirPath);
}

export function ensureFile(filePath: string): Promise<void> {
    return fs.ensureFile(filePath);
}

export function ensureSymlink(target: string, filePath: string, type?: fs.SymlinkType): Promise<void> {
    return fs.ensureSymlink(target, filePath, type);
}

export function appendFile(filePath: string, data: any, options?: { encoding: BufferEncoding }): Promise<void> {
    return fs.appendFile(filePath, data, options);
}

export function readdir(path: string): Promise<string[]>;
export function readdir(
    path: string,
    options: fs.ObjectEncodingOptions & {
        withFileTypes: true;
    },
): Promise<fs.Dirent[]>;
export function readdir(
    path: fs.PathLike,
    options?: fs.ObjectEncodingOptions & {
        withFileTypes: true;
    },
): Promise<string[] | fs.Dirent[]> {
    if (options === undefined) {
        return fs.readdir(path);
    }
    return fs.readdir(path, options);
}

export function emptyDir(dirPath: string): Promise<void> {
    return fs.emptyDir(dirPath);
}
