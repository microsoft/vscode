/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { Throttler } from '../../../base/common/async.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { dirname } from '../../../base/common/path.js';
import { hasKey } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';

export const IAgentHostStorageService = createDecorator<IAgentHostStorageService>('agentHostStorageService');

/** Small persistent key/value store for agent-host internal state. */
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
	writeFile(path: string, content: string): Promise<void>;
}

export class AgentHostStorageService extends Disposable implements IAgentHostStorageService {
	declare readonly _serviceBrand: undefined;
	private readonly _values: Record<string, unknown>;
	private readonly _writeThrottler = this._register(new Throttler());
	private _write = Promise.resolve();
	private _previousWriteError: unknown;
	private readonly _onDidChange = this._register(new Emitter<string>());
	readonly onDidChange = this._onDidChange.event;

	constructor(
		@ILogService private readonly _logService: ILogService,
		private readonly _resource?: URI,
		private readonly _writer: IAgentHostStorageWriter = {
			mkdir: path => fs.promises.mkdir(path, { recursive: true }).then(() => undefined),
			writeFile: (path, content) => fs.promises.writeFile(path, content, 'utf8'),
		},
	) {
		super();
		this._values = this._load();
	}

	get<T>(key: string): T | undefined {
		return this._values[key] as T | undefined;
	}

	set<T>(key: string, value: T): void {
		this._values[key] = value;
		this._onDidChange.fire(key);
		this._persist();
	}

	delete(key: string): void {
		if (hasKey(this._values, { [key]: true })) {
			delete this._values[key];
			this._onDidChange.fire(key);
			this._persist();
		}
	}

	async whenIdle(): Promise<void> {
		await this._write;
	}

	private _load(): Record<string, unknown> {
		if (!this._resource) {
			return {};
		}
		try {
			const parsed: unknown = JSON.parse(fs.readFileSync(this._resource.fsPath, 'utf8'));
			return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? { ...(parsed as Record<string, unknown>) } : {};
		} catch (err) {
			const code = err && typeof err === 'object' && hasKey(err, { code: true }) ? String(err.code) : undefined;
			if (code !== 'ENOENT') {
				this._logService.warn(`[AgentHostStorageService] Failed to read host storage from ${this._resource.fsPath}: ${err instanceof Error ? err.message : String(err)}`);
			}
			return {};
		}
	}

	private _persist(): void {
		if (!this._resource) {
			return;
		}
		const resource = this._resource;
		this._write = this._writeThrottler.queue(async () => {
			if (this._previousWriteError !== undefined) {
				this._logService.warn('[AgentHostStorageService] Previous host storage write failed', this._previousWriteError);
				this._previousWriteError = undefined;
			}
			try {
				await this._writer.mkdir(dirname(resource.fsPath));
				await this._writer.writeFile(resource.fsPath, `${JSON.stringify(this._values, undefined, '\t')}\n`);
			} catch (err) {
				this._previousWriteError = err;
				this._logService.error(`[AgentHostStorageService] Failed to persist host storage to ${resource.fsPath}`, err);
			}
		}).catch(err => {
			this._logService.error(`[AgentHostStorageService] Failed to persist host storage to ${resource.fsPath}`, err);
		});
	}
}
