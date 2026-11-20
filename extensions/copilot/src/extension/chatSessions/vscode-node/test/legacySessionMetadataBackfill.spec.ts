/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fsPromises } from 'fs';
import { mkdtemp, readdir, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { Uri } from 'vscode';
import { IVSCodeExtensionContext } from '../../../../platform/extContext/common/extensionContext';
import { MockFileSystemService } from '../../../../platform/filesystem/node/test/mockFileSystemService';
import { ILogService } from '../../../../platform/log/common/logService';
import { NullTelemetryService } from '../../../../platform/telemetry/common/nullTelemetryService';
import { TelemetryEventMeasurements, TelemetryEventProperties } from '../../../../platform/telemetry/common/telemetry';
import { mock } from '../../../../util/common/test/simpleMock';
import { DeferredPromise } from '../../../../util/vs/base/common/async';
import { ChatSessionWorktreeProperties } from '../../common/chatSessionWorktreeService';
import { sessionMetadataFileWriteSequencer } from '../../common/sessionMetadataFileWriteSequencer';
import { getCopilotCLISessionDir } from '../../copilotcli/node/cliHelpers';
import { LegacySessionMetadataBackfill, writeFileIfAbsent, WriteFileIfAbsentFileSystem } from '../legacySessionMetadataBackfill';

vi.mock('../../copilotcli/node/cliHelpers', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../copilotcli/node/cliHelpers')>();
	return {
		...actual,
		getCopilotCLISessionDir: (sessionId: string) => `/mock/session-state/${sessionId}`,
		getCopilotBulkMetadataFile: () => '/mock/copilot-home/vscode.session.metadata.cache.json',
	};
});

class MockGlobalState implements vscode.Memento {
	private data = new Map<string, unknown>();

	get<T>(key: string, defaultValue?: T): T {
		const value = this.data.get(key);
		return (value ?? defaultValue) as T;
	}

	async update(key: string, value: unknown): Promise<void> {
		if (value === undefined) {
			this.data.delete(key);
		} else {
			this.data.set(key, value);
		}
	}

	keys(): readonly string[] {
		return Array.from(this.data.keys());
	}

	setKeysForSync(_keys: readonly string[]): void { }

	/** Test helper to seed data without triggering update logic */
	seed(key: string, value: unknown) {
		this.data.set(key, value);
	}

	has(key: string): boolean {
		return this.data.has(key);
	}
}

class MockExtensionContext extends mock<IVSCodeExtensionContext>() {
	public override globalState = new MockGlobalState();
	override extensionPath = Uri.file('/mock/extension/path').fsPath;
	override globalStorageUri = Uri.file('/mock/global/storage');
	override storagePath = Uri.file('/mock/storage/path').fsPath;
	override globalStoragePath = Uri.file('/mock/global/storage/path').fsPath;
	override logPath = Uri.file('/mock/log/path').fsPath;
	override logUri = Uri.file('/mock/log/uri');
	override extensionUri = Uri.file('/mock/extension');
}

class MockLogService extends mock<ILogService>() {
	override trace = vi.fn();
	override info = vi.fn();
	override warn = vi.fn();
	override error = vi.fn();
	override debug = vi.fn();
}

class TestTelemetryService extends NullTelemetryService {
	public readonly events: Array<{ name: string; properties?: TelemetryEventProperties; measurements?: TelemetryEventMeasurements }> = [];
	override sendMSFTTelemetryEvent(name: string, properties?: TelemetryEventProperties, measurements?: TelemetryEventMeasurements): void {
		this.events.push({ name, properties, measurements });
	}
}
/** Emulates the real exclusive create against the in-memory file system. */
class TestLegacySessionMetadataBackfill extends LegacySessionMetadataBackfill {
	constructor(
		private readonly testFileSystem: MockFileSystemService,
		logService: ILogService,
		extensionContext: IVSCodeExtensionContext,
		telemetryService: NullTelemetryService,
	) {
		super(testFileSystem, logService, extensionContext, telemetryService);
	}

	protected override async createSessionMetadataFileIfAbsent(uri: vscode.Uri, content: Uint8Array): Promise<boolean> {
		try {
			await this.testFileSystem.stat(uri);
			return false;
		} catch {
			await this.testFileSystem.writeFile(uri, content);
			return true;
		}
	}
}

const BULK_METADATA_FILE = Uri.file('/mock/copilot-home/vscode.session.metadata.cache.json');
const LEGACY_BULK_METADATA_FILE = Uri.joinPath(Uri.file('/mock/global/storage'), 'copilotcli', 'copilotcli.session.metadata.json');

function sessionDirectoryUri(sessionId: string): Uri {
	return Uri.file(getCopilotCLISessionDir(sessionId));
}

function sessionMetadataFileUri(sessionId: string): Uri {
	return Uri.joinPath(sessionDirectoryUri(sessionId), 'vscode.metadata.json');
}

function makeWorktreeV1Props(overrides?: Partial<ChatSessionWorktreeProperties>): ChatSessionWorktreeProperties {
	return {
		version: 1,
		baseCommit: 'abc123',
		branchName: 'feature-branch',
		repositoryPath: Uri.file('/repo').fsPath,
		worktreePath: Uri.file('/repo/.worktrees/wt').fsPath,
		autoCommit: true,
		...overrides,
	} as ChatSessionWorktreeProperties;
}

function makeWorktreeV2Props(overrides?: Partial<ChatSessionWorktreeProperties>): ChatSessionWorktreeProperties {
	return {
		version: 2,
		baseCommit: 'def456',
		branchName: 'feature-v2',
		baseBranchName: 'main',
		repositoryPath: Uri.file('/repo').fsPath,
		worktreePath: Uri.file('/repo/.worktrees/wt2').fsPath,
		...overrides,
	} as ChatSessionWorktreeProperties;
}

describe('LegacySessionMetadataBackfill', () => {
	let mockFs: MockFileSystemService;
	let logService: MockLogService;
	let extensionContext: MockExtensionContext;
	let telemetryService: TestTelemetryService;

	beforeEach(() => {
		vi.useFakeTimers();
		mockFs = new MockFileSystemService();
		logService = new MockLogService();
		extensionContext = new MockExtensionContext();
		telemetryService = new TestTelemetryService();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	async function createBackfill(): Promise<LegacySessionMetadataBackfill> {
		const backfill = new TestLegacySessionMetadataBackfill(mockFs, logService, extensionContext, telemetryService);
		await vi.advanceTimersByTimeAsync(0);
		return backfill;
	}

	const BACKFILLED_KEY = 'github.copilot.cli.sessionMetadataBackfilled.v1';

	async function readSessionFile(sessionId: string): Promise<unknown> {
		try {
			return JSON.parse(new TextDecoder().decode(await mockFs.readFile(sessionMetadataFileUri(sessionId))));
		} catch {
			return undefined;
		}
	}

	function mockSessionDirectories(...sessionIds: string[]): void {
		for (const sessionId of sessionIds) {
			mockFs.mockDirectory(sessionDirectoryUri(sessionId), []);
		}
	}

	async function runBackfill(): Promise<LegacySessionMetadataBackfill> {
		const backfill = await createBackfill();
		let done = false;
		void backfill.whenSessionMetadataBackfilled().then(() => done = true);
		await vi.advanceTimersByTimeAsync(60_000);
		// Batches pause between each other; keep time moving until the run settles.
		for (let i = 0; !done && i < 1_000; i++) {
			await vi.advanceTimersByTimeAsync(50);
		}
		return backfill;
	}

	function backfillEvents() {
		return telemetryService.events.filter(e => e.name === 'copilotcli.sessionMetadataBackfill');
	}

	it('handles thousands of sessions in paced batches without touching existing files', async () => {
		const bulk: Record<string, unknown> = {};
		for (let i = 0; i < 2_500; i++) {
			bulk[`s-${i}`] = { origin: 'vscode', workspaceFolder: { folderPath: `/w/${i}`, timestamp: i }, modified: i };
			mockSessionDirectories(`s-${i}`);
			if (i % 2 === 0) {
				mockFs.mockFile(sessionMetadataFileUri(`s-${i}`), JSON.stringify({ origin: 'vscode', customTitle: `existing ${i}` }));
			}
		}
		mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify(bulk));

		const backfill = await runBackfill();

		expect({
			existingKept: await readSessionFile('s-0'),
			written: await readSessionFile('s-2499'),
			sharedAtCap: backfillEvents()[0]?.properties?.sharedAtCap,
			measurements: { ...backfillEvents()[0]?.measurements, durationMs: 0 },
			backfilled: extensionContext.globalState.get(BACKFILLED_KEY),
		}).toEqual({
			existingKept: { origin: 'vscode', customTitle: 'existing 0' },
			written: { origin: 'vscode', workspaceFolder: { folderPath: '/w/2499', timestamp: 2499 }, modified: 2499 },
			sharedAtCap: 'true',
			measurements: { attempt: 1, sharedEntryCount: 2_500, perInstallEntryCount: 0, globalStateEntryCount: 0, globalStateOnlyCount: 0, candidateCount: 2_500, notVSCodeCount: 0, existingFileCount: 1_250, missingSessionDirectoryCount: 0, writtenCount: 1_250, failedCount: 0, durationMs: 0 },
			backfilled: true,
		});
		backfill.dispose();
	});

	it('reports whether the per-install bulk file was merged on an earlier start', async () => {
		const reported = [];
		for (const mergedEarlier of [false, true]) {
			extensionContext = new MockExtensionContext();
			if (mergedEarlier) {
				extensionContext.globalState.seed('github.copilot.cli.legacyBulkMigrated', true);
			}
			mockFs.mockFile(LEGACY_BULK_METADATA_FILE, JSON.stringify({
				'legacy': { workspaceFolder: { folderPath: '/legacy', timestamp: 1 } },
			}));
			const backfill = await runBackfill();
			reported.push({
				mergedEarlier,
				legacyBulkMigrated: backfillEvents().at(-1)?.properties?.legacyBulkMigrated,
			});
			backfill.dispose();
		}

		expect(reported).toEqual([
			{ mergedEarlier: false, legacyBulkMigrated: 'false' },
			{ mergedEarlier: true, legacyBulkMigrated: 'true' },
		]);
	});

	it('recovers sessions whose metadata only exists in the original globalState store, without overriding newer bulk data', async () => {
		const worktree = makeWorktreeV1Props();
		extensionContext.globalState.seed('github.copilot.cli.sessionWorkspaceFolders', {
			'folder-only': { folderPath: '/old/folder', timestamp: 5 },
			'in-bulk': { folderPath: '/stale', timestamp: 1 },
			'untitled-1': { folderPath: '/untitled', timestamp: 1 },
			'legacy-string': '/plain/string/entry',
			'both': { folderPath: '/replaced-by-worktree', timestamp: 1 },
		});
		extensionContext.globalState.seed('github.copilot.cli.sessionWorktrees', {
			'worktree-only': { version: 1, data: JSON.stringify({ ...worktree, version: undefined }) },
			'both': { version: 2, data: JSON.stringify(makeWorktreeV2Props()) },
			'bad-json': { version: 1, data: '{not json' },
			'legacy-string': 'plain',
		});
		mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({
			'in-bulk': { origin: 'vscode', workspaceFolder: { folderPath: '/newer', timestamp: 9 }, modified: 9 },
		}));
		mockSessionDirectories('folder-only', 'worktree-only', 'both', 'in-bulk', 'untitled-1', 'bad-json', 'legacy-string');

		const backfill = await runBackfill();

		expect({
			files: {
				'folder-only': await readSessionFile('folder-only'),
				'worktree-only': await readSessionFile('worktree-only'),
				'both': await readSessionFile('both'),
				'in-bulk': await readSessionFile('in-bulk'),
				'untitled-1': await readSessionFile('untitled-1'),
				'bad-json': await readSessionFile('bad-json'),
				'legacy-string': await readSessionFile('legacy-string'),
			},
			globalStateEntryCount: backfillEvents()[0]?.measurements?.globalStateEntryCount,
			globalStateOnlyCount: backfillEvents()[0]?.measurements?.globalStateOnlyCount,
		}).toEqual({
			files: {
				'folder-only': { workspaceFolder: { folderPath: '/old/folder', timestamp: 5 } },
				'worktree-only': { worktreeProperties: worktree },
				'both': { worktreeProperties: makeWorktreeV2Props() },
				'in-bulk': { origin: 'vscode', workspaceFolder: { folderPath: '/newer', timestamp: 9 }, modified: 9 },
				'untitled-1': undefined,
				'bad-json': undefined,
				'legacy-string': undefined,
			},
			globalStateEntryCount: 5,
			globalStateOnlyCount: 4,
		});
		backfill.dispose();
	});

	it('waits for a session metadata store write to the same session in this window', async () => {
		mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({
			'session': { origin: 'vscode', workspaceFolder: { folderPath: '/stale', timestamp: 1 }, modified: 1 },
		}));
		mockSessionDirectories('session');
		const storeContent = JSON.stringify({ origin: 'vscode', customTitle: 'Written by the store', modified: 99 });
		const storeWriteStarted = new DeferredPromise<void>();
		const storeWrite = sessionMetadataFileWriteSequencer.queue('session', async () => {
			await storeWriteStarted.p;
			await mockFs.writeFile(sessionMetadataFileUri('session'), new TextEncoder().encode(storeContent));
		});

		const backfill = await createBackfill();
		let done = false;
		void backfill.whenSessionMetadataBackfilled().then(() => done = true);
		await vi.advanceTimersByTimeAsync(60_000);
		const whileStoreWrites = { done, file: await readSessionFile('session') };
		storeWriteStarted.complete();
		await storeWrite;
		await backfill.whenSessionMetadataBackfilled();

		expect({
			whileStoreWrites,
			file: await readSessionFile('session'),
			existingFileCount: backfillEvents()[0]?.measurements?.existingFileCount,
			writtenCount: backfillEvents()[0]?.measurements?.writtenCount,
		}).toEqual({
			whileStoreWrites: { done: false, file: undefined },
			file: JSON.parse(storeContent),
			existingFileCount: 1,
			writtenCount: 0,
		});
		backfill.dispose();
	});

	it('keeps a marker that another window creates while the backfill is running', async () => {
		mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({
			'session': { origin: 'vscode', workspaceFolder: { folderPath: '/stale', timestamp: 1 }, modified: 1 },
		}));
		mockSessionDirectories('session');
		const otherWindow = JSON.stringify({ origin: 'vscode', customTitle: 'Renamed in another window', modified: 99 });
		const stat = mockFs.stat.bind(mockFs);
		vi.spyOn(mockFs, 'stat').mockImplementation(async uri => {
			const result = await stat(uri);
			// Another window writes the marker right after the backfill checked the session folder.
			if (uri.toString() === sessionDirectoryUri('session').toString()) {
				mockFs.mockFile(sessionMetadataFileUri('session'), otherWindow);
			}
			return result;
		});

		const backfill = await runBackfill();

		expect({
			file: await readSessionFile('session'),
			existingFileCount: backfillEvents()[0]?.measurements?.existingFileCount,
			writtenCount: backfillEvents()[0]?.measurements?.writtenCount,
		}).toEqual({
			file: JSON.parse(otherWindow),
			existingFileCount: 1,
			writtenCount: 0,
		});
		backfill.dispose();
	});

	it('creates files exclusively on disk and never overwrites an existing one', async () => {
		vi.useRealTimers();
		const directory = await mkdtemp(join(tmpdir(), 'copilot-backfill-'));
		try {
			const path = join(directory, 'vscode.metadata.json');
			const results = [
				await writeFileIfAbsent(path, new TextEncoder().encode('first')),
				await writeFileIfAbsent(path, new TextEncoder().encode('second')),
			];
			expect({ results, content: await readFile(path, 'utf8'), files: await readdir(directory) }).toEqual({ results: [true, false], content: 'first', files: ['vscode.metadata.json'] });
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it('never leaves a partial marker behind when a write is interrupted, so the next run can still create it', async () => {
		vi.useRealTimers();
		const directory = await mkdtemp(join(tmpdir(), 'copilot-backfill-'));
		const diskFull = () => Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
		// Simulates disk exhaustion after the file is created: an empty file is left and the write throws.
		const interruptedWriteFile = (async (file: Parameters<typeof fsPromises.writeFile>[0], _data: unknown, options: Parameters<typeof fsPromises.writeFile>[2]) => {
			await fsPromises.writeFile(file, '', options);
			throw diskFull();
		}) as typeof fsPromises.writeFile;
		const interruptedOpen = (async (file: Parameters<typeof fsPromises.open>[0], flags: Parameters<typeof fsPromises.open>[1]) => {
			const handle = await fsPromises.open(file, flags);
			return { writeFile: async () => { throw diskFull(); }, close: () => handle.close() };
		}) as unknown as typeof fsPromises.open;
		const cases: Record<string, WriteFileIfAbsentFileSystem> = {
			hardLink: { ...fsPromises, writeFile: interruptedWriteFile },
			noHardLinkFallback: { ...fsPromises, link: async () => { throw Object.assign(new Error('EPERM'), { code: 'EPERM' }); }, open: interruptedOpen },
		};
		try {
			const outcomes: Record<string, unknown> = {};
			for (const [name, failingFileSystem] of Object.entries(cases)) {
				const folder = join(directory, name);
				await fsPromises.mkdir(folder);
				const path = join(folder, 'vscode.metadata.json');
				const firstRun = await writeFileIfAbsent(path, new TextEncoder().encode('{"origin":"vscode"}'), failingFileSystem).then(() => 'created', (error: NodeJS.ErrnoException) => error.code);
				const filesAfterFailure = await readdir(folder);
				const retry = await writeFileIfAbsent(path, new TextEncoder().encode('{"origin":"vscode"}'));
				outcomes[name] = { firstRun, filesAfterFailure, retry, content: await readFile(path, 'utf8') };
			}
			const expected = { firstRun: 'ENOSPC', filesAfterFailure: [], retry: true, content: '{"origin":"vscode"}' };
			expect(outcomes).toEqual({ hardLink: expected, noHardLinkFallback: expected });
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it('does not treat unreadable files or folders as missing', async () => {
		mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({
			'session': { origin: 'vscode', workspaceFolder: { folderPath: '/w', timestamp: 1 } },
		}));
		mockSessionDirectories('session');
		mockFs.mockError(sessionDirectoryUri('session'), new Error('EACCES: permission denied'));
		mockFs.mockError(LEGACY_BULK_METADATA_FILE, new Error('EIO: i/o error'));

		const backfill = await runBackfill();

		const event = backfillEvents()[0];
		expect({
			perInstallBulkFile: event?.properties?.perInstallBulkFile,
			completed: event?.properties?.completed,
			failedCount: event?.measurements?.failedCount,
			missingSessionDirectoryCount: event?.measurements?.missingSessionDirectoryCount,
			backfilled: extensionContext.globalState.get(BACKFILLED_KEY),
		}).toEqual({
			perInstallBulkFile: 'invalid',
			completed: 'false',
			failedCount: 1,
			missingSessionDirectoryCount: 0,
			backfilled: undefined,
		});
		backfill.dispose();
	});

	it('stops a run after repeated consecutive write failures and gives up after a bounded number of runs', async () => {
		const bulk: Record<string, unknown> = {};
		for (let i = 0; i < 30; i++) {
			bulk[`s-${i}`] = { origin: 'vscode', workspaceFolder: { folderPath: `/w/${i}`, timestamp: i } };
			mockSessionDirectories(`s-${i}`);
		}
		mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify(bulk));
		const writeFile = mockFs.writeFile.bind(mockFs);
		vi.spyOn(mockFs, 'writeFile').mockImplementation(async (uri, content) => {
			if (uri.toString().endsWith('/vscode.metadata.json')) {
				throw new Error('EROFS');
			}
			return writeFile(uri, content);
		});

		const runs = [];
		for (let run = 0; run < 3; run++) {
			const backfill = await runBackfill();
			const event = backfillEvents()[run];
			runs.push({ aborted: event?.properties?.aborted, attempt: event?.measurements?.attempt, failedCount: event?.measurements?.failedCount, backfilled: extensionContext.globalState.get(BACKFILLED_KEY) });
			backfill.dispose();
		}

		expect({ runs, loggedFailures: logService.error.mock.calls.filter(c => String(c[1]).includes('Failed to backfill metadata')).length }).toEqual({
			runs: [
				{ aborted: 'true', attempt: 1, failedCount: 20, backfilled: undefined },
				{ aborted: 'true', attempt: 2, failedCount: 20, backfilled: undefined },
				{ aborted: 'true', attempt: 3, failedCount: 20, backfilled: true },
			],
			loggedFailures: 30,
		});
	});

	it('waits until after startup and leaves the bulk file untouched', async () => {
		const bulk = JSON.stringify({
			'session': { origin: 'vscode', workspaceFolder: { folderPath: '/w', timestamp: 1 }, modified: 7 },
		});
		mockFs.mockFile(BULK_METADATA_FILE, bulk);
		mockSessionDirectories('session');

		const backfill = await createBackfill();
		await vi.advanceTimersByTimeAsync(59_000);
		const beforeDelay = await readSessionFile('session');
		await vi.advanceTimersByTimeAsync(1_000);
		await backfill.whenSessionMetadataBackfilled();

		expect({
			beforeDelay,
			afterDelay: await readSessionFile('session'),
			bulkFile: new TextDecoder().decode(await mockFs.readFile(BULK_METADATA_FILE)),
		}).toEqual({
			beforeDelay: undefined,
			afterDelay: { origin: 'vscode', workspaceFolder: { folderPath: '/w', timestamp: 1 }, modified: 7 },
			bulkFile: bulk,
		});
		backfill.dispose();
	});

	it('stops when another window completes the backfill first', async () => {
		mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({
			'session': { origin: 'vscode', workspaceFolder: { folderPath: '/w', timestamp: 1 } },
		}));
		mockSessionDirectories('session');

		const backfill = await createBackfill();
		extensionContext.globalState.seed(BACKFILLED_KEY, true);
		await vi.advanceTimersByTimeAsync(60_000);
		await backfill.whenSessionMetadataBackfilled();

		expect({
			file: await readSessionFile('session'),
			events: telemetryService.events.filter(e => e.name === 'copilotcli.sessionMetadataBackfill').length,
		}).toEqual({ file: undefined, events: 0 });
		backfill.dispose();
	});

	it('does not run when disposed before startup settles', async () => {
		mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({
			'session': { origin: 'vscode', workspaceFolder: { folderPath: '/w', timestamp: 1 } },
		}));
		mockSessionDirectories('session');

		const backfill = await createBackfill();
		backfill.dispose();
		await vi.advanceTimersByTimeAsync(60_000);
		await backfill.whenSessionMetadataBackfilled();

		expect(await readSessionFile('session')).toBeUndefined();
	});

	it('writes missing per-session files for VS Code sessions from both bulk files, as stored', async () => {
		const worktree = makeWorktreeV2Props();
		mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({
			'shared-only': { workspaceFolder: { folderPath: '/a', timestamp: 1 }, origin: 'vscode', customTitle: 'Renamed', archived: true, created: 10, modified: 20, writtenToDisc: true },
			'origin-less': { worktreeProperties: worktree, modified: 30 },
			'in-both': { workspaceFolder: { folderPath: '/old', timestamp: 1 }, modified: 50 },
		}));
		mockFs.mockFile(LEGACY_BULK_METADATA_FILE, JSON.stringify({
			'per-install-only': { repositoryProperties: { repositoryPath: '/repo' }, modified: 5 },
			'in-both': { workspaceFolder: { folderPath: '/newer', timestamp: 2 }, modified: 200 },
		}));
		mockSessionDirectories('shared-only', 'origin-less', 'in-both', 'per-install-only');

		const backfill = await runBackfill();

		expect({
			'shared-only': await readSessionFile('shared-only'),
			'origin-less': await readSessionFile('origin-less'),
			'in-both': await readSessionFile('in-both'),
			'per-install-only': await readSessionFile('per-install-only'),
			backfilled: extensionContext.globalState.get(BACKFILLED_KEY),
		}).toEqual({
			'shared-only': { workspaceFolder: { folderPath: '/a', timestamp: 1 }, origin: 'vscode', customTitle: 'Renamed', archived: true, created: 10, modified: 20 },
			'origin-less': { worktreeProperties: worktree, modified: 30 },
			'in-both': { workspaceFolder: { folderPath: '/newer', timestamp: 2 }, modified: 200 },
			'per-install-only': { repositoryProperties: { repositoryPath: '/repo' }, modified: 5 },
			backfilled: true,
		});
		backfill.dispose();
	});

	it('skips non-VS Code, untitled, unsafe and missing-directory sessions and never overwrites an existing file', async () => {
		const folder = { folderPath: '/w', timestamp: 1 };
		mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({
			'external': { origin: 'other', workspaceFolder: folder },
			'no-workspace': { customTitle: 'title only' },
			'untitled-1': { origin: 'vscode', workspaceFolder: folder },
			'..': { origin: 'vscode', workspaceFolder: folder },
			'no-directory': { origin: 'vscode', workspaceFolder: folder },
			'has-file': { origin: 'vscode', workspaceFolder: folder },
		}));
		mockSessionDirectories('external', 'no-workspace', 'untitled-1', 'has-file');
		mockFs.mockFile(sessionMetadataFileUri('has-file'), JSON.stringify({ origin: 'other', customTitle: 'from another app' }));

		const backfill = await runBackfill();

		expect({
			files: {
				'external': await readSessionFile('external'),
				'no-workspace': await readSessionFile('no-workspace'),
				'untitled-1': await readSessionFile('untitled-1'),
				'no-directory': await readSessionFile('no-directory'),
				'has-file': await readSessionFile('has-file'),
			},
			telemetry: telemetryService.events.filter(e => e.name === 'copilotcli.sessionMetadataBackfill').map(e => ({ properties: e.properties, measurements: { ...e.measurements, durationMs: 0 } })),
		}).toEqual({
			files: {
				'external': undefined,
				'no-workspace': undefined,
				'untitled-1': undefined,
				'no-directory': undefined,
				'has-file': { origin: 'other', customTitle: 'from another app' },
			},
			telemetry: [{
				properties: { sharedBulkFile: 'present', perInstallBulkFile: 'missing', legacyBulkMigrated: 'false', sharedAtCap: 'false', completed: 'true', aborted: 'false' },
				measurements: { attempt: 1, sharedEntryCount: 6, perInstallEntryCount: 0, globalStateEntryCount: 0, globalStateOnlyCount: 0, candidateCount: 6, notVSCodeCount: 4, existingFileCount: 1, missingSessionDirectoryCount: 1, writtenCount: 0, failedCount: 0, durationMs: 0 },
			}],
		});
		backfill.dispose();
	});

	it('does not mark the backfill complete when a write fails', async () => {
		mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({
			'fails': { origin: 'vscode', workspaceFolder: { folderPath: '/w', timestamp: 1 } },
		}));
		mockSessionDirectories('fails');
		const writeFile = mockFs.writeFile.bind(mockFs);
		vi.spyOn(mockFs, 'writeFile').mockImplementation(async (uri, content) => {
			if (uri.toString() === sessionMetadataFileUri('fails').toString()) {
				throw new Error('EACCES');
			}
			return writeFile(uri, content);
		});

		const backfill = await runBackfill();

		expect({
			backfilled: extensionContext.globalState.get(BACKFILLED_KEY),
			failedCount: telemetryService.events.find(e => e.name === 'copilotcli.sessionMetadataBackfill')?.measurements?.failedCount,
		}).toEqual({ backfilled: undefined, failedCount: 1 });
		backfill.dispose();
	});

	it('does nothing once the backfill has completed', async () => {
		extensionContext.globalState.seed(BACKFILLED_KEY, true);
		mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({
			'session': { origin: 'vscode', workspaceFolder: { folderPath: '/w', timestamp: 1 } },
		}));
		mockSessionDirectories('session');

		const backfill = await runBackfill();

		expect({
			file: await readSessionFile('session'),
			events: telemetryService.events.filter(e => e.name === 'copilotcli.sessionMetadataBackfill').length,
		}).toEqual({ file: undefined, events: 0 });
		backfill.dispose();
	});
});
