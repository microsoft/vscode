/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IDiskFileChange, ILogMessage } from 'vs/platform/files/node/watcher/watcher';

export interface IWatcherRequest {
	path: string;
	excludes: string[];
}

export interface IWatcherService {

	readonly onDidLogMessage: Event<ILogMessage>;
	readonly onDidChangeFile: Event<IDiskFileChange[]>;

	setRoots(roots: IWatcherRequest[]): Promise<void>;
	setVerboseLogging(enabled: boolean): Promise<void>;

	stop(): Promise<void>;
}
