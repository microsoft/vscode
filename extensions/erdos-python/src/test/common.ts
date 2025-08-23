// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
'use strict';

// IMPORTANT: Do not import anything from the 'client' folder in this file as that folder is not available during smoke tests.

import * as assert from 'assert';
import * as fs from '../client/common/platform/fs-paths';
import * as glob from 'glob';
import * as path from 'path';
import { coerce, SemVer } from 'semver';
import { ConfigurationTarget, Event, TextDocument, Uri } from 'vscode';
import type { PythonExtension } from '../client/api/types';
import { IProcessService } from '../client/common/process/types';
import { IDisposable } from '../client/common/types';
import { IServiceContainer, IServiceManager } from '../client/ioc/types';
import { ProposedExtensionAPI } from '../client/proposedApiTypes';
import { EXTENSION_ROOT_DIR_FOR_TESTS, IS_MULTI_ROOT_TEST, IS_PERF_TEST, IS_SMOKE_TEST } from './constants';
import { noop, sleep } from './core';

const StreamZip = require('node-stream-zip');

export { sleep } from './core';

const fileInNonRootWorkspace = path.join(EXTENSION_ROOT_DIR_FOR_TESTS, 'src', 'test', 'python_files', 'dummy.py');
export const rootWorkspaceUri = getWorkspaceRoot();

export const PYTHON_PATH = getPythonPath();

const arch = require('arch');
export const IS_64_BIT = arch() === 'x64';

export enum OSType {
    Unknown = 'Unknown',
    Windows = 'Windows',
    OSX = 'OSX',
    Linux = 'Linux',
}

export type PythonSettingKeys =
    | 'defaultInterpreterPath'
    | 'languageServer'
    | 'testing.pytestArgs'
    | 'testing.unittestArgs'
    | 'formatting.provider'
    | 'testing.pytestEnabled'
    | 'testing.unittestEnabled'
    | 'envFile'
    | 'terminal.activateEnvironment';

async function disposePythonSettings() {
    if (!IS_SMOKE_TEST) {
        const configSettings = await import('../client/common/configSettings.js');
        configSettings.PythonSettings.dispose();
    }
}

export async function updateSetting(
    setting: PythonSettingKeys,
    value: {} | undefined,
    resource: Uri | undefined,
    configTarget: ConfigurationTarget,
) {
    const vscode = require('vscode') as typeof import('vscode');
    const settings = vscode.workspace.getConfiguration('python', { uri: resource, languageId: 'python' });
    const currentValue = settings.inspect(setting);
    if (
        currentValue !== undefined &&
        ((configTarget === vscode.ConfigurationTarget.Global && currentValue.globalValue === value) ||
            (configTarget === vscode.ConfigurationTarget.Workspace && currentValue.workspaceValue === value) ||
            (configTarget === vscode.ConfigurationTarget.WorkspaceFolder &&
                currentValue.workspaceFolderValue === value))
    ) {
        await disposePythonSettings();
        return;
    }
    await settings.update(setting, value, configTarget);

    // We've experienced trouble with .update in the past, where VSC returns stale data even
    // after invoking the update method. This issue has regressed a few times as well. This
    // delay is merely a backup to ensure it extension doesn't break the tests due to similar
    // regressions in VSC:
    // await sleep(2000);
    // ... please see issue #2356 and PR #2332 for a discussion on the matter

    await disposePythonSettings();
}

export async function clearPythonPathInWorkspaceFolder(resource: string | Uri) {
    const vscode = require('vscode') as typeof import('vscode');
    return retryAsync(setPythonPathInWorkspace)(resource, vscode.ConfigurationTarget.WorkspaceFolder);
}

export async function setPythonPathInWorkspaceRoot(pythonPath: string) {
    const vscode = require('vscode') as typeof import('vscode');
    return retryAsync(setPythonPathInWorkspace)(undefined, vscode.ConfigurationTarget.Workspace, pythonPath);
}

export async function restorePythonPathInWorkspaceRoot() {
    const vscode = require('vscode') as typeof import('vscode');
    return retryAsync(setPythonPathInWorkspace)(undefined, vscode.ConfigurationTarget.Workspace, PYTHON_PATH);
}

export async function setGlobalInterpreterPath(pythonPath: string) {
    return retryAsync(setGlobalPathToInterpreter)(pythonPath);
}

export const resetGlobalInterpreterPathSetting = async () => retryAsync(restoreGlobalInterpreterPathSetting)();

async function restoreGlobalInterpreterPathSetting(): Promise<void> {
    const vscode = require('vscode') as typeof import('vscode');
    const pythonConfig = vscode.workspace.getConfiguration('python', (null as any) as Uri);
    await pythonConfig.update('defaultInterpreterPath', undefined, true);
    await disposePythonSettings();
}
async function setGlobalPathToInterpreter(pythonPath?: string): Promise<void> {
    const vscode = require('vscode') as typeof import('vscode');
    const pythonConfig = vscode.workspace.getConfiguration('python', (null as any) as Uri);
    await pythonConfig.update('defaultInterpreterPath', pythonPath, true);
    await disposePythonSettings();
}
export const resetGlobalPythonPathSetting = async () => retryAsync(restoreGlobalPythonPathSetting)();

export async function setAutoSaveDelayInWorkspaceRoot(delayinMS: number) {
    const vscode = require('vscode') as typeof import('vscode');
    return retryAsync(setAutoSaveDelay)(undefined, vscode.ConfigurationTarget.Workspace, delayinMS);
}

function getWorkspaceRoot() {
    if (IS_SMOKE_TEST || IS_PERF_TEST) {
        return;
    }
    const vscode = require('vscode') as typeof import('vscode');
    if (!Array.isArray(vscode.workspace.workspaceFolders) || vscode.workspace.workspaceFolders.length === 0) {
        return vscode.Uri.file(path.join(EXTENSION_ROOT_DIR_FOR_TESTS, 'src', 'test'));
    }
    if (vscode.workspace.workspaceFolders.length === 1) {
        return vscode.workspace.workspaceFolders[0].uri;
    }
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(fileInNonRootWorkspace));
    return workspaceFolder ? workspaceFolder.uri : vscode.workspace.workspaceFolders[0].uri;
}

export function retryAsync(this: any, wrapped: Function, retryCount: number = 2) {
    return async (...args: any[]) => {
        return new Promise((resolve, reject) => {
            const reasons: any[] = [];

            const makeCall = () => {
                wrapped.call(this as Function, ...args).then(resolve, (reason: any) => {
                    reasons.push(reason);
                    if (reasons.length >= retryCount) {
                        reject(reasons);
                    } else {
                        // If failed once, lets wait for some time before trying again.
                        setTimeout(makeCall, 500);
                    }
                });
            };

            makeCall();
        });
    };
}

async function setAutoSaveDelay(resource: string | Uri | undefined, config: ConfigurationTarget, delayinMS: number) {
    const vscode = require('vscode') as typeof import('vscode');
    if (config === vscode.ConfigurationTarget.WorkspaceFolder && !IS_MULTI_ROOT_TEST) {
        return;
    }
    const resourceUri = typeof resource === 'string' ? vscode.Uri.file(resource) : resource;
    const settings = vscode.workspace.getConfiguration('files', resourceUri || null);
    const value = settings.inspect<number>('autoSaveDelay');
    const prop: 'workspaceFolderValue' | 'workspaceValue' =
        config === vscode.ConfigurationTarget.Workspace ? 'workspaceValue' : 'workspaceFolderValue';
    if (value && value[prop] !== delayinMS) {
        await settings.update('autoSaveDelay', delayinMS, config);
        await settings.update('autoSave', 'afterDelay');
    }
}

async function setPythonPathInWorkspace(
    resource: string | Uri | undefined,
    config: ConfigurationTarget,
    pythonPath?: string,
) {
    const vscode = require('vscode') as typeof import('vscode');
    if (config === vscode.ConfigurationTarget.WorkspaceFolder && !IS_MULTI_ROOT_TEST) {
        return;
    }
    const resourceUri = typeof resource === 'string' ? vscode.Uri.file(resource) : resource;
    const settings = vscode.workspace.getConfiguration('python', resourceUri || null);
    const value = settings.inspect<string>('defaultInterpreterPath');
    const prop: 'workspaceFolderValue' | 'workspaceValue' =
        config === vscode.ConfigurationTarget.Workspace ? 'workspaceValue' : 'workspaceFolderValue';
    if (value && value[prop] !== pythonPath) {
        await settings.update('defaultInterpreterPath', pythonPath, config);
        await disposePythonSettings();
    }
}
async function restoreGlobalPythonPathSetting(): Promise<void> {
    const vscode = require('vscode') as typeof import('vscode');
    const pythonConfig = vscode.workspace.getConfiguration('python', (null as any) as Uri);
    await Promise.all([
        pythonConfig.update('defaultInterpreterPath', undefined, true),
        pythonConfig.update('defaultInterpreterPath', undefined, true),
    ]);
    await disposePythonSettings();
}

export async function deleteDirectory(dir: string) {
    const exists = await fs.pathExists(dir);
    if (exists) {
        await fs.remove(dir);
    }
}

export async function deleteFile(file: string) {
    const exists = await fs.pathExists(file);
    if (exists) {
        await fs.remove(file);
    }
}

export async function deleteFiles(globPattern: string) {
    const items = await new Promise<string[]>((resolve, reject) => {
        glob.default(globPattern, (ex, files) => (ex ? reject(ex) : resolve(files)));
    });

    return Promise.all(items.map((item) => fs.remove(item).catch(noop)));
}
function getPythonPath(): string {
    if (process.env.CI_PYTHON_PATH && fs.existsSync(process.env.CI_PYTHON_PATH)) {
        return process.env.CI_PYTHON_PATH;
    }

    // TODO: Change this to python3.
    // See https://github.com/microsoft/vscode-python/issues/10910.
    return 'python';
}

/**
 * Determine if the current platform is included in a list of platforms.
 *
 * @param {OSes} OSType[] List of operating system Ids to check within.
 * @return true if the current OS matches one from the list, false otherwise.
 */
export function isOs(...OSes: OSType[]): boolean {
    // get current OS
    const currentOS: OSType = getOSType();
    // compare and return
    if (OSes.indexOf(currentOS) === -1) {
        return false;
    }
    return true;
}

export function getOSType(platform: string = process.platform): OSType {
    if (/^win/.test(platform)) {
        return OSType.Windows;
    } else if (/^darwin/.test(platform)) {
        return OSType.OSX;
    } else if (/^linux/.test(platform)) {
        return OSType.Linux;
    } else {
        return OSType.Unknown;
    }
}

/**
 * Update a string that represents a path in any OS to the string representation of
 * that same path in a different OS. Note: Does not handle drive letter if the path
 * is intended for a root.
 *
 * @param pathToCorrect The string representation of a path from a specific OS.
 * @param os The OS representation to switch to - if left undefined the current OS is used.
 */
export function correctPathForOsType(pathToCorrect: string, os?: OSType): string {
    if (os === undefined) {
        os = getOSType();
    }
    const pathSep: string = os === OSType.Windows ? '\\' : '/';
    const replacePathSepRegex: RegExp = os === OSType.Windows ? /\//g : /\\/g;

    return pathToCorrect.replace(replacePathSepRegex, pathSep);
}

/**
 * Get the current Python interpreter version.
 *
 * @param {procService} IProcessService Optionally specify the IProcessService implementation to use to execute with.
 * @return `SemVer` version of the Python interpreter, or `undefined` if an error occurs.
 */
export async function getPythonSemVer(procService?: IProcessService): Promise<SemVer | undefined> {
    const proc = await import('../client/common/process/proc.js');

    const pythonProcRunner = procService ? procService : new proc.ProcessService();
    const pyVerArgs = ['-c', 'import sys;print("{0}.{1}.{2}".format(*sys.version_info[:3]))'];

    return pythonProcRunner
        .exec(PYTHON_PATH, pyVerArgs)
        .then((strVersion) => new SemVer(strVersion.stdout.trim()))
        .catch((err) => {
            // if the call fails this should make it loudly apparent.
            console.error('Failed to get Python Version in getPythonSemVer', err);
            return undefined;
        });
}

/**
 * Match a given semver version specification with a list of loosely defined
 * version strings.
 *
 * Specify versions by their major version at minimum - the minor and patch
 * version numbers are optional.
 *
 * '3', '3.6', '3.6.6', are all vald and only the portions specified will be matched
 * against the current running Python interpreter version.
 *
 * Example scenarios:
 * '3' will match version 3.5.6, 3.6.4, 3.6.6, and 3.7.0.
 * '3.6' will match version 3.6.4 and 3.6.6.
 * '3.6.4' will match version 3.6.4 only.
 *
 * @param {version} SemVer the version to look for.
 * @param {searchVersions} string[] List of loosely-specified versions to match against.
 */
export function isVersionInList(version: SemVer, ...searchVersions: string[]): boolean {
    // see if the major/minor version matches any member of the skip-list.
    const isPresent = searchVersions.findIndex((ver) => {
        const semverChecker = coerce(ver);
        if (semverChecker) {
            if (semverChecker.compare(version) === 0) {
                return true;
            } else {
                // compare all the parts of the version that we have, we know we have
                // at minimum the major version or semverChecker would be 'null'...
                const versionParts = ver.split('.');
                let matches = parseInt(versionParts[0], 10) === version.major;

                if (matches && versionParts.length >= 2) {
                    matches = parseInt(versionParts[1], 10) === version.minor;
                }

                if (matches && versionParts.length >= 3) {
                    matches = parseInt(versionParts[2], 10) === version.patch;
                }

                return matches;
            }
        }
        return false;
    });

    if (isPresent >= 0) {
        return true;
    }
    return false;
}

/**
 * Determine if the Python interpreter version running in a given `IProcessService`
 * is in a selection of versions.
 *
 * You can specify versions by specifying the major version at minimum - the minor and
 * patch version numbers are optional.
 *
 * '3', '3.6', '3.6.6', are all vald and only the portions specified will be matched
 * against the current running Python interpreter version.
 *
 * Example scenarios:
 * '3' will match version 3.5.6, 3.6.4, 3.6.6, and 3.7.0.
 * '3.6' will match version 3.6.4 and 3.6.6.
 * '3.6.4' will match version 3.6.4 only.
 *
 * If you don't need to specify the environment (ie. the workspace) that the Python
 * interpreter is running under, use the simpler `isPythonVersion` instead.
 *
 * @param {procService} IProcessService Optionally, use this process service to call out to python with.
 * @param {versions} string[] Python versions to test for, specified as described above.
 * @return true if the current Python version matches a version in the skip list, false otherwise.
 */
export async function isPythonVersionInProcess(procService?: IProcessService, ...versions: string[]): Promise<boolean> {
    // get the current python version major/minor
    const currentPyVersion = await getPythonSemVer(procService);
    if (currentPyVersion) {
        return isVersionInList(currentPyVersion, ...versions);
    } else {
        console.error(
            `Failed to determine the current Python version when comparing against list [${versions.join(', ')}].`,
        );
        return false;
    }
}

/**
 * Determine if the current interpreter version is in a given selection of versions.
 *
 * You can specify versions by using up to the first three semver parts of a python
 * version.
 *
 * '3', '3.6', '3.6.6', are all vald and only the portions specified will be matched
 * against the current running Python interpreter version.
 *
 * Example scenarios:
 * '3' will match version 3.5.6, 3.6.4, 3.6.6, and 3.7.0.
 * '3.6' will match version 3.6.4 and 3.6.6.
 * '3.6.4' will match version 3.6.4 only.
 *
 * If you need to specify the environment (ie. the workspace) that the Python
 * interpreter is running under, use `isPythonVersionInProcess` instead.
 *
 * @param {versions} string[] List of versions of python that are to be skipped.
 * @param {resource} vscode.Uri Current workspace resource Uri or undefined.
 * @return true if the current Python version matches a version in the skip list, false otherwise.
 */
export async function isPythonVersion(...versions: string[]): Promise<boolean> {
    const currentPyVersion = await getPythonSemVer();
    if (currentPyVersion) {
        return isVersionInList(currentPyVersion, ...versions);
    } else {
        console.error(
            `Failed to determine the current Python version when comparing against list [${versions.join(', ')}].`,
        );
        return false;
    }
}

export interface IExtensionTestApi extends PythonExtension, ProposedExtensionAPI {
    serviceContainer: IServiceContainer;
    serviceManager: IServiceManager;
}

export async function unzip(zipFile: string, targetFolder: string): Promise<void> {
    await fs.ensureDir(targetFolder);
    return new Promise<void>((resolve, reject) => {
        const zip = new StreamZip({
            file: zipFile,
            storeEntries: true,
        });
        zip.on('ready', async () => {
            zip.extract('extension', targetFolder, (err: any) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
                zip.close();
            });
        });
    });
}
/**
 * Wait for a condition to be fulfilled within a timeout.
 */
export async function waitForCondition(
    condition: () => Promise<boolean>,
    timeoutMs: number,
    errorMessage: string,
): Promise<void> {
    return new Promise<void>(async (resolve, reject) => {
        const timeout = setTimeout(() => {
            clearTimeout(timeout);

            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            clearTimeout(timer);
            reject(new Error(errorMessage));
        }, timeoutMs);
        const timer = setInterval(async () => {
            if (!(await condition().catch(() => false))) {
                return;
            }
            clearTimeout(timeout);
            clearTimeout(timer);
            resolve();
        }, 10);
    });
}

/**
 * Execute a method until it executes without any exceptions.
 */
export async function retryIfFail<T>(fn: () => Promise<T>, timeoutMs: number = 60_000): Promise<T> {
    let lastEx: Error | undefined;
    const started = new Date().getTime();
    while (timeoutMs > new Date().getTime() - started) {
        try {
            const result = await fn();
            // Capture result, if no exceptions return that.
            return result;
        } catch (ex) {
            lastEx = ex as Error | undefined;
        }
        await sleep(10);
    }
    if (lastEx) {
        throw lastEx;
    }
    throw new Error('Timeout waiting for function to complete without any errors');
}

export async function openFile(file: string): Promise<TextDocument> {
    const vscode = require('vscode') as typeof import('vscode');
    const textDocument = await vscode.workspace.openTextDocument(file);
    await vscode.window.showTextDocument(textDocument);
    assert.ok(vscode.window.activeTextEditor, 'No active editor');
    return textDocument;
}

/**
 * Helper class to test events.
 *
 * Usage: Assume xyz.onDidSave is the event we want to test.
 * const handler = new TestEventHandler(xyz.onDidSave);
 * // Do something that would trigger the event.
 * assert.ok(handler.fired)
 * assert.strictEqual(handler.first, 'Args Passed to first onDidSave')
 * assert.strictEqual(handler.count, 1)// Only one should have been fired.
 */
export class TestEventHandler<T extends void | any = any> implements IDisposable {
    public get fired() {
        return this.handledEvents.length > 0;
    }
    public get first(): T {
        return this.handledEvents[0];
    }
    public get second(): T {
        return this.handledEvents[1];
    }
    public get last(): T {
        return this.handledEvents[this.handledEvents.length - 1];
    }
    public get count(): number {
        return this.handledEvents.length;
    }
    public get all(): T[] {
        return this.handledEvents;
    }
    private readonly handler: IDisposable;

    private readonly handledEvents: any[] = [];
    constructor(event: Event<T>, private readonly eventNameForErrorMessages: string, disposables: IDisposable[] = []) {
        disposables.push(this);
        this.handler = event(this.listener, this);
    }
    public reset() {
        while (this.handledEvents.length) {
            this.handledEvents.pop();
        }
    }
    public async assertFired(waitPeriod: number = 100): Promise<void> {
        await waitForCondition(async () => this.fired, waitPeriod, `${this.eventNameForErrorMessages} event not fired`);
    }
    public async assertFiredExactly(numberOfTimesFired: number, waitPeriod: number = 2_000): Promise<void> {
        await waitForCondition(
            async () => this.count === numberOfTimesFired,
            waitPeriod,
            `${this.eventNameForErrorMessages} event fired ${this.count}, expected ${numberOfTimesFired}`,
        );
    }
    public async assertFiredAtLeast(numberOfTimesFired: number, waitPeriod: number = 2_000): Promise<void> {
        await waitForCondition(
            async () => this.count >= numberOfTimesFired,
            waitPeriod,
            `${this.eventNameForErrorMessages} event fired ${this.count}, expected at least ${numberOfTimesFired}.`,
        );
    }
    public atIndex(index: number): T {
        return this.handledEvents[index];
    }

    public dispose() {
        this.handler.dispose();
    }

    private listener(e: T) {
        this.handledEvents.push(e);
    }
}

export function createEventHandler<T, K extends keyof T>(
    obj: T,
    eventName: K,
    dispoables: IDisposable[] = [],
): T[K] extends Event<infer TArgs> ? TestEventHandler<TArgs> : TestEventHandler<void> {
    return new TestEventHandler(obj[eventName] as any, eventName as string, dispoables) as any;
}
