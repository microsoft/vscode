/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event';
import { URI } from '../../../../../base/common/uri';
import { CancellationToken } from '../../../../../base/common/cancellation';
import { TestServiceAccessor, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation';
import { FileChangesEvent, FileChangeType } from '../../../../../platform/files/common/files';
import { IRevertOptions, ISaveOptions } from '../../../../common/editor';
import { ResourceWorkingCopy } from '../../common/resourceWorkingCopy';
import { WorkingCopyCapabilities, IWorkingCopyBackup } from '../../common/workingCopy';
import { DisposableStore } from '../../../../../base/common/lifecycle';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils';

suite('ResourceWorkingCopy', function () {

	class TestResourceWorkingCopy extends ResourceWorkingCopy {
		name = 'testName';
		typeId = 'testTypeId';
		capabilities = WorkingCopyCapabilities.None;
		onDidChangeDirty = Event.None;
		onDidChangeContent = Event.None;
		onDidSave = Event.None;
		isDirty(): boolean { return false; }
		async backup(token: CancellationToken): Promise<IWorkingCopyBackup> { throw new Error('Method not implemented.'); }
		async save(options?: ISaveOptions): Promise<boolean> { return false; }
		async revert(options?: IRevertOptions): Promise<void> { }

	}

	const disposables = new DisposableStore();
	const resource = URI.file('test/resource');
	let instantiationService: IInstantiationService;
	let accessor: TestServiceAccessor;
	let workingCopy: TestResourceWorkingCopy;

	function createWorkingCopy(uri: URI = resource) {
		return new TestResourceWorkingCopy(uri, accessor.fileService);
	}

	setup(() => {
		instantiationService = workbenchInstantiationService(undefined, disposables);
		accessor = instantiationService.createInstance(TestServiceAccessor);

		workingCopy = disposables.add(createWorkingCopy());
	});

	teardown(() => {
		disposables.clear();
	});

	test('orphaned tracking', async () => {
		return runWithFakedTimers({}, async () => {
			assert.strictEqual(workingCopy.isOrphaned(), false);

			let onDidChangeOrphanedPromise = Event.toPromise(workingCopy.onDidChangeOrphaned);
			accessor.fileService.notExistsSet.set(resource, true);
			accessor.fileService.fireFileChanges(new FileChangesEvent([{ resource, type: FileChangeType.DELETED }], false));

			await onDidChangeOrphanedPromise;
			assert.strictEqual(workingCopy.isOrphaned(), true);

			onDidChangeOrphanedPromise = Event.toPromise(workingCopy.onDidChangeOrphaned);
			accessor.fileService.notExistsSet.delete(resource);
			accessor.fileService.fireFileChanges(new FileChangesEvent([{ resource, type: FileChangeType.ADDED }], false));

			await onDidChangeOrphanedPromise;
			assert.strictEqual(workingCopy.isOrphaned(), false);
		});
	});

	test('dispose, isDisposed', async () => {
		assert.strictEqual(workingCopy.isDisposed(), false);

		let disposedEvent = false;
		disposables.add(workingCopy.onWillDispose(() => {
			disposedEvent = true;
		}));

		workingCopy.dispose();

		assert.strictEqual(workingCopy.isDisposed(), true);
		assert.strictEqual(disposedEvent, true);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
