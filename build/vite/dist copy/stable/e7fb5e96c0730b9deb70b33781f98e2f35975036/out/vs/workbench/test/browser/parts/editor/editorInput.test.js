/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DEFAULT_EDITOR_ASSOCIATION, isEditorInput, isResourceDiffEditorInput, isResourceEditorInput, isResourceMergeEditorInput, isResourceSideBySideEditorInput, isUntitledResourceEditorInput } from '../../../../common/editor.js';
import { DiffEditorInput } from '../../../../common/editor/diffEditorInput.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { TextResourceEditorInput } from '../../../../common/editor/textResourceEditorInput.js';
import { FileEditorInput } from '../../../../contrib/files/browser/editors/fileEditorInput.js';
import { MergeEditorInput } from '../../../../contrib/mergeEditor/browser/mergeEditorInput.js';
import { UntitledTextEditorInput } from '../../../../services/untitled/common/untitledTextEditorInput.js';
import { TestEditorInput, TestServiceAccessor, workbenchInstantiationService } from '../../workbenchTestServices.js';
suite('EditorInput', () => {
    let instantiationService;
    let accessor;
    const disposables = new DisposableStore();
    const testResource = URI.from({ scheme: 'random', path: '/path' });
    const untypedResourceEditorInput = { resource: testResource, options: { override: DEFAULT_EDITOR_ASSOCIATION.id } };
    const untypedTextResourceEditorInput = { resource: testResource, options: { override: DEFAULT_EDITOR_ASSOCIATION.id } };
    const untypedResourceSideBySideEditorInput = { primary: untypedResourceEditorInput, secondary: untypedResourceEditorInput, options: { override: DEFAULT_EDITOR_ASSOCIATION.id } };
    const untypedUntitledResourceEditorinput = { resource: URI.from({ scheme: Schemas.untitled, path: '/path' }), options: { override: DEFAULT_EDITOR_ASSOCIATION.id } };
    const untypedResourceDiffEditorInput = { original: untypedResourceEditorInput, modified: untypedResourceEditorInput, options: { override: DEFAULT_EDITOR_ASSOCIATION.id } };
    const untypedResourceMergeEditorInput = { base: untypedResourceEditorInput, input1: untypedResourceEditorInput, input2: untypedResourceEditorInput, result: untypedResourceEditorInput, options: { override: DEFAULT_EDITOR_ASSOCIATION.id } };
    // Function to easily remove the overrides from the untyped inputs
    const stripOverrides = () => {
        if (!untypedResourceEditorInput.options ||
            !untypedTextResourceEditorInput.options ||
            !untypedUntitledResourceEditorinput.options ||
            !untypedResourceDiffEditorInput.options ||
            !untypedResourceMergeEditorInput.options) {
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
        if (!untypedResourceEditorInput.options ||
            !untypedTextResourceEditorInput.options ||
            !untypedUntitledResourceEditorinput.options ||
            !untypedResourceDiffEditorInput.options ||
            !untypedResourceMergeEditorInput.options) {
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
        constructor() {
            super(...arguments);
            this.resource = undefined;
        }
        get typeId() { return 'myEditorInput'; }
        resolve() { return null; }
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
        assert.ok(!isUntitledResourceEditorInput(input));
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
        const mergeData = { uri: testResource, description: undefined, detail: undefined, title: undefined };
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
        const untitledTextEditorInput = instantiationService.createInstance(UntitledTextEditorInput, untitledModel);
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
        const diffEditorInput = instantiationService.createInstance(DiffEditorInput, undefined, undefined, fileEditorInput1, fileEditorInput2, false);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9ySW5wdXQudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC90ZXN0L2Jyb3dzZXIvcGFydHMvZWRpdG9yL2VkaXRvcklucHV0LnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBR25HLE9BQU8sRUFBRSwwQkFBMEIsRUFBdUYsYUFBYSxFQUFFLHlCQUF5QixFQUFFLHFCQUFxQixFQUFFLDBCQUEwQixFQUFFLCtCQUErQixFQUFFLDZCQUE2QixFQUFvQyxNQUFNLDhCQUE4QixDQUFDO0FBQzlWLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUMvRSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDdkUsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDL0YsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBQy9GLE9BQU8sRUFBRSxnQkFBZ0IsRUFBd0IsTUFBTSw2REFBNkQsQ0FBQztBQUNySCxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUMxRyxPQUFPLEVBQUUsZUFBZSxFQUFFLG1CQUFtQixFQUFFLDZCQUE2QixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFFckgsS0FBSyxDQUFDLGFBQWEsRUFBRSxHQUFHLEVBQUU7SUFF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