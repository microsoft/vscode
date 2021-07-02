/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from 'vs/base/common/uri';
import { IResourceDiffEditorInput } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { SideBySideEditorInput } from 'vs/workbench/common/editor/sideBySideEditorInput';
import { TestFileEditorInput } from 'vs/workbench/test/browser/workbenchTestServices';

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

	test('untyped matches', () => {
		const primaryInput = new TestFileEditorInput(URI.file('/fake'), 'primaryId');
		const secondaryInput = new TestFileEditorInput(URI.file('/fake2'), 'secondaryId');
		const sideBySideInput = new SideBySideEditorInput('Side By Side Test', undefined, secondaryInput, primaryInput);

		const primaryUntypedInput = { resource: URI.file('/fake'), options: { override: 'primaryId' } };
		const secondaryUntypedInput = { resource: URI.file('/fake2'), options: { override: 'secondaryId' } };
		const sideBySideUntyped: IResourceDiffEditorInput = { original: secondaryUntypedInput, modified: primaryUntypedInput };

		assert.ok(sideBySideInput.matches(sideBySideUntyped));

		const primaryUntypedInput2 = { resource: URI.file('/fake'), options: { override: 'primaryIdWrong' } };
		const secondaryUntypedInput2 = { resource: URI.file('/fake2'), options: { override: 'secondaryId' } };
		const sideBySideUntyped2: IResourceDiffEditorInput = { original: secondaryUntypedInput2, modified: primaryUntypedInput2 };

		assert.ok(!sideBySideInput.matches(sideBySideUntyped2));

		const primaryUntypedInput3 = { resource: URI.file('/fake'), options: { override: 'primaryId' } };
		const secondaryUntypedInput3 = { resource: URI.file('/fake2Wrong'), options: { override: 'secondaryId' } };
		const sideBySideUntyped3: IResourceDiffEditorInput = { original: secondaryUntypedInput3, modified: primaryUntypedInput3 };

		assert.ok(!sideBySideInput.matches(sideBySideUntyped3));
	});

});
