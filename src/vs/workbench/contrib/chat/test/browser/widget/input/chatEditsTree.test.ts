/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../../base/common/uri.js';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../../platform/contextkey/browser/contextKeyService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../../platform/storage/common/storage.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { IChatCollapsibleListItem } from '../../../../browser/widget/chatContentParts/chatReferencesContentPart.js';
import { buildEditsList, buildEditsTree, ChatEditsListWidget, ChatEditsTreeIdentityProvider, IChatEditsFolderElement } from '../../../../browser/widget/input/chatEditsTree.js';
import { CHAT_EDITS_VIEW_MODE_STORAGE_KEY } from '../../../../browser/chatEditing/chatEditingActions.js';
import { ModifiedFileEntryState, IChatEditingSession } from '../../../../common/editing/chatEditingService.js';
import { Event } from '../../../../../../../base/common/event.js';

function makeFileItem(path: string, added = 0, removed = 0): IChatCollapsibleListItem {
	return {
		reference: URI.file(path),
		state: ModifiedFileEntryState.Modified,
		kind: 'reference',
		options: {
			status: undefined,
			diffMeta: { added, removed },
		}
	};
}

suite('ChatEditsTree', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('buildEditsList', () => {
		test('wraps items as flat tree elements', () => {
			const items = [
				makeFileItem('/src/a.ts'),
				makeFileItem('/src/b.ts'),
			];
			const result = buildEditsList(items);
			assert.strictEqual(result.length, 2);
			assert.strictEqual(result[0].children, undefined);
			assert.strictEqual(result[1].children, undefined);
		});

		test('returns empty array for empty input', () => {
			assert.deepStrictEqual(buildEditsList([]), []);
		});
	});

	suite('buildEditsTree', () => {
		test('groups files by directory', () => {
			const items = [
				makeFileItem('/project/src/a.ts'),
				makeFileItem('/project/src/b.ts'),
				makeFileItem('/project/lib/c.ts'),
			];
			const result = buildEditsTree(items);

			// Should have 2 folder elements
			assert.strictEqual(result.length, 2);

			const folders = result.map(r => r.element).filter((e): e is IChatEditsFolderElement => e.kind === 'folder');
			assert.strictEqual(folders.length, 2);

			// Each folder should have children
			for (const r of result) {
				assert.ok(r.children);
				assert.ok(r.collapsible);
			}
		});

		test('skips folder grouping for single file in single folder', () => {
			const items = [makeFileItem('/project/src/a.ts')];
			const result = buildEditsTree(items);

			// Single file should not be wrapped in a folder
			assert.strictEqual(result.length, 1);
			assert.notStrictEqual(result[0].element.kind, 'folder');
		});

		test('still groups when there are multiple folders even with single files', () => {
			const items = [
				makeFileItem('/project/src/a.ts'),
				makeFileItem('/project/lib/b.ts'),
			];
			const result = buildEditsTree(items);

			assert.strictEqual(result.length, 2);
			const folders = result.map(r => r.element).filter((e): e is IChatEditsFolderElement => e.kind === 'folder');
			assert.strictEqual(folders.length, 2);
		});

		test('handles items without URIs as top-level elements', () => {
			const warning: IChatCollapsibleListItem = {
				kind: 'warning',
				content: { value: 'Something went wrong' },
			};
			const items: IChatCollapsibleListItem[] = [
				warning,
				makeFileItem('/src/a.ts'),
			];
			const result = buildEditsTree(items);

			// Warning at top level + single file at root (common ancestor is /src/)
			assert.strictEqual(result.length, 2);
			assert.strictEqual(result[0].element.kind, 'warning');
			assert.strictEqual(result[1].element.kind, 'reference');
		});

		test('flattens files at common ancestor and shows subfolders', () => {
			const items = [
				makeFileItem('/project/root/hello.py'),
				makeFileItem('/project/root/README.md'),
				makeFileItem('/project/root/test.py'),
				makeFileItem('/project/root/js/test2.js'),
			];
			const result = buildEditsTree(items);

			// Common ancestor is /project/root/ — files there go to root level,
			// js/ becomes a folder node
			const rootFiles = result.filter(r => r.element.kind === 'reference');
			const folders = result.filter(r => r.element.kind === 'folder');
			assert.strictEqual(rootFiles.length, 3, 'three files at root level');
			assert.strictEqual(folders.length, 1, 'one subfolder');
			assert.strictEqual((folders[0].element as IChatEditsFolderElement).children.length, 1);

			// Folders should come before files (like search)
			const firstFolderIndex = result.findIndex(r => r.element.kind === 'folder');
			const firstFileIndex = result.findIndex(r => r.element.kind === 'reference');
			assert.ok(firstFolderIndex < firstFileIndex, 'folders should appear before files');
		});

		test('all files in same directory produces no folder row', () => {
			const items = [
				makeFileItem('/project/src/a.ts'),
				makeFileItem('/project/src/b.ts'),
				makeFileItem('/project/src/c.ts'),
			];
			const result = buildEditsTree(items);

			// All files in the same directory — common ancestor is /project/src/
			// No folder row needed
			assert.strictEqual(result.length, 3);
			assert.ok(result.every(r => r.element.kind === 'reference'));
		});
	});

	suite('ChatEditsTreeIdentityProvider', () => {
		test('provides stable IDs for folders', () => {
			const provider = new ChatEditsTreeIdentityProvider();
			const folder: IChatEditsFolderElement = {
				kind: 'folder',
				uri: URI.file('/src'),
				children: [],
			};
			const id = provider.getId(folder);
			assert.strictEqual(id, `folder:${URI.file('/src').toString()}`);
		});

		test('provides stable IDs for file references', () => {
			const provider = new ChatEditsTreeIdentityProvider();
			const item = makeFileItem('/src/a.ts');
			const id = provider.getId(item);
			assert.strictEqual(id, `file:${URI.file('/src/a.ts').toString()}`);
		});

		test('same element produces same ID', () => {
			const provider = new ChatEditsTreeIdentityProvider();
			const item1 = makeFileItem('/src/a.ts');
			const item2 = makeFileItem('/src/a.ts');
			assert.strictEqual(provider.getId(item1), provider.getId(item2));
		});

		test('different elements produce different IDs', () => {
			const provider = new ChatEditsTreeIdentityProvider();
			const item1 = makeFileItem('/src/a.ts');
			const item2 = makeFileItem('/src/b.ts');
			assert.notStrictEqual(provider.getId(item1), provider.getId(item2));
		});
	});

	suite('ChatEditsListWidget lifecycle', () => {
		let store: DisposableStore;
		let storageService: IStorageService;
		let widget: ChatEditsListWidget;

		setup(() => {
			store = new DisposableStore();
			const instaService = workbenchInstantiationService({
				contextKeyService: () => store.add(new ContextKeyService(new TestConfigurationService)),
			}, store);
			store.add(instaService);

			storageService = instaService.get(IStorageService);
			widget = store.add(instaService.createInstance(ChatEditsListWidget, Event.None));
		});

		teardown(() => {
			store.dispose();
		});

		test('storage listener fires after clear', () => {
			// Stub create to avoid DOM/widget side effects in tests
			let createCallCount = 0;
			const origCreate = widget.create.bind(widget);
			widget.create = (c, s) => {
				createCallCount++;
				// Update stored refs without actually building widgets
				(widget as unknown as { _currentContainer: HTMLElement | undefined })._currentContainer = c;
				(widget as unknown as { _currentSession: IChatEditingSession | null })._currentSession = s;
			};

			const container = document.createElement('div');
			widget.create(container, null);
			assert.strictEqual(createCallCount, 1);

			// Simulate session switch
			widget.clear();

			// Toggle view mode — storage listener must still fire after clear()
			createCallCount = 0;
			storageService.store(CHAT_EDITS_VIEW_MODE_STORAGE_KEY, 'tree', StorageScope.PROFILE, StorageTarget.USER);
			assert.strictEqual(createCallCount, 1, 'storage listener should trigger create after clear()');

			widget.create = origCreate;
		});

		test('currentSession is updated on rebuild', () => {
			// Stub create
			widget.create = (c, s) => {
				(widget as unknown as { _currentContainer: HTMLElement | undefined })._currentContainer = c;
				(widget as unknown as { _currentSession: IChatEditingSession | null })._currentSession = s;
			};

			const container = document.createElement('div');
			widget.create(container, null);
			assert.strictEqual(widget.currentSession, null);

			const mockSession = {} as IChatEditingSession;
			widget.rebuild(container, mockSession);
			assert.strictEqual(widget.currentSession, mockSession);
		});

		test('setEntries replays after view mode toggle', () => {
			// Stub create and track setEntries calls
			widget.create = (c, s) => {
				(widget as unknown as { _currentContainer: HTMLElement | undefined })._currentContainer = c;
				(widget as unknown as { _currentSession: IChatEditingSession | null })._currentSession = s;
			};

			const container = document.createElement('div');
			widget.create(container, null);

			const entries = [makeFileItem('/src/a.ts'), makeFileItem('/src/b.ts')];
			widget.setEntries(entries);

			const setEntriesCalls: readonly IChatCollapsibleListItem[][] = [];
			const origSetEntries = widget.setEntries.bind(widget);
			widget.setEntries = (e) => {
				(setEntriesCalls as IChatCollapsibleListItem[][]).push([...e]);
				origSetEntries(e);
			};

			// Toggle to tree mode — should replay entries
			storageService.store(CHAT_EDITS_VIEW_MODE_STORAGE_KEY, 'tree', StorageScope.PROFILE, StorageTarget.USER);
			assert.strictEqual(setEntriesCalls.length, 1, 'setEntries should have been replayed');
			assert.strictEqual(setEntriesCalls[0].length, 2, 'should have replayed the 2 entries');

			widget.setEntries = origSetEntries;
		});
	});
});
