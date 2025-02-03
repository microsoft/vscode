/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EditorService } from '../../../editor/browser/editorService.js';
import { IEditorGroupsService } from '../../../editor/common/editorGroupsService.js';
import { UntitledTextEditorInput } from '../../../untitled/common/untitledTextEditorInput.js';
import { IWorkingCopyEditorHandler, WorkingCopyEditorService } from '../../common/workingCopyEditorService.js';
import { createEditorPart, registerTestResourceEditor, TestEditorService, TestServiceAccessor, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { TestWorkingCopy } from '../../../../test/common/workbenchTestServices.js';

suite('WorkingCopyEditorService', () => {

	const disposables = new DisposableStore();

	setup(() => {
		disposables.add(registerTestResourceEditor());
	});

	teardown(() => {
		disposables.clear();
	});

	test('registry - basics', () => {
		const service = disposables.add(new WorkingCopyEditorService(disposables.add(new TestEditorService())));

		let handlerEvent: IWorkingCopyEditorHandler | undefined = undefined;
		disposables.add(service.onDidRegisterHandler(handler => {
			handlerEvent = handler;
		}));

		const editorHandler: IWorkingCopyEditorHandler = {
			handles: workingCopy => false,
			isOpen: () => false,
			createEditor: workingCopy => { throw new Error(); }
		};

		disposables.add(service.registerHandler(editorHandler));

		assert.strictEqual(handlerEvent, editorHandler);
	});

	test('findEditor', async () => {
		const disposables = new DisposableStore();

		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const part = await createEditorPart(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, part);

		const editorService = disposables.add(instantiationService.createInstance(EditorService, undefined));
		const accessor = instantiationService.createInstance(TestServiceAccessor);

		const service = disposables.add(new WorkingCopyEditorService(editorService));

		const resource = URI.parse('custom://some/folder/custom.txt');
		const testWorkingCopy = disposables.add(new TestWorkingCopy(resource, false, 'testWorkingCopyTypeId1'));

		assert.strictEqual(service.findEditor(testWorkingCopy), undefined);

		const editorHandler: IWorkingCopyEditorHandler = {
			handles: workingCopy => workingCopy === testWorkingCopy,
			isOpen: (workingCopy, editor) => workingCopy === testWorkingCopy,
			createEditor: workingCopy => { throw new Error(); }
		};

		disposables.add(service.registerHandler(editorHandler));

		const editor1 = disposables.add(instantiationService.createInstance(UntitledTextEditorInput, accessor.untitledTextEditorService.create({ initialValue: 'foo' })));
		const editor2 = disposables.add(instantiationService.createInstance(UntitledTextEditorInput, accessor.untitledTextEditorService.create({ initialValue: 'foo' })));

		await editorService.openEditors([{ editor: editor1 }, { editor: editor2 }]);

		assert.ok(service.findEditor(testWorkingCopy));

		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
