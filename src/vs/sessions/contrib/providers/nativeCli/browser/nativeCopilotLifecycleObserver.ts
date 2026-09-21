/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler, Sequencer } from '../../../../../base/common/async.js';
import { Disposable, DisposableMap } from '../../../../../base/common/lifecycle.js';
import { extUri, isEqual, joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { INativeCliLifecycleEvent } from '../../../../../platform/agentHost/common/nativeCliLifecycle.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { readNativeCopilotForeground, readNativeCopilotMetadata } from '../common/nativeCli.js';
import { NativeCliLineObserver } from './nativeCliLifecycleObserver.js';

/** Native foreground registration precedes lazy SDK hooks, including switches between idle conversations. */
export class NativeCopilotLifecycleObserver extends Disposable {
	private readonly _logs = this._register(new DisposableMap<string, NativeCliLineObserver>());
	private readonly _queue = new Sequencer();
	private _logResource: URI | undefined;
	private _hasEvents = false;
	private readonly _scheduler = this._register(new RunOnceScheduler(() => {
		void this.read().catch(error => this._logService.warn('Could not read native Copilot foreground session', error));
	}, 20));

	constructor(
		private readonly _directory: URI,
		private readonly _metadataHome: URI,
		private readonly _initialSessionId: string,
		private readonly _onEvent: (event: INativeCliLifecycleEvent) => Promise<void>,
		private readonly _onError: (error: unknown) => void,
		@IFileService private readonly _fileService: IFileService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		const watcher = this._register(_fileService.createWatcher(_directory, { recursive: false, excludes: [] }));
		this._register(watcher.onDidChange(() => this._scheduler.schedule()));
		this._scheduler.schedule();
	}

	/** Whether this observer has recognized at least one record from its source. */
	get hasEvents(): boolean {
		return this._hasEvents;
	}

	read(): Promise<void> {
		return this._queue.queue(async () => {
			if (this._store.isDisposed) {
				return;
			}
			const directory = await this._fileService.resolve(this._directory);
			for (const file of directory.children ?? []) {
				if (this._store.isDisposed) {
					return;
				}
				if (!file.isFile || !/^process-\d+-\d+\.log$/.test(file.name) || this._logResource && !isEqual(file.resource, this._logResource)) {
					continue;
				}
				const key = extUri.getComparisonKey(file.resource);
				let observer = this._logs.get(key);
				if (!observer) {
					observer = this._instantiationService.createInstance(NativeCliLineObserver, file.resource, async line => {
						const foreground = readNativeCopilotForeground(line);
						if (!foreground || this._logResource && !isEqual(file.resource, this._logResource) || !this._logResource && foreground.sessionId !== this._initialSessionId) {
							return false;
						}
						this._logResource = file.resource;
						const resource = joinPath(this._metadataHome, 'session-state', foreground.sessionId, 'workspace.yaml');
						const content = await this._fileService.readFile(resource, { limits: { size: 65536 } });
						const metadata = readNativeCopilotMetadata(content.value.toString());
						if (metadata.id !== foreground.sessionId) {
							throw new Error('Native Copilot session metadata does not match its foreground session');
						}
						if (!this._store.isDisposed) {
							await this._onEvent({ event: 'start', sessionId: metadata.id, cwd: metadata.cwd, title: metadata.title, timestamp: foreground.timestamp, source: 'switch' });
							this._hasEvents = true;
						}
						return true;
					}, this._onError, true);
					this._logs.set(key, observer);
				}
				await observer.read();
			}
		}).catch(error => {
			if (!this._store.isDisposed) {
				this._onError(error);
			}
			throw error;
		});
	}
}
