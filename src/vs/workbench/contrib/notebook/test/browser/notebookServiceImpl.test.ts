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

	test('Virtual scheme URIs should be supported for notebook diffs #242097', function () {
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

		const ipynbInfo = new NotebookProviderInfo({
			extension: nullExtensionDescription.identifier,
			id: 'jupyter-notebook',
			displayName: 'Jupyter Notebook',
			selectors: [{ filenamePattern: '*.ipynb' }],
			priority: RegisteredEditorPriority.default,
			providerDisplayName: 'Jupyter',
		});

		store.add(ipynbInfo);

		// Test that git scheme URIs are recognized for timeline diffs
		let providers = store.getContributedNotebook(URI.parse('git:/test/notebook.ipynb?%7B%22path%22%3A%22%2Ftest%2Fnotebook.ipynb%22%2C%22ref%22%3A%22HEAD%22%7D'));
		assert.strictEqual(providers.length, 1);
		assert.strictEqual(providers[0] === ipynbInfo, true);

		// Test that vscode-local-history scheme URIs are also recognized
		providers = store.getContributedNotebook(URI.parse('vscode-local-history:/test/notebook.ipynb'));
		assert.strictEqual(providers.length, 1);
		assert.strictEqual(providers[0] === ipynbInfo, true);
	});

});
