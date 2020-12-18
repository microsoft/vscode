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

export interface IWatcherOptions {
	pollingInterval?: number;
	usePolling?: boolean;
	verboseLogging?: boolean;
}

export interface IWatcherService {

	readonly onDidChangeFile: Event<IDiskFileChange[]>;
	readonly onDidLogMessage: Event<ILogMessage>;

	init(options: IWatcherOptions): Promise<void>;

	setRoots(roots: IWatcherRequest[]): Promise<void>;
	setVerboseLogging(enabled: boolean): Promise<void>;

	stop(): Promise<void>;
}
