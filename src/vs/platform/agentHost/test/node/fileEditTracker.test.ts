/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { encodeHex, VSBuffer } from '../../../../base/common/buffer.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { IFileService } from '../../../files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { IDiffComputeService } from '../../common/diffComputeService.js';
import { createFileEditContentDigest, getFileEditAttributionMarker, IAgentEditAttributionService, NullAgentEditAttributionService } from '../../common/fileEditAttribution.js';
import { ToolResultContentType } from '../../common/state/sessionState.js';
import { TestDiffComputeService } from '../common/sessionTestHelpers.js';
import { SessionDatabase } from '../../node/sessionDatabase.js';
import { IEditSurvivalReporterFactory, NullEditSurvivalReporterFactory } from '../../node/shared/editSurvivalReporter.js';
import { FileEditTracker, buildSessionDbUri, parseSessionDbUri } from '../../node/shared/fileEditTracker.js';

suite('FileEditTracker', () => {

	const disposables = new DisposableStore();
	let fileService: FileService;
	let db: SessionDatabase;
	let tracker: FileEditTracker;
	let diffComputeService: TestDiffComputeService;

	setup(async () => {
		fileService = disposables.add(new FileService(new NullLogService()));
		const sourceFs = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider('file', sourceFs));

		db = disposables.add(await SessionDatabase.open(':memory:'));
		await db.createTurn('turn-1');

		const services = new ServiceCollection();
		services.set(ILogService, new NullLogService());
		services.set(IFileService, fileService);
		diffComputeService = new TestDiffComputeService();
		services.set(IDiffComputeService, diffComputeService);
		services.set(IAgentEditAttributionService, new NullAgentEditAttributionService());
		services.set(IEditSurvivalReporterFactory, new NullEditSurvivalReporterFactory());
		const instantiationService: IInstantiationService = disposables.add(new InstantiationService(services));
		tracker = instantiationService.createInstance(FileEditTracker, 'copilot:/test-session', db);
	});

	teardown(async () => {
		disposables.clear();
		await db.close();
	});
	ensureNoDisposablesAreLeakedInTestSuite();

	test('tracks edit start and complete for existing file', async () => {
		await fileService.writeFile(URI.file('/workspace/test.txt'), VSBuffer.fromString('original content\nline 2'));

		await tracker.trackEditStart('/workspace/test.txt');
		await fileService.writeFile(URI.file('/workspace/test.txt'), VSBuffer.fromString('modified content\nline 2\nline 3'));
		await tracker.completeEdit('/workspace/test.txt');

		const fileEdit = await tracker.takeCompletedEdit('turn-1', 'tc-1', '/workspace/test.txt', '', undefined, undefined);
		assert.ok(fileEdit);
		assert.strictEqual(fileEdit.type, ToolResultContentType.FileEdit);
		assert.strictEqual(diffComputeService.callCount, 1);

		// URIs are parseable session-db: URIs
		const beforeFields = parseSessionDbUri(fileEdit.before!.content.uri);
		assert.ok(beforeFields);
		assert.strictEqual(beforeFields.sessionUri, 'copilot:/test-session');
		assert.strictEqual(beforeFields.toolCallId, 'tc-1');
		assert.strictEqual(beforeFields.filePath, '/workspace/test.txt');
		assert.strictEqual(beforeFields.part, 'before');

		const afterFields = parseSessionDbUri(fileEdit.after!.content.uri);
		assert.ok(afterFields);
		assert.strictEqual(afterFields.part, 'after');

		// Content is persisted in the database (wait for fire-and-forget write)
		await new Promise(r => setTimeout(r, 50));

		const content = await db.readFileEditContent('tc-1', '/workspace/test.txt');
		assert.ok(content);
		assert.strictEqual(new TextDecoder().decode(content.beforeContent), 'original content\nline 2');
		assert.strictEqual(new TextDecoder().decode(content.afterContent), 'modified content\nline 2\nline 3');
	});

	test('tracks edit for newly created file (no before content)', async () => {
		await tracker.trackEditStart('/workspace/new-file.txt');
		await fileService.writeFile(URI.file('/workspace/new-file.txt'), VSBuffer.fromString('new file\ncontent'));
		await tracker.completeEdit('/workspace/new-file.txt');

		const fileEdit = await tracker.takeCompletedEdit('turn-1', 'tc-2', '/workspace/new-file.txt', '', undefined, undefined);
		assert.ok(fileEdit);

		// Wait for the fire-and-forget DB write to complete
		await new Promise(r => setTimeout(r, 50));

		const content = await db.readFileEditContent('tc-2', '/workspace/new-file.txt');
		assert.ok(content);
		assert.strictEqual(new TextDecoder().decode(content.beforeContent), '');
		assert.strictEqual(new TextDecoder().decode(content.afterContent), 'new file\ncontent');
	});

	test('takeCompletedEdit returns undefined for unknown file path', async () => {
		const result = await tracker.takeCompletedEdit('turn-1', 'tc-x', '/nonexistent', '', undefined, undefined);
		assert.strictEqual(result, undefined);
	});

	test('attaches Agent attribution marker to the file edit result', async () => {
		const services = new ServiceCollection();
		services.set(ILogService, new NullLogService());
		services.set(IFileService, fileService);
		services.set(IDiffComputeService, new TestDiffComputeService());
		services.set(IAgentEditAttributionService, {
			_serviceBrand: undefined,
			setEnabled: () => { },
			recordEdit: async edit => ({
				version: 1,
				editId: 'edit-1',
				sequence: 1,
				beforeDigest: createFileEditContentDigest(edit.beforeText),
				afterDigest: createFileEditContentDigest(edit.afterText),
			}),
			flushSession: async () => { },
			prepareFlush: async () => undefined,
			commitFlush: async () => ({ outcome: 'missing', agentModifiedCount: 0 }),
			cancelFlush: async () => ({ outcome: 'missing', agentModifiedCount: 0 }),
		});
		services.set(IEditSurvivalReporterFactory, new NullEditSurvivalReporterFactory());
		const instantiationService: IInstantiationService = disposables.add(new InstantiationService(services));
		const localTracker = instantiationService.createInstance(FileEditTracker, 'copilot:/test-session', db);
		await fileService.writeFile(URI.file('/workspace/marker.txt'), VSBuffer.fromString('before'));

		await localTracker.trackEditStart('/workspace/marker.txt');
		await fileService.writeFile(URI.file('/workspace/marker.txt'), VSBuffer.fromString('after'));
		await localTracker.completeEdit('/workspace/marker.txt');
		const result = await localTracker.takeCompletedEdit('turn-1', 'tc-marker', '/workspace/marker.txt', 'edit', undefined, 'model');

		assert.deepStrictEqual(result && getFileEditAttributionMarker(result), {
			version: 1,
			editId: 'edit-1',
			sequence: 1,
			beforeDigest: createFileEditContentDigest('before'),
			afterDigest: createFileEditContentDigest('after'),
		});
	});

	test('returns the file edit result when attribution fails', async () => {
		const services = new ServiceCollection();
		services.set(ILogService, new NullLogService());
		services.set(IFileService, fileService);
		services.set(IDiffComputeService, new TestDiffComputeService());
		services.set(IAgentEditAttributionService, {
			_serviceBrand: undefined,
			setEnabled: () => { },
			recordEdit: async () => {
				throw new Error('Attribution failed');
			},
			flushSession: async () => { },
			prepareFlush: async () => undefined,
			commitFlush: async () => ({ outcome: 'missing', agentModifiedCount: 0 }),
			cancelFlush: async () => ({ outcome: 'missing', agentModifiedCount: 0 }),
		});
		services.set(IEditSurvivalReporterFactory, new NullEditSurvivalReporterFactory());
		const instantiationService: IInstantiationService = disposables.add(new InstantiationService(services));
		const localTracker = instantiationService.createInstance(FileEditTracker, 'copilot:/test-session', db);
		await fileService.writeFile(URI.file('/workspace/fallback.txt'), VSBuffer.fromString('before'));

		await localTracker.trackEditStart('/workspace/fallback.txt');
		await fileService.writeFile(URI.file('/workspace/fallback.txt'), VSBuffer.fromString('after'));
		await localTracker.completeEdit('/workspace/fallback.txt');
		const result = await localTracker.takeCompletedEdit('turn-1', 'tc-fallback', '/workspace/fallback.txt', 'edit', undefined, 'model');

		assert.deepStrictEqual({
			type: result?.type,
			marker: result && getFileEditAttributionMarker(result),
		}, {
			type: ToolResultContentType.FileEdit,
			marker: undefined,
		});
	});

	test('Write to non-existent file records kind=create with removed=0', async () => {
		// When a file did not exist before the edit, the tracker clamps
		// `removed` to 0 (the differ otherwise reports 1 for an empty
		// before-content vs. a one-line after-content) and records
		// `kind=create` instead of `edit`. `added` is passed through
		// from the diff service unchanged.
		const services = new ServiceCollection();
		services.set(ILogService, new NullLogService());
		services.set(IFileService, fileService);
		services.set(IDiffComputeService, new TestDiffComputeService({ added: 1, removed: 1, changes: [] }));
		services.set(IAgentEditAttributionService, new NullAgentEditAttributionService());
		services.set(IEditSurvivalReporterFactory, new NullEditSurvivalReporterFactory());
		const inst: IInstantiationService = disposables.add(new InstantiationService(services));
		const localTracker = inst.createInstance(FileEditTracker, 'copilot:/test-session', db);

		await localTracker.trackEditStart('/workspace/brand-new.txt');
		await fileService.writeFile(URI.file('/workspace/brand-new.txt'), VSBuffer.fromString('fresh'));
		await localTracker.completeEdit('/workspace/brand-new.txt');

		const fileEdit = await localTracker.takeCompletedEdit('turn-1', 'tc-create', '/workspace/brand-new.txt', '', undefined, undefined);
		assert.ok(fileEdit);

		const records = await db.getAllFileEdits();
		const created = records.find(r => r.toolCallId === 'tc-create');
		assert.deepStrictEqual({
			diff: fileEdit.diff,
			kind: created?.kind,
			addedLines: created?.addedLines,
			removedLines: created?.removedLines,
		}, {
			diff: { added: 1, removed: 0 },
			kind: 'create',
			addedLines: 1,
			removedLines: 0,
		});
	});

	test('before and after content can be read from database', async () => {
		await fileService.writeFile(URI.file('/workspace/file.ts'), VSBuffer.fromString('original'));

		await tracker.trackEditStart('/workspace/file.ts');
		await fileService.writeFile(URI.file('/workspace/file.ts'), VSBuffer.fromString('modified'));
		await tracker.completeEdit('/workspace/file.ts');

		await tracker.takeCompletedEdit('turn-1', 'tc-3', '/workspace/file.ts', '', undefined, undefined);

		const content = await db.readFileEditContent('tc-3', '/workspace/file.ts');
		assert.ok(content);
		assert.strictEqual(new TextDecoder().decode(content.beforeContent), 'original');
		assert.strictEqual(new TextDecoder().decode(content.afterContent), 'modified');
	});
});

suite('buildSessionDbUri / parseSessionDbUri', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('round-trips a simple URI', () => {
		const uri = buildSessionDbUri('copilot:/abc-123', 'tc-1', '/workspace/file.ts', 'before');
		const parsed = parseSessionDbUri(uri);
		assert.ok(parsed);
		assert.deepStrictEqual(parsed, {
			sessionUri: 'copilot:/abc-123',
			toolCallId: 'tc-1',
			filePath: '/workspace/file.ts',
			part: 'before',
		});
	});

	test('round-trips with special characters in filePath', () => {
		const uri = buildSessionDbUri('copilot:/s1', 'tc-2', '/work space/file (1).ts', 'after');
		const parsed = parseSessionDbUri(uri);
		assert.ok(parsed);
		assert.strictEqual(parsed.filePath, '/work space/file (1).ts');
		assert.strictEqual(parsed.part, 'after');
	});

	test('round-trips with special characters in toolCallId', () => {
		const uri = buildSessionDbUri('copilot:/s1', 'call_abc=123&x', '/file.ts', 'before');
		const parsed = parseSessionDbUri(uri);
		assert.ok(parsed);
		assert.strictEqual(parsed.toolCallId, 'call_abc=123&x');
	});

	test('round-trips a backslashed Windows filePath, which the database lookup needs verbatim', () => {
		const filePath = 'C:\\Code\\vscode\\src\\vs\\file.ts';
		const parsed = parseSessionDbUri(buildSessionDbUri('copilot:/s1', 'tc-1', filePath, 'before'));
		assert.ok(parsed);
		assert.strictEqual(parsed.filePath, filePath);
	});

	test('parseSessionDbUri returns undefined for non-session-db URIs', () => {
		assert.strictEqual(parseSessionDbUri('file:///foo/bar'), undefined);
		assert.strictEqual(parseSessionDbUri('https://example.com'), undefined);
	});

	test('parseSessionDbUri returns undefined for malformed session-db URIs', () => {
		assert.strictEqual(parseSessionDbUri('session-db:copilot:/s1'), undefined);
		assert.strictEqual(parseSessionDbUri('session-db:copilot:/s1?toolCallId=tc-1'), undefined);
		assert.strictEqual(parseSessionDbUri('session-db:copilot:/s1?toolCallId=tc-1&filePath=/f&part=middle'), undefined);
	});

	test('parseSessionDbUri returns undefined for JSON queries that are not objects', () => {
		const queries = ['null', '123', '"a string"', 'true', '[]'];
		assert.deepStrictEqual(
			queries.map(query => parseSessionDbUri(`session-db:/f.ts?${encodeURIComponent(query)}`)),
			queries.map(() => undefined),
		);
	});

	test('parseSessionDbUri rejects empty lookup keys, which would hit the database', () => {
		const withField = (field: Partial<Record<'sessionUri' | 'toolCallId' | 'filePath', string>>) =>
			`session-db:/f.ts?${encodeURIComponent(JSON.stringify({ sessionUri: 's', toolCallId: 't', filePath: '/f.ts', part: 'before', ...field }))}`;

		assert.deepStrictEqual([
			parseSessionDbUri(withField({ sessionUri: '' })),
			parseSessionDbUri(withField({ toolCallId: '' })),
			parseSessionDbUri(withField({ filePath: '' })),
		], [undefined, undefined, undefined]);
	});

	test('URI path is the file path, so labels show a real path', () => {
		const uri = buildSessionDbUri('copilot:/s1', 'tc-1', '/workspace/src/index.ts', 'before');
		assert.strictEqual(URI.parse(uri).path, '/workspace/src/index.ts');
	});

	test('URI path is the file path for files with spaces and special chars', () => {
		const uri = buildSessionDbUri('copilot:/s1', 'tc-1', '/work space/file (1).ts', 'after');
		assert.strictEqual(URI.parse(uri).path, '/work space/file (1).ts');
	});

	test('parses the legacy hex-encoded layout', () => {
		const hex = (value: string) => encodeHex(VSBuffer.fromString(value)).toString();
		const legacy = URI.from({
			scheme: 'session-db',
			authority: hex('copilot:/abc-123'),
			path: `/tc-1/${hex('/workspace/file.ts')}/before/file.ts`,
		}).toString();

		assert.deepStrictEqual(parseSessionDbUri(legacy), {
			sessionUri: 'copilot:/abc-123',
			toolCallId: 'tc-1',
			filePath: '/workspace/file.ts',
			part: 'before',
		});
	});
});
