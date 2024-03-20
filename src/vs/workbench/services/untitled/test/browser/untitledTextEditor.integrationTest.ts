/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { workbenchInstantiationService, TestServiceAccessor } from 'vs/workbench/test/browser/workbenchTestServices';
import { UntitledTextEditorInput } from 'vs/workbench/services/untitled/common/untitledTextEditorInput';
import { CancellationToken } from 'vs/base/common/cancellation';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

suite('Untitled text editors', () => {

	const disposables = new DisposableStore();

	let instantiationService: IInstantiationService;
	let accessor: TestServiceAccessor;

	setup(() => {
		instantiationService = workbenchInstantiationService(undefined, disposables);
		accessor = instantiationService.createInstance(TestServiceAccessor);
		disposables.add(accessor.untitledTextEditorService);
	});

	teardown(() => {
		disposables.clear();
	});

	test('backup and restore (simple)', async function () {
		return testBackupAndRestore('Some very small file text content.');
	});

	test('backup and restore (large, #121347)', async function () {
		const largeContent = '국어한\n'.repeat(100000);
		return testBackupAndRestore(largeContent);
	});

	async function testBackupAndRestore(content: string) {
		const service = accessor.untitledTextEditorService;
		const originalInput = disposables.add(instantiationService.createInstance(UntitledTextEditorInput, service.create()));
		const restoredInput = disposables.add(instantiationService.createInstance(UntitledTextEditorInput, service.create()));

		const originalModel = disposables.add(await originalInput.resolve());
		originalModel.textEditorModel?.setValue(content);

		const backup = await originalModel.backup(CancellationToken.None);
		const modelRestoredIdentifier = { typeId: originalModel.typeId, resource: restoredInput.resource };
		await accessor.workingCopyBackupService.backup(modelRestoredIdentifier, backup.content);

		const restoredModel = disposables.add(await restoredInput.resolve());

		assert.strictEqual(restoredModel.textEditorModel?.getValue(), content);
		assert.strictEqual(restoredModel.isDirty(), true);
	}

	ensureNoDisposablesAreLeakedInTestSuite();
});
