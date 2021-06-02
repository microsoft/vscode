/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { SideBySideEditorInput } from 'vs/workbench/common/editor/sideBySideEditorInput';

suite('SideBySideEditorInput', () => {

	class MyEditorInput extends EditorInput {
		readonly resource = undefined;

		override get typeId(): string { return 'myEditorInput'; }
		override resolve(): any { return null; }

		fireCapabilitiesChangeEvent(): void {
			this._onDidChangeCapabilities.fire();
		}

		fireDirtyChangeEvent(): void {
			this._onDidChangeDirty.fire();
		}

		fireLabelChangeEvent(): void {
			this._onDidChangeLabel.fire();
		}
	}

	test('events dispatching', () => {
		let input = new MyEditorInput();
		let otherInput = new MyEditorInput();

		const sideBySideInut = new SideBySideEditorInput('name', 'description', otherInput, input);

		let capabilitiesChangeCounter = 0;
		sideBySideInut.onDidChangeCapabilities(() => capabilitiesChangeCounter++);

		let dirtyChangeCounter = 0;
		sideBySideInut.onDidChangeDirty(() => dirtyChangeCounter++);

		let labelChangeCounter = 0;
		sideBySideInut.onDidChangeLabel(() => labelChangeCounter++);

		input.fireCapabilitiesChangeEvent();
		assert.strictEqual(capabilitiesChangeCounter, 1);

		otherInput.fireCapabilitiesChangeEvent();
		assert.strictEqual(capabilitiesChangeCounter, 2);

		input.fireDirtyChangeEvent();
		otherInput.fireDirtyChangeEvent();
		assert.strictEqual(dirtyChangeCounter, 1);

		input.fireLabelChangeEvent();
		otherInput.fireLabelChangeEvent();
		assert.strictEqual(labelChangeCounter, 1);
	});

});
