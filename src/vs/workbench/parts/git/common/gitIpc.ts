/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { RawServiceState, IRawStatus, IPushOptions } from './git';

export interface IGitChannel extends IChannel {
	call(command: 'getVersion'): TPromise<string>;
	call(command: 'serviceState'): TPromise<RawServiceState>;
	call(command: 'status'): TPromise<IRawStatus>;
	call(command: 'init'): TPromise<IRawStatus>;
	call(command: 'add', filesPaths?: string[]): TPromise<IRawStatus>;
	call(command: 'stage', filePath: string, content: string): TPromise<IRawStatus>;
	call(command: 'branch', name: string, checkout?: boolean): TPromise<IRawStatus>;
	call(command: 'checkout', treeish?: string, filePaths?: string[]): TPromise<IRawStatus>;
	call(command: 'clean', filePaths: string[]): TPromise<IRawStatus>;
	call(command: 'undo'): TPromise<IRawStatus>;
	call(command: 'reset', treeish:string, hard?: boolean): TPromise<IRawStatus>;
	call(command: 'revertFiles', treeish:string, filePaths?: string[]): TPromise<IRawStatus>;
	call(command: 'fetch'): TPromise<IRawStatus>;
	call(command: 'pull', rebase?: boolean): TPromise<IRawStatus>;
	call(command: 'push', remote?: string, name?: string, options?: IPushOptions): TPromise<IRawStatus>;
	call(command: 'sync'): TPromise<IRawStatus>;
	call(command: 'commit', message:string, amend?: boolean, stage?: boolean): TPromise<IRawStatus>;
	call(command: 'detectMimetypes', path: string, treeish?: string): TPromise<string[]>;
	call(command: 'show', path: string, treeish?: string): TPromise<string>;
	call(command: 'onOutput'): TPromise<void>;
	call(command: string, ...args: any[]): TPromise<any>;
}
