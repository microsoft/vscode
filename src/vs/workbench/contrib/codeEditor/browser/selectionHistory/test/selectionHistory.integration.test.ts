/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { URI } from '../../../../../../base/common/uri.js';
import { hasKey } from '../../../../../../base/common/types.js';
import { SelectionHistoryService, SelectionHistoryEntry } from '../selectionHistoryService.js';
import { GoToPreviousSelectionAction, GoToNextSelectionAction, ClearSelectionHistoryAction } from '../selectionHistoryActions.js';
import { SelectionHistoryQuickAccessProvider } from '../selectionHistoryQuickAccess.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { TestStorageService, TestContextService } from '../../../../../test/common/workbenchTestServices.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { ICodeEditorService } from '../../../../../../editor/browser/services/codeEditorService.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { ICodeEditor } from '../../../../../../editor/browser/editorBrowser.js';
import { TestNotificationService } from '../../../../../../platform/notification/test/common/testNotificationService.js';
import { IStorageService, StorageScope } from '../../../../../../platform/storage/common/storage.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { TestDialogService } from '../../../../../../platform/dialogs/test/common/testDialogService.js';
import { IQuickInputService } from '../../../../../../platform/quickinput/common/quickInput.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';

suite('SelectionHistory Integration Tests', () => {
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
		instantiationService.stub(IDialogService, new TestDialogService());
		instantiationService.stub(IQuickInputService, {
			quickAccess: {
				show: () => { }
			}
		});
		instantiationService.stub(ILabelService, {
			getUriLabel: () => 'test.ts',
			getIcon: () => undefined
		});
		instantiationService.stub(IModelService, {
			getModel: () => null
		});
		instantiationService.stub(ICodeEditorService, {
			getActiveCodeEditor: () => null
		});
		instantiationService.stub(IEditorService, {
			openEditor: async () => undefined
		});

		const testContextService = disposables.add(new TestContextService());
		instantiationService.stub(IWorkspaceContextService, testContextService);

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
			registerCodeEditorOpenHandler: (_handler: any) => ({ dispose: () => { } })
		};
		instantiationService.stub(ICodeEditorService, mockCodeEditorService);
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

	suite('End-to-End Selection Tracking and Navigation', () => {
		test('complete workflow: add entries, navigate, clear', async () => {
			const service = createService();
			const testFile = URI.file('/test/file.ts');
			await fileService.writeFile(testFile, VSBuffer.fromString('line 1\nline 2\nline 3'));

			// Add entries
			const entry1 = createEntry({ id: '1', fileUri: testFile.toString(), startLine: 1 });
			const entry2 = createEntry({ id: '2', fileUri: testFile.toString(), startLine: 2 });
			service.addEntry(entry1);
			service.addEntry(entry2);

			// Verify history
			const history = service.getHistory();
			assert.strictEqual(history.length, 2);
			assert.strictEqual(history[0].id, '2'); // Newest first

			// Navigate previous
			service.setCurrentPosition(0);
			const previousAction = instantiationService.createInstance(GoToPreviousSelectionAction);
			await previousAction.run(instantiationService);

			// Position should be updated
			assert.strictEqual(service.getCurrentPosition(), 1);

			// Navigate next
			const nextAction = instantiationService.createInstance(GoToNextSelectionAction);
			await nextAction.run(instantiationService);

			// Position should be back to 0
			assert.strictEqual(service.getCurrentPosition(), 0);

			// Clear history
			const clearAction = instantiationService.createInstance(ClearSelectionHistoryAction);
			// Mock dialog to confirm
			const dialogService = instantiationService.get(IDialogService);
			if (dialogService && hasKey(dialogService, { confirm: true })) {
				(dialogService as { confirm: (options: unknown) => Promise<{ confirmed: boolean }> }).confirm = async () => ({ confirmed: true });
			}
			await clearAction.run(instantiationService);

			// History should be cleared
			assert.strictEqual(service.getHistory().length, 0);
		});
	});

	suite('Cross-File Navigation', () => {
		test('navigate between entries in different files', async () => {
			const service = createService();
			const file1 = URI.file('/test/file1.ts');
			const file2 = URI.file('/test/file2.ts');
			await fileService.writeFile(file1, VSBuffer.fromString('content 1'));
			await fileService.writeFile(file2, VSBuffer.fromString('content 2'));

			const entry1 = createEntry({ id: '1', fileUri: file1.toString() });
			const entry2 = createEntry({ id: '2', fileUri: file2.toString() });
			service.addEntry(entry1);
			service.addEntry(entry2);

			// Navigate to previous (should switch files)
			service.setCurrentPosition(0);
			const previousAction = instantiationService.createInstance(GoToPreviousSelectionAction);

			let openEditorCalled = false;
			let openedFile: URI | undefined;
			const editorService = instantiationService.get(IEditorService);
			if (editorService && hasKey(editorService, { openEditor: true })) {
				(editorService as { openEditor: (input: { resource: URI }) => Promise<unknown> }).openEditor = async (input: { resource: URI }) => {
					openEditorCalled = true;
					openedFile = input.resource;
					return undefined;
				};
			}

			await previousAction.run(instantiationService);

			assert.ok(openEditorCalled);
			assert.ok(openedFile);
			assert.strictEqual(openedFile.toString(), file1.toString());
		});
	});

	suite('History Persistence', () => {
		test('history persists across service recreation', async () => {
			const service1 = createService();
			const testFile = URI.file('/test/file.ts');
			await fileService.writeFile(testFile, VSBuffer.fromString('content'));

			const entry1 = createEntry({ id: '1', fileUri: testFile.toString() });
			const entry2 = createEntry({ id: '2', fileUri: testFile.toString() });
			service1.addEntry(entry1);
			service1.addEntry(entry2);
			service1.dispose();

			// Create new service
			const service2 = createService();
			const history = service2.getHistory();

			// History should be loaded from storage
			assert.strictEqual(history.length, 2);
			assert.strictEqual(history[0].id, '2'); // Newest first
		});

		test('invalid entries are removed on load', async () => {
			// Store invalid data
			const invalidData = {
				version: 1,
				entries: [
					createEntry({ id: '1', fileUri: 'file:///non-existent.ts' }), // Invalid
					createEntry({ id: '2', fileUri: 'untitled:test' }) // Invalid (untitled)
				]
			};
			storageService.store('workbench.selectionHistory.entries', JSON.stringify(invalidData), StorageScope.WORKSPACE);

			const service = createService();
			await service.validateEntries();

			const history = service.getHistory();
			// Invalid entries should be removed
			assert.strictEqual(history.length, 0);
		});
	});

	suite('Quick Access Panel Integration', () => {
		test('Quick Access provider shows history entries', async () => {
			const service = createService();
			const testFile = URI.file('/test/file.ts');
			await fileService.writeFile(testFile, VSBuffer.fromString('content'));

			const entry = createEntry({ id: '1', fileUri: testFile.toString() });
			service.addEntry(entry);

			const provider = instantiationService.createInstance(SelectionHistoryQuickAccessProvider);
			const token = new (await import('../../../../../../base/common/cancellation.js')).CancellationTokenSource().token;
			const picks = await provider['_getPicks']('', new DisposableStore(), token);

			assert.ok(Array.isArray(picks));
			assert.ok(picks.length > 0);
		});

		test('Quick Access filtering works', async () => {
			const service = createService();
			const file1 = URI.file('/test/file1.ts');
			const file2 = URI.file('/test/file2.ts');
			await fileService.writeFile(file1, VSBuffer.fromString('content 1'));
			await fileService.writeFile(file2, VSBuffer.fromString('content 2'));

			const entry1 = createEntry({ id: '1', fileUri: file1.toString(), text: 'function test' });
			const entry2 = createEntry({ id: '2', fileUri: file2.toString(), text: 'const value' });
			service.addEntry(entry1);
			service.addEntry(entry2);

			const provider = instantiationService.createInstance(SelectionHistoryQuickAccessProvider);
			const token = new (await import('../../../../../../base/common/cancellation.js')).CancellationTokenSource().token;
			const picks = await provider['_getPicks']('file1', new DisposableStore(), token);

			assert.ok(Array.isArray(picks));
			const matchingPicks = picks.filter(p => p.entry && p.entry.id === '1');
			assert.strictEqual(matchingPicks.length, 1);
		});
	});

	suite('Service Integration', () => {
		test('service integrates with storage service', () => {
			const service = createService();
			const entry = createEntry();
			service.addEntry(entry);

			// Verify storage
			const stored = storageService.get('workbench.selectionHistory.entries', StorageScope.WORKSPACE, '');
			assert.ok(stored);
			const data = JSON.parse(stored);
			assert.strictEqual(data.version, 1);
			assert.strictEqual(data.entries.length, 1);
		});

		test('service integrates with file service for validation', async () => {
			const service = createService();
			const testFile = URI.file('/test/file.ts');
			await fileService.writeFile(testFile, VSBuffer.fromString('content'));

			const entry = createEntry({ id: '1', fileUri: testFile.toString() });
			service.addEntry(entry);

			// Validate entries
			await service.validateEntries();
			const history = service.getHistory();
			assert.strictEqual(history.length, 1); // Entry should still be valid
		});
	});
});

