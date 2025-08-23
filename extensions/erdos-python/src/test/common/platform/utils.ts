// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import * as fsextra from '../../../client/common/platform/fs-paths';
import * as net from 'net';
import * as path from 'path';
import * as tmpMod from 'tmp';
import { CleanupFixture } from '../../fixtures';

// XXX Move most of this file to src/test/utils/fs.ts and src/test/fixtures.ts.

// Note: all functional tests that trigger the VS Code "fs" API are
// found in filesystem.test.ts.

export const WINDOWS = /^win/.test(process.platform);
export const OSX = /^darwin/.test(process.platform);

export const SUPPORTS_SYMLINKS = (() => {
    const source = fsextra.readdirSync('.')[0];
    const symlink = `${source}.symlink`;
    try {
        fsextra.symlinkSync(source, symlink);
    } catch {
        return false;
    }
    fsextra.unlinkSync(symlink);
    return true;
})();
export const SUPPORTS_SOCKETS = (() => {
    if (WINDOWS) {
        // Windows requires named pipes to have a specific path under
        // the local domain ("\\.\pipe\*").  This makes them relatively
        // useless in our functional tests, where we want to use them
        // to exercise FileType.Unknown.
        return false;
    }
    const tmp = tmpMod.dirSync({
        prefix: 'pyvsc-test-',
        unsafeCleanup: true, // for non-empty dir
    });
    const filename = path.join(tmp.name, 'test.sock');
    try {
        const srv = net.createServer();
        try {
            srv.listen(filename);
        } finally {
            srv.close();
        }
    } catch {
        return false;
    } finally {
        tmp.removeCallback();
    }
    return true;
})();

export const DOES_NOT_EXIST = 'this file does not exist';

export async function assertDoesNotExist(filename: string) {
    const promise = fsextra.stat(filename);
    await expect(promise).to.eventually.be.rejected;
}

export async function assertExists(filename: string) {
    const promise = fsextra.stat(filename);
    await expect(promise).to.not.eventually.be.rejected;
}

export async function assertFileText(filename: string, expected: string): Promise<string> {
    const data = await fsextra.readFile(filename);
    const text = data.toString();
    expect(text).to.equal(expected);
    return text;
}

export function fixPath(filename: string): string {
    return path.normalize(filename);
}

export class SystemError extends Error {
    public code: string;
    public errno: number;
    public syscall: string;
    public info?: string;
    public path?: string;
    public address?: string;
    public dest?: string;
    public port?: string;
    constructor(code: string, syscall: string, message: string) {
        super(`${code}: ${message} ${syscall} '...'`);
        this.code = code;
        this.errno = 0; // Don't bother until we actually need it.
        this.syscall = syscall;
    }
}

export class FSFixture extends CleanupFixture {
    private tempDir: string | undefined;
    private sockServer: net.Server | undefined;

    public addFSCleanup(filename: string, dispose?: () => void) {
        this.addCleanup(() => this.ensureDeleted(filename, dispose));
    }

    public async resolve(relname: string, mkdirs = true): Promise<string> {
        const tempDir = this.ensureTempDir();
        relname = path.normalize(relname);
        const filename = path.join(tempDir, relname);
        if (mkdirs) {
            const dirname = path.dirname(filename);
            await fsextra.mkdirp(dirname);
        }
        return filename;
    }

    public async createFile(relname: string, text = ''): Promise<string> {
        const filename = await this.resolve(relname);
        await fsextra.writeFile(filename, text);
        return filename;
    }

    public async createDirectory(relname: string): Promise<string> {
        const dirname = await this.resolve(relname);
        await fsextra.mkdir(dirname);
        return dirname;
    }

    public async createSymlink(relname: string, source: string): Promise<string> {
        if (!SUPPORTS_SYMLINKS) {
            throw Error('this platform does not support symlinks');
        }
        const symlink = await this.resolve(relname);
        // We cannot use fsextra.ensureSymlink() because it requires
        // that "source" exist.
        await fsextra.symlink(source, symlink);
        return symlink;
    }

    public async createSocket(relname: string): Promise<string> {
        const srv = this.ensureSocketServer();
        const filename = await this.resolve(relname);
        await new Promise<void>((resolve) => srv!.listen(filename, 0, resolve));
        return filename;
    }

    public async ensureDeleted(filename: string, dispose?: () => void) {
        if (dispose) {
            try {
                dispose();
                return; // Trust that dispose() did what it's supposed to.
            } catch (err) {
                // For temp directories, the "unsafeCleanup: true"
                // option of the "tmp" module is supposed to support
                // a non-empty directory, but apparently that isn't
                // always the case.
                // (see #8804)
                if (!(await fsextra.pathExists(filename))) {
                    return;
                }
                console.log(`failure during dispose() for ${filename}: ${err}`);
                console.log('...manually deleting');
                // Fall back to fsextra.
            }
        }

        try {
            await fsextra.remove(filename);
        } catch (err) {
            console.log(`failure while deleting ${filename}: ${err}`);
        }
    }

    private ensureTempDir(): string {
        if (this.tempDir) {
            return this.tempDir;
        }

        const tempDir = tmpMod.dirSync({
            prefix: 'pyvsc-fs-tests-',
            unsafeCleanup: true,
        });
        this.tempDir = tempDir.name;

        this.addFSCleanup(tempDir.name, async () => {
            if (!this.tempDir) {
                return;
            }
            this.tempDir = undefined;

            await this.ensureDeleted(tempDir.name, tempDir.removeCallback);
            //try {
            //    tempDir.removeCallback();
            //} catch {
            //    // The "unsafeCleanup: true" option is supposed
            //    // to support a non-empty directory, but apparently
            //    // that isn't always the case.  (see #8804)
            //    await fsextra.remove(tempDir.name);
            //}
        });
        return tempDir.name;
    }

    private ensureSocketServer(): net.Server {
        if (this.sockServer) {
            return this.sockServer;
        }

        const srv = net.createServer();
        this.sockServer = srv;
        this.addCleanup(async () => {
            try {
                await new Promise((resolve) => srv.close(resolve));
            } catch (err) {
                console.log(`failure while closing socket server: ${err}`);
            }
        });
        return srv;
    }
}
