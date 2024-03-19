/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { IWorkingCopy } from 'vs/workbench/services/workingCopy/common/workingCopy';
import { URI } from 'vs/base/common/uri';
import { TestWorkingCopy } from 'vs/workbench/test/common/workbenchTestServices';
import { IWorkingCopySaveEvent, WorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { DisposableStore } from 'vs/base/common/lifecycle';

suite('WorkingCopyService', () => {

	const disposables = new DisposableStore();

	teardown(() => {
		disposables.clear();
	});

	test('registry - basics', () => {
		const service = disposables.add(new WorkingCopyService());

		const onDidChangeDirty: IWorkingCopy[] = [];
		disposables.add(service.onDidChangeDirty(copy => onDidChangeDirty.push(copy)));

		const onDidChangeContent: IWorkingCopy[] = [];
		disposables.add(service.onDidChangeContent(copy => onDidChangeContent.push(copy)));

		const onDidSave: IWorkingCopySaveEvent[] = [];
		disposables.add(service.onDidSave(copy => onDidSave.push(copy)));

		const onDidRegister: IWorkingCopy[] = [];
		disposables.add(service.onDidRegister(copy => onDidRegister.push(copy)));

		const onDidUnregister: IWorkingCopy[] = [];
		disposables.add(service.onDidUnregister(copy => onDidUnregister.push(copy)));

		assert.strictEqual(service.hasDirty, false);
		assert.strictEqual(service.dirtyCount, 0);
		assert.strictEqual(service.workingCopies.length, 0);
		assert.strictEqual(service.isDirty(URI.file('/')), false);

		// resource 1
		const resource1 = URI.file('/some/folder/file.txt');
		assert.strictEqual(service.has(resource1), false);
		assert.strictEqual(service.has({ resource: resource1, typeId: 'testWorkingCopyType' }), false);
		assert.strictEqual(service.get({ resource: resource1, typeId: 'testWorkingCopyType' }), undefined);
		assert.strictEqual(service.getAll(resource1), undefined);
		const copy1 = disposables.add(new TestWorkingCopy(resource1));
		const unregister1 = service.registerWorkingCopy(copy1);

		assert.strictEqual(service.workingCopies.length, 1);
		assert.strictEqual(service.workingCopies[0], copy1);
		assert.strictEqual(onDidRegister.length, 1);
		assert.strictEqual(onDidRegister[0], copy1);
		assert.strictEqual(service.dirtyCount, 0);
		assert.strictEqual(service.modifiedCount, 0);
		assert.strictEqual(service.isDirty(resource1), false);
		assert.strictEqual(service.has(resource1), true);
		assert.strictEqual(service.has(copy1), true);
		assert.strictEqual(service.get(copy1), copy1);
		assert.strictEqual(service.hasDirty, false);

		const copies = service.getAll(copy1.resource);
		assert.strictEqual(copies?.length, 1);
		assert.strictEqual(copies[0], copy1);

		copy1.setDirty(true);
		copy1.save();

		assert.strictEqual(copy1.isDirty(), true);
		assert.strictEqual(service.dirtyCount, 1);
		assert.strictEqual(service.dirtyWorkingCopies.length, 1);
		assert.strictEqual(service.dirtyWorkingCopies[0], copy1);
		assert.strictEqual(service.modifiedCount, 1);
		assert.strictEqual(service.modifiedWorkingCopies.length, 1);
		assert.strictEqual(service.modifiedWorkingCopies[0], copy1);
		assert.strictEqual(service.workingCopies.length, 1);
		assert.strictEqual(service.workingCopies[0], copy1);
		assert.strictEqual(service.isDirty(resource1), true);
		assert.strictEqual(service.hasDirty, true);
		assert.strictEqual(onDidChangeDirty.length, 1);
		assert.strictEqual(onDidChangeDirty[0], copy1);
		assert.strictEqual(onDidSave.length, 1);
		assert.strictEqual(onDidSave[0].workingCopy, copy1);

		copy1.setContent('foo');

		assert.strictEqual(onDidChangeContent.length, 1);
		assert.strictEqual(onDidChangeContent[0], copy1);

		copy1.setDirty(false);

		assert.strictEqual(service.dirtyCount, 0);
		assert.strictEqual(service.isDirty(resource1), false);
		assert.strictEqual(service.hasDirty, false);
		assert.strictEqual(onDidChangeDirty.length, 2);
		assert.strictEqual(onDidChangeDirty[1], copy1);

		unregister1.dispose();

		assert.strictEqual(onDidUnregister.length, 1);
		assert.strictEqual(onDidUnregister[0], copy1);
		assert.strictEqual(service.workingCopies.length, 0);
		assert.strictEqual(service.has(resource1), false);

		// resource 2
		const resource2 = URI.file('/some/folder/file-dirty.txt');
		const copy2 = disposables.add(new TestWorkingCopy(resource2, true));
		const unregister2 = service.registerWorkingCopy(copy2);

		assert.strictEqual(onDidRegister.length, 2);
		assert.strictEqual(onDidRegister[1], copy2);
		assert.strictEqual(service.dirtyCount, 1);
		assert.strictEqual(service.isDirty(resource2), true);
		assert.strictEqual(service.hasDirty, true);

		assert.strictEqual(onDidChangeDirty.length, 3);
		assert.strictEqual(onDidChangeDirty[2], copy2);

		copy2.setContent('foo');

		assert.strictEqual(onDidChangeContent.length, 2);
		assert.strictEqual(onDidChangeContent[1], copy2);

		unregister2.dispose();

		assert.strictEqual(onDidUnregister.length, 2);
		assert.strictEqual(onDidUnregister[1], copy2);
		assert.strictEqual(service.dirtyCount, 0);
		assert.strictEqual(service.hasDirty, false);
		assert.strictEqual(onDidChangeDirty.length, 4);
		assert.strictEqual(onDidChangeDirty[3], copy2);
	});

	test('registry - multiple copies on same resource throws (same type ID)', () => {
		const service = disposables.add(new WorkingCopyService());

		const resource = URI.parse('custom://some/folder/custom.txt');

		const copy1 = disposables.add(new TestWorkingCopy(resource));
		disposables.add(service.registerWorkingCopy(copy1));

		const copy2 = disposables.add(new TestWorkingCopy(resource));

		assert.throws(() => service.registerWorkingCopy(copy2));
	});

	test('registry - multiple copies on same resource is supported (different type ID)', () => {
		const service = disposables.add(new WorkingCopyService());

		const resource = URI.parse('custom://some/folder/custom.txt');

		const typeId1 = 'testWorkingCopyTypeId1';
		let copy1 = disposables.add(new TestWorkingCopy(resource, false, typeId1));
		let dispose1 = service.registerWorkingCopy(copy1);

		const typeId2 = 'testWorkingCopyTypeId2';
		const copy2 = disposables.add(new TestWorkingCopy(resource, false, typeId2));
		const dispose2 = service.registerWorkingCopy(copy2);

		const typeId3 = 'testWorkingCopyTypeId3';
		const copy3 = disposables.add(new TestWorkingCopy(resource, false, typeId3));
		const dispose3 = service.registerWorkingCopy(copy3);

		const copies = service.getAll(resource);
		assert.strictEqual(copies?.length, 3);
		assert.strictEqual(copies[0], copy1);
		assert.strictEqual(copies[1], copy2);
		assert.strictEqual(copies[2], copy3);

		assert.strictEqual(service.dirtyCount, 0);
		assert.strictEqual(service.isDirty(resource), false);
		assert.strictEqual(service.isDirty(resource, typeId1), false);

		copy1.setDirty(true);
		assert.strictEqual(service.dirtyCount, 1);
		assert.strictEqual(service.isDirty(resource), true);
		assert.strictEqual(service.isDirty(resource, typeId1), true);
		assert.strictEqual(service.isDirty(resource, typeId2), false);

		copy2.setDirty(true);
		assert.strictEqual(service.dirtyCount, 2);
		assert.strictEqual(service.isDirty(resource), true);
		assert.strictEqual(service.isDirty(resource, typeId1), true);
		assert.strictEqual(service.isDirty(resource, typeId2), true);

		copy3.setDirty(true);
		assert.strictEqual(service.dirtyCount, 3);
		assert.strictEqual(service.isDirty(resource), true);
		assert.strictEqual(service.isDirty(resource, typeId1), true);
		assert.strictEqual(service.isDirty(resource, typeId2), true);
		assert.strictEqual(service.isDirty(resource, typeId3), true);

		copy1.setDirty(false);
		copy2.setDirty(false);
		copy3.setDirty(false);
		assert.strictEqual(service.dirtyCount, 0);
		assert.strictEqual(service.isDirty(resource), false);
		assert.strictEqual(service.isDirty(resource, typeId1), false);
		assert.strictEqual(service.isDirty(resource, typeId2), false);
		assert.strictEqual(service.isDirty(resource, typeId3), false);

		dispose1.dispose();
		copy1 = disposables.add(new TestWorkingCopy(resource, false, typeId1));
		dispose1 = service.registerWorkingCopy(copy1);

		dispose1.dispose();
		dispose2.dispose();
		dispose3.dispose();

		assert.strictEqual(service.workingCopies.length, 0);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
