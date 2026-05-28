/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICustomEditorModel } from '../../common/customEditor.js';
import { CustomEditorModelManager } from '../../common/customEditorModelManager.js';

class TestCustomEditorModel implements ICustomEditorModel {
	public readonly backupId = undefined;
	public readonly canHotExit = true;
	public readonly onDidChangeReadonly = Event.None;
	public readonly onDidChangeOrphaned = Event.None;
	public readonly onDidChangeDirty = Event.None;

	constructor(
		public readonly viewType: string,
		public readonly resource: URI,
	) { }

	isReadonly(): boolean {
		return false;
	}

	isOrphaned(): boolean {
		return false;
	}

	isDirty(): boolean {
		return false;
	}

	async revert(): Promise<void> {
	}

	async saveCustomEditor(): Promise<URI | undefined> {
		return undefined;
	}

	async saveCustomEditorAs(): Promise<boolean> {
		return true;
	}

	dispose(): void {
	}
}

suite('CustomEditorModelManager', () => {
	test('removes rejected models so a later open can recreate the model', async () => {
		const manager = new CustomEditorModelManager();
		const resource = URI.file('/test/customEditor.txt');
		const viewType = 'test.customEditor';
		const error = new Error('file not found');

		await assert.rejects(manager.add(resource, viewType, Promise.reject(error)), error);

		const retained = manager.tryRetain(resource, viewType);
		if (retained) {
			await assert.rejects(retained, error);
		}
		assert.strictEqual(retained, undefined);

		const recoveredModel = new TestCustomEditorModel(viewType, resource);
		const recoveredReference = await manager.add(resource, viewType, Promise.resolve(recoveredModel));
		assert.strictEqual(recoveredReference.object, recoveredModel);

		recoveredReference.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
