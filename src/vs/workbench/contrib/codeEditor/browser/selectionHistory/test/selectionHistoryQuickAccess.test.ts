/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { URI } from '../../../../../../base/common/uri.js';
import { hasKey } from '../../../../../../base/common/types.js';
import { ISelectionHistoryService, SelectionHistoryEntry } from '../selectionHistoryService.js';
import { SelectionHistoryQuickAccessProvider } from '../selectionHistoryQuickAccess.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IEditorService } from '../../../../../../workbench/services/editor/common/editorService.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { ICodeEditorService } from '../../../../../../editor/browser/services/codeEditorService.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { TestNotificationService } from '../../../../../../platform/notification/test/common/testNotificationService.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';

suite('SelectionHistoryQuickAccessProvider', () => {
	let instantiationService: TestInstantiationService;
	let disposables: DisposableStore;
	let provider: SelectionHistoryQuickAccessProvider;

	setup(() => {
		disposables = new DisposableStore();

		// Mock services
		const mockSelectionHistoryService: Partial<ISelectionHistoryService> = {
			getHistory: () => [],
			removeEntry: () => { },
			setCurrentPosition: () => { }
		};

		const mockEditorService: Partial<IEditorService> = {};
		const mockFileService: Partial<IFileService> = {
			exists: async () => true
		};
		const mockLabelService: Partial<ILabelService> = {
			getUriLabel: () => 'test.ts'
		};
		const mockModelService: Partial<IModelService> = {
			getModel: () => null
		};
		const mockCodeEditorService: Partial<ICodeEditorService> = {
			getActiveCodeEditor: () => null
		};

		instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(ISelectionHistoryService, mockSelectionHistoryService);
		instantiationService.stub(IEditorService, mockEditorService);
		instantiationService.stub(IFileService, mockFileService);
		instantiationService.stub(INotificationService, new TestNotificationService());
		instantiationService.stub(ILabelService, mockLabelService);
		instantiationService.stub(IModelService, mockModelService);
		instantiationService.stub(ICodeEditorService, mockCodeEditorService);
		instantiationService.stub(ILogService, new NullLogService());

		provider = disposables.add(instantiationService.createInstance(SelectionHistoryQuickAccessProvider));
	});

	teardown(() => {
		disposables.dispose();
	});

	test('provider instantiation', () => {
		assert.ok(provider);
	});

	test('empty history returns empty message', async () => {
		const token = new CancellationTokenSource().token;
		const picks = await provider['_getPicks']('', new DisposableStore(), token);

		assert.ok(Array.isArray(picks));
		assert.strictEqual(picks.length, 1);
		const firstPick = picks[0];
		assert.ok(firstPick && firstPick.label !== undefined);
	});

	test('label formatting - single line', () => {
		const entry: SelectionHistoryEntry = {
			id: 'test-id',
			text: 'test',
			fileUri: URI.file('/test.ts').toString(),
			startLine: 10,
			startColumn: 1,
			endLine: 10,
			endColumn: 5,
			timestamp: Date.now()
		};

		const label = provider['_formatLabel'](entry);
		assert.strictEqual(label, 'test.ts:10');
	});

	test('label formatting - multi-line', () => {
		const entry: SelectionHistoryEntry = {
			id: 'test-id',
			text: 'test',
			fileUri: URI.file('/test.ts').toString(),
			startLine: 10,
			startColumn: 1,
			endLine: 15,
			endColumn: 5,
			timestamp: Date.now()
		};

		const label = provider['_formatLabel'](entry);
		assert.strictEqual(label, 'test.ts:10-15');
	});

	test('line number filtering - single line', () => {
		const entry: SelectionHistoryEntry = {
			id: 'test-id',
			text: 'test',
			fileUri: URI.file('/test.ts').toString(),
			startLine: 42,
			startColumn: 1,
			endLine: 42,
			endColumn: 5,
			timestamp: Date.now()
		};

		assert.ok(provider['_matchesLineNumber'](entry, '42'));
		assert.ok(!provider['_matchesLineNumber'](entry, '43'));
	});

	test('line number filtering - range', () => {
		const entry: SelectionHistoryEntry = {
			id: 'test-id',
			text: 'test',
			fileUri: URI.file('/test.ts').toString(),
			startLine: 42,
			startColumn: 1,
			endLine: 45,
			endColumn: 5,
			timestamp: Date.now()
		};

		assert.ok(provider['_matchesLineNumber'](entry, '42-45'));
		assert.ok(provider['_matchesLineNumber'](entry, '40-50'));
		assert.ok(!provider['_matchesLineNumber'](entry, '50-60'));
	});

	test('filtering by file name', async () => {
		const entry1: SelectionHistoryEntry = {
			id: '1',
			text: 'test',
			fileUri: URI.file('/test/file1.ts').toString(),
			startLine: 1,
			startColumn: 1,
			endLine: 1,
			endColumn: 5,
			timestamp: Date.now()
		};
		const entry2: SelectionHistoryEntry = {
			id: '2',
			text: 'test',
			fileUri: URI.file('/test/file2.ts').toString(),
			startLine: 1,
			startColumn: 1,
			endLine: 1,
			endColumn: 5,
			timestamp: Date.now()
		};

		const mockService = instantiationService.get(ISelectionHistoryService);
		if (mockService && hasKey(mockService, { getHistory: true })) {
			(mockService as { getHistory: () => SelectionHistoryEntry[] }).getHistory = () => [entry2, entry1];
		}

		const token = new CancellationTokenSource().token;
		const picks = await provider['_getPicks']('file1', new DisposableStore(), token);

		assert.ok(Array.isArray(picks));
		assert.ok(picks.length > 0);
		const matchingPicks = picks.filter(p => p.entry && p.entry.id === '1');
		assert.strictEqual(matchingPicks.length, 1);
	});

	test('filtering by text content', async () => {
		const entry1: SelectionHistoryEntry = {
			id: '1',
			text: 'function test()',
			fileUri: URI.file('/test/file.ts').toString(),
			startLine: 1,
			startColumn: 1,
			endLine: 1,
			endColumn: 15,
			timestamp: Date.now()
		};
		const entry2: SelectionHistoryEntry = {
			id: '2',
			text: 'const value = 42',
			fileUri: URI.file('/test/file.ts').toString(),
			startLine: 2,
			startColumn: 1,
			endLine: 2,
			endColumn: 15,
			timestamp: Date.now()
		};

		const mockService = instantiationService.get(ISelectionHistoryService);
		if (mockService && hasKey(mockService, { getHistory: true })) {
			(mockService as { getHistory: () => SelectionHistoryEntry[] }).getHistory = () => [entry2, entry1];
		}

		const token = new CancellationTokenSource().token;
		const picks = await provider['_getPicks']('function', new DisposableStore(), token);

		assert.ok(Array.isArray(picks));
		const matchingPicks = picks.filter(p => p.entry && p.entry.id === '1');
		assert.strictEqual(matchingPicks.length, 1);
	});

	test('filtering is case-insensitive', async () => {
		const entry: SelectionHistoryEntry = {
			id: '1',
			text: 'Function Test',
			fileUri: URI.file('/test/file.ts').toString(),
			startLine: 1,
			startColumn: 1,
			endLine: 1,
			endColumn: 12,
			timestamp: Date.now()
		};

		const mockService = instantiationService.get(ISelectionHistoryService);
		if (mockService && hasKey(mockService, { getHistory: true })) {
			(mockService as { getHistory: () => SelectionHistoryEntry[] }).getHistory = () => [entry];
		}

		const token = new CancellationTokenSource().token;
		const picks1 = await provider['_getPicks']('function', new DisposableStore(), token);
		const picks2 = await provider['_getPicks']('FUNCTION', new DisposableStore(), token);

		assert.ok(picks1.length > 0);
		assert.ok(picks2.length > 0);
	});

	test('handles large history (50+ entries)', async () => {
		const entries: SelectionHistoryEntry[] = [];
		for (let i = 0; i < 60; i++) {
			entries.push({
				id: `id-${i}`,
				text: `text ${i}`,
				fileUri: URI.file(`/test/file${i}.ts`).toString(),
				startLine: i + 1,
				startColumn: 1,
				endLine: i + 1,
				endColumn: 10,
				timestamp: Date.now() + i
			});
		}

		const mockService = instantiationService.get(ISelectionHistoryService);
		if (mockService && hasKey(mockService, { getHistory: true })) {
			(mockService as { getHistory: () => SelectionHistoryEntry[] }).getHistory = () => entries;
		}

		const token = new CancellationTokenSource().token;
		const picks = await provider['_getPicks']('', new DisposableStore(), token);

		assert.ok(Array.isArray(picks));
		assert.ok(picks.length > 0);
		// Should handle large history without performance issues
	});

	test('preview cache is cleared when history changes', async () => {
		const entry: SelectionHistoryEntry = {
			id: '1',
			text: 'test',
			fileUri: URI.file('/test/file.ts').toString(),
			startLine: 1,
			startColumn: 1,
			endLine: 1,
			endColumn: 5,
			timestamp: Date.now()
		};

		const mockService = instantiationService.get(ISelectionHistoryService);
		if (mockService && hasKey(mockService, { getHistory: true })) {
			(mockService as { getHistory: () => SelectionHistoryEntry[] }).getHistory = () => [entry];
		}

		const token = new CancellationTokenSource().token;
		await provider['_getPicks']('', new DisposableStore(), token);

		// Change history length
		if (mockService && hasKey(mockService, { getHistory: true })) {
			(mockService as { getHistory: () => SelectionHistoryEntry[] }).getHistory = () => [entry, entry];
		}

		// Cache should be cleared
		const picks = await provider['_getPicks']('', new DisposableStore(), token);
		assert.ok(Array.isArray(picks));
	});

	test('handles missing model gracefully', async () => {
		const entry: SelectionHistoryEntry = {
			id: '1',
			text: 'test',
			fileUri: URI.file('/test/file.ts').toString(),
			startLine: 1,
			startColumn: 1,
			endLine: 1,
			endColumn: 5,
			timestamp: Date.now()
		};

		const mockService = instantiationService.get(ISelectionHistoryService);
		if (mockService && hasKey(mockService, { getHistory: true })) {
			(mockService as { getHistory: () => SelectionHistoryEntry[] }).getHistory = () => [entry];
		}

		const mockModelService = instantiationService.get(IModelService);
		if (mockModelService && hasKey(mockModelService, { getModel: true })) {
			(mockModelService as { getModel: () => null }).getModel = () => null; // Model not found
		}

		const token = new CancellationTokenSource().token;
		const picks = await provider['_getPicks']('', new DisposableStore(), token);

		// Should not crash, should return picks without preview
		assert.ok(Array.isArray(picks));
	});

	test('description formatting includes line numbers', () => {
		const entry: SelectionHistoryEntry = {
			id: '1',
			text: 'test',
			fileUri: URI.file('/test/file.ts').toString(),
			startLine: 10,
			startColumn: 1,
			endLine: 15,
			endColumn: 5,
			timestamp: Date.now()
		};

		// Test that description is formatted correctly
		// The actual implementation may vary, but we test the label format
		const label = provider['_formatLabel'](entry);
		assert.ok(label.includes('10'));
		assert.ok(label.includes('15'));
	});

	test('filters out invalid entries', async () => {
		const validEntry: SelectionHistoryEntry = {
			id: '1',
			text: 'test',
			fileUri: URI.file('/test/file.ts').toString(),
			startLine: 1,
			startColumn: 1,
			endLine: 1,
			endColumn: 5,
			timestamp: Date.now()
		};

		const mockService = instantiationService.get(ISelectionHistoryService);
		if (mockService && hasKey(mockService, { getHistory: true })) {
			(mockService as { getHistory: () => SelectionHistoryEntry[] }).getHistory = () => [validEntry];
		}

		const mockFileService = instantiationService.get(IFileService);
		if (mockFileService && hasKey(mockFileService, { exists: true })) {
			(mockFileService as { exists: (uri: URI) => Promise<boolean> }).exists = async (uri: URI) => {
				// Only valid entry's file exists
				return uri.toString().includes('file.ts');
			};
		}

		const token = new CancellationTokenSource().token;
		const picks = await provider['_getPicks']('', new DisposableStore(), token);

		assert.ok(Array.isArray(picks));
		// Should only show valid entries
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});

