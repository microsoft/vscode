/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs/promises';
import path from 'path';
import { FetchOptions, IAbortController, IFetcherService, PaginationOptions, Response, WebSocketConnection } from '../../../../platform/networking/common/fetcherService';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { Event } from '../../../../util/vs/base/common/event';
import { ICommandExecutor } from '../../vscode-node/util';

type CommandResult = { fileName?: string; stdout?: string; exitCode: number };

export class FixtureCommandExecutor implements ICommandExecutor {
	commands: Array<{ command: string; args: string[]; cwd: string }> = [];

	constructor(public readonly fullCommandToResultMap: Map<string, CommandResult> = new Map()) { }

	async executeWithTimeout(command: string, args: string[], cwd: string, timeoutMs?: number, expectZeroExitCode?: boolean, cancellationToken?: CancellationToken): Promise<{ stdout: string; stderr: string; exitCode: number }> {
		this.commands.push({ command, args, cwd });

		let stdout: string = '';
		let exitCode: number = 1;
		if (this.fullCommandToResultMap) {
			const fullCommand = `${command} ${args.join(' ')}`;
			const result = this.fullCommandToResultMap.get(fullCommand);
			if (result) {
				exitCode = result.exitCode;
				if (result.fileName) {
					const filePath = path.join(__dirname, 'fixtures', 'snapshots', result.fileName);
					stdout = await fs.readFile(filePath, 'utf-8');
				} else if (result.stdout) {
					stdout = result.stdout;
				}
			}
		}

		if (expectZeroExitCode && exitCode !== 0) {
			return Promise.reject(new Error(`Expected zero exit code but got ${exitCode}`));
		}

		return Promise.resolve({
			exitCode,
			stdout,
			stderr: '',
		});
	}
}

export class FixtureFetcherService implements IFetcherService {
	urls: Array<string> = [];

	constructor(readonly urlToFileNameMap: Map<string, { fileName: string; status: number }> = new Map()) { }

	async fetch(url: string, options: FetchOptions): Promise<Response> {
		this.urls.push(url);

		const result = this.urlToFileNameMap?.get(url);
		if (!result) {
			return Promise.resolve({
				ok: false,
				status: 404,
				json: async () => ({ message: 'Not Found' }),
			} as Response);
		} else {
			const filePath = path.join(__dirname, 'fixtures', 'snapshots', result.fileName);
			const content = await fs.readFile(filePath, 'utf-8');
			return Promise.resolve({
				ok: result.status === 200,
				status: result.status,
				text: async () => content,
				json: async () => JSON.parse(content),
			} as Response);
		}
	}

	async fetchWithPagination<T>(baseUrl: string, options: PaginationOptions<T>): Promise<T[]> {
		const items: T[] = [];
		const pageSize = options.pageSize ?? 20;
		let page = options.startPage ?? 1;
		let hasNextPage = false;

		do {
			const url = options.buildUrl(baseUrl, pageSize, page);
			const response = await this.fetch(url, options);

			if (!response.ok) {
				// Return what we've collected so far if request fails
				return items;
			}

			const data = await response.json();
			const pageItems = options.getItemsFromResponse(data);
			items.push(...pageItems);

			hasNextPage = pageItems.length === pageSize;
			page++;
		} while (hasNextPage);

		return items;
	}

	_serviceBrand: undefined;
	readonly onDidFetch = Event.None;
	readonly onDidCompleteFetch = Event.None;
	getUserAgentLibrary(): string { throw new Error('Method not implemented.'); }
	createWebSocket(_url: string): WebSocketConnection { throw new Error('Method not implemented.'); }
	disconnectAll(): Promise<unknown> { throw new Error('Method not implemented.'); }
	makeAbortController(): IAbortController { throw new Error('Method not implemented.'); }
	isAbortError(e: any): boolean { throw new Error('Method not implemented.'); }
	isInternetDisconnectedError(e: any): boolean { throw new Error('Method not implemented.'); }
	isFetcherError(e: any): boolean { throw new Error('Method not implemented.'); }
	isNetworkProcessCrashedError(e: any): boolean { throw new Error('Method not implemented.'); }
	getUserMessageForFetcherError(err: any): string { throw new Error('Method not implemented.'); }
}
