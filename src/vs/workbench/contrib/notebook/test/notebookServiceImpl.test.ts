/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { mock } from 'vs/base/test/common/mock';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { NotebookProviderInfoStore } from 'vs/workbench/contrib/notebook/browser/notebookServiceImpl';
import { NotebookEditorPriority } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { NotebookProviderInfo } from 'vs/workbench/contrib/notebook/common/notebookProvider';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';

suite('NotebookProviderInfoStore', function () {

	test('Can\'t open untitled notebooks in test #119363', function () {

		const store = new NotebookProviderInfoStore(
			new class extends mock<IStorageService>() {
				override get() { return ''; }
				override store() { }
			},
			new class extends mock<IExtensionService>() {
				override onDidRegisterExtensions = Event.None;
			}
		);

		const fooInfo = new NotebookProviderInfo({
			id: 'foo',
			displayName: 'foo',
			selectors: [{ filenamePattern: '*.foo' }],
			priority: NotebookEditorPriority.default,
			dynamicContribution: false,
			exclusive: false,
			providerDisplayName: 'foo',
			providerExtensionLocation: null!
		});
		const barInfo = new NotebookProviderInfo({
			id: 'bar',
			displayName: 'bar',
			selectors: [{ filenamePattern: '*.bar' }],
			priority: NotebookEditorPriority.default,
			dynamicContribution: false,
			exclusive: false,
			providerDisplayName: 'bar',
			providerExtensionLocation: null!
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
