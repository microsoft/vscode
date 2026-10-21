/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite, toResource } from '../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ResourceContextKey } from '../../common/contextkeys.js';
import { workbenchInstantiationService } from './workbenchTestServices.js';

suite('ResourceContextKey', () => {

	const disposables = new DisposableStore();
	let contextKeyService: ContextKeyService;
	let instantiationService: TestInstantiationService;

	setup(() => {
		instantiationService = workbenchInstantiationService(undefined, disposables);
		// A real service: instances must share the same underlying keys
		contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		instantiationService.stub(IContextKeyService, contextKeyService);
	});

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('set rewrites the keys after another instance changed them', function () {
		const first = disposables.add(instantiationService.createInstance(ResourceContextKey));
		const second = disposables.add(instantiationService.createInstance(ResourceContextKey));
		const resource = toResource.call(this, '/folder/file.txt');

		first.set(resource);
		assert.strictEqual(contextKeyService.getContextKeyValue('resource'), resource.toString());

		second.reset();
		second.set(null);
		assert.strictEqual(contextKeyService.getContextKeyValue('resourceScheme'), undefined);

		first.set(resource);
		assert.strictEqual(contextKeyService.getContextKeyValue('resource'), resource.toString());
		assert.strictEqual(contextKeyService.getContextKeyValue('resourceScheme'), resource.scheme);
		assert.strictEqual(contextKeyService.getContextKeyValue('resourcePath'), resource.fsPath);
	});

	test('set skips the write when the keys already hold the resource', function () {
		const key = disposables.add(instantiationService.createInstance(ResourceContextKey));
		const resource = toResource.call(this, '/folder/file.txt');
		key.set(resource);

		let changes = 0;
		disposables.add(contextKeyService.onDidChangeContext(() => changes++));
		key.set(resource);

		assert.strictEqual(changes, 0);
	});

	test('set clears derived keys another writer left behind', () => {
		const key = disposables.add(instantiationService.createInstance(ResourceContextKey));
		contextKeyService.createKey('resourceScheme', 'untitled');

		key.set(null);

		assert.strictEqual(contextKeyService.getContextKeyValue('resourceScheme'), null);
	});
});
