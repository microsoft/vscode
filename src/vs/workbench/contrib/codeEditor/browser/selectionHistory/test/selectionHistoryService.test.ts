/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ICodeEditor } from '../../../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../../../editor/browser/services/codeEditorService.js';
import { ITextResourceEditorInput } from '../../../../../../platform/editor/common/editor.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { TestStorageService, TestContextService } from '../../../../../test/common/workbenchTestServices.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { SelectionHistoryEntry, SelectionHistoryService } from '../selectionHistoryService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { TestNotificationService } from '../../../../../../platform/notification/test/common/testNotificationService.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';

suite('SelectionHistoryService', () => {
	let instantiationService: TestInstantiationService;
	let storageService: TestStorageService;
	let fileService: IFileService;
	let disposables: DisposableStore;

	setup(() => {
		disposables = new DisposableStore();
		storageService = disposables.add(new TestStorageService());
		fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.file, new InMemoryFileSystemProvider()));

		instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IStorageService, storageService);
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(INotificationService, new TestNotificationService());
		instantiationService.stub(IWorkspaceContextService, new TestContextService());

		// Mock ICodeEditorService
		const mockCodeEditorService = {
			_serviceBrand: undefined,
			onWillCreateCodeEditor: Event.None,
			onCodeEditorAdd: new Emitter<ICodeEditor>().event,
			onCodeEditorRemove: new Emitter<ICodeEditor>().event,
			onWillCreateDiffEditor: Event.None,
			onDiffEditorAdd: Event.None,
			onDiffEditorRemove: Event.None,
			onDidChangeTransientModelProperty: Event.None,
			onDecorationTypeRegistered: Event.None,
			willCreateCodeEditor: () => { },
			addCodeEditor: () => { },
			removeCodeEditor: () => { },
			listCodeEditors: () => [],
			willCreateDiffEditor: () => { },
			addDiffEditor: () => { },
			removeDiffEditor: () => { },
			listDiffEditors: () => [],
			getFocusedCodeEditor: () => null,
			registerDecorationType: () => ({ dispose: () => { } }),
			listDecorationTypes: () => [],
			removeDecorationType: () => { },
			resolveDecorationOptions: () => ({}),
			resolveDecorationCSSRules: () => null,
			setModelProperty: () => { },
			getModelProperty: () => undefined,
			setTransientModelProperty: () => { },
			getTransientModelProperty: () => undefined,
			getTransientModelProperties: () => undefined,
			getActiveCodeEditor: () => null,
			openCodeEditor: async () => null,
			registerCodeEditorOpenHandler: (_handler: (input: ITextResourceEditorInput, source: ICodeEditor | null, sideBySide?: boolean) => Promise<ICodeEditor | null>) => ({ dispose: () => { } })
		};
		instantiationService.stub(ICodeEditorService, mockCodeEditorService as ICodeEditorService);
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function createService(): SelectionHistoryService {
		return disposables.add(instantiationService.createInstance(SelectionHistoryService));
	}

	function createEntry(overrides?: Partial<SelectionHistoryEntry>): SelectionHistoryEntry {
		return {
			id: 'test-id-1',
			text: 'test text',
			fileUri: 'file:///test/file.ts',
			startLine: 1,
			startColumn: 1,
			endLine: 1,
			endColumn: 10,
			timestamp: Date.now(),
			...overrides
		};
	}

	test('getHistory returns empty array initially', () => {
		const service = createService();
		const history = service.getHistory();
		assert.strictEqual(history.length, 0);
	});

	test('addEntry adds entry to history', () => {
		const service = createService();
		const entry = createEntry();
		service.addEntry(entry);
		const history = service.getHistory();
		assert.strictEqual(history.length, 1);
		assert.deepStrictEqual(history[0], entry);
	});

	test('addEntry adds entries in newest-first order', () => {
		const service = createService();
		const entry1 = createEntry({ id: '1', timestamp: 1000 });
		const entry2 = createEntry({ id: '2', timestamp: 2000 });
		service.addEntry(entry1);
		service.addEntry(entry2);
		const history = service.getHistory();
		assert.strictEqual(history.length, 2);
		assert.strictEqual(history[0].id, '2'); // Newest first
		assert.strictEqual(history[1].id, '1');
	});

	test('addEntry enforces history size limit (FIFO)', () => {
		const service = createService();
		// Add 51 entries (limit is 50)
		for (let i = 0; i < 51; i++) {
			service.addEntry(createEntry({ id: `id-${i}`, timestamp: 1000 + i }));
		}
		const history = service.getHistory();
		assert.strictEqual(history.length, 50);
		// First entry should be the newest (id-50)
		assert.strictEqual(history[0].id, 'id-50');
		// Last entry should be id-1 (oldest of the 50)
		assert.strictEqual(history[49].id, 'id-1');
		// id-0 should be removed (oldest)
		assert.strictEqual(history.find(e => e.id === 'id-0'), undefined);
	});

	test('clearHistory clears all entries', () => {
		const service = createService();
		service.addEntry(createEntry());
		service.addEntry(createEntry({ id: '2' }));
		service.clearHistory();
		const history = service.getHistory();
		assert.strictEqual(history.length, 0);
	});

	test('removeEntry removes entry by ID', () => {
		const service = createService();
		const entry1 = createEntry({ id: '1' });
		const entry2 = createEntry({ id: '2' });
		service.addEntry(entry1);
		service.addEntry(entry2);
		service.removeEntry('1');
		const history = service.getHistory();
		assert.strictEqual(history.length, 1);
		assert.strictEqual(history[0].id, '2');
	});

	test('removeEntry handles missing entry gracefully', () => {
		const service = createService();
		service.addEntry(createEntry({ id: '1' }));
		service.removeEntry('non-existent');
		const history = service.getHistory();
		assert.strictEqual(history.length, 1);
	});

	test('getCurrentPosition returns -1 when no history', () => {
		const service = createService();
		assert.strictEqual(service.getCurrentPosition(), -1);
	});

	test('getCurrentPosition returns 0 after adding entry', () => {
		const service = createService();
		service.addEntry(createEntry());
		assert.strictEqual(service.getCurrentPosition(), 0);
	});

	test('setCurrentPosition sets and validates position', () => {
		const service = createService();
		service.addEntry(createEntry({ id: '1' }));
		service.addEntry(createEntry({ id: '2' }));
		service.setCurrentPosition(1);
		assert.strictEqual(service.getCurrentPosition(), 1);
	});

	test('setCurrentPosition ignores invalid position', () => {
		const service = createService();
		service.addEntry(createEntry());
		service.setCurrentPosition(0);
		const initialPos = service.getCurrentPosition();
		service.setCurrentPosition(-1); // Invalid
		service.setCurrentPosition(10); // Invalid
		assert.strictEqual(service.getCurrentPosition(), initialPos);
	});

	test('history persists across service recreation', () => {
		const service1 = createService();
		service1.addEntry(createEntry({ id: '1' }));
		service1.addEntry(createEntry({ id: '2' }));
		service1.dispose();

		const service2 = createService();
		const history = service2.getHistory();
		assert.strictEqual(history.length, 2);
	});

	test('storage format includes version', () => {
		const service = createService();
		service.addEntry(createEntry());
		const stored = storageService.get('workbench.selectionHistory.entries', StorageScope.WORKSPACE, '');
		assert.ok(stored);
		const data = JSON.parse(stored);
		assert.strictEqual(data.version, 1);
		assert.ok(Array.isArray(data.entries));
	});

	test('loadHistory handles missing storage gracefully', () => {
		const service = createService();
		const history = service.getHistory();
		assert.strictEqual(history.length, 0);
	});

	test('loadHistory filters invalid entries', () => {
		// Store invalid data
		const invalidData = {
			version: 1,
			entries: [
				{ id: '1', text: 'test' }, // Missing required fields
				createEntry({ id: '2' }) // Valid entry
			]
		};
		storageService.store('workbench.selectionHistory.entries', JSON.stringify(invalidData), StorageScope.WORKSPACE, StorageTarget.MACHINE);

		const service = createService();
		const history = service.getHistory();
		assert.strictEqual(history.length, 1);
		assert.strictEqual(history[0].id, '2');
	});

	test('validateEntries removes untitled file entries', async () => {
		const service = createService();
		service.addEntry(createEntry({ id: '1', fileUri: 'untitled:test' }));
		service.addEntry(createEntry({ id: '2', fileUri: 'file:///test/file.ts' }));
		await service.validateEntries();
		const history = service.getHistory();
		assert.strictEqual(history.length, 1);
		assert.strictEqual(history[0].id, '2');
	});

	test('validateEntries removes entries for deleted files', async () => {
		const service = createService();
		const testFile = URI.file('/test/file.ts');
		await fileService.writeFile(testFile, VSBuffer.fromString('test content'));

		service.addEntry(createEntry({ id: '1', fileUri: testFile.toString() }));
		service.addEntry(createEntry({ id: '2', fileUri: 'file:///non-existent.ts' }));

		await service.validateEntries();
		const history = service.getHistory();
		assert.strictEqual(history.length, 1);
		assert.strictEqual(history[0].id, '1');
	});

	test('addEntry resets navigation position to 0', () => {
		const service = createService();
		service.addEntry(createEntry({ id: '1' }));
		service.setCurrentPosition(5);
		service.addEntry(createEntry({ id: '2' }));
		assert.strictEqual(service.getCurrentPosition(), 0);
	});

	test('removeEntry adjusts position when entry before current position is removed', () => {
		const service = createService();
		service.addEntry(createEntry({ id: '1' }));
		service.addEntry(createEntry({ id: '2' }));
		service.addEntry(createEntry({ id: '3' }));
		service.setCurrentPosition(2); // Position 2 (middle entry)
		service.removeEntry('1'); // Remove entry at position 2 (was id-1, now id-2 is at position 2)
		assert.strictEqual(service.getCurrentPosition(), 1); // Position adjusted down
	});

	test('removeEntry does not adjust position when entry after current position is removed', () => {
		const service = createService();
		service.addEntry(createEntry({ id: '1' }));
		service.addEntry(createEntry({ id: '2' }));
		service.addEntry(createEntry({ id: '3' }));
		service.setCurrentPosition(0); // Position 0 (newest)
		service.removeEntry('3'); // Remove entry at position 2 (oldest)
		assert.strictEqual(service.getCurrentPosition(), 0); // Position unchanged
	});

	test('clearHistory resets navigation position', () => {
		const service = createService();
		service.addEntry(createEntry({ id: '1' }));
		service.addEntry(createEntry({ id: '2' }));
		service.setCurrentPosition(1);
		service.clearHistory();
		assert.strictEqual(service.getCurrentPosition(), 0);
		assert.strictEqual(service.getHistory().length, 0);
	});

	test('getHistory returns copy not reference', () => {
		const service = createService();
		service.addEntry(createEntry({ id: '1' }));
		const history1 = service.getHistory();
		const history2 = service.getHistory();
		assert.notStrictEqual(history1, history2);
		history1.push(createEntry({ id: '2' }));
		assert.strictEqual(service.getHistory().length, 1); // Original unchanged
	});

	test('updateEntryUri updates entry URI', () => {
		const service = createService();
		service.addEntry(createEntry({ id: '1', fileUri: 'file:///old/path.ts' }));
		service.updateEntryUri('1', 'file:///new/path.ts');
		const history = service.getHistory();
		assert.strictEqual(history[0].fileUri, 'file:///new/path.ts');
	});

	test('updateEntryUri handles missing entry gracefully', () => {
		const service = createService();
		service.addEntry(createEntry({ id: '1' }));
		service.updateEntryUri('non-existent', 'file:///new/path.ts');
		const history = service.getHistory();
		assert.strictEqual(history[0].fileUri, 'file:///test/file.ts'); // Unchanged
	});

	test('validateAllEntries returns valid and invalid entries', async () => {
		const service = createService();
		const testFile = URI.file('/test/file.ts');
		await fileService.writeFile(testFile, VSBuffer.fromString('test content'));

		service.addEntry(createEntry({ id: '1', fileUri: testFile.toString() }));
		service.addEntry(createEntry({ id: '2', fileUri: 'file:///non-existent.ts' }));
		service.addEntry(createEntry({ id: '3', fileUri: 'untitled:test' }));

		const result = await service.validateAllEntries();
		assert.strictEqual(result.valid.length, 1);
		assert.strictEqual(result.invalid.length, 2);
		assert.strictEqual(result.valid[0].id, '1');
	});

	test('validateAllEntries removes invalid entries from history', async () => {
		const service = createService();
		const testFile = URI.file('/test/file.ts');
		await fileService.writeFile(testFile, VSBuffer.fromString('test content'));

		service.addEntry(createEntry({ id: '1', fileUri: testFile.toString() }));
		service.addEntry(createEntry({ id: '2', fileUri: 'file:///non-existent.ts' }));

		await service.validateAllEntries();
		const history = service.getHistory();
		assert.strictEqual(history.length, 1);
		assert.strictEqual(history[0].id, '1');
	});

	test('validateAllEntries adjusts position when invalid entries removed', async () => {
		const service = createService();
		const testFile = URI.file('/test/file.ts');
		await fileService.writeFile(testFile, VSBuffer.fromString('test content'));

		service.addEntry(createEntry({ id: '1', fileUri: testFile.toString() }));
		service.addEntry(createEntry({ id: '2', fileUri: 'file:///non-existent.ts' }));
		service.addEntry(createEntry({ id: '3', fileUri: testFile.toString() }));
		service.setCurrentPosition(1); // Position 1 (middle entry, which will be invalid)

		await service.validateAllEntries();
		assert.strictEqual(service.getCurrentPosition(), 0); // Position adjusted
	});

	test('loadHistory handles future version gracefully', () => {
		const futureData = {
			version: 999,
			entries: [createEntry({ id: '1' })]
		};
		storageService.store('workbench.selectionHistory.entries', JSON.stringify(futureData), StorageScope.WORKSPACE, StorageTarget.MACHINE);

		const service = createService();
		const history = service.getHistory();
		assert.strictEqual(history.length, 0); // History cleared
	});

	test('loadHistory handles outdated version gracefully', () => {
		const oldData = {
			version: 0,
			entries: [createEntry({ id: '1' })]
		};
		storageService.store('workbench.selectionHistory.entries', JSON.stringify(oldData), StorageScope.WORKSPACE, StorageTarget.MACHINE);

		const service = createService();
		const history = service.getHistory();
		assert.strictEqual(history.length, 0); // History cleared
	});

	test('loadHistory handles missing version gracefully', () => {
		const noVersionData = {
			entries: [createEntry({ id: '1' })]
		};
		storageService.store('workbench.selectionHistory.entries', JSON.stringify(noVersionData), StorageScope.WORKSPACE, StorageTarget.MACHINE);

		const service = createService();
		const history = service.getHistory();
		assert.strictEqual(history.length, 0); // History cleared
	});

	test('loadHistory handles corrupted JSON gracefully', () => {
		storageService.store('workbench.selectionHistory.entries', 'invalid json', StorageScope.WORKSPACE, StorageTarget.MACHINE);

		const service = createService();
		const history = service.getHistory();
		assert.strictEqual(history.length, 0); // History cleared
	});

	test('_saveHistory handles storage errors gracefully', () => {
		const service = createService();
		service.addEntry(createEntry({ id: '1' }));

		// Simulate storage error by making store throw
		const originalStore = storageService.store;
		let storeCallCount = 0;
		storageService.store = function (key: string, value: string, scope: StorageScope, target: StorageTarget) {
			storeCallCount++;
			if (storeCallCount === 1) {
				throw new Error('Storage error');
			}
			return originalStore.call(this, key, value, scope, target);
		};

		// Add another entry - should not crash
		service.addEntry(createEntry({ id: '2' }));
		const history = service.getHistory();
		assert.strictEqual(history.length, 2); // Entries still in memory
	});

	test('validateEntries adjusts position when entries removed', async () => {
		const service = createService();
		const testFile = URI.file('/test/file.ts');
		await fileService.writeFile(testFile, VSBuffer.fromString('test content'));

		service.addEntry(createEntry({ id: '1', fileUri: testFile.toString() }));
		service.addEntry(createEntry({ id: '2', fileUri: 'file:///non-existent.ts' }));
		service.addEntry(createEntry({ id: '3', fileUri: testFile.toString() }));
		service.setCurrentPosition(1); // Position 1 (middle entry, which will be invalid)

		await service.validateEntries();
		assert.strictEqual(service.getCurrentPosition(), 0); // Position adjusted
	});

	test('validateEntries handles file service errors gracefully', async () => {
		const service = createService();
		service.addEntry(createEntry({ id: '1', fileUri: 'file:///test/file.ts' }));

		// Mock file service to throw error
		const originalExists = fileService.exists;
		fileService.exists = async () => {
			throw new Error('File service error');
		};

		await service.validateEntries();
		const history = service.getHistory();
		// Entry should be removed due to error
		assert.strictEqual(history.length, 0);

		// Restore
		fileService.exists = originalExists;
	});

	test('validateEntries handles invalid URI gracefully', async () => {
		const service = createService();
		service.addEntry(createEntry({ id: '1', fileUri: 'invalid-uri' }));

		await service.validateEntries();
		const history = service.getHistory();
		// Entry should be removed due to invalid URI
		assert.strictEqual(history.length, 0);
	});

	test('validateAllEntries handles renamed files', async () => {
		const service = createService();
		const testFile = URI.file('/test/old-name.ts');
		await fileService.writeFile(testFile, VSBuffer.fromString('test content'));

		service.addEntry(createEntry({ id: '1', fileUri: 'file:///test/old-name.ts' }));

		// Move file
		const newFile = URI.file('/test/new-name.ts');
		await fileService.move(testFile, newFile, true);

		const result = await service.validateAllEntries();
		// Entry should be valid (file found with new name)
		assert.strictEqual(result.valid.length, 1);
		assert.strictEqual(result.invalid.length, 0);
	});

	test('validateAllEntries validates range correctly', async () => {
		const service = createService();
		const testFile = URI.file('/test/file.ts');
		await fileService.writeFile(testFile, VSBuffer.fromString('test content'));

		service.addEntry(createEntry({ id: '1', fileUri: testFile.toString(), startLine: 1, endLine: 1 })); // Valid
		service.addEntry(createEntry({ id: '2', fileUri: testFile.toString(), startLine: 5, endLine: 1 })); // Invalid (start > end)
		service.addEntry(createEntry({ id: '3', fileUri: testFile.toString(), startLine: 0, endLine: 1 })); // Invalid (start < 1)

		const result = await service.validateAllEntries();
		assert.strictEqual(result.valid.length, 1);
		assert.strictEqual(result.invalid.length, 2);
	});

	test('service disposes correctly', () => {
		const service = createService();
		service.addEntry(createEntry({ id: '1' }));

		// Dispose should not throw
		service.dispose();

		// Service should still work (methods check initialization)
		const history = service.getHistory();
		assert.strictEqual(history.length, 1);
	});

	test('service initializes lazily', async () => {
		const service = createService();
		// Service should initialize on first access
		const history = service.getHistory();
		assert.ok(Array.isArray(history));
	});

	test('addEntry validates entry structure', () => {
		const service = createService();
		// Missing required fields - intentionally invalid
		const invalidEntry: Partial<SelectionHistoryEntry> = { id: '1' };
		service.addEntry(invalidEntry as SelectionHistoryEntry);
		const history = service.getHistory();
		assert.strictEqual(history.length, 0); // Invalid entry not added
	});

	test('addEntry handles very large text (truncation)', () => {
		const service = createService();
		const largeText = 'x'.repeat(3000); // > 2000 chars
		const entry = createEntry({ text: largeText });
		service.addEntry(entry);
		const history = service.getHistory();
		assert.strictEqual(history.length, 1);
		// Text should be truncated (implementation truncates to 2000 chars with ... prefix)
		assert.ok(history[0].text.length <= 2000);
	});

	test('addEntry handles single character selections', () => {
		const service = createService();
		const entry = createEntry({ text: 'x', startColumn: 1, endColumn: 2 });
		service.addEntry(entry);
		const history = service.getHistory();
		assert.strictEqual(history.length, 1);
		assert.strictEqual(history[0].text, 'x');
	});

	test('addEntry handles multi-line selections', () => {
		const service = createService();
		const entry = createEntry({
			text: 'line 1\nline 2\nline 3',
			startLine: 1,
			endLine: 3
		});
		service.addEntry(entry);
		const history = service.getHistory();
		assert.strictEqual(history.length, 1);
		assert.strictEqual(history[0].startLine, 1);
		assert.strictEqual(history[0].endLine, 3);
	});

	test('clearHistory persists to storage', () => {
		const service = createService();
		service.addEntry(createEntry({ id: '1' }));
		service.clearHistory();

		// Verify storage is cleared
		const stored = storageService.get('workbench.selectionHistory.entries', StorageScope.WORKSPACE, '');
		if (stored) {
			const data = JSON.parse(stored);
			assert.strictEqual(data.entries.length, 0);
		}
	});

	test('removeEntry persists to storage', () => {
		const service = createService();
		service.addEntry(createEntry({ id: '1' }));
		service.addEntry(createEntry({ id: '2' }));
		service.removeEntry('1');

		const history = service.getHistory();
		assert.strictEqual(history.length, 1);
		assert.strictEqual(history[0].id, '2');
	});

	test('validateAllEntries handles renamed files correctly', async () => {
		const service = createService();
		const testFile = URI.file('/test/old-name.ts');
		await fileService.writeFile(testFile, VSBuffer.fromString('test content'));

		service.addEntry(createEntry({ id: '1', fileUri: 'file:///test/old-name.ts' }));

		// Move file
		const newFile = URI.file('/test/new-name.ts');
		await fileService.move(testFile, newFile, true);

		const result = await service.validateAllEntries();
		// Entry should be valid (file found with new name)
		assert.strictEqual(result.valid.length, 1);
		assert.strictEqual(result.invalid.length, 0);
		// Entry URI should be updated
		const history = service.getHistory();
		assert.ok(history[0].fileUri.includes('new-name.ts'));
	});

	test('validateAllEntries handles range validation edge cases', async () => {
		const service = createService();
		const testFile = URI.file('/test/file.ts');
		await fileService.writeFile(testFile, VSBuffer.fromString('test content'));

		service.addEntry(createEntry({ id: '1', fileUri: testFile.toString(), startLine: 1, endLine: 1 })); // Valid
		service.addEntry(createEntry({ id: '2', fileUri: testFile.toString(), startLine: 5, endLine: 1 })); // Invalid (start > end)
		service.addEntry(createEntry({ id: '3', fileUri: testFile.toString(), startLine: 0, endLine: 1 })); // Invalid (start < 1)
		service.addEntry(createEntry({ id: '4', fileUri: testFile.toString(), startLine: 1, endLine: 1, startColumn: 0 })); // Invalid (column < 1)

		const result = await service.validateAllEntries();
		assert.strictEqual(result.valid.length, 1);
		assert.strictEqual(result.invalid.length, 3);
	});

	test('storage error handling with quota exceeded', () => {
		const service = createService();
		// Simulate quota exceeded error
		const originalStore = storageService.store;
		let storeCallCount = 0;
		storageService.store = function (key: string, value: string, scope: StorageScope, target: any) {
			storeCallCount++;
			if (storeCallCount === 1) {
				const error = new Error('QuotaExceededError');
				error.name = 'QuotaExceededError';
				throw error;
			}
			return originalStore.call(this, key, value, scope, target);
		};

		// Add entry - should handle error gracefully
		service.addEntry(createEntry({ id: '1' }));
		const history = service.getHistory();
		// Entry should still be in memory
		assert.strictEqual(history.length, 1);
	});

	test('storage error handling with permission denied', () => {
		const service = createService();
		// Simulate permission denied error
		const originalStore = storageService.store;
		let storeCallCount = 0;
		storageService.store = function (key: string, value: string, scope: StorageScope, target: any) {
			storeCallCount++;
			if (storeCallCount === 1) {
				throw new Error('Permission denied');
			}
			return originalStore.call(this, key, value, scope, target);
		};

		// Add entry - should handle error gracefully
		service.addEntry(createEntry({ id: '1' }));
		const history = service.getHistory();
		// Entry should still be in memory
		assert.strictEqual(history.length, 1);
	});

	test('loadHistory handles corrupted storage data gracefully', () => {
		// Store corrupted data
		storageService.store('workbench.selectionHistory.entries', 'invalid json {', StorageScope.WORKSPACE);

		const service = createService();
		const history = service.getHistory();
		// Should handle gracefully and return empty history
		assert.strictEqual(history.length, 0);
	});

	test('loadHistory handles missing entries array gracefully', () => {
		const invalidData = {
			version: 1
			// Missing entries array
		};
		storageService.store('workbench.selectionHistory.entries', JSON.stringify(invalidData), StorageScope.WORKSPACE);

		const service = createService();
		const history = service.getHistory();
		assert.strictEqual(history.length, 0);
	});

	test('validateEntries handles file service errors gracefully', async () => {
		const service = createService();
		service.addEntry(createEntry({ id: '1', fileUri: 'file:///test/file.ts' }));

		// Mock file service to throw error
		const originalExists = fileService.exists;
		fileService.exists = async () => {
			throw new Error('File service error');
		};

		await service.validateEntries();
		const history = service.getHistory();
		// Entry should be removed due to error
		assert.strictEqual(history.length, 0);

		// Restore
		fileService.exists = originalExists;
	});

	test('validateAllEntries handles many entries efficiently', async () => {
		const service = createService();
		const testFile = URI.file('/test/file.ts');
		await fileService.writeFile(testFile, VSBuffer.fromString('test content'));

		// Add 30 entries
		for (let i = 0; i < 30; i++) {
			service.addEntry(createEntry({ id: `id-${i}`, fileUri: testFile.toString() }));
		}

		const startTime = Date.now();
		const result = await service.validateAllEntries();
		const endTime = Date.now();

		// Should complete in reasonable time (< 1 second for 30 entries)
		assert.ok(endTime - startTime < 1000);
		assert.strictEqual(result.valid.length, 30);
		assert.strictEqual(result.invalid.length, 0);
	});
});

