/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { IWorkingCopy } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { URI } from 'vs/base/common/uri';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { TestWorkingCopyService } from 'vs/workbench/test/workbenchTestServices';

suite('WorkingCopyService', () => {

	class TestWorkingCopy extends Disposable implements IWorkingCopy {

		private readonly _onDidChangeDirty = this._register(new Emitter<void>());
		readonly onDidChangeDirty = this._onDidChangeDirty.event;

		private readonly _onDispose = this._register(new Emitter<void>());
		readonly onDispose = this._onDispose.event;

		readonly capabilities = 0;

		private dirty = false;

		constructor(public readonly resource: URI, isDirty = false) {
			super();

			this.dirty = isDirty;
		}

		setDirty(dirty: boolean): void {
			if (this.dirty !== dirty) {
				this.dirty = dirty;
				this._onDidChangeDirty.fire();
			}
		}

		isDirty(): boolean {
			return this.dirty;
		}

		dispose(): void {
			this._onDispose.fire();

			super.dispose();
		}
	}

	test('registry - basics', () => {
		const service = new TestWorkingCopyService();

		const onDidChangeDirty: IWorkingCopy[] = [];
		service.onDidChangeDirty(copy => onDidChangeDirty.push(copy));

		assert.equal(service.hasDirty, false);
		assert.equal(service.dirtyCount, 0);
		assert.equal(service.getDirty().length, 0);
		assert.equal(service.getDirty(URI.file('/'), URI.file('/some')).length, 0);
		assert.equal(service.isDirty(URI.file('/')), false);

		// resource 1
		const resource1 = URI.file('/some/folder/file.txt');
		const copy1 = new TestWorkingCopy(resource1);
		const unregister1 = service.registerWorkingCopy(copy1);

		assert.equal(service.dirtyCount, 0);
		assert.equal(service.isDirty(resource1), false);
		assert.equal(service.hasDirty, false);
		assert.equal(service.getDirty(resource1).length, 0);
		assert.equal(service.getDirty().length, 0);

		copy1.setDirty(true);

		assert.equal(service.dirtyCount, 1);
		assert.equal(service.isDirty(resource1), true);
		assert.equal(service.hasDirty, true);
		assert.equal(onDidChangeDirty.length, 1);
		assert.equal(onDidChangeDirty[0], copy1);
		assert.equal(service.getDirty(resource1).length, 1);
		assert.equal(service.getDirty().length, 1);

		copy1.setDirty(false);

		assert.equal(service.dirtyCount, 0);
		assert.equal(service.isDirty(resource1), false);
		assert.equal(service.hasDirty, false);
		assert.equal(onDidChangeDirty.length, 2);
		assert.equal(onDidChangeDirty[1], copy1);
		assert.equal(service.getDirty(resource1).length, 0);
		assert.equal(service.getDirty().length, 0);

		unregister1.dispose();

		// resource 2
		const resource2 = URI.file('/some/folder/file-dirty.txt');
		const copy2 = new TestWorkingCopy(resource2, true);
		const unregister2 = service.registerWorkingCopy(copy2);

		assert.equal(service.dirtyCount, 1);
		assert.equal(service.isDirty(resource2), true);
		assert.equal(service.hasDirty, true);
		assert.equal(service.getDirty(resource1, resource2).length, 1);
		assert.equal(service.getDirty().length, 1);

		assert.equal(onDidChangeDirty.length, 3);
		assert.equal(onDidChangeDirty[2], copy2);

		unregister2.dispose();
		assert.equal(service.dirtyCount, 0);
		assert.equal(service.hasDirty, false);
		assert.equal(onDidChangeDirty.length, 4);
		assert.equal(onDidChangeDirty[3], copy2);
		assert.equal(service.getDirty(resource1, resource2).length, 0);
		assert.equal(service.getDirty().length, 0);
	});

	test('registry - multiple copies on same resource', () => {
		const service = new TestWorkingCopyService();

		const onDidChangeDirty: IWorkingCopy[] = [];
		service.onDidChangeDirty(copy => onDidChangeDirty.push(copy));

		const resource = URI.parse('custom://some/folder/custom.txt');

		const copy1 = new TestWorkingCopy(resource);
		const unregister1 = service.registerWorkingCopy(copy1);

		const copy2 = new TestWorkingCopy(resource);
		const unregister2 = service.registerWorkingCopy(copy2);

		copy1.setDirty(true);

		assert.equal(service.dirtyCount, 1);
		assert.equal(onDidChangeDirty.length, 1);
		assert.equal(service.isDirty(resource), true);
		assert.equal(service.getDirty(resource).length, 1);
		assert.equal(service.getDirty().length, 1);

		copy2.setDirty(true);

		assert.equal(service.dirtyCount, 2);
		assert.equal(onDidChangeDirty.length, 2);
		assert.equal(service.isDirty(resource), true);
		assert.equal(service.getDirty(resource).length, 2);
		assert.equal(service.getDirty().length, 2);

		unregister1.dispose();

		assert.equal(service.dirtyCount, 1);
		assert.equal(onDidChangeDirty.length, 3);
		assert.equal(service.isDirty(resource), true);
		assert.equal(service.getDirty(resource).length, 1);
		assert.equal(service.getDirty().length, 1);

		unregister2.dispose();

		assert.equal(service.dirtyCount, 0);
		assert.equal(onDidChangeDirty.length, 4);
		assert.equal(service.isDirty(resource), false);
		assert.equal(service.getDirty(resource).length, 0);
		assert.equal(service.getDirty().length, 0);
	});
});
