/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler, Sequencer } from '../../../../../base/common/async.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { INativeCliLifecycleEvent, isNativeCliLifecycleEvent } from '../../../../../platform/agentHost/common/nativeCliLifecycle.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';

export class NativeCliLineObserver extends Disposable {
	private readonly _queue = new Sequencer();
	private readonly _decoder = new TextDecoder();
	private _remainder = '';
	private _offset = 0;
	private _hasEvents = false;
	private _discardingLine = false;
	private readonly _readScheduler = this._register(new RunOnceScheduler(() => {
		void this.read().catch(error => {
			if (!this._store.isDisposed) {
				this._logService.error('Could not read native CLI lifecycle events', error);
			}
		});
	}, 20));

	constructor(
		private readonly _resource: URI,
		private readonly _onLine: (line: string) => Promise<boolean>,
		private readonly _onError: (error: unknown) => void,
		private readonly _discardOversizedLines: boolean,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		const watcher = this._register(_fileService.createWatcher(_resource, { recursive: false, excludes: [] }));
		this._register(watcher.onDidChange(() => this._readScheduler.schedule()));
	}

	/** Whether this observer has recognized at least one record from its source. */
	get hasEvents(): boolean {
		return this._hasEvents;
	}

	read(): Promise<void> {
		return this._queue.queue(async () => {
			while (!this._store.isDisposed) {
				const { value } = await this._fileService.readFile(this._resource, { position: this._offset, length: 65536 });
				if (!value.byteLength || this._store.isDisposed) {
					return;
				}
				this._offset += value.byteLength;
				this._remainder += this._decoder.decode(value.buffer, { stream: true });
				let newline: number;
				while ((newline = this._remainder.indexOf('\n')) >= 0) {
					const line = this._remainder.slice(0, newline);
					this._remainder = this._remainder.slice(newline + 1);
					if (this._discardingLine) {
						this._discardingLine = false;
						continue;
					}
					if (line.length > 65536) {
						if (this._discardOversizedLines) {
							continue;
						}
						throw new Error('Native CLI lifecycle record exceeded its limit');
					}
					if (!this._store.isDisposed && await this._onLine(line)) {
						this._hasEvents = true;
					}
				}
				if (this._remainder.length > 65536) {
					if (!this._discardOversizedLines) {
						throw new Error('Native CLI lifecycle record exceeded its limit');
					}
					this._discardingLine = true;
				}
				if (this._discardingLine) {
					this._remainder = '';
				}
				if (value.byteLength < 65536) {
					return;
				}
			}

		}).catch(error => {
			if (!this._store.isDisposed) {
				this._onError(error);
			}
			throw error;
		});
	}
}

export class NativeCliLifecycleObserver extends NativeCliLineObserver {
	constructor(
		resource: URI,
		onEvent: (event: INativeCliLifecycleEvent) => Promise<void>,
		onError: (error: unknown) => void,
		@IFileService fileService: IFileService,
		@ILogService logService: ILogService,
	) {
		super(resource, async line => {
			let event: unknown;
			try {
				event = JSON.parse(line);
			} catch {
				throw new Error('Invalid native CLI lifecycle record');
			}
			if (!isNativeCliLifecycleEvent(event)) {
				throw new Error('Invalid native CLI lifecycle metadata');
			}
			await onEvent(event);
			return true;
		}, onError, false, fileService, logService);
	}
}
