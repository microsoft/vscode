/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICustomEditorModel } from '../../common/customEditor.js';
import { CustomEditorModelManager } from '../../common/customEditorModelManager.js';

suite('CustomEditorModelManager', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function createFakeModel(viewType: string, resource: URI): ICustomEditorModel {
		return {
			viewType,
			resource,
			backupId: undefined,
			canHotExit: false,
			isReadonly: () => false,
			onDidChangeReadonly: () => ({ dispose: () => { } }),
			isOrphaned: () => false,
			onDidChangeOrphaned: () => ({ dispose: () => { } }),
			isDirty: () => false,
			onDidChangeDirty: () => ({ dispose: () => { } }),
			revert: async () => { },
			saveCustomEditor: async () => resource,
			saveCustomEditorAs: async () => true,
			dispose: () => { },
		};
	}

	test('Retains and disposes model correctly', async () => {
		const manager = new CustomEditorModelManager();
		const resource = URI.parse('test://foo/bar.txt');
		const viewType = 'customView';
		const model = createFakeModel(viewType, resource);

		const ref = await manager.add(resource, viewType, Promise.resolve(model));
		assert.strictEqual(ref.object, model);

		const ref2 = await manager.tryRetain(resource, viewType);
		assert.strictEqual(ref2?.object, model);

		ref.dispose();
		ref2?.dispose();

		assert.strictEqual(manager.tryRetain(resource, viewType), undefined);
	});

	test('Purges rejected model from map so subsequent attempts can retry', async () => {
		const manager = new CustomEditorModelManager();
		const resource = URI.parse('test://foo/bar.txt');
		const viewType = 'customView';

		const failedPromise = Promise.reject(new Error('File not found'));
		await assert.rejects(manager.add(resource, viewType, failedPromise), /File not found/);

		// After failure, manager should not retain the rejected model
		assert.strictEqual(manager.tryRetain(resource, viewType), undefined);

		// Retrying with a valid model should succeed
		const model = createFakeModel(viewType, resource);
		const ref = await manager.add(resource, viewType, Promise.resolve(model));
		assert.strictEqual(ref.object, model);
		ref.dispose();
	});

	test('getAllModels does not throw when an entry rejects', async () => {
		const manager = new CustomEditorModelManager();
		const resource = URI.parse('test://foo/bar.txt');
		const viewType1 = 'customView1';
		const viewType2 = 'customView2';

		let rejectFailedPromise!: (err: any) => void;
		const failedPromise = new Promise<ICustomEditorModel>((_, reject) => {
			rejectFailedPromise = reject;
		});
		manager.add(resource, viewType1, failedPromise).catch(() => { });

		const validModel = createFakeModel(viewType2, resource);
		const ref = await manager.add(resource, viewType2, Promise.resolve(validModel));

		const getAllModelsPromise = manager.getAllModels(resource);
		rejectFailedPromise(new Error('Failed to load'));

		const models = await getAllModelsPromise;
		assert.strictEqual(models.length, 1);
		assert.strictEqual(models[0], validModel);

		ref.dispose();
	});

	test('disposeAllModelsForView cleans up even with rejected models', async () => {
		const manager = new CustomEditorModelManager();
		const resource = URI.parse('test://foo/bar.txt');
		const viewType = 'customView';

		const failedPromise = Promise.reject(new Error('Failed to load'));
		manager.add(resource, viewType, failedPromise).catch(() => { });

		manager.disposeAllModelsForView(viewType);
		assert.strictEqual(manager.tryRetain(resource, viewType), undefined);
	});
});
