/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IDiskFileChange, ILogMessage, IWatchRequest } from 'vs/platform/files/common/watcher';

export interface IWatcherOptions {
	pollingInterval?: number;
	usePolling?: boolean | string[]; // boolean or a set of glob patterns matching folders that need polling
	verboseLogging?: boolean;
}

export interface IWatcherService {

	readonly onDidChangeFile: Event<IDiskFileChange[]>;
	readonly onDidLogMessage: Event<ILogMessage>;

	init(options: IWatcherOptions): Promise<void>;

	watch(paths: IWatchRequest[]): Promise<void>;
	setVerboseLogging(enabled: boolean): Promise<void>;

	stop(): Promise<void>;
}
