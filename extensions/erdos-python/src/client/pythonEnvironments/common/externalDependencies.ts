// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as fsapi from '../../common/platform/fs-paths';
import { IWorkspaceService } from '../../common/application/types';
import { ExecutionResult, IProcessServiceFactory, ShellOptions, SpawnOptions } from '../../common/process/types';
import { IDisposable, IConfigurationService, IExperimentService } from '../../common/types';
import { chain, iterable } from '../../common/utils/async';
import { getOSType, OSType } from '../../common/utils/platform';
import { IServiceContainer } from '../../ioc/types';
import { traceError, traceVerbose } from '../../logging';

let internalServiceContainer: IServiceContainer;
export function initializeExternalDependencies(serviceContainer: IServiceContainer): void {
    internalServiceContainer = serviceContainer;
}

// processes

export async function shellExecute(command: string, options: ShellOptions = {}): Promise<ExecutionResult<string>> {
    const useWorker = false;
    const service = await internalServiceContainer.get<IProcessServiceFactory>(IProcessServiceFactory).create();
    options = { ...options, useWorker };
    return service.shellExec(command, options);
}

export async function exec(
    file: string,
    args: string[],
    options: SpawnOptions = {},
    useWorker = false,
): Promise<ExecutionResult<string>> {
    const service = await internalServiceContainer.get<IProcessServiceFactory>(IProcessServiceFactory).create();
    options = { ...options, useWorker };
    return service.exec(file, args, options);
}

export function inExperiment(experimentName: string): boolean {
    const service = internalServiceContainer.get<IExperimentService>(IExperimentService);
    return service.inExperimentSync(experimentName);
}

// Workspace

export function isVirtualWorkspace(): boolean {
    const service = internalServiceContainer.get<IWorkspaceService>(IWorkspaceService);
    return service.isVirtualWorkspace;
}

// filesystem

export function pathExists(absPath: string): Promise<boolean> {
    return fsapi.pathExists(absPath);
}

export function pathExistsSync(absPath: string): boolean {
    return fsapi.pathExistsSync(absPath);
}

export function readFile(filePath: string): Promise<string> {
    return fsapi.readFile(filePath, 'utf-8');
}

export function readFileSync(filePath: string): string {
    return fsapi.readFileSync(filePath, 'utf-8');
}

/**
 * Returns true if given file path exists within the given parent directory, false otherwise.
 * @param filePath File path to check for
 * @param parentPath The potential parent path to check for
 */
export function isParentPath(filePath: string, parentPath: string): boolean {
    if (!parentPath.endsWith(path.sep)) {
        parentPath += path.sep;
    }
    if (!filePath.endsWith(path.sep)) {
        filePath += path.sep;
    }
    return normCasePath(filePath).startsWith(normCasePath(parentPath));
}

export async function isDirectory(filename: string): Promise<boolean> {
    const stat = await fsapi.lstat(filename);
    return stat.isDirectory();
}

export function isDirectorySync(filename: string): boolean {
    const stat = fsapi.statSync(filename);
    return stat.isDirectory();
}

export function normalizePath(filename: string): string {
    return path.normalize(filename);
}

export function resolvePath(filename: string): string {
    return path.resolve(filename);
}

export function normCasePath(filePath: string): string {
    return getOSType() === OSType.Windows ? path.normalize(filePath).toUpperCase() : path.normalize(filePath);
}

export function arePathsSame(path1: string, path2: string): boolean {
    return normCasePath(path1) === normCasePath(path2);
}

export async function resolveSymbolicLink(absPath: string, stats?: fsapi.Stats, count?: number): Promise<string> {
    stats = stats ?? (await fsapi.lstat(absPath));
    if (stats.isSymbolicLink()) {
        if (count && count > 5) {
            traceError(`Detected a potential symbolic link loop at ${absPath}, terminating resolution.`);
            return absPath;
        }
        const link = await fsapi.readlink(absPath);
        // Result from readlink is not guaranteed to be an absolute path. For eg. on Mac it resolves
        // /usr/local/bin/python3.9 -> ../../../Library/Frameworks/Python.framework/Versions/3.9/bin/python3.9
        //
        // The resultant path is reported relative to the symlink directory we resolve. Convert that to absolute path.
        const absLinkPath = path.isAbsolute(link) ? link : path.resolve(path.dirname(absPath), link);
        count = count ? count + 1 : 1;
        return resolveSymbolicLink(absLinkPath, undefined, count);
    }
    return absPath;
}

export async function getFileInfo(filePath: string): Promise<{ ctime: number; mtime: number }> {
    try {
        const data = await fsapi.lstat(filePath);
        return {
            ctime: data.ctime.valueOf(),
            mtime: data.mtime.valueOf(),
        };
    } catch (ex) {
        // This can fail on some cases, such as, `reparse points` on windows. So, return the
        // time as -1. Which we treat as not set in the extension.
        traceVerbose(`Failed to get file info for ${filePath}`, ex);
        return { ctime: -1, mtime: -1 };
    }
}

export async function isFile(filePath: string): Promise<boolean> {
    const stats = await fsapi.lstat(filePath);
    if (stats.isSymbolicLink()) {
        const resolvedPath = await resolveSymbolicLink(filePath, stats);
        const resolvedStats = await fsapi.lstat(resolvedPath);
        return resolvedStats.isFile();
    }
    return stats.isFile();
}

/**
 * Returns full path to sub directories of a given directory.
 * @param {string} root : path to get sub-directories from.
 * @param options : If called with `resolveSymlinks: true`, then symlinks found in
 *                  the directory are resolved and if they resolve to directories
 *                  then resolved values are returned.
 */
export async function* getSubDirs(
    root: string,
    options?: { resolveSymlinks?: boolean },
): AsyncIterableIterator<string> {
    const dirContents = await fsapi.readdir(root, { withFileTypes: true });
    const generators = dirContents.map((item) => {
        async function* generator() {
            const fullPath = path.join(root, item.name);
            if (item.isDirectory()) {
                yield fullPath;
            } else if (options?.resolveSymlinks && item.isSymbolicLink()) {
                // The current FS item is a symlink. It can potentially be a file
                // or a directory. Resolve it first and then check if it is a directory.
                const resolvedPath = await resolveSymbolicLink(fullPath);
                const resolvedPathStat = await fsapi.lstat(resolvedPath);
                if (resolvedPathStat.isDirectory()) {
                    yield resolvedPath;
                }
            }
        }

        return generator();
    });

    yield* iterable(chain(generators));
}

export function checkParentDirs(
    root: string,
    fileName: string,
    options?: { resolveSymlinks?: boolean; maxDepth?: number },
): string | undefined {
    let depth = 0;
    while (pathExistsSync(root) && (options?.maxDepth === undefined || depth < options.maxDepth)) {
        const filePath = path.join(root, fileName);
        if (options?.resolveSymlinks && pathExistsSync(filePath) && fs.lstatSync(filePath).isSymbolicLink()) {
            return fs.readlinkSync(filePath);
        }
        if (pathExistsSync(filePath)) {
            return filePath;
        }
        if (root === path.dirname(root)) {
            break;
        }
        root = path.dirname(root);
        depth += 1;
    }
    return undefined;
}

/**
 * Returns the value for setting `python.<name>`.
 * @param name The name of the setting.
 */
export function getPythonSetting<T>(name: string, root?: string): T | undefined {
    const resource = root ? vscode.Uri.file(root) : undefined;
    const settings = internalServiceContainer.get<IConfigurationService>(IConfigurationService).getSettings(resource);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (settings as any)[name];
}

/**
 * Registers the listener to be called when a particular setting changes.
 * @param name The name of the setting.
 * @param callback The listener function to be called when the setting changes.
 */
export function onDidChangePythonSetting(name: string, callback: () => void, root?: string): IDisposable {
    return vscode.workspace.onDidChangeConfiguration((event: vscode.ConfigurationChangeEvent) => {
        const scope = root ? vscode.Uri.file(root) : undefined;
        if (event.affectsConfiguration(`python.${name}`, scope)) {
            callback();
        }
    });
}
