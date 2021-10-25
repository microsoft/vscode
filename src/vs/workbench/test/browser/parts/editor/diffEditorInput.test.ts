/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { workbenchInstantiationService } from 'vs/workbench/test/browser/workbenchTestServices';
import { EditorResourceAccessor, isDiffEditorInput, isResourceDiffEditorInput, isResourceSideBySideEditorInput, IUntypedEditorInput } from 'vs/workbench/common/editor';
import { URI } from 'vs/base/common/uri';
import { DisposableStore } from 'vs/base/common/lifecycle';

suite('Diff editor input', () => {

	class MyEditorInput extends EditorInput {

		constructor(public resource: URI | undefined = undefined) {
			super();
		}

		override get typeId(): string { return 'myEditorInput'; }
		override resolve(): any { return null; }

		override toUntyped() {
			return { resource: this.resource, options: { override: this.typeId } };
		}

		override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
			if (super.matches(otherInput)) {
				return true;
			}

			const resource = EditorResourceAccessor.getCanonicalUri(otherInput);
			return resource?.toString() === this.resource?.toString();
		}
	}

	let disposables: DisposableStore;

	setup(() => {
		disposables = new DisposableStore();
	});

	teardown(() => {
		disposables.dispose();
	});

	test('basics', () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);

		let counter = 0;
		const input = new MyEditorInput();
		input.onWillDispose(() => {
			assert(true);
			counter++;
		});

		const otherInput = new MyEditorInput();
		otherInput.onWillDispose(() => {
			assert(true);
			counter++;
		});

		const diffInput = instantiationService.createInstance(DiffEditorInput, 'name', 'description', input, otherInput, undefined);

		assert.ok(isDiffEditorInput(diffInput));
		assert.ok(!isDiffEditorInput(input));

		assert.strictEqual(diffInput.original, input);
		assert.strictEqual(diffInput.modified, otherInput);
		assert(diffInput.matches(diffInput));
		assert(!diffInput.matches(otherInput));


		diffInput.dispose();
		assert.strictEqual(counter, 0);
	});

	test('toUntyped', () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);

		const input = new MyEditorInput(URI.file('foo/bar1'));
		const otherInput = new MyEditorInput(URI.file('foo/bar2'));

		const diffInput = instantiationService.createInstance(DiffEditorInput, 'name', 'description', input, otherInput, undefined);

		const untypedDiffInput = diffInput.toUntyped();
		assert.ok(isResourceDiffEditorInput(untypedDiffInput));
		assert.ok(!isResourceSideBySideEditorInput(untypedDiffInput));
		assert.ok(diffInput.matches(untypedDiffInput));
	});

	test('disposes when input inside disposes', function () {
		const instantiationService = workbenchInstantiationService(undefined, disposables);

		let counter = 0;
		let input = new MyEditorInput();
		let otherInput = new MyEditorInput();

		let diffInput = instantiationService.createInstance(DiffEditorInput, 'name', 'description', input, otherInput, undefined);
		diffInput.onWillDispose(() => {
			counter++;
			assert(true);
		});

		input.dispose();

		input = new MyEditorInput();
		otherInput = new MyEditorInput();

		let diffInput2 = instantiationService.createInstance(DiffEditorInput, 'name', 'description', input, otherInput, undefined);
		diffInput2.onWillDispose(() => {
			counter++;
			assert(true);
		});

		otherInput.dispose();
		assert.strictEqual(counter, 2);
	});
});
