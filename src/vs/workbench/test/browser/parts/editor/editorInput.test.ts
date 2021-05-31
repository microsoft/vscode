/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';

suite('EditorInput', () => {

	class MyEditorInput extends EditorInput {
		readonly resource = undefined;

		override get typeId(): string { return 'myEditorInput'; }
		override resolve(): any { return null; }
	}

	test('basics', () => {
		let counter = 0;
		let input = new MyEditorInput();
		let otherInput = new MyEditorInput();

		assert(input.matches(input));
		assert(!input.matches(otherInput));
		assert(!input.matches(null));
		assert(input.getName());

		input.onWillDispose(() => {
			assert(true);
			counter++;
		});

		input.dispose();
		assert.strictEqual(counter, 1);
	});
});
