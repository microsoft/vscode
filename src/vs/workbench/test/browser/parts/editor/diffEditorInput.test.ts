/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { DiffEditorInput } from '../../../../common/editor/diffEditorInput.js';
import { workbenchInstantiationService } from '../../workbenchTestServices.js';
import { EditorResourceAccessor, EditorInputCapabilities, isDiffEditorInput, isResourceDiffEditorInput, isResourceSideBySideEditorInput, IUntypedEditorInput } from '../../../../common/editor.js';
import { URI } from '../../../../../base/common/uri.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

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

	const disposables = new DisposableStore();

	teardown(() => {
		disposables.clear();
	});

	test('basics', () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);

		let counter = 0;
		const input = disposables.add(new MyEditorInput());
		disposables.add(input.onWillDispose(() => {
			assert(true);
			counter++;
		}));

		const otherInput = disposables.add(new MyEditorInput());
		disposables.add(otherInput.onWillDispose(() => {
			assert(true);
			counter++;
		}));

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

		const input = disposables.add(new MyEditorInput(URI.file('foo/bar1')));
		const otherInput = disposables.add(new MyEditorInput(URI.file('foo/bar2')));

		const diffInput = instantiationService.createInstance(DiffEditorInput, 'name', 'description', input, otherInput, undefined);

		const untypedDiffInput = diffInput.toUntyped();
		assert.ok(isResourceDiffEditorInput(untypedDiffInput));
		assert.ok(!isResourceSideBySideEditorInput(untypedDiffInput));
		assert.ok(diffInput.matches(untypedDiffInput));
	});

	test('disposes when input inside disposes', function () {
		const instantiationService = workbenchInstantiationService(undefined, disposables);

		let counter = 0;
		let input = disposables.add(new MyEditorInput());
		let otherInput = disposables.add(new MyEditorInput());

		const diffInput = disposables.add(instantiationService.createInstance(DiffEditorInput, 'name', 'description', input, otherInput, undefined));
		disposables.add(diffInput.onWillDispose(() => {
			counter++;
			assert(true);
		}));

		input.dispose();

		input = disposables.add(new MyEditorInput());
		otherInput = disposables.add(new MyEditorInput());

		const diffInput2 = disposables.add(instantiationService.createInstance(DiffEditorInput, 'name', 'description', input, otherInput, undefined));
		disposables.add(diffInput2.onWillDispose(() => {
			counter++;
			assert(true);
		}));

		otherInput.dispose();
		assert.strictEqual(counter, 2);
	});

	test('preferred name avoids forced description when both sides share a name', () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);

		class NamedEditorInput extends MyEditorInput {
			constructor(resource: URI, private readonly name: string) {
				super(resource);
			}

			override getName(): string {
				return this.name;
			}
		}

		const original = disposables.add(new NamedEditorInput(URI.file('/tmp/agent-host/snapshots/before/very/long/path/file.ts'), 'file.ts'));
		const modified = disposables.add(new NamedEditorInput(URI.file('/tmp/agent-host/snapshots/after/very/long/path/file.ts'), 'file.ts'));

		const unlabeled = disposables.add(instantiationService.createInstance(DiffEditorInput, undefined, undefined, original, modified, undefined));
		assert.strictEqual(unlabeled.getName(), 'file.ts ↔ file.ts');
		assert.ok(unlabeled.capabilities & EditorInputCapabilities.ForceDescription);

		const labeled = disposables.add(instantiationService.createInstance(DiffEditorInput, 'file.ts (changes from chat)', undefined, original, modified, undefined));
		assert.strictEqual(labeled.getName(), 'file.ts (changes from chat)');
		assert.strictEqual(labeled.capabilities & EditorInputCapabilities.ForceDescription, 0);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
