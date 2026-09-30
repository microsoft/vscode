/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableMap, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { basename, dirname, isEqual, isEqualOrParent } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { createFileSystemProviderError, FileChangesEvent, FileChangeType, FileSystemProviderErrorCode, IFileService, IFileStatWithMetadata, IFileStatWithPartialMetadata, IWatchOptionsWithoutCorrelation } from '../../../files/common/files.js';
import { NullLogService } from '../../../log/common/log.js';
import { CopilotChatDiscovery, ICopilotChatDiscoveryScan } from '../../node/copilot/copilotChatDiscovery.js';

const root = URI.file('/custom-copilot-home/session-state');

class DiscoveryFileService extends mock<IFileService>() {
	private readonly _store = new DisposableStore();
	private readonly _watchStores = this._store.add(new DisposableMap<string>());
	private readonly _entries = new Map<string, IFileStatWithPartialMetadata>();
	private _timestamp = 1;
	private _activeStats = 0;
	readonly watches = new Map<string, { resource: URI; options: IWatchOptionsWithoutCorrelation; changes: Emitter<FileChangesEvent>; armedAt: number; rootIdentity: number | undefined }>();
	readonly watchRequests: URI[] = [];
	readonly statCalls: string[] = [];
	maxWatches = 0;
	maxActiveStats = 0;
	resolveCalls = 0;
	watchDelay = 0;

	constructor() {
		super();
		this._set(root, true);
	}

	override createWatcher(resource: URI, options: IWatchOptionsWithoutCorrelation & { recursive: false }) {
		const store = new DisposableStore();
		this._watchStores.set(resource.path, store);
		const changes = store.add(new Emitter<FileChangesEvent>());
		this.watchRequests.push(resource);
		this.watches.set(resource.path, {
			resource, options, changes, armedAt: Date.now() + this.watchDelay,
			rootIdentity: this._entries.get(root.path)?.ctime,
		});
		store.add(toDisposable(() => this.watches.delete(resource.path)));
		this.maxWatches = Math.max(this.maxWatches, this.watches.size);
		return { onDidChange: changes.event, dispose: () => this._watchStores.deleteAndDispose(resource.path) };
	}

	override async stat(resource: URI): Promise<IFileStatWithPartialMetadata> {
		this.statCalls.push(resource.path);
		this.maxActiveStats = Math.max(this.maxActiveStats, ++this._activeStats);
		try {
			await Promise.resolve();
			const entry = this._entries.get(resource.path);
			if (!entry) {
				throw createFileSystemProviderError('Missing test entry', FileSystemProviderErrorCode.FileNotFound);
			}
			return entry;
		} finally {
			this._activeStats--;
		}
	}

	override async resolve(resource: URI): Promise<IFileStatWithMetadata> {
		this.resolveCalls++;
		const stat = await this.stat(resource);
		return {
			...stat,
			children: [...this._entries.values()]
				.filter(entry => isEqual(dirname(entry.resource), resource))
				.map(entry => ({ ...entry, children: [] })),
		};
	}

	private _set(resource: URI, directory: boolean): void {
		const previous = this._entries.get(resource.path);
		const timestamp = ++this._timestamp;
		this._entries.set(resource.path, {
			resource, name: basename(resource), isDirectory: directory, isFile: !directory, isSymbolicLink: false,
			ctime: previous?.ctime ?? timestamp, mtime: timestamp, size: directory ? 0 : timestamp,
			etag: String(timestamp), readonly: false, locked: false, executable: false,
		});
		const parent = this._entries.get(dirname(resource).path);
		if (parent && !previous) {
			this._entries.set(parent.resource.path, { ...parent, mtime: timestamp });
		}
	}

	mkdir(id: string, emit = true): URI {
		if (!this._entries.has(root.path)) {
			this._set(root, true);
		}
		const resource = URI.joinPath(root, id);
		this._set(resource, true);
		if (emit) {
			this.change(resource, FileChangeType.ADDED);
		}
		return resource;
	}

	write(id: string, name: string, emit = true): void {
		const resource = URI.joinPath(root, id, name);
		const type = this._entries.has(resource.path) ? FileChangeType.UPDATED : FileChangeType.ADDED;
		this._set(resource, false);
		if (emit) {
			this.change(resource, type);
		}
	}

	remove(id: string): void {
		const resource = URI.joinPath(root, id);
		for (const [key, entry] of this._entries) {
			if (isEqualOrParent(entry.resource, resource)) {
				this._entries.delete(key);
			}
		}
		this.change(resource, FileChangeType.DELETED);
	}

	replaceRoot(): void {
		this._entries.clear();
		this._set(root, true);
	}

	removeRoot(): void {
		this._entries.clear();
		this.change(root, FileChangeType.DELETED);
	}

	change(resource: URI, type: FileChangeType): void {
		for (const watch of [...this.watches.values()]) {
			if (isEqual(watch.resource, root) && (watch.rootIdentity === undefined
				|| (watch.rootIdentity !== this._entries.get(root.path)?.ctime && !(isEqual(resource, root) && type === FileChangeType.DELETED)))) {
				continue;
			}
			if (Date.now() >= watch.armedAt && (isEqual(resource, watch.resource) || isEqual(dirname(resource), watch.resource))) {
				watch.changes.fire(new FileChangesEvent([{ resource, type }], false));
			}
		}
	}

	override dispose(): void {
		this._store.dispose();
	}
}

class DiscoveryCatalog {
	readonly sessions = new Set<string>();
	readonly calls: { ids: string[] | undefined; time: number }[] = [];
	readonly published: string[] = [];
	started: DeferredPromise<void> | undefined;
	gate: Promise<void> | undefined;
	failures = 0;
	active = 0;
	maxActive = 0;

	async scan(scan: ICopilotChatDiscoveryScan): Promise<ReadonlySet<string> | undefined> {
		const { sessionIds: ids, isCurrent } = scan;
		this.calls.push({ ids: ids ? [...ids].sort() : undefined, time: Date.now() });
		this.maxActive = Math.max(this.maxActive, ++this.active);
		const snapshot = [...this.sessions].filter(id => !ids || ids.has(id));
		try {
			await Promise.all(snapshot.map(id => scan.prepare(id)));
			this.started?.complete();
			await this.gate;
			if (this.failures > 0) {
				this.failures--;
				return undefined;
			}
			const completed = new Set<string>();
			await Promise.all(snapshot.map(async id => {
				if (await scan.validate(id)) {
					completed.add(id);
				}
			}));
			for (const id of completed) {
				if (isCurrent(id) && !this.published.includes(id)) {
					this.published.push(id);
				}
			}
			return completed;
		} finally {
			this.active--;
		}
	}
}

class DiscoveryLogService extends NullLogService {
	readonly messages: string[] = [];
	override info(message: string): void { this.messages.push(`info ${message}`); }
	override debug(message: string): void { this.messages.push(`debug ${message}`); }
	override trace(message: string): void { this.messages.push(`trace ${message}`); }
	override warn(message: string): void { this.messages.push(`warn ${message}`); }
}

suite('CopilotChatDiscovery', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function testDiscovery(name: string, run: (files: DiscoveryFileService, catalog: DiscoveryCatalog, discovery: CopilotChatDiscovery, log: DiscoveryLogService) => Promise<void>): void {
		test(name, () => runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1_000 }, async () => {
			const files = store.add(new DiscoveryFileService());
			const catalog = new DiscoveryCatalog();
			const log = new DiscoveryLogService();
			const discovery = store.add(new CopilotChatDiscovery(root, scan => catalog.scan(scan), files, log));
			try {
				await run(files, catalog, discovery, log);
			} finally {
				discovery.dispose();
			}
		}));
	}

	testDiscovery('five thousand historical sessions do not amplify new-session or host-created work', async (files, catalog, discovery) => {
		for (let index = 0; index < 5_000; index++) {
			const id = `history-${index}`;
			files.mkdir(id, false);
			catalog.sessions.add(id);
		}
		await discovery.start();
		const baseline = { scans: catalog.calls.length, enumerations: files.resolveCalls, stats: files.statCalls.length };
		for (let index = 0; index < 100; index++) {
			const id = `host-${index}`;
			discovery.ignoreSession(id);
			files.mkdir(id);
			files.write(id, 'events.jsonl');
		}
		await timeout(1_000);
		const afterHostCreation = { scans: catalog.calls.length, enumerations: files.resolveCalls, stats: files.statCalls.length };
		files.mkdir('external');
		files.write('external', 'events.jsonl');
		catalog.sessions.add('external');
		await timeout(501);
		assert.deepStrictEqual({
			hostWork: {
				scans: afterHostCreation.scans - baseline.scans,
				enumerations: afterHostCreation.enumerations - baseline.enumerations,
				stats: afterHostCreation.stats - baseline.stats,
			},
			externalWork: {
				request: catalog.calls[1].ids,
				enumerations: files.resolveCalls - baseline.enumerations,
				stats: files.statCalls.length - baseline.stats,
			},
			scans: catalog.calls.length, maxWatches: files.maxWatches, remainingWatches: files.watches.size,
		}, {
			hostWork: { scans: 0, enumerations: 0, stats: 0 },
			externalWork: { request: ['external'], enumerations: 0, stats: 4 },
			scans: 2, maxWatches: 33, remainingWatches: 1,
		});
	});

	testDiscovery('opening a new empty CLI does not scan history before its first request', async (files, catalog, discovery) => {
		await discovery.start();
		files.mkdir('empty');
		files.write('empty', 'workspace.yaml');
		await timeout(10_000);
		const emptyScans = catalog.calls.length;
		catalog.sessions.add('empty');
		files.write('empty', 'events.jsonl');
		await timeout(501);
		assert.deepStrictEqual({ emptyScans, scans: catalog.calls.map(call => call.ids), published: catalog.published }, {
			emptyScans: 1, scans: [undefined, ['empty']], published: ['empty'],
		});
	});

	testDiscovery('host-session exclusions work before discovery starts and after a candidate was enrolled', async (files, catalog, discovery) => {
		discovery.ignoreSession('before-start');
		files.mkdir('before-start');
		catalog.sessions.add('before-start');
		files.mkdir('later-claimed');
		await discovery.start();
		discovery.ignoreSession('later-claimed');
		files.write('later-claimed', 'events.jsonl');
		catalog.sessions.add('later-claimed');
		await timeout(60_001);
		assert.deepStrictEqual({
			scans: catalog.calls.length, published: catalog.published, watches: [...files.watches.keys()],
		}, { scans: 1, published: [], watches: [root.path] });
	});

	testDiscovery('a slow host fork never scans its unknown ID or loses an external session created concurrently', async (files, catalog, discovery) => {
		await discovery.start();
		const fork = discovery.trackSessionCreation(async () => {
			files.mkdir('fork');
			files.write('fork', 'events.jsonl');
			catalog.sessions.add('fork');
			await timeout(3_000);
			return { sessionId: 'fork' };
		});
		files.mkdir('external-during-fork');
		files.write('external-during-fork', 'events.jsonl');
		catalog.sessions.add('external-during-fork');
		await timeout(1_000);
		const scansDuringFork = catalog.calls.length;
		await fork;
		await timeout(501);
		assert.deepStrictEqual({
			scansDuringFork, calls: catalog.calls.map(call => call.ids), published: catalog.published, maxWatches: files.maxWatches,
		}, {
			scansDuringFork: 1, calls: [undefined, ['external-during-fork']], published: ['external-during-fork'], maxWatches: 2,
		});
	});

	testDiscovery('claiming a session during a scan prevents external publication and further scans', async (files, catalog, discovery) => {
		files.mkdir('claimed');
		await discovery.start();
		const release = new DeferredPromise<void>();
		catalog.gate = release.p;
		catalog.started = new DeferredPromise<void>();
		catalog.sessions.add('claimed');
		files.write('claimed', 'events.jsonl');
		await catalog.started.p;
		discovery.ignoreSession('claimed');
		release.complete();
		await timeout(60_001);
		assert.deepStrictEqual({
			published: catalog.published, scans: catalog.calls.length, watches: files.watches.size,
		}, { published: [], scans: 2, watches: 1 });
	});

	testDiscovery('failed host creation releases discovery without swallowing the creation error', async (files, catalog, discovery) => {
		await discovery.start();
		await assert.rejects(discovery.trackSessionCreation(async () => {
			files.mkdir('external');
			files.write('external', 'events.jsonl');
			catalog.sessions.add('external');
			throw new Error('fork failed');
		}), /fork failed/);
		await timeout(501);
		assert.deepStrictEqual({ scans: catalog.calls.map(call => call.ids), published: catalog.published }, {
			scans: [undefined, ['external']], published: ['external'],
		});
	});

	testDiscovery('logs scan causes, work counts, timing, retries and suppressed host events', async (files, catalog, discovery, log) => {
		catalog.failures = 1;
		await discovery.start();
		discovery.ignoreSession('own');
		files.mkdir('own');
		files.mkdir('cli');
		await timeout(501);
		files.write('cli', 'events.jsonl');
		catalog.sessions.add('cli');
		await timeout(501);
		assert.deepStrictEqual({
			start: log.messages.some(message => /Scan 3 started: initial=false, candidates=1, reasons=\{"journalCreated":1\}, watched=1, pending=1, ignoredHostEvents=1$/.test(message)),
			finish: log.messages.some(message => /Scan 3 finished: elapsedMs=\d+, completed=1, pending=0, watched=0, overflow=0, ignoredHostEvents=1$/.test(message)),
			retry: log.messages.some(message => /Scan 1 unavailable: elapsedMs=\d+, retryMs=250, failures=1$/.test(message)),
			enrollment: log.messages.includes('trace [CopilotDiscovery] Candidate cli: enrolled=directoryAdded'),
			suppression: log.messages.includes('trace [CopilotDiscovery] Ignoring Agent Host session own'),
		}, { start: true, finish: true, retry: true, enrollment: true, suppression: true });
	});

	testDiscovery('keeps pre-existing empty sessions observable without polling the SDK', async (files, catalog, discovery) => {
		files.mkdir('old');
		files.mkdir('idle');
		files.write('idle', 'workspace.yaml');
		catalog.sessions.add('old');
		await Promise.all([discovery.start(), discovery.start()]);
		await timeout(10 * 60_000);
		const idleCalls = catalog.calls.length;
		const waitingWatches = [...files.watches].map(([path, watch]) => ({
			path, recursive: watch.options.recursive, includes: watch.options.includes,
		}));
		catalog.sessions.add('idle');
		files.write('idle', 'events.jsonl');
		await timeout(501);
		assert.deepStrictEqual({
			idleCalls, waitingWatches, published: catalog.published, calls: catalog.calls.map(call => call.ids),
			watches: [...files.watches.keys()],
		}, {
			idleCalls: 1,
			waitingWatches: [
				{ path: root.path, recursive: false, includes: undefined },
				{ path: URI.joinPath(root, 'idle').path, recursive: false, includes: ['events.jsonl', 'workspace.yaml', 'vscode.metadata.json'] },
			],
			published: ['old', 'idle'], calls: [undefined, ['idle']], watches: [root.path],
		});
	});

	testDiscovery('coalesces a burst within 500 ms and ignores transcript, artifact and lock noise', async (files, catalog, discovery) => {
		await discovery.start();
		const changedAt = Date.now();
		for (const id of ['a', 'b', 'c']) {
			files.mkdir(id);
			files.write(id, 'events.jsonl');
			catalog.sessions.add(id);
		}
		await timeout(499);
		const callsBeforeDeadline = catalog.calls.length;
		await timeout(2);
		files.write('a', 'events.jsonl');
		files.write('a', 'files/output.txt');
		files.mkdir('.session-operation-locks');
		files.write('', 'unrelated.txt');
		files.change(URI.joinPath(dirname(root), 'session-store.db-wal'), FileChangeType.UPDATED);
		await timeout(501);
		assert.deepStrictEqual({
			callsBeforeDeadline, calls: catalog.calls.map(call => call.ids), delay: catalog.calls[1].time - changedAt,
			published: catalog.published, maxActive: catalog.maxActive, watches: [...files.watches.keys()],
		}, {
			callsBeforeDeadline: 1, calls: [undefined, ['a', 'b', 'c']], delay: 500,
			published: ['a', 'b', 'c'], maxActive: 1, watches: [root.path],
		});
	});

	testDiscovery('metadata hints advance readiness retries without waiting for the slow retry', async (files, catalog, discovery) => {
		files.mkdir('delayed');
		await discovery.start();
		files.write('delayed', 'events.jsonl');
		await timeout(8_000);
		const beforeReady = catalog.published.slice();
		const callsBeforeReady = catalog.calls.length;
		catalog.sessions.add('delayed');
		files.write('delayed', 'workspace.yaml');
		await timeout(501);
		assert.deepStrictEqual({
			beforeReady, published: catalog.published, addedCalls: catalog.calls.length - callsBeforeReady,
			watches: [...files.watches.keys()],
		}, { beforeReady: [], published: ['delayed'], addedCalls: 1, watches: [root.path] });
	});

	testDiscovery('rejects stale in-flight results and runs one trailing scan', async (files, catalog, discovery) => {
		files.mkdir('changing');
		await discovery.start();
		const release = new DeferredPromise<void>();
		catalog.gate = release.p;
		catalog.started = new DeferredPromise<void>();
		catalog.sessions.add('changing');
		files.write('changing', 'events.jsonl');
		await catalog.started.p;
		for (let index = 0; index < 10; index++) {
			files.write('changing', 'vscode.metadata.json');
		}
		catalog.gate = undefined;
		release.complete();
		await timeout(0);
		const beforeTrailing = { published: [...catalog.published], watches: files.watches.size };
		await timeout(501);
		assert.deepStrictEqual({
			beforeTrailing, calls: catalog.calls.map(call => call.ids), published: catalog.published, maxActive: catalog.maxActive,
		}, {
			beforeTrailing: { published: [], watches: 2 }, calls: [undefined, ['changing'], ['changing']],
			published: ['changing'], maxActive: 1,
		});
	});

	testDiscovery('probes overflow fairly while keeping watcher and per-tick IO bounds', async (files, catalog, discovery) => {
		for (let index = 0; index < 40; index++) {
			files.mkdir(`idle-${index}`);
		}
		await discovery.start();
		const beforeProbe = files.statCalls.length;
		await timeout(5_001);
		const probeCalls = files.statCalls.length - beforeProbe;
		catalog.sessions.add('idle-39');
		files.write('idle-39', 'events.jsonl');
		await timeout(10_000);
		assert.deepStrictEqual({
			maxWatches: files.maxWatches, probeCalls, maxActiveStats: files.maxActiveStats,
			published: catalog.published, calls: catalog.calls.map(call => call.ids),
		}, {
			maxWatches: 33, probeCalls: 97, maxActiveStats: 4,
			published: ['idle-39'], calls: [undefined, ['idle-39']],
		});
	});

	testDiscovery('recovers an unobserved populated root and silent root replacement', async (files, catalog, discovery) => {
		files.removeRoot();
		await discovery.start();
		files.mkdir('missed', false);
		files.write('missed', 'events.jsonl', false);
		catalog.sessions.add('missed');
		await timeout(60_001);
		files.replaceRoot();
		files.mkdir('replacement', false);
		files.write('replacement', 'events.jsonl', false);
		catalog.sessions.clear();
		catalog.sessions.add('replacement');
		await timeout(60_001);
		const settledCalls = catalog.calls.length;
		await timeout(120_000);
		assert.deepStrictEqual({
			published: catalog.published, settledCalls, idleCalls: catalog.calls.length - settledCalls, watches: files.watches.size,
		}, { published: ['missed', 'replacement'], settledCalls: 3, idleCalls: 0, watches: 1 });
	});

	for (const recovery of ['initially missing', 'silently replaced', 'deleted and recreated'] as const) {
		testDiscovery(`re-arms the ${recovery} root for subsequent event-driven discovery`, async (files, catalog, discovery) => {
			if (recovery === 'initially missing') {
				files.removeRoot();
			}
			await discovery.start();
			const initialRootWatches = files.watchRequests.filter(resource => isEqual(resource, root)).length;
			if (recovery === 'silently replaced') {
				files.replaceRoot();
			} else if (recovery === 'deleted and recreated') {
				files.removeRoot();
				await timeout(501);
			}
			files.mkdir('recovered');
			files.write('recovered', 'events.jsonl');
			catalog.sessions.add('recovered');
			await timeout(60_001);
			const recoveredRootWatches = files.watchRequests.filter(resource => isEqual(resource, root)).length;
			const enumerations = files.resolveCalls;
			const calls = catalog.calls.length;
			const createdAt = Date.now();
			files.mkdir('subsequent');
			files.write('subsequent', 'events.jsonl');
			catalog.sessions.add('subsequent');
			await timeout(501);
			const subsequentScan = catalog.calls[calls];
			const immediate = {
				additionalScans: catalog.calls.length - calls,
				discoveryDelay: subsequentScan ? subsequentScan.time - createdAt : undefined,
				enumerations: files.resolveCalls - enumerations,
				published: [...catalog.published],
			};
			await timeout(60_001);
			assert.deepStrictEqual({
				rearmed: recoveredRootWatches - initialRootWatches,
				immediate,
				additionalRootWatches: files.watchRequests.filter(resource => isEqual(resource, root)).length - recoveredRootWatches,
				watches: files.watches.size,
				maxWatches: files.maxWatches,
			}, {
				rearmed: 1,
				immediate: { additionalScans: 1, discoveryDelay: 500, enumerations: 0, published: ['recovered', 'subsequent'] },
				additionalRootWatches: 0,
				watches: 1,
				maxWatches: 2,
			});
		});
	}

	for (const readyImmediately of [true, false]) {
		testDiscovery(`rediscovers a same-ID directory replaced within one interval (ready=${readyImmediately})`, async (files, catalog, discovery) => {
			files.mkdir('replaced');
			await discovery.start();
			files.remove('replaced');
			files.mkdir('replaced');
			if (readyImmediately) {
				files.write('replaced', 'events.jsonl');
				catalog.sessions.add('replaced');
			}
			await timeout(501);
			const watchingReplacement = files.watches.has(URI.joinPath(root, 'replaced').path);
			if (!readyImmediately) {
				files.write('replaced', 'events.jsonl');
				catalog.sessions.add('replaced');
				await timeout(501);
			}
			await timeout(60_001);
			assert.deepStrictEqual({
				watchingReplacement, published: catalog.published, calls: catalog.calls.map(call => call.ids),
				watches: files.watches.size, maxWatches: files.maxWatches,
			}, {
				watchingReplacement: !readyImmediately, published: ['replaced'], calls: [undefined, ['replaced']],
				watches: 1, maxWatches: 2,
			});
		});
	}

	testDiscovery('closes a candidate watcher arming gap with a readiness probe', async (files, catalog, discovery) => {
		files.watchDelay = 5_000;
		files.mkdir('arming');
		await discovery.start();
		catalog.sessions.add('arming');
		files.write('arming', 'events.jsonl');
		await timeout(5_001);
		assert.deepStrictEqual({ published: catalog.published, calls: catalog.calls.length }, { published: ['arming'], calls: 2 });
	});

	testDiscovery('file events cannot bypass the shared SDK failure cooldown', async (files, catalog, discovery) => {
		files.mkdir('retry');
		files.write('retry', 'events.jsonl');
		catalog.sessions.add('retry');
		catalog.failures = 4;
		await discovery.start();
		for (let index = 0; index < 10; index++) {
			files.write('retry', 'workspace.yaml');
			await timeout(1_000);
		}
		const callsDuringCooldown = catalog.calls.length;
		await timeout(50_001);
		assert.deepStrictEqual({
			callsDuringCooldown, published: catalog.published, calls: catalog.calls.length, maxActive: catalog.maxActive,
		}, { callsDuringCooldown: 4, published: ['retry'], calls: 5, maxActive: 1 });
	});

	testDiscovery('removes deleted candidates and suppresses publication after disposal', async (files, catalog, discovery) => {
		files.mkdir('deleted');
		files.mkdir('blocked');
		await discovery.start();
		files.remove('deleted');
		const release = new DeferredPromise<void>();
		catalog.gate = release.p;
		catalog.started = new DeferredPromise<void>();
		catalog.sessions.add('blocked');
		files.write('blocked', 'events.jsonl');
		await catalog.started.p;
		const watchesBeforeDispose = [...files.watches.keys()];
		discovery.dispose();
		release.complete();
		await discovery.start();
		await timeout(120_000);
		assert.deepStrictEqual({
			watchesBeforeDispose, watchesAfterDispose: files.watches.size, published: catalog.published, calls: catalog.calls.length,
		}, {
			watchesBeforeDispose: [root.path, URI.joinPath(root, 'blocked').path],
			watchesAfterDispose: 0, published: [], calls: 2,
		});
	});
});
