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
import { NotebookProviderInfoStore } from '../../browser/services/notebookServiceImpl.js';
import { INotebookEditorModelResolverService } from '../../common/notebookEditorModelResolverService.js';
import { NotebookProviderInfo } from '../../common/notebookProvider.js';
import { registerBuiltinNotebookType } from '../../common/notebookTypeRegistry.js';
import { EditorResolverService } from '../../../../services/editor/browser/editorResolverService.js';
import { RegisteredEditorPriority } from '../../../../services/editor/common/editorResolverService.js';
import { IExtensionService, nullExtensionDescription } from '../../../../services/extensions/common/extensions.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';

suite('NotebookProviderInfoStore', function () {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite() as Pick<DisposableStore, 'add'>;

	function createStore(memento: { editors?: NotebookProviderInfo[] } = {}): NotebookProviderInfoStore {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		return disposables.add(new NotebookProviderInfoStore(
			new class extends mock<IStorageService>() {
				override get() { return ''; }
				override store() { }
				override getObject() { return memento; }
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
		));
	}

	test('Can\'t open untitled notebooks in test #119363', function () {
		const store = createStore();

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

	test('declarative built-in notebook types take precedence over stale memento entries', function () {
		disposables.add(registerBuiltinNotebookType('test.builtinNotebook', {
			providerDisplayName: 'Built-in Notebook',
			displayName: 'Built-in Notebook',
			filenamePattern: ['*.builtinNotebook'],
			priority: RegisteredEditorPriority.builtin
		}));

		const store = createStore({
			editors: [new NotebookProviderInfo({
				id: 'test.builtinNotebook',
				displayName: 'Stale Notebook',
				providerDisplayName: 'Stale Notebook',
				priority: RegisteredEditorPriority.default,
				selectors: [{ filenamePattern: '*.staleNotebook' }]
			})]
		});
		const info = store.get('test.builtinNotebook');

		assert.deepStrictEqual({
			id: info?.id,
			displayName: info?.displayName,
			providerDisplayName: info?.providerDisplayName,
			priority: info?.priority,
			selectors: info?.selectors
		}, {
			id: 'test.builtinNotebook',
			displayName: 'Built-in Notebook',
			providerDisplayName: 'Built-in Notebook',
			priority: RegisteredEditorPriority.builtin,
			selectors: ['*.builtinNotebook']
		});
	});

});
