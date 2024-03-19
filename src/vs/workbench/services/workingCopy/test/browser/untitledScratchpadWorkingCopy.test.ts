/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBufferReadableStream, VSBuffer, streamToBuffer, bufferToStream, readableToBuffer, VSBufferReadable } from 'vs/base/common/buffer';
import { CancellationToken } from 'vs/base/common/cancellation';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { basename } from 'vs/base/common/resources';
import { consumeReadable, consumeStream, isReadable, isReadableStream } from 'vs/base/common/stream';
import { URI } from 'vs/base/common/uri';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IUntitledFileWorkingCopyModelFactory, UntitledFileWorkingCopy } from 'vs/workbench/services/workingCopy/common/untitledFileWorkingCopy';
import { TestUntitledFileWorkingCopyModel } from 'vs/workbench/services/workingCopy/test/browser/untitledFileWorkingCopy.test';
import { TestServiceAccessor, workbenchInstantiationService } from 'vs/workbench/test/browser/workbenchTestServices';

export class TestUntitledFileWorkingCopyModelFactory implements IUntitledFileWorkingCopyModelFactory<TestUntitledFileWorkingCopyModel> {

	async createModel(resource: URI, contents: VSBufferReadableStream, token: CancellationToken): Promise<TestUntitledFileWorkingCopyModel> {
		return new TestUntitledFileWorkingCopyModel(resource, (await streamToBuffer(contents)).toString());
	}
}

suite('UntitledScratchpadWorkingCopy', () => {

	const factory = new TestUntitledFileWorkingCopyModelFactory();

	const disposables = new DisposableStore();
	const resource = URI.from({ scheme: Schemas.untitled, path: 'Untitled-1' });
	let instantiationService: IInstantiationService;
	let accessor: TestServiceAccessor;
	let workingCopy: UntitledFileWorkingCopy<TestUntitledFileWorkingCopyModel>;

	function createWorkingCopy(uri: URI = resource, hasAssociatedFilePath = false, initialValue = '') {
		return disposables.add(new UntitledFileWorkingCopy<TestUntitledFileWorkingCopyModel>(
			'testUntitledWorkingCopyType',
			uri,
			basename(uri),
			hasAssociatedFilePath,
			true,
			initialValue.length > 0 ? { value: bufferToStream(VSBuffer.fromString(initialValue)) } : undefined,
			factory,
			async workingCopy => { await workingCopy.revert(); return true; },
			accessor.workingCopyService,
			accessor.workingCopyBackupService,
			accessor.logService
		));
	}

	setup(() => {
		instantiationService = workbenchInstantiationService(undefined, disposables);
		accessor = instantiationService.createInstance(TestServiceAccessor);

		workingCopy = disposables.add(createWorkingCopy());
	});

	teardown(() => {
		disposables.clear();
	});

	test('registers with working copy service', async () => {
		assert.strictEqual(accessor.workingCopyService.workingCopies.length, 1);

		workingCopy.dispose();

		assert.strictEqual(accessor.workingCopyService.workingCopies.length, 0);
	});

	test('modified - not dirty', async () => {
		assert.strictEqual(workingCopy.isDirty(), false);

		let changeDirtyCounter = 0;
		disposables.add(workingCopy.onDidChangeDirty(() => {
			changeDirtyCounter++;
		}));

		let contentChangeCounter = 0;
		disposables.add(workingCopy.onDidChangeContent(() => {
			contentChangeCounter++;
		}));

		await workingCopy.resolve();
		assert.strictEqual(workingCopy.isResolved(), true);

		// Modified from: Model content change
		workingCopy.model?.updateContents('hello modified');
		assert.strictEqual(contentChangeCounter, 1);

		assert.strictEqual(workingCopy.isDirty(), false);
		assert.strictEqual(workingCopy.isModified(), true);
		assert.strictEqual(changeDirtyCounter, 0);

		await workingCopy.save();

		assert.strictEqual(workingCopy.isDirty(), false);
		assert.strictEqual(changeDirtyCounter, 0);
	});

	test('modified - cleared when content event signals isEmpty', async () => {
		assert.strictEqual(workingCopy.isModified(), false);

		await workingCopy.resolve();

		workingCopy.model?.updateContents('hello modified');

		assert.strictEqual(workingCopy.isModified(), true);

		workingCopy.model?.fireContentChangeEvent({ isInitial: true });

		assert.strictEqual(workingCopy.isModified(), false);
	});

	test('modified - not cleared when content event signals isEmpty when associated resource', async () => {
		workingCopy.dispose();
		workingCopy = createWorkingCopy(resource, true);

		await workingCopy.resolve();

		workingCopy.model?.updateContents('hello modified');
		assert.strictEqual(workingCopy.isModified(), true);

		workingCopy.model?.fireContentChangeEvent({ isInitial: true });

		assert.strictEqual(workingCopy.isModified(), true);
	});

	test('revert', async () => {
		let revertCounter = 0;
		disposables.add(workingCopy.onDidRevert(() => {
			revertCounter++;
		}));

		let disposeCounter = 0;
		disposables.add(workingCopy.onWillDispose(() => {
			disposeCounter++;
		}));

		await workingCopy.resolve();

		workingCopy.model?.updateContents('hello modified');
		assert.strictEqual(workingCopy.isModified(), true);

		await workingCopy.revert();

		assert.strictEqual(revertCounter, 1);
		assert.strictEqual(disposeCounter, 1);
		assert.strictEqual(workingCopy.isModified(), false);
	});

	test('dispose', async () => {
		let disposeCounter = 0;
		disposables.add(workingCopy.onWillDispose(() => {
			disposeCounter++;
		}));

		await workingCopy.resolve();
		workingCopy.dispose();

		assert.strictEqual(disposeCounter, 1);
	});

	test('backup', async () => {
		assert.strictEqual((await workingCopy.backup(CancellationToken.None)).content, undefined);

		await workingCopy.resolve();

		workingCopy.model?.updateContents('Hello Backup');
		const backup = await workingCopy.backup(CancellationToken.None);

		let backupContents: string | undefined = undefined;
		if (isReadableStream(backup.content)) {
			backupContents = (await consumeStream(backup.content, chunks => VSBuffer.concat(chunks))).toString();
		} else if (backup.content) {
			backupContents = consumeReadable(backup.content, chunks => VSBuffer.concat(chunks)).toString();
		}

		assert.strictEqual(backupContents, 'Hello Backup');
	});

	test('resolve - without contents', async () => {
		assert.strictEqual(workingCopy.isResolved(), false);
		assert.strictEqual(workingCopy.hasAssociatedFilePath, false);
		assert.strictEqual(workingCopy.model, undefined);

		await workingCopy.resolve();

		assert.strictEqual(workingCopy.isResolved(), true);
		assert.ok(workingCopy.model);
	});

	test('resolve - with initial contents', async () => {
		workingCopy.dispose();

		workingCopy = createWorkingCopy(resource, false, 'Hello Initial');

		let contentChangeCounter = 0;
		disposables.add(workingCopy.onDidChangeContent(() => {
			contentChangeCounter++;
		}));

		assert.strictEqual(workingCopy.isModified(), true);

		await workingCopy.resolve();

		assert.strictEqual(workingCopy.isModified(), true);
		assert.strictEqual(workingCopy.model?.contents, 'Hello Initial');
		assert.strictEqual(contentChangeCounter, 1);

		workingCopy.model.updateContents('Changed contents');

		await workingCopy.resolve(); // second resolve should be ignored
		assert.strictEqual(workingCopy.model?.contents, 'Changed contents');
	});

	test('backup - with initial contents uses those even if unresolved', async () => {
		workingCopy.dispose();

		workingCopy = createWorkingCopy(resource, false, 'Hello Initial');

		assert.strictEqual(workingCopy.isModified(), true);

		const backup = (await workingCopy.backup(CancellationToken.None)).content;
		if (isReadableStream(backup)) {
			const value = await streamToBuffer(backup as VSBufferReadableStream);
			assert.strictEqual(value.toString(), 'Hello Initial');
		} else if (isReadable(backup)) {
			const value = readableToBuffer(backup as VSBufferReadable);
			assert.strictEqual(value.toString(), 'Hello Initial');
		} else {
			assert.fail('Missing untitled backup');
		}
	});


	test('resolve - with associated resource', async () => {
		workingCopy.dispose();
		workingCopy = createWorkingCopy(resource, true);

		await workingCopy.resolve();

		assert.strictEqual(workingCopy.isModified(), true);
		assert.strictEqual(workingCopy.hasAssociatedFilePath, true);
	});

	test('resolve - with backup', async () => {
		await workingCopy.resolve();
		workingCopy.model?.updateContents('Hello Backup');

		const backup = await workingCopy.backup(CancellationToken.None);
		await accessor.workingCopyBackupService.backup(workingCopy, backup.content, undefined, backup.meta);

		assert.strictEqual(accessor.workingCopyBackupService.hasBackupSync(workingCopy), true);

		workingCopy.dispose();

		workingCopy = createWorkingCopy();

		let contentChangeCounter = 0;
		disposables.add(workingCopy.onDidChangeContent(() => {
			contentChangeCounter++;
		}));

		await workingCopy.resolve();

		assert.strictEqual(workingCopy.isModified(), true);
		assert.strictEqual(workingCopy.model?.contents, 'Hello Backup');
		assert.strictEqual(contentChangeCounter, 1);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
