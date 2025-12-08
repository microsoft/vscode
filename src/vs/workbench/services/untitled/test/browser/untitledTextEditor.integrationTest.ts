/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { UntitledTextEditorService } from 'vs/workbench/services/untitled/common/untitledTextEditorService';
import { workbenchInstantiationService, TestServiceAccessor } from 'vs/workbench/test/browser/workbenchTestServices';
import { UntitledTextEditorInput } from 'vs/workbench/services/untitled/common/untitledTextEditorInput';
import { CancellationToken } from 'vs/base/common/cancellation';
import { DisposableStore } from 'vs/base/common/lifecycle';

suite('Untitled text editors', () => {

	let disposables: DisposableStore;
	let instantiationService: IInstantiationService;
	let accessor: TestServiceAccessor;

	setup(() => {
		disposables = new DisposableStore();
		instantiationService = workbenchInstantiationService(undefined, disposables);
		accessor = instantiationService.createInstance(TestServiceAccessor);
	});

	teardown(() => {
		(accessor.untitledTextEditorService as UntitledTextEditorService).dispose();
		disposables.dispose();
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
		const originalInput = instantiationService.createInstance(UntitledTextEditorInput, service.create());
		const restoredInput = instantiationService.createInstance(UntitledTextEditorInput, service.create());

		const originalModel = await originalInput.resolve();
		originalModel.textEditorModel?.setValue(content);

		const backup = await originalModel.backup(CancellationToken.None);
		const modelRestoredIdentifier = { typeId: originalModel.typeId, resource: restoredInput.resource };
		await accessor.workingCopyBackupService.backup(modelRestoredIdentifier, backup.content);

		const restoredModel = await restoredInput.resolve();

		assert.strictEqual(restoredModel.textEditorModel?.getValue(), content);
		assert.strictEqual(restoredModel.isDirty(), true);

		originalInput.dispose();
		originalModel.dispose();
		restoredInput.dispose();
		restoredModel.dispose();
	}
});
