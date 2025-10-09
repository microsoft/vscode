/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { ObservableMemento, observableMemento } from '../../../../platform/observable/common/observableMemento.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IMcpServer } from './mcpTypes.js';
import { MCP } from './modelContextProtocol.js';

const enum Constants {
	SamplingRetentionDays = 7,
	MsPerDay = 24 * 60 * 60 * 1000,
	SamplingRetentionMs = SamplingRetentionDays * MsPerDay,
	SamplingLastNMessage = 30,
}

export interface ISamplingStoredData {
	// UTC day ordinal of the first bin in the bins
	head: number;
	// Requests per day, max length of `Constants.SamplingRetentionDays`
	bins: number[];
	// Last sampling requests/responses
	lastReqs: { request: MCP.SamplingMessage[]; response: string; at: number; model: string }[];
}

const samplingMemento = observableMemento<ReadonlyMap<string, ISamplingStoredData>>({
	defaultValue: new Map(),
	key: 'mcp.sampling.logs',
	toStorage: v => JSON.stringify(Array.from(v.entries())),
	fromStorage: v => new Map(JSON.parse(v)),
});

export class McpSamplingLog extends Disposable {
	private readonly _logs: { [K in StorageScope]?: ObservableMemento<ReadonlyMap<string, ISamplingStoredData>> } = {};

	constructor(
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();
	}

	public has(server: IMcpServer): boolean {
		const storage = this._getLogStorageForServer(server);
		return storage.get().has(server.definition.id);
	}

	public get(server: IMcpServer): Readonly<ISamplingStoredData | undefined> {
		const storage = this._getLogStorageForServer(server);
		return storage.get().get(server.definition.id);
	}

	public getAsText(server: IMcpServer): string {
		const storage = this._getLogStorageForServer(server);
		const record = storage.get().get(server.definition.id);
		if (!record) {
			return '';
		}

		const parts: string[] = [];
		const total = record.bins.reduce((sum, value) => sum + value, 0);
		parts.push(localize('mcp.sampling.rpd', '{0} total requests in the last 7 days.', total));

		parts.push(this._formatRecentRequests(record));
		return parts.join('\n');
	}

	private _formatRecentRequests(data: ISamplingStoredData): string {
		if (!data.lastReqs.length) {
			return '\nNo recent requests.';
		}

		const result: string[] = [];
		for (let i = 0; i < data.lastReqs.length; i++) {
			const { request, response, at, model } = data.lastReqs[i];
			result.push(`\n[${i + 1}] ${new Date(at).toISOString()} ${model}`);

			result.push('  Request:');
			for (const msg of request) {
				const role = msg.role.padEnd(9);
				let content = '';
				if ('text' in msg.content && msg.content.type === 'text') {
					content = msg.content.text;
				} else if ('data' in msg.content) {
					content = `[${msg.content.type} data: ${msg.content.mimeType}]`;
				}
				result.push(`    ${role}: ${content}`);
			}
			result.push('  Response:');
			result.push(`    ${response}`);
		}

		return result.join('\n');
	}

	public async add(server: IMcpServer, request: MCP.SamplingMessage[], response: string, model: string) {
		const now = Date.now();
		const utcOrdinal = Math.floor(now / Constants.MsPerDay);
		const storage = this._getLogStorageForServer(server);

		const next = new Map(storage.get());
		let record = next.get(server.definition.id);
		if (!record) {
			record = {
				head: utcOrdinal,
				bins: Array.from({ length: Constants.SamplingRetentionDays }, () => 0),
				lastReqs: [],
			};
		} else {
			// Shift bins back by daysSinceHead, dropping old days
			for (let i = 0; i < (utcOrdinal - record.head) && i < Constants.SamplingRetentionDays; i++) {
				record.bins.pop();
				record.bins.unshift(0);
			}
			record.head = utcOrdinal;
		}

		// Increment the current day's bin (head)
		record.bins[0]++;
		record.lastReqs.unshift({ request, response, at: now, model });
		while (record.lastReqs.length > Constants.SamplingLastNMessage) {
			record.lastReqs.pop();
		}

		next.set(server.definition.id, record);
		storage.set(next, undefined);
	}

	private _getLogStorageForServer(server: IMcpServer) {
		const scope = server.readDefinitions().get().collection?.scope ?? StorageScope.WORKSPACE;
		return this._logs[scope] ??= this._register(samplingMemento(scope, StorageTarget.MACHINE, this._storageService));
	}
}
