/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { IWorkingCopyEditorHandler, WorkingCopyEditorService } from 'vs/workbench/services/workingCopy/common/workingCopyEditorService';

suite('WorkingCopyEditorService', () => {

	test('registry - basics', () => {
		const service = new WorkingCopyEditorService();

		let handlerEvent: IWorkingCopyEditorHandler | undefined = undefined;
		service.onDidRegisterHandler(handler => {
			handlerEvent = handler;
		});

		const editorHandler: IWorkingCopyEditorHandler = {
			handles: async workingCopy => false,
			isOpen: async () => false,
			createEditor: async workingCopy => Promise.reject()
		};

		const disposable = service.registerHandler(editorHandler);

		assert.strictEqual(handlerEvent, editorHandler);

		disposable.dispose();
	});
});
