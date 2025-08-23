// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as fs from 'fs';
import * as vscode from 'vscode';
import { traceError } from '../../logging';

export import FileType = vscode.FileType;

export type DirEntry = {
    filename: string;
    filetype: FileType;
};

interface IKnowsFileType {
    isFile(): boolean;
    isDirectory(): boolean;
    isSymbolicLink(): boolean;
}

// This helper function determines the file type of the given stats
// object.  The type follows the convention of node's fs module, where
// a file has exactly one type.  Symlinks are not resolved.
export function convertFileType(info: IKnowsFileType): FileType {
    if (info.isFile()) {
        return FileType.File;
    }
    if (info.isDirectory()) {
        return FileType.Directory;
    }
    if (info.isSymbolicLink()) {
        // The caller is responsible for combining this ("logical or")
        // with File or Directory as necessary.
        return FileType.SymbolicLink;
    }
    return FileType.Unknown;
}

/**
 * Identify the file type for the given file.
 */
export async function getFileType(
    filename: string,
    opts: {
        ignoreErrors: boolean;
    } = { ignoreErrors: true },
): Promise<FileType | undefined> {
    let stat: fs.Stats;
    try {
        stat = await fs.promises.lstat(filename);
    } catch (err) {
        const error = err as NodeJS.ErrnoException;
        if (error.code === 'ENOENT') {
            return undefined;
        }
        if (opts.ignoreErrors) {
            traceError(`lstat() failed for "${filename}" (${err})`);
            return FileType.Unknown;
        }
        throw err; // re-throw
    }
    return convertFileType(stat);
}

function normalizeFileTypes(filetypes: FileType | FileType[] | undefined): FileType[] | undefined {
    if (filetypes === undefined) {
        return undefined;
    }
    if (Array.isArray(filetypes)) {
        if (filetypes.length === 0) {
            return undefined;
        }
        return filetypes;
    }
    return [filetypes];
}

async function resolveFile(
    file: string | DirEntry,
    opts: {
        ensure?: boolean;
        onMissing?: FileType;
    } = {},
): Promise<DirEntry | undefined> {
    let filename: string;
    if (typeof file !== 'string') {
        if (!opts.ensure) {
            if (opts.onMissing === undefined) {
                return file;
            }
            // At least make sure it exists.
            if ((await getFileType(file.filename)) !== undefined) {
                return file;
            }
        }
        filename = file.filename;
    } else {
        filename = file;
    }

    const filetype = (await getFileType(filename)) || opts.onMissing;
    if (filetype === undefined) {
        return undefined;
    }
    return { filename, filetype };
}

type FileFilterFunc = (file: string | DirEntry) => Promise<boolean>;

export function getFileFilter(
    opts: {
        ignoreMissing?: boolean;
        ignoreFileType?: FileType | FileType[];
        ensureEntry?: boolean;
    } = {
        ignoreMissing: true,
    },
): FileFilterFunc | undefined {
    const ignoreFileType = normalizeFileTypes(opts.ignoreFileType);

    if (!opts.ignoreMissing && !ignoreFileType) {
        // Do not filter.
        return undefined;
    }

    async function filterFile(file: string | DirEntry): Promise<boolean> {
        let entry = await resolveFile(file, { ensure: opts.ensureEntry });
        if (!entry) {
            if (opts.ignoreMissing) {
                return false;
            }
            const filename = typeof file === 'string' ? file : file.filename;
            entry = { filename, filetype: FileType.Unknown };
        }
        if (ignoreFileType) {
            if (ignoreFileType.includes(entry!.filetype)) {
                return false;
            }
        }
        return true;
    }
    return filterFile;
}
