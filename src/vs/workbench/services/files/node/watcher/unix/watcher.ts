/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
	setRoots(roots: IWatcherRequest[]): Promise<void>;
	setVerboseLogging(enabled: boolean): Promise<void>;
	stop(): Promise<void>;
}