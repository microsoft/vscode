/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICustomEditorModel } from '../../common/customEditor.js';
import { CustomEditorModelManager } from '../../common/customEditorModelManager.js';

class TestCustomEditorModel extends mock<ICustomEditorModel>() {
	disposeCount = 0;

	constructor(
		readonly name: string,
		override readonly resource: URI,
		override readonly viewType: string,
	) {
		super();
	}

	override dispose(): void {
		this.disposeCount++;
	}
}

function names(models: readonly ICustomEditorModel[]): string[] {
	return models.map(model => (model as TestCustomEditorModel).name);
}

suite('CustomEditorModelManager', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const resource = URI.file('/workspace/file.custom');
	const otherResource = URI.file('/workspace/other.custom');
	const viewType = 'test.customEditor';
	const otherViewType = 'test.otherCustomEditor';

	test('tryRetain returns undefined when there is no model', () => {
		const manager = new CustomEditorModelManager();

		assert.strictEqual(manager.tryRetain(resource, viewType), undefined);
	});

	test('shares a model between references and disposes it with the last reference', async () => {
		const manager = new CustomEditorModelManager();
		const model = new TestCustomEditorModel('model', resource, viewType);

		const first = await manager.add(resource, viewType, Promise.resolve(model));
		const second = await manager.tryRetain(resource, viewType)!;
		first.dispose();
		first.dispose();
		await timeout(0);
		const afterFirstDisposed = { disposeCount: model.disposeCount, stillKnown: await manager.get(resource, viewType) === model };

		second.dispose();
		await timeout(0);

		assert.deepStrictEqual({
			sameModel: first.object === model && second.object === model,
			afterFirstDisposed,
			afterLastDisposed: { disposeCount: model.disposeCount, retained: manager.tryRetain(resource, viewType) },
		}, {
			sameModel: true,
			afterFirstDisposed: { disposeCount: 0, stillKnown: true },
			afterLastDisposed: { disposeCount: 1, retained: undefined },
		});
	});

	test('add throws when a model already exists for the resource and view type', async () => {
		const manager = new CustomEditorModelManager();
		const reference = await manager.add(resource, viewType, Promise.resolve(new TestCustomEditorModel('first', resource, viewType)));

		assert.throws(() => manager.add(resource, viewType, Promise.resolve(new TestCustomEditorModel('second', resource, viewType))), /Model already exists/);

		reference.dispose();
	});

	test('finds models by resource and view type', async () => {
		const manager = new CustomEditorModelManager();
		const references = await Promise.all([
			manager.add(resource, viewType, Promise.resolve(new TestCustomEditorModel('a', resource, viewType))),
			manager.add(resource, otherViewType, Promise.resolve(new TestCustomEditorModel('b', resource, otherViewType))),
			manager.add(otherResource, viewType, Promise.resolve(new TestCustomEditorModel('c', otherResource, viewType))),
		]);

		assert.deepStrictEqual({
			get: (await manager.get(resource, otherViewType) as TestCustomEditorModel | undefined)?.name,
			getMissing: await manager.get(otherResource, otherViewType),
			allForResource: names(await manager.getAllModels(resource)),
			allForOtherResource: names(await manager.getAllModels(otherResource)),
		}, {
			get: 'b',
			getMissing: undefined,
			allForResource: ['a', 'b'],
			allForOtherResource: ['c'],
		});

		references.forEach(reference => reference.dispose());
	});

	test('disposeAllModelsForView only disposes and forgets models of that view type', async () => {
		const manager = new CustomEditorModelManager();
		const a = new TestCustomEditorModel('a', resource, viewType);
		const b = new TestCustomEditorModel('b', resource, otherViewType);
		const c = new TestCustomEditorModel('c', otherResource, viewType);
		const bReference = await manager.add(resource, otherViewType, Promise.resolve(b));
		await manager.add(resource, viewType, Promise.resolve(a));
		await manager.add(otherResource, viewType, Promise.resolve(c));

		manager.disposeAllModelsForView(viewType);
		await timeout(0);

		assert.deepStrictEqual({
			disposed: [a, b, c].map(model => model.disposeCount),
			remaining: [...names(await manager.getAllModels(resource)), ...names(await manager.getAllModels(otherResource))],
		}, {
			disposed: [1, 0, 1],
			remaining: ['b'],
		});

		bReference.dispose();
	});

	test('disposeAllModelsForResource only disposes and forgets models of that resource', async () => {
		const manager = new CustomEditorModelManager();
		const a = new TestCustomEditorModel('a', resource, viewType);
		const b = new TestCustomEditorModel('b', resource, otherViewType);
		const c = new TestCustomEditorModel('c', otherResource, viewType);
		const cReference = await manager.add(otherResource, viewType, Promise.resolve(c));
		await manager.add(resource, viewType, Promise.resolve(a));
		await manager.add(resource, otherViewType, Promise.resolve(b));

		manager.disposeAllModelsForResource(resource);
		await timeout(0);

		assert.deepStrictEqual({
			disposed: [a, b, c].map(model => model.disposeCount),
			remaining: [...names(await manager.getAllModels(resource)), ...names(await manager.getAllModels(otherResource))],
		}, {
			disposed: [1, 1, 0],
			remaining: ['c'],
		});

		cReference.dispose();
	});

	test('forgets a model that fails to resolve so that it can be created again (#250622)', async () => {
		const manager = new CustomEditorModelManager();

		await assert.rejects(manager.add(resource, viewType, Promise.reject(new Error('Could not open'))), /Could not open/);
		const afterFailure = { retained: manager.tryRetain(resource, viewType), model: await manager.get(resource, viewType) };

		const model = new TestCustomEditorModel('retry', resource, viewType);
		const reference = await manager.add(resource, viewType, Promise.resolve(model));

		assert.deepStrictEqual({ afterFailure, afterRetry: reference.object === model }, {
			afterFailure: { retained: undefined, model: undefined },
			afterRetry: true,
		});

		reference.dispose();
	});

	test('reports the failure of a pending model to everyone waiting for it (#250622)', async () => {
		const manager = new CustomEditorModelManager();
		const pending = new DeferredPromise<ICustomEditorModel>();

		const waiting = [manager.add(resource, viewType, pending.p), manager.tryRetain(resource, viewType)!];
		pending.error(new Error('Could not open'));
		const results = await Promise.allSettled(waiting);

		assert.deepStrictEqual({
			results: results.map(result => result.status === 'rejected' ? (result.reason as Error).message : result.status),
			retained: manager.tryRetain(resource, viewType),
		}, {
			results: ['Could not open', 'Could not open'],
			retained: undefined,
		});
	});

	test('a model that fails after it was disposed does not forget its replacement', async () => {
		const manager = new CustomEditorModelManager();
		const pending = new DeferredPromise<ICustomEditorModel>();
		const failed = manager.add(resource, viewType, pending.p);

		manager.disposeAllModelsForResource(resource);
		const replacement = new TestCustomEditorModel('replacement', resource, viewType);
		const reference = await manager.add(resource, viewType, Promise.resolve(replacement));
		pending.error(new Error('Could not open'));
		await assert.rejects(failed, /Could not open/);
		await timeout(0);

		assert.deepStrictEqual({ model: await manager.get(resource, viewType) === replacement, disposeCount: replacement.disposeCount }, {
			model: true,
			disposeCount: 0,
		});

		reference.dispose();
	});

	test('getAllModels skips models that fail to resolve', async () => {
		const manager = new CustomEditorModelManager();
		const reference = await manager.add(resource, viewType, Promise.resolve(new TestCustomEditorModel('a', resource, viewType)));
		const pending = new DeferredPromise<ICustomEditorModel>();
		const failed = manager.add(resource, otherViewType, pending.p);

		const all = manager.getAllModels(resource);
		pending.error(new Error('Could not open'));
		await assert.rejects(failed, /Could not open/);

		assert.deepStrictEqual(names(await all), ['a']);

		reference.dispose();
	});

	test('releasing a reference to a model disposed with its resource leaves the new model alone', async () => {
		const manager = new CustomEditorModelManager();
		const deleted = new TestCustomEditorModel('deleted', resource, viewType);
		const staleReference = await manager.add(resource, viewType, Promise.resolve(deleted));

		manager.disposeAllModelsForResource(resource);
		const recreated = new TestCustomEditorModel('recreated', resource, viewType);
		const reference = await manager.add(resource, viewType, Promise.resolve(recreated));
		staleReference.dispose();
		await timeout(0);

		assert.deepStrictEqual({
			model: (await manager.get(resource, viewType) as TestCustomEditorModel | undefined)?.name,
			disposeCounts: [deleted.disposeCount, recreated.disposeCount],
		}, {
			model: 'recreated',
			disposeCounts: [1, 0],
		});

		reference.dispose();
	});
});
