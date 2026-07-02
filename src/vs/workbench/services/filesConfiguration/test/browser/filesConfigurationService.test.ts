/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestFilesConfigurationService, TestServiceAccessor, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';

suite('FilesConfigurationService', () => {

	const disposables = new DisposableStore();
	let service: TestFilesConfigurationService;
	let accessor: TestServiceAccessor;

	setup(() => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		accessor = instantiationService.createInstance(TestServiceAccessor);
		service = accessor.filesConfigurationService;
	});

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('updateReadonly with single resource fires onDidChangeReadonly once', async () => {
		const resource = URI.file('/test/file.txt');
		let eventCount = 0;
		disposables.add(service.onDidChangeReadonly(() => eventCount++));

		await service.updateReadonly(resource, true);

		assert.strictEqual(eventCount, 1);
		assert.strictEqual(!!service.isReadonly(resource), true);
	});

	test('updateReadonly with array of resources fires onDidChangeReadonly once', async () => {
		const resources = [
			URI.file('/test/file1.txt'),
			URI.file('/test/file2.txt'),
			URI.file('/test/file3.txt'),
		];
		let eventCount = 0;
		disposables.add(service.onDidChangeReadonly(() => eventCount++));

		await service.updateReadonly(resources, true);

		assert.strictEqual(eventCount, 1);
		for (const resource of resources) {
			assert.strictEqual(!!service.isReadonly(resource), true);
		}
	});

	test('updateReadonly with empty array does not fire onDidChangeReadonly', async () => {
		let eventCount = 0;
		disposables.add(service.onDidChangeReadonly(() => eventCount++));

		await service.updateReadonly([], true);

		assert.strictEqual(eventCount, 0);
	});

	test('updateReadonly with array supports reset', async () => {
		const resources = [
			URI.file('/test/file1.txt'),
			URI.file('/test/file2.txt'),
		];

		await service.updateReadonly(resources, true);
		for (const resource of resources) {
			assert.strictEqual(!!service.isReadonly(resource), true);
		}

		await service.updateReadonly(resources, 'reset');
		for (const resource of resources) {
			assert.strictEqual(service.isReadonly(resource), false);
		}
	});

	test('multiple single updateReadonly calls fire onDidChangeReadonly multiple times', async () => {
		const resources = [
			URI.file('/test/file1.txt'),
			URI.file('/test/file2.txt'),
			URI.file('/test/file3.txt'),
		];
		let eventCount = 0;
		disposables.add(service.onDidChangeReadonly(() => eventCount++));

		for (const resource of resources) {
			await service.updateReadonly(resource, true);
		}

		assert.strictEqual(eventCount, 3);
	});

	test('updateReadonly ignores resources without a file system provider', async () => {
		const resource = URI.parse('test://authority/file.txt');
		let eventCount = 0;
		disposables.add(service.onDidChangeReadonly(() => eventCount++));

		await service.updateReadonly(resource, true);

		assert.strictEqual(eventCount, 0);
		assert.strictEqual(service.isReadonly(resource), false);
	});

	test('updateReadonly ignores readonly file system providers', async () => {
		const provider = disposables.add(new InMemoryFileSystemProvider());
		provider.setReadOnly(true);
		disposables.add(accessor.fileService.registerProvider('readonly', provider));

		const resource = URI.parse('readonly://authority/file.txt');
		let eventCount = 0;
		disposables.add(service.onDidChangeReadonly(() => eventCount++));

		await service.updateReadonly(resource, false);

		assert.strictEqual(eventCount, 0);
		assert.ok(service.isReadonly(resource));
	});
});
