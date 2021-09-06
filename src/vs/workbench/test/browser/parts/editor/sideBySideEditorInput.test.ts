/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from 'vs/base/common/uri';
import { EditorResourceAccessor, IEditorInput, IResourceSideBySideEditorInput, isResourceSideBySideEditorInput, isSideBySideEditorInput, IUntypedEditorInput } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { SideBySideEditorInput } from 'vs/workbench/common/editor/sideBySideEditorInput';
import { TestFileEditorInput } from 'vs/workbench/test/browser/workbenchTestServices';

suite('SideBySideEditorInput', () => {

	class MyEditorInput extends EditorInput {

		constructor(public resource: URI | undefined = undefined) {
			super();
		}

		fireCapabilitiesChangeEvent(): void {
			this._onDidChangeCapabilities.fire();
		}

		fireDirtyChangeEvent(): void {
			this._onDidChangeDirty.fire();
		}

		fireLabelChangeEvent(): void {
			this._onDidChangeLabel.fire();
		}

		override get typeId(): string { return 'myEditorInput'; }
		override resolve(): any { return null; }

		override toUntyped() {
			return { resource: this.resource, options: { override: this.typeId } };
		}

		override matches(otherInput: IEditorInput | IUntypedEditorInput): boolean {
			if (super.matches(otherInput)) {
				return true;
			}

			const resource = EditorResourceAccessor.getCanonicalUri(otherInput);
			return resource?.toString() === this.resource?.toString();
		}
	}

	test('basics', () => {
		let counter = 0;
		const input = new MyEditorInput(URI.file('/fake'));
		input.onWillDispose(() => {
			assert(true);
			counter++;
		});

		const otherInput = new MyEditorInput(URI.file('/fake2'));
		otherInput.onWillDispose(() => {
			assert(true);
			counter++;
		});

		const sideBySideInput = new SideBySideEditorInput('name', 'description', input, otherInput);

		assert.ok(isSideBySideEditorInput(sideBySideInput));
		assert.ok(!isSideBySideEditorInput(input));

		assert.strictEqual(sideBySideInput.secondary, input);
		assert.strictEqual(sideBySideInput.primary, otherInput);
		assert(sideBySideInput.matches(sideBySideInput));
		assert(!sideBySideInput.matches(otherInput));

		sideBySideInput.dispose();
		assert.strictEqual(counter, 0);
	});

	test('events dispatching', () => {
		let input = new MyEditorInput();
		let otherInput = new MyEditorInput();

		const sideBySideInut = new SideBySideEditorInput('name', 'description', otherInput, input);

		assert.ok(isSideBySideEditorInput(sideBySideInut));

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

	test('toUntyped', () => {
		const primaryInput = new MyEditorInput(URI.file('/fake'));
		const secondaryInput = new MyEditorInput(URI.file('/fake2'));

		const sideBySideInput = new SideBySideEditorInput('Side By Side Test', undefined, secondaryInput, primaryInput);

		const untypedSideBySideInput = sideBySideInput.toUntyped();
		assert.ok(isResourceSideBySideEditorInput(untypedSideBySideInput));
	});

	test('untyped matches', () => {
		const primaryInput = new TestFileEditorInput(URI.file('/fake'), 'primaryId');
		const secondaryInput = new TestFileEditorInput(URI.file('/fake2'), 'secondaryId');
		const sideBySideInput = new SideBySideEditorInput('Side By Side Test', undefined, secondaryInput, primaryInput);

		const primaryUntypedInput = { resource: URI.file('/fake'), options: { override: 'primaryId' } };
		const secondaryUntypedInput = { resource: URI.file('/fake2'), options: { override: 'secondaryId' } };
		const sideBySideUntyped: IResourceSideBySideEditorInput = { primary: primaryUntypedInput, secondary: secondaryUntypedInput };

		assert.ok(sideBySideInput.matches(sideBySideUntyped));

		const primaryUntypedInput2 = { resource: URI.file('/fake'), options: { override: 'primaryIdWrong' } };
		const secondaryUntypedInput2 = { resource: URI.file('/fake2'), options: { override: 'secondaryId' } };
		const sideBySideUntyped2: IResourceSideBySideEditorInput = { primary: primaryUntypedInput2, secondary: secondaryUntypedInput2 };

		assert.ok(!sideBySideInput.matches(sideBySideUntyped2));

		const primaryUntypedInput3 = { resource: URI.file('/fake'), options: { override: 'primaryId' } };
		const secondaryUntypedInput3 = { resource: URI.file('/fake2Wrong'), options: { override: 'secondaryId' } };
		const sideBySideUntyped3: IResourceSideBySideEditorInput = { primary: primaryUntypedInput3, secondary: secondaryUntypedInput3 };

		assert.ok(!sideBySideInput.matches(sideBySideUntyped3));
	});
});
