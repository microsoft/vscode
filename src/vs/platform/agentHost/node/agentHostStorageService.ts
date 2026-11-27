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
import { generateUuid } from '../../../base/common/uuid.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';

export const IAgentHostStorageService = createDecorator<IAgentHostStorageService>('agentHostStorageService');

export interface IAgentHostStorageService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<string>;
	readonly loadError: Error | undefined;
	get<T>(key: string): T | undefined;
	set<T>(key: string, value: T): void;
	setAndFlush<T>(key: string, value: T): Promise<void>;
	delete(key: string): void;
	whenIdle(): Promise<void>;
}

export interface IAgentHostStorageWriter {
	mkdir(path: string): Promise<void>;
	writeFile(path: string, contents: string): Promise<void>;
	rename(from: string, to: string): Promise<void>;
	rm(path: string): Promise<void>;
}

const defaultStorageWriter: IAgentHostStorageWriter = {
	mkdir: path => fs.promises.mkdir(path, { recursive: true }).then(() => undefined),
	writeFile: (path, contents) => fs.promises.writeFile(path, contents, 'utf8'),
	rename: (from, to) => fs.promises.rename(from, to),
	rm: path => fs.promises.rm(path, { force: true }),
};

/**
 * A small host-owned persistent store. Reads are synchronously available after
 * construction; writes are coalesced and atomically replace the persisted file.
 *
 * Construct with {@link AgentHostStorageService.create} to load the persisted
 * file without blocking the event loop. The `persisted` argument injects the
 * loaded contents, and defaults to an empty store for tests and resources
 * without persisted data.
 */
export class AgentHostStorageService extends Disposable implements IAgentHostStorageService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<string>());
	readonly onDidChange = this._onDidChange.event;

	private readonly _writeThrottler = this._register(new Throttler());
	private readonly _pendingWrites = new Set<Promise<void>>();
	private readonly _data: Record<string, unknown>;
	private _lastWriteError: Error | undefined;
	private readonly _loadError: Error | undefined;

	constructor(
		private readonly _resource: URI | undefined,
		@ILogService private readonly _logService: ILogService,
		private readonly _writer: IAgentHostStorageWriter = defaultStorageWriter,
		persisted: { readonly data: Record<string, unknown>; readonly loadError?: Error } = { data: {} },
	) {
		super();
		this._data = persisted.data;
		this._loadError = persisted.loadError;
	}

	/**
	 * Reads and validates the persisted storage file, then returns a service whose
	 * reads are available immediately. Reading asynchronously keeps storage I/O off
	 * the host's event loop, which a synchronous load would block for the whole read.
	 */
	static async create(resource: URI | undefined, logService: ILogService, writer: IAgentHostStorageWriter = defaultStorageWriter): Promise<AgentHostStorageService> {
		let data: Record<string, unknown> = {};
		let loadError: Error | undefined;
		if (resource !== undefined) {
			try {
				const value: unknown = JSON.parse(await fs.promises.readFile(resource.fsPath, 'utf8'));
				if (value && typeof value === 'object' && !Array.isArray(value)) {
					data = value as Record<string, unknown>;
				} else {
					logService.warn(`[AgentHostStorageService] Ignoring non-object storage data: ${resource.toString()}`);
					loadError = new Error(`Agent Host storage does not contain a JSON object: ${resource.toString()}`);
				}
			} catch (err) {
				if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
					logService.warn(`[AgentHostStorageService] Failed to read storage: ${resource.toString()}`, err);
					loadError = err instanceof Error ? err : new Error(String(err));
				}
			}
		}
		return new AgentHostStorageService(resource, logService, writer, { data, loadError });
	}

	get<T>(key: string): T | undefined {
		return this._data[key] as T | undefined;
	}

	get loadError(): Error | undefined {
		return this._loadError;
	}

	set<T>(key: string, value: T): void {
		this._throwIfLoadFailed();
		this._data[key] = value;
		this._onDidChange.fire(key);
		this._scheduleWrite();
	}

	async setAndFlush<T>(key: string, value: T): Promise<void> {
		const hadPrevious = Object.hasOwn(this._data, key);
		const previous = this._data[key];
		this.set(key, value);
		try {
			await this.whenIdle();
		} catch (error) {
			if (this._data[key] === value) {
				if (hadPrevious) {
					this._data[key] = previous;
				} else {
					delete this._data[key];
				}
				this._onDidChange.fire(key);
				this._scheduleWrite();
			}
			throw error;
		}
	}

	delete(key: string): void {
		this._throwIfLoadFailed();
		if (!Object.hasOwn(this._data, key)) {
			return;
		}
		delete this._data[key];
		this._onDidChange.fire(key);
		this._scheduleWrite();
	}

	async whenIdle(): Promise<void> {
		this._throwIfLoadFailed();
		while (this._pendingWrites.size > 0) {
			await Promise.allSettled([...this._pendingWrites]);
		}
		if (this._lastWriteError) {
			throw this._lastWriteError;
		}
	}

	private _scheduleWrite(): void {
		const resource = this._resource;
		if (resource === undefined) {
			return;
		}

		const write = this._writeThrottler.queue(async () => {
			await this._writer.mkdir(dirname(resource.fsPath));
			const temporaryPath = `${resource.fsPath}.${generateUuid()}.tmp`;
			try {
				await this._writer.writeFile(temporaryPath, JSON.stringify(this._data));
				await this._writer.rename(temporaryPath, resource.fsPath);
			} finally {
				await this._writer.rm(temporaryPath);
			}
		});
		this._pendingWrites.add(write);
		const untrack = () => this._pendingWrites.delete(write);
		void write.then(
			() => {
				this._lastWriteError = undefined;
				untrack();
			},
			error => {
				this._lastWriteError = error instanceof Error ? error : new Error(String(error));
				this._logService.error(`[AgentHostStorageService] Failed to write storage: ${resource.toString()}`, error);
				untrack();
			},
		);
	}

	private _throwIfLoadFailed(): void {
		if (this._loadError) {
			throw new Error('Agent Host storage is unavailable because its persisted data could not be loaded.', { cause: this._loadError });
		}
	}
}
