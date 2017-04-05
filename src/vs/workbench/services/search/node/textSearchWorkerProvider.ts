/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as os from 'os';

import uri from 'vs/base/common/uri';
import * as ipc from 'vs/base/parts/ipc/common/ipc';
import { Client } from 'vs/base/parts/ipc/node/ipc.cp';

import { ISearchWorker, ISearchWorkerChannel, SearchWorkerChannelClient } from './worker/searchWorkerIpc';

export interface ITextSearchWorkerProvider {
	getWorkers(): ISearchWorker[];
}

export class TextSearchWorkerProvider implements ITextSearchWorkerProvider {
	private workers: ISearchWorker[] = [];

	getWorkers(): ISearchWorker[] {
		const numWorkers = os.cpus().length;
		while (this.workers.length < numWorkers) {
			this.createWorker();
		}

		return this.workers;
	}

	private createWorker(): void {
		let client = new Client(
			uri.parse(require.toUrl('bootstrap')).fsPath,
			{
				serverName: 'Search Worker ' + this.workers.length,
				args: ['--type=searchWorker'],
				timeout: 30 * 1000,
				env: {
					AMD_ENTRYPOINT: 'vs/workbench/services/search/node/worker/searchWorkerApp',
					PIPE_LOGGING: 'true',
					VERBOSE_LOGGING: process.env.VERBOSE_LOGGING
				},
				useQueue: true
			});

		const channel = ipc.getNextTickChannel(client.getChannel<ISearchWorkerChannel>('searchWorker'));
		const channelClient = new SearchWorkerChannelClient(channel);

		this.workers.push(channelClient);
	}
}