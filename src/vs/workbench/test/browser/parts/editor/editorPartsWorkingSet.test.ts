/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAuxiliaryWindowService } from '../../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { IEditorWorkingSet } from '../../../../services/editor/common/editorGroupsService.js';
import { createEditorParts, workbenchInstantiationService } from '../../workbenchTestServices.js';

suite('EditorParts - applying working set', () => {

	const disposables = new DisposableStore();

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	async function createParts() {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IAuxiliaryWindowService, new class extends mock<IAuxiliaryWindowService>() { override getWindow() { return undefined; } }());
		return createEditorParts(instantiationService, disposables);
	}

	test('reports applying from the first apply start until the last overlapping apply completes', async () => {
		const parts = await createParts();

		const changes: boolean[] = [];
		disposables.add(parts.onDidChangeApplyingWorkingSet(applying => changes.push(applying)));

		const first = parts.applyWorkingSet('empty');
		const second = parts.applyWorkingSet('empty');
		assert.deepStrictEqual({ applying: parts.isApplyingWorkingSet, changes }, { applying: true, changes: [true] });

		await first;
		await second;
		assert.deepStrictEqual({ applying: parts.isApplyingWorkingSet, changes }, { applying: false, changes: [true, false] });
	});

	test('stays applying after the first overlapping apply completes while the second is pending', async () => {
		const parts = await createParts();

		const pending: DeferredPromise<boolean>[] = [];
		(parts as unknown as { doApplyWorkingSet(): Promise<boolean> }).doApplyWorkingSet = () => {
			const deferred = new DeferredPromise<boolean>();
			pending.push(deferred);
			return deferred.p;
		};

		const changes: boolean[] = [];
		disposables.add(parts.onDidChangeApplyingWorkingSet(applying => changes.push(applying)));

		const first = parts.applyWorkingSet('empty');
		const second = parts.applyWorkingSet('empty');

		await pending[0].complete(true);
		await first;
		assert.deepStrictEqual({ applying: parts.isApplyingWorkingSet, changes }, { applying: true, changes: [true] });

		await pending[1].complete(true);
		await second;
		assert.deepStrictEqual({ applying: parts.isApplyingWorkingSet, changes }, { applying: false, changes: [true, false] });
	});

	test('resets applying when the apply rejects', async () => {
		const parts = await createParts();

		const changes: boolean[] = [];
		disposables.add(parts.onDidChangeApplyingWorkingSet(applying => changes.push(applying)));

		parts.saveWorkingSet('saved');
		const failing: IEditorWorkingSet = { get id(): string { throw new Error('boom'); }, name: 'failing' };
		await assert.rejects(() => parts.applyWorkingSet(failing), /boom/);

		assert.deepStrictEqual({ applying: parts.isApplyingWorkingSet, changes }, { applying: false, changes: [true, false] });
	});
});
