/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from 'vs/base/common/uri';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { workbenchInstantiationService, TestServiceAccessor } from 'vs/workbench/test/browser/workbenchTestServices';
import { FileWorkingCopyManager, IFileWorkingCopyManager } from 'vs/workbench/services/workingCopy/common/fileWorkingCopyManager';
import { IFileWorkingCopy, IFileWorkingCopyModel } from 'vs/workbench/services/workingCopy/common/fileWorkingCopy';
import { bufferToStream, VSBuffer } from 'vs/base/common/buffer';
import { FileChangesEvent, FileChangeType } from 'vs/platform/files/common/files';
import { timeout } from 'vs/base/common/async';
import { TestFileWorkingCopyModel, TestFileWorkingCopyModelFactory } from 'vs/workbench/services/workingCopy/test/browser/fileWorkingCopy.test';

suite('FileWorkingCopyManager', () => {

	let instantiationService: IInstantiationService;
	let accessor: TestServiceAccessor;

	let manager: IFileWorkingCopyManager<TestFileWorkingCopyModel>;

	setup(() => {
		instantiationService = workbenchInstantiationService();
		accessor = instantiationService.createInstance(TestServiceAccessor);

		const factory = new TestFileWorkingCopyModelFactory();
		manager = new FileWorkingCopyManager<TestFileWorkingCopyModel>(factory, accessor.fileService, accessor.lifecycleService, accessor.labelService, instantiationService, accessor.logService);
	});

	teardown(() => {
		manager.dispose();
	});

	test('resolve', async () => {
		const resource = URI.file('/test.html');

		const events: IFileWorkingCopy<IFileWorkingCopyModel>[] = [];
		const listener = manager.onDidCreate(workingCopy => {
			events.push(workingCopy);
		});

		const resolvePromise = manager.resolve(resource);
		assert.ok(manager.get(resource)); // working copy known even before resolved()

		const workingCopy1 = await resolvePromise;
		assert.ok(workingCopy1);
		assert.ok(workingCopy1.model);
		assert.strictEqual(manager.get(resource), workingCopy1);

		const workingCopy2 = await manager.resolve(resource);
		assert.strictEqual(workingCopy2, workingCopy1);
		workingCopy1.dispose();

		const workingCopy3 = await manager.resolve(resource);
		assert.notStrictEqual(workingCopy3, workingCopy2);
		assert.strictEqual(manager.get(resource), workingCopy3);
		workingCopy3.dispose();

		assert.strictEqual(events.length, 2);
		assert.strictEqual(events[0].resource.toString(), workingCopy1.resource.toString());
		assert.strictEqual(events[1].resource.toString(), workingCopy2.resource.toString());

		listener.dispose();

		workingCopy1.dispose();
		workingCopy2.dispose();
		workingCopy3.dispose();
	});

	test('resolve with initial contents', async () => {
		const resource = URI.file('/test.html');

		const workingCopy = await manager.resolve(resource, { contents: bufferToStream(VSBuffer.fromString('Hello World')) });
		assert.strictEqual(workingCopy.model?.contents, 'Hello World');
		assert.strictEqual(workingCopy.isDirty(), true);

		await manager.resolve(resource, { contents: bufferToStream(VSBuffer.fromString('More Changes')) });
		assert.strictEqual(workingCopy.model?.contents, 'More Changes');
		assert.strictEqual(workingCopy.isDirty(), true);

		workingCopy.dispose();
	});

	test('multiple resolves execute in sequence', async () => {
		const resource = URI.file('/test.html');

		const firstPromise = manager.resolve(resource);
		const secondPromise = manager.resolve(resource, { contents: bufferToStream(VSBuffer.fromString('Hello World')) });
		const thirdPromise = manager.resolve(resource, { contents: bufferToStream(VSBuffer.fromString('More Changes')) });

		await firstPromise;
		await secondPromise;
		const workingCopy = await thirdPromise;

		assert.strictEqual(workingCopy.model?.contents, 'More Changes');
		assert.strictEqual(workingCopy.isDirty(), true);

		workingCopy.dispose();
	});

	test('removed from cache when working copy or model gets disposed', async () => {
		const resource = URI.file('/test.html');

		let workingCopy = await manager.resolve(resource, { contents: bufferToStream(VSBuffer.fromString('Hello World')) });

		assert.strictEqual(manager.get(URI.file('/test.html')), workingCopy);

		workingCopy.dispose();
		assert(!manager.get(URI.file('/test.html')));

		workingCopy = await manager.resolve(resource, { contents: bufferToStream(VSBuffer.fromString('Hello World')) });

		assert.strictEqual(manager.get(URI.file('/test.html')), workingCopy);

		workingCopy.model?.dispose();
		assert(!manager.get(URI.file('/test.html')));
	});

	test('events', async () => {
		const resource1 = URI.file('/path/index.txt');
		const resource2 = URI.file('/path/other.txt');

		let loadedCounter = 0;
		let gotDirtyCounter = 0;
		let gotNonDirtyCounter = 0;
		let revertedCounter = 0;
		let savedCounter = 0;

		manager.onDidResolve(workingCopy => {
			if (workingCopy.resource.toString() === resource1.toString()) {
				loadedCounter++;
			}
		});

		manager.onDidChangeDirty(workingCopy => {
			if (workingCopy.resource.toString() === resource1.toString()) {
				if (workingCopy.isDirty()) {
					gotDirtyCounter++;
				} else {
					gotNonDirtyCounter++;
				}
			}
		});

		manager.onDidRevert(workingCopy => {
			if (workingCopy.resource.toString() === resource1.toString()) {
				revertedCounter++;
			}
		});

		manager.onDidSave(({ workingCopy }) => {
			if (workingCopy.resource.toString() === resource1.toString()) {
				savedCounter++;
			}
		});

		const workingCopy1 = await manager.resolve(resource1);
		assert.strictEqual(loadedCounter, 1);

		accessor.fileService.fireFileChanges(new FileChangesEvent([{ resource: resource1, type: FileChangeType.DELETED }], false));
		accessor.fileService.fireFileChanges(new FileChangesEvent([{ resource: resource1, type: FileChangeType.ADDED }], false));

		const workingCopy2 = await manager.resolve(resource2);
		assert.strictEqual(loadedCounter, 2);

		workingCopy1.model?.updateContents('changed');

		await workingCopy1.revert();
		workingCopy1.model?.updateContents('changed again');

		await workingCopy1.save();
		workingCopy1.dispose();
		workingCopy2.dispose();

		await workingCopy1.revert();
		assert.strictEqual(gotDirtyCounter, 2);
		assert.strictEqual(gotNonDirtyCounter, 2);
		assert.strictEqual(revertedCounter, 1);
		assert.strictEqual(savedCounter, 1);

		workingCopy1.dispose();
		workingCopy2.dispose();
	});

	test('canDispose with dirty model', async function () {
		const resource = URI.file('/path/index_something.txt');

		const workingCopy = await manager.resolve(resource);
		workingCopy.model?.updateContents('make dirty');

		let canDisposePromise = manager.canDispose(workingCopy);
		assert.ok(canDisposePromise instanceof Promise);

		let canDispose = false;
		(async () => {
			canDispose = await canDisposePromise;
		})();

		assert.strictEqual(canDispose, false);
		workingCopy.revert({ soft: true });

		await timeout(0);

		assert.strictEqual(canDispose, true);

		let canDispose2 = manager.canDispose(workingCopy);
		assert.strictEqual(canDispose2, true);
	});
});
