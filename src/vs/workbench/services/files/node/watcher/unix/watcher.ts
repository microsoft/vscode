/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { Event } from 'vs/base/common/event';
import { IRawFileChange } from 'vs/workbench/services/files/node/watcher/common';

export interface IWatcherRequest {
	basePath: string;
	ignored: string[];
}

export interface IWatcherOptions {
	verboseLogging: boolean;
}

export interface IWatchError {
	message: string;
}

export interface IWatcherService {
	watch(options: IWatcherOptions): Event<IRawFileChange[] | IWatchError>;
	setRoots(roots: IWatcherRequest[]): TPromise<void>;
	setVerboseLogging(enabled: boolean): TPromise<void>;
	stop(): TPromise<void>;
}