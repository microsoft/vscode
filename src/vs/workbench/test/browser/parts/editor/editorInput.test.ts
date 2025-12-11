/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IResourceEditorInput, ITextResourceEditorInput } from '../../../../../platform/editor/common/editor.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { DEFAULT_EDITOR_ASSOCIATION, IResourceDiffEditorInput, IResourceMergeEditorInput, IResourceSideBySideEditorInput, isEditorInput, isResourceDiffEditorInput, isResourceEditorInput, isResourceMergeEditorInput, isResourceSideBySideEditorInput, isUntitledResourceEditorInput, IUntitledTextResourceEditorInput } from '../../../../common/editor.js';
import { DiffEditorInput } from '../../../../common/editor/diffEditorInput.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { TextResourceEditorInput } from '../../../../common/editor/textResourceEditorInput.js';
import { FileEditorInput } from '../../../../contrib/files/browser/editors/fileEditorInput.js';
import { MergeEditorInput, MergeEditorInputData } from '../../../../contrib/mergeEditor/browser/mergeEditorInput.js';
import { UntitledTextEditorInput } from '../../../../services/untitled/common/untitledTextEditorInput.js';
import { TestEditorInput, TestServiceAccessor, workbenchInstantiationService } from '../../workbenchTestServices.js';

suite('EditorInput', () => {

	let instantiationService: IInstantiationService;
	let accessor: TestServiceAccessor;
	const disposables = new DisposableStore();

	const testResource: URI = URI.from({ scheme: 'random', path: '/path' });
	const untypedResourceEditorInput: IResourceEditorInput = { resource: testResource, options: { override: DEFAULT_EDITOR_ASSOCIATION.id } };
	const untypedTextResourceEditorInput: ITextResourceEditorInput = { resource: testResource, options: { override: DEFAULT_EDITOR_ASSOCIATION.id } };
	const untypedResourceSideBySideEditorInput: IResourceSideBySideEditorInput = { primary: untypedResourceEditorInput, secondary: untypedResourceEditorInput, options: { override: DEFAULT_EDITOR_ASSOCIATION.id } };
	const untypedUntitledResourceEditorinput: IUntitledTextResourceEditorInput = { resource: URI.from({ scheme: Schemas.untitled, path: '/path' }), options: { override: DEFAULT_EDITOR_ASSOCIATION.id } };
	const untypedResourceDiffEditorInput: IResourceDiffEditorInput = { original: untypedResourceEditorInput, modified: untypedResourceEditorInput, options: { override: DEFAULT_EDITOR_ASSOCIATION.id } };
	const untypedResourceMergeEditorInput: IResourceMergeEditorInput = { base: untypedResourceEditorInput, input1: untypedResourceEditorInput, input2: untypedResourceEditorInput, result: untypedResourceEditorInput, options: { override: DEFAULT_EDITOR_ASSOCIATION.id } };

	// Function to easily remove the overrides from the untyped inputs
	const stripOverrides = () => {
		if (
			!untypedResourceEditorInput.options ||
			!untypedTextResourceEditorInput.options ||
			!untypedUntitledResourceEditorinput.options ||
			!untypedResourceDiffEditorInput.options ||
			!untypedResourceMergeEditorInput.options
		) {
			throw new Error('Malformed options on untyped inputs');
		}
		// Some of the tests mutate the overrides so we want to reset them on each test
		untypedResourceEditorInput.options.override = undefined;
		untypedTextResourceEditorInput.options.override = undefined;
		untypedUntitledResourceEditorinput.options.override = undefined;
		untypedResourceDiffEditorInput.options.override = undefined;
		untypedResourceMergeEditorInput.options.override = undefined;
	};

	setup(() => {
		instantiationService = workbenchInstantiationService(undefined, disposables);
		accessor = instantiationService.createInstance(TestServiceAccessor);

		if (
			!untypedResourceEditorInput.options ||
			!untypedTextResourceEditorInput.options ||
			!untypedUntitledResourceEditorinput.options ||
			!untypedResourceDiffEditorInput.options ||
			!untypedResourceMergeEditorInput.options
		) {
			throw new Error('Malformed options on untyped inputs');
		}
		// Some of the tests mutate the overrides so we want to reset them on each test
		untypedResourceEditorInput.options.override = DEFAULT_EDITOR_ASSOCIATION.id;
		untypedTextResourceEditorInput.options.override = DEFAULT_EDITOR_ASSOCIATION.id;
		untypedUntitledResourceEditorinput.options.override = DEFAULT_EDITOR_ASSOCIATION.id;
		untypedResourceDiffEditorInput.options.override = DEFAULT_EDITOR_ASSOCIATION.id;
		untypedResourceMergeEditorInput.options.override = DEFAULT_EDITOR_ASSOCIATION.id;
	});

	teardown(() => {
		disposables.clear();
	});

	class MyEditorInput extends EditorInput {
		readonly resource = undefined;

		override get typeId(): string { return 'myEditorInput'; }
		override resolve(): any { return null; }
	}

	test('basics', () => {
		let counter = 0;
		const input = disposables.add(new MyEditorInput());
		const otherInput = disposables.add(new MyEditorInput());

		assert.ok(isEditorInput(input));
		assert.ok(!isEditorInput(undefined));
		assert.ok(!isEditorInput({ resource: URI.file('/') }));
		assert.ok(!isEditorInput({}));

		assert.ok(!isResourceEditorInput(input));
		// eslint-disable-next-line local/code-no-any-casts
		assert.ok(!isUntitledResourceEditorInput(input as any));
		assert.ok(!isResourceDiffEditorInput(input));
		assert.ok(!isResourceMergeEditorInput(input));
		assert.ok(!isResourceSideBySideEditorInput(input));

		assert(input.matches(input));
		assert(!input.matches(otherInput));
		assert(input.getName());

		disposables.add(input.onWillDispose(() => {
			assert(true);
			counter++;
		}));

		input.dispose();
		assert.strictEqual(counter, 1);
	});

	test('untyped matches', () => {
		const testInputID = 'untypedMatches';
		const testInputResource = URI.file('/fake');
		const testInput = disposables.add(new TestEditorInput(testInputResource, testInputID));
		const testUntypedInput = { resource: testInputResource, options: { override: testInputID } };
		const tetUntypedInputWrongResource = { resource: URI.file('/incorrectFake'), options: { override: testInputID } };
		const testUntypedInputWrongId = { resource: testInputResource, options: { override: 'wrongId' } };
		const testUntypedInputWrong = { resource: URI.file('/incorrectFake'), options: { override: 'wrongId' } };

		assert(testInput.matches(testUntypedInput));
		assert.ok(!testInput.matches(tetUntypedInputWrongResource));
		assert.ok(!testInput.matches(testUntypedInputWrongId));
		assert.ok(!testInput.matches(testUntypedInputWrong));
	});

	test('Untpyed inputs properly match TextResourceEditorInput', () => {
		const textResourceEditorInput = instantiationService.createInstance(TextResourceEditorInput, testResource, undefined, undefined, undefined, undefined);

		assert.ok(textResourceEditorInput.matches(untypedResourceEditorInput));
		assert.ok(textResourceEditorInput.matches(untypedTextResourceEditorInput));
		assert.ok(!textResourceEditorInput.matches(untypedResourceSideBySideEditorInput));
		assert.ok(!textResourceEditorInput.matches(untypedUntitledResourceEditorinput));
		assert.ok(!textResourceEditorInput.matches(untypedResourceDiffEditorInput));
		assert.ok(!textResourceEditorInput.matches(untypedResourceMergeEditorInput));

		textResourceEditorInput.dispose();
	});

	test('Untyped inputs properly match FileEditorInput', () => {
		const fileEditorInput = instantiationService.createInstance(FileEditorInput, testResource, undefined, undefined, undefined, undefined, undefined, undefined);

		assert.ok(fileEditorInput.matches(untypedResourceEditorInput));
		assert.ok(fileEditorInput.matches(untypedTextResourceEditorInput));
		assert.ok(!fileEditorInput.matches(untypedResourceSideBySideEditorInput));
		assert.ok(!fileEditorInput.matches(untypedUntitledResourceEditorinput));
		assert.ok(!fileEditorInput.matches(untypedResourceDiffEditorInput));
		assert.ok(!fileEditorInput.matches(untypedResourceMergeEditorInput));

		// Now we remove the override on the untyped to ensure that FileEditorInput supports lightweight resource matching
		stripOverrides();

		assert.ok(fileEditorInput.matches(untypedResourceEditorInput));
		assert.ok(fileEditorInput.matches(untypedTextResourceEditorInput));
		assert.ok(!fileEditorInput.matches(untypedResourceSideBySideEditorInput));
		assert.ok(!fileEditorInput.matches(untypedUntitledResourceEditorinput));
		assert.ok(!fileEditorInput.matches(untypedResourceDiffEditorInput));
		assert.ok(!fileEditorInput.matches(untypedResourceMergeEditorInput));

		fileEditorInput.dispose();
	});

	test('Untyped inputs properly match MergeEditorInput', () => {
		const mergeData: MergeEditorInputData = { uri: testResource, description: undefined, detail: undefined, title: undefined };
		const mergeEditorInput = instantiationService.createInstance(MergeEditorInput, testResource, mergeData, mergeData, testResource);

		assert.ok(!mergeEditorInput.matches(untypedResourceEditorInput));
		assert.ok(!mergeEditorInput.matches(untypedTextResourceEditorInput));
		assert.ok(!mergeEditorInput.matches(untypedResourceSideBySideEditorInput));
		assert.ok(!mergeEditorInput.matches(untypedUntitledResourceEditorinput));
		assert.ok(!mergeEditorInput.matches(untypedResourceDiffEditorInput));
		assert.ok(mergeEditorInput.matches(untypedResourceMergeEditorInput));

		stripOverrides();

		assert.ok(!mergeEditorInput.matches(untypedResourceEditorInput));
		assert.ok(!mergeEditorInput.matches(untypedTextResourceEditorInput));
		assert.ok(!mergeEditorInput.matches(untypedResourceSideBySideEditorInput));
		assert.ok(!mergeEditorInput.matches(untypedUntitledResourceEditorinput));
		assert.ok(!mergeEditorInput.matches(untypedResourceDiffEditorInput));
		assert.ok(mergeEditorInput.matches(untypedResourceMergeEditorInput));

		mergeEditorInput.dispose();
	});

	test('Untyped inputs properly match UntitledTextEditorInput', () => {
		const untitledModel = accessor.untitledTextEditorService.create({ associatedResource: { authority: '', path: '/path', fragment: '', query: '' } });
		const untitledTextEditorInput: UntitledTextEditorInput = instantiationService.createInstance(UntitledTextEditorInput, untitledModel);

		assert.ok(!untitledTextEditorInput.matches(untypedResourceEditorInput));
		assert.ok(!untitledTextEditorInput.matches(untypedTextResourceEditorInput));
		assert.ok(!untitledTextEditorInput.matches(untypedResourceSideBySideEditorInput));
		assert.ok(untitledTextEditorInput.matches(untypedUntitledResourceEditorinput));
		assert.ok(!untitledTextEditorInput.matches(untypedResourceDiffEditorInput));
		assert.ok(!untitledTextEditorInput.matches(untypedResourceMergeEditorInput));

		stripOverrides();

		assert.ok(!untitledTextEditorInput.matches(untypedResourceEditorInput));
		assert.ok(!untitledTextEditorInput.matches(untypedTextResourceEditorInput));
		assert.ok(!untitledTextEditorInput.matches(untypedResourceSideBySideEditorInput));
		assert.ok(untitledTextEditorInput.matches(untypedUntitledResourceEditorinput));
		assert.ok(!untitledTextEditorInput.matches(untypedResourceDiffEditorInput));
		assert.ok(!untitledTextEditorInput.matches(untypedResourceMergeEditorInput));

		untitledTextEditorInput.dispose();
	});

	test('Untyped inputs properly match DiffEditorInput', () => {
		const fileEditorInput1 = instantiationService.createInstance(FileEditorInput, testResource, undefined, undefined, undefined, undefined, undefined, undefined);
		const fileEditorInput2 = instantiationService.createInstance(FileEditorInput, testResource, undefined, undefined, undefined, undefined, undefined, undefined);
		const diffEditorInput: DiffEditorInput = instantiationService.createInstance(DiffEditorInput, undefined, undefined, fileEditorInput1, fileEditorInput2, false);

		assert.ok(!diffEditorInput.matches(untypedResourceEditorInput));
		assert.ok(!diffEditorInput.matches(untypedTextResourceEditorInput));
		assert.ok(!diffEditorInput.matches(untypedResourceSideBySideEditorInput));
		assert.ok(!diffEditorInput.matches(untypedUntitledResourceEditorinput));
		assert.ok(diffEditorInput.matches(untypedResourceDiffEditorInput));
		assert.ok(!diffEditorInput.matches(untypedResourceMergeEditorInput));

		stripOverrides();

		assert.ok(!diffEditorInput.matches(untypedResourceEditorInput));
		assert.ok(!diffEditorInput.matches(untypedTextResourceEditorInput));
		assert.ok(!diffEditorInput.matches(untypedResourceSideBySideEditorInput));
		assert.ok(!diffEditorInput.matches(untypedUntitledResourceEditorinput));
		assert.ok(diffEditorInput.matches(untypedResourceDiffEditorInput));
		assert.ok(!diffEditorInput.matches(untypedResourceMergeEditorInput));

		diffEditorInput.dispose();
		fileEditorInput1.dispose();
		fileEditorInput2.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
