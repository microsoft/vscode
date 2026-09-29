/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileChangesEvent, FileChangeType, IFileService } from '../../../files/common/files.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentHostFileMonitorService } from '../../node/agentHostFileMonitorService.js';

suite('AgentHostFileMonitorService', () => {

	const disposables = new DisposableStore();

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	function acquire(monitor: AgentHostFileMonitorService, folder: URI, callback: () => void, options?: { readonly excludes?: readonly string[]; readonly debounceMs?: number }): IDisposable {
		const registration = monitor.acquire(folder, callback, options);
		assert.ok(registration, 'expected file monitor acquisition to succeed');
		return registration;
	}

	test('shares one recursive watcher per folder/options and refcounts callbacks', () => {
		return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
			const fileService = new TestFileService();
			const monitor = disposables.add(new AgentHostFileMonitorService(fileService.service, new NullLogService()));
			const folder = URI.file('/repo');
			let first = 0;
			let second = 0;

			const firstRegistration = acquire(monitor, folder, () => first++, { debounceMs: 10 });
			const secondRegistration = acquire(monitor, folder, () => second++, { debounceMs: 10 });
			assert.deepStrictEqual(fileService.snapshot(), { watches: 1, disposed: 0 });

			fileService.fire(URI.file('/repo/src/a.ts'));
			await timeout(11);
			assert.deepStrictEqual({ first, second }, { first: 1, second: 1 });

			firstRegistration.dispose();
			fileService.fire(URI.file('/repo/src/b.ts'));
			await timeout(11);
			assert.deepStrictEqual({ first, second, snapshot: fileService.snapshot() }, { first: 1, second: 2, snapshot: { watches: 1, disposed: 0 } });

			secondRegistration.dispose();
			assert.deepStrictEqual(fileService.snapshot(), { watches: 1, disposed: 1 });
		});
	});

	test('filters known repository metadata noise before debouncing', () => {
		return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
			const fileService = new TestFileService();
			const monitor = disposables.add(new AgentHostFileMonitorService(fileService.service, new NullLogService()));
			let calls = 0;

			disposables.add(acquire(monitor, URI.file('/repo'), () => calls++, { debounceMs: 10 }));
			fileService.fire(URI.file('/repo/.git/objects/12/abcdef'));
			fileService.fire(URI.file('/repo/.git/index.lock'));
			fileService.fire(URI.file('/repo/.watchman-cookie-123'));
			await timeout(11);
			assert.strictEqual(calls, 0);

			fileService.fire(URI.file('/repo/src/a.ts'));
			await timeout(11);
			assert.strictEqual(calls, 1);
		});
	});

	test('filters custom excludes before debouncing', () => {
		return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
			const fileService = new TestFileService();
			const monitor = disposables.add(new AgentHostFileMonitorService(fileService.service, new NullLogService()));
			let calls = 0;

			disposables.add(acquire(monitor, URI.file('/repo'), () => calls++, { excludes: ['**/generated/**'], debounceMs: 10 }));
			fileService.fire(URI.file('/repo/generated/a.ts'));
			await timeout(11);
			assert.strictEqual(calls, 0);

			fileService.fire(URI.file('/repo/src/a.ts'));
			await timeout(11);
			assert.strictEqual(calls, 1);
		});
	});

	test('sorts excludes when sharing watchers', () => {
		const fileService = new TestFileService();
		const monitor = disposables.add(new AgentHostFileMonitorService(fileService.service, new NullLogService()));
		const folder = URI.file('/repo');

		disposables.add(acquire(monitor, folder, () => { }, { excludes: ['**/b/**', '**/a/**'], debounceMs: 10 }));
		disposables.add(acquire(monitor, folder, () => { }, { excludes: ['**/a/**', '**/b/**'], debounceMs: 10 }));

		assert.deepStrictEqual(fileService.snapshot(), { watches: 1, disposed: 0 });
	});

	test('canonicalizes equivalent folder keys when sharing watchers', () => {
		const fileService = new TestFileService();
		const monitor = disposables.add(new AgentHostFileMonitorService(fileService.service, new NullLogService()));

		disposables.add(acquire(monitor, URI.file('/repo'), () => { }, { debounceMs: 10 }));
		disposables.add(acquire(monitor, URI.file('/repo/../repo/'), () => { }, { debounceMs: 10 }));

		assert.deepStrictEqual(fileService.snapshot(), { watches: 1, disposed: 0 });
	});

	test('returns undefined when watcher acquisition fails', () => {
		const fileService = new TestFileService();
		fileService.failWatch = true;
		const monitor = disposables.add(new AgentHostFileMonitorService(fileService.service, new NullLogService()));

		const registration = monitor.acquire(URI.file('/repo'), () => { }, { debounceMs: 10 });

		assert.deepStrictEqual({ registration, snapshot: fileService.snapshot() }, { registration: undefined, snapshot: { watches: 1, disposed: 0 } });
	});

	test('uses one file-change listener across monitor entries', () => {
		const fileService = new TestFileService();
		const monitor = disposables.add(new AgentHostFileMonitorService(fileService.service, new NullLogService()));

		disposables.add(acquire(monitor, URI.file('/repo-a'), () => { }, { debounceMs: 10 }));
		disposables.add(acquire(monitor, URI.file('/repo-b'), () => { }, { debounceMs: 10 }));

		assert.deepStrictEqual({ snapshot: fileService.snapshot(), listeners: fileService.fileChangeListenerCount }, {
			snapshot: { watches: 2, disposed: 0 },
			listeners: 1,
		});
	});

	test('disposing service cleans up active watchers and pending debounce callbacks', () => {
		return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
			const fileService = new TestFileService();
			const monitor = disposables.add(new AgentHostFileMonitorService(fileService.service, new NullLogService()));
			let calls = 0;

			const registration = acquire(monitor, URI.file('/repo'), () => calls++, { debounceMs: 10 });
			fileService.fire(URI.file('/repo/src/a.ts'));
			monitor.dispose();
			registration.dispose();
			await timeout(11);

			fileService.fire(URI.file('/repo/src/b.ts'));
			await timeout(11);
			assert.deepStrictEqual({ calls, snapshot: fileService.snapshot() }, { calls: 0, snapshot: { watches: 1, disposed: 1 } });
		});
	});
});

class TestFileService {
	private readonly _onDidFilesChange = new Emitter<FileChangesEvent>();
	private readonly _onDidWatchError = new Emitter<Error>();
	private _watchCount = 0;
	private _disposeCount = 0;
	private _fileChangeListenerCount = 0;
	failWatch = false;

	private readonly _onDidFilesChangeEvent: Event<FileChangesEvent> = (listener, thisArgs, disposables) => {
		this._fileChangeListenerCount++;
		return this._onDidFilesChange.event(listener, thisArgs, disposables);
	};

	readonly service = {
		_serviceBrand: undefined,
		onDidChangeFileSystemProviderRegistrations: Event.None,
		onDidChangeFileSystemProviderCapabilities: Event.None,
		onWillActivateFileSystemProvider: Event.None,
		onDidFilesChange: this._onDidFilesChangeEvent,
		onDidWatchError: this._onDidWatchError.event,
		watch: (_resource: URI, _options?: Parameters<IFileService['watch']>[1]): IDisposable => {
			this._watchCount++;
			if (this.failWatch) {
				throw new Error('watch failed');
			}
			return toDisposable(() => this._disposeCount++);
		},
		dispose: () => { },
	} as Partial<IFileService> as IFileService;

	fire(resource: URI, type: FileChangeType = FileChangeType.UPDATED): void {
		this._onDidFilesChange.fire(new FileChangesEvent([{ resource, type }], false));
	}

	snapshot(): { watches: number; disposed: number } {
		return { watches: this._watchCount, disposed: this._disposeCount };
	}

	get fileChangeListenerCount(): number {
		return this._fileChangeListenerCount;
	}
}
