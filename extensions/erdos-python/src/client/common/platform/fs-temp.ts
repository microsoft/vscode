// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as tmp from 'tmp';
import { ITempFileSystem, TemporaryFile } from './types';

interface IRawTempFS {
    fileSync(config?: tmp.Options): tmp.SynchrounousResult;
}

// Operations related to temporary files and directories.
export class TemporaryFileSystem implements ITempFileSystem {
    constructor(
        // (effectively) the third-party "tmp" module to use
        private readonly raw: IRawTempFS,
    ) {}
    public static withDefaults(): TemporaryFileSystem {
        return new TemporaryFileSystem(
            // Use the actual "tmp" module.
            tmp,
        );
    }

    // Create a new temp file with the given filename suffix.
    public createFile(suffix: string, mode?: number): Promise<TemporaryFile> {
        const opts = {
            postfix: suffix,
            mode,
        };
        return new Promise<TemporaryFile>((resolve, reject) => {
            const { name, removeCallback } = this.raw.fileSync(opts);
            if (!name) {
                return reject(new Error('Failed to create temp file'));
            }
            resolve({
                filePath: name,
                dispose: removeCallback,
            });
        });
    }
}
