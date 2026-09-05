/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { NotebookProviderInfoStore, registerProviderData } from '../../browser/services/notebookServiceImpl.js';
import { INotebookEditorModelResolverService } from '../../common/notebookEditorModelResolverService.js';
import { NotebookProviderInfo } from '../../common/notebookProvider.js';
import { NotebookExtensionDescription } from '../../common/notebookCommon.js';
import { SimpleNotebookProviderInfo } from '../../common/notebookService.js';
import { EditorResolverService } from '../../../../services/editor/browser/editorResolverService.js';
import { RegisteredEditorPriority } from '../../../../services/editor/common/editorResolverService.js';
import { IExtensionService, nullExtensionDescription } from '../../../../services/extensions/common/extensions.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';

suite('NotebookProviderInfoStore', function () {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite() as Pick<DisposableStore, 'add'>;

	test('Can\'t open untitled notebooks in test #119363', function () {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const store = new NotebookProviderInfoStore(
			new class extends mock<IStorageService>() {
				override get() { return ''; }
				override store() { }
				override getObject() { return {}; }
			},
			new class extends mock<IExtensionService>() {
				override onDidRegisterExtensions = Event.None;
			},
			disposables.add(instantiationService.createInstance(EditorResolverService)),
			new TestConfigurationService(),
			new class extends mock<IAccessibilityService>() {
				override onDidChangeScreenReaderOptimized: Event<void> = Event.None;
			},
			instantiationService,
			new class extends mock<IFileService>() {
				override hasProvider() { return true; }
			},
			new class extends mock<INotebookEditorModelResolverService>() { },
			new class extends mock<IUriIdentityService>() { }
		);
		disposables.add(store);

		const fooInfo = new NotebookProviderInfo({
			extension: nullExtensionDescription.identifier,
			id: 'foo',
			displayName: 'foo',
			selectors: [{ filenamePattern: '*.foo' }],
			priority: RegisteredEditorPriority.default,
			providerDisplayName: 'foo',
		});
		const barInfo = new NotebookProviderInfo({
			extension: nullExtensionDescription.identifier,
			id: 'bar',
			displayName: 'bar',
			selectors: [{ filenamePattern: '*.bar' }],
			priority: RegisteredEditorPriority.default,
			providerDisplayName: 'bar',
		});

		store.add(fooInfo);
		store.add(barInfo);

		assert.ok(store.get('foo'));
		assert.ok(store.get('bar'));
		assert.ok(!store.get('barfoo'));

		let providers = store.getContributedNotebook(URI.parse('file:///test/nb.foo'));
		assert.strictEqual(providers.length, 1);
		assert.strictEqual(providers[0] === fooInfo, true);

		providers = store.getContributedNotebook(URI.parse('file:///test/nb.bar'));
		assert.strictEqual(providers.length, 1);
		assert.strictEqual(providers[0] === barInfo, true);

		providers = store.getContributedNotebook(URI.parse('untitled:///Untitled-1'));
		assert.strictEqual(providers.length, 2);
		assert.strictEqual(providers[0] === fooInfo, true);
		assert.strictEqual(providers[1] === barInfo, true);

		providers = store.getContributedNotebook(URI.parse('untitled:///test/nb.bar'));
		assert.strictEqual(providers.length, 1);
		assert.strictEqual(providers[0] === barInfo, true);
	});

});

suite('NotebookService serializer registration', function () {
	ensureNoDisposablesAreLeakedInTestSuite();

	function providerInfo(extensionId: string) {
		return new SimpleNotebookProviderInfo(
			'sql-book',
			{
				options: {
					transientOutputs: false,
					transientCellMetadata: {},
					transientDocumentMetadata: {},
					cellContentMetadata: {}
				},
				dataToNotebook: async () => { throw new Error('not implemented'); },
				notebookToData: async () => { throw new Error('not implemented'); },
				save: async () => { throw new Error('not implemented'); },
				searchInNotebooks: async () => { return { results: [], limitHit: false }; }
			},
			{ id: { value: extensionId } } as NotebookExtensionDescription
		);
	}

	test('re-registering a serializer replaces the stale one instead of failing', function () {

		// https://github.com/microsoft/vscode/issues/174051 - after an extension
		// host restart the extension registers again while the old registration
		// may not have been cleaned up. The new registration must win.
		const providers = new Map<string, SimpleNotebookProviderInfo>();
		const added: string[] = [];
		const removed: string[] = [];

		const first = registerProviderData('sql-book', providerInfo('ext.a'), providers, viewType => added.push(viewType), viewType => removed.push(viewType));
		assert.strictEqual(added.length, 1);

		const second = registerProviderData('sql-book', providerInfo('ext.b'), providers, viewType => added.push(viewType), viewType => removed.push(viewType));
		assert.strictEqual(second.replacedExtensionId, 'ext.a', 'the replacement must be reported');
		assert.strictEqual(providers.get('sql-book')?.extensionData.id.value, 'ext.b', 'the fresh registration must be in effect');

		first.disposable.dispose(); // stale registration disposes late, must NOT remove the fresh entry
		assert.ok(providers.has('sql-book'), 'stale disposal must not remove the fresh registration');

		second.disposable.dispose(); // disposing the fresh registration removes it
		assert.ok(!providers.has('sql-book'));
		assert.deepStrictEqual(added, ['sql-book', 'sql-book']);
		assert.deepStrictEqual(removed, ['sql-book']);
	});
});
