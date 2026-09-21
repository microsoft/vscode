/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestFilesConfigurationService, TestServiceAccessor, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';

suite('FilesConfigurationService', () => {

	const disposables = new DisposableStore();
	let service: TestFilesConfigurationService;

	setup(() => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		service = instantiationService.createInstance(TestServiceAccessor).filesConfigurationService;
	});

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('updateReadonly with a custom reason returns that reason', async () => {
		const resource = URI.file('/test/file.txt');
		const reason = new MarkdownString('Custom read-only reason');

		await service.updateReadonly(resource, reason);

		const readonly = service.isReadonly(resource);
		assert.strictEqual(typeof readonly === 'object' ? readonly.value : undefined, reason.value);
	});

	test('updateReadonly with true returns the default session reason', async () => {
		const resource = URI.file('/test/file.txt');
		const customReason = new MarkdownString('Custom read-only reason');

		await service.updateReadonly(resource, true);

		const readonly = service.isReadonly(resource);
		assert.ok(typeof readonly === 'object' && readonly.value && readonly.value !== customReason.value);
	});

	test('updateReadonly reset clears a custom reason', async () => {
		const resource = URI.file('/test/file.txt');

		await service.updateReadonly(resource, new MarkdownString('Custom read-only reason'));
		await service.updateReadonly(resource, 'reset');

		assert.strictEqual(service.isReadonly(resource), false);
	});

	test('updateReadonly with an array applies a custom reason to every resource', async () => {
		const resources = [
			URI.file('/test/file1.txt'),
			URI.file('/test/file2.txt'),
		];
		const reason = new MarkdownString('Custom read-only reason');

		await service.updateReadonly(resources, reason);

		assert.deepStrictEqual(resources.map(resource => {
			const readonly = service.isReadonly(resource);
			return typeof readonly === 'object' ? readonly.value : undefined;
		}), [reason.value, reason.value]);
	});

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
});
