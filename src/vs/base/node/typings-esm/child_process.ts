/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// ESM-comment-begin
import * as _child_process from 'child_process';
// ESM-comment-end

// ESM-uncomment-begin
// const _child_process = globalThis._VSCODE_NODE_MODULES.child_process;
// ESM-uncomment-end


export type ForkOptions = import('child_process').ForkOptions;
export type SpawnOptions = import('child_process').SpawnOptions;
export type ChildProcess = import('child_process').ChildProcess;
export type StdioOptions = import('child_process').StdioOptions;
export type ChildProcessWithoutNullStreams = import('child_process').ChildProcessWithoutNullStreams;
export const exec = _child_process.exec;
export const execFile = _child_process.execFile;
export const execFileSync = _child_process.execFileSync;
export const execSync = _child_process.execSync;
export const fork = _child_process.fork;
export const spawn = _child_process.spawn;
export const spawnSync = _child_process.spawnSync;
