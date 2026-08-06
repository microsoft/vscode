/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { Throttler } from '../../../base/common/async.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { dirname } from '../../../base/common/path.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';

export const IAgentHostStorageService = createDecorator<IAgentHostStorageService>('agentHostStorageService');

export interface IAgentHostStorageService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<string>;
	get<T>(key: string): T | undefined;
	set<T>(key: string, value: T): void;
	delete(key: string): void;
	whenIdle(): Promise<void>;
}

export interface IAgentHostStorageWriter {
	mkdir(path: string): Promise<void>;
	writeFile(path: string, contents: string): Promise<void>;
}

const defaultStorageWriter: IAgentHostStorageWriter = {
	mkdir: path => fs.promises.mkdir(path, { recursive: true }).then(() => undefined),
	writeFile: (path, contents) => fs.promises.writeFile(path, contents, 'utf8'),
};

/**
 * A small host-owned persistent store. Reads are synchronously available after
 * construction; writes are coalesced so callers never wait on disk I/O.
 */
export class AgentHostStorageService extends Disposable implements IAgentHostStorageService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<string>());
	readonly onDidChange = this._onDidChange.event;

	private readonly _writeThrottler = this._register(new Throttler());
	private readonly _pendingWrites = new Set<Promise<void>>();
	private _data: Record<string, unknown>;

	constructor(
		private readonly _resource: URI | undefined,
		@ILogService private readonly _logService: ILogService,
		private readonly _writer: IAgentHostStorageWriter = defaultStorageWriter,
	) {
		super();
		this._data = this._load();
	}

	get<T>(key: string): T | undefined {
		return this._data[key] as T | undefined;
	}

	set<T>(key: string, value: T): void {
		this._data[key] = value;
		this._onDidChange.fire(key);
		this._scheduleWrite();
	}

	delete(key: string): void {
		if (!Object.hasOwn(this._data, key)) {
			return;
		}
		delete this._data[key];
		this._onDidChange.fire(key);
		this._scheduleWrite();
	}

	async whenIdle(): Promise<void> {
		while (this._pendingWrites.size > 0) {
			await Promise.allSettled([...this._pendingWrites]);
		}
	}

	private _load(): Record<string, unknown> {
		if (this._resource === undefined) {
			return {};
		}

		try {
			const value: unknown = JSON.parse(fs.readFileSync(this._resource.fsPath, 'utf8'));
			if (value && typeof value === 'object' && !Array.isArray(value)) {
				return value as Record<string, unknown>;
			}
			this._logService.warn(`[AgentHostStorageService] Ignoring non-object storage data: ${this._resource.toString()}`);
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
				this._logService.warn(`[AgentHostStorageService] Failed to read storage: ${this._resource.toString()}`, err);
			}
		}
		return {};
	}

	private _scheduleWrite(): void {
		const resource = this._resource;
		if (resource === undefined) {
			return;
		}

		const write = this._writeThrottler.queue(async () => {
			try {
				await this._writer.mkdir(dirname(resource.fsPath));
				await this._writer.writeFile(resource.fsPath, JSON.stringify(this._data));
			} catch (err) {
				this._logService.error(`[AgentHostStorageService] Failed to write storage: ${resource.toString()}`, err);
			}
		});
		this._pendingWrites.add(write);
		const untrack = () => this._pendingWrites.delete(write);
		write.then(untrack, untrack);
	}
}
