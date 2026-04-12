/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite, toResource } from '../../../../../base/test/common/utils.js';
import { FileEditorInput } from '../../browser/editors/fileEditorInput.js';
import { workbenchInstantiationService, TestServiceAccessor, getLastResolvedFileStat } from '../../../../test/browser/workbenchTestServices.js';
import { EditorExtensions } from '../../../../common/editor.js';
import { TextFileOperationError } from '../../../../services/textfile/common/textfiles.js';
import { NotModifiedSinceFileOperationError, TooLargeFileOperationError } from '../../../../../platform/files/common/files.js';
import { TextFileEditorModel } from '../../../../services/textfile/common/textFileEditorModel.js';
import { timeout } from '../../../../../base/common/async.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../../../editor/common/languages/modesRegistry.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { BinaryEditorModel } from '../../../../common/editor/binaryEditorModel.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { FileEditorInputSerializer } from '../../browser/editors/fileEditorHandler.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TextEditorService } from '../../../../services/textfile/common/textEditorService.js';
suite('Files - FileEditorInput', () => {
    const disposables = new DisposableStore();
    let instantiationService;
    let accessor;
    function createFileInput(resource, preferredResource, preferredLanguageId, preferredName, preferredDescription, preferredContents) {
        return disposables.add(instantiationService.createInstance(FileEditorInput, resource, preferredResource, preferredName, preferredDescription, undefined, preferredLanguageId, preferredContents));
    }
    class TestTextEditorService extends TextEditorService {
        createTextEditor(input) {
            return createFileInput(input.resource);
        }
        async resolveTextEditor(input) {
            return createFileInput(input.resource);
        }
    }
    setup(() => {
        instantiationService = workbenchInstantiationService({
            textEditorService: instantiationService => instantiationService.createInstance(TestTextEditorService)
        }, disposables);
        accessor = instantiationService.createInstance(TestServiceAccessor);
    });
    teardown(() => {
        disposables.clear();
    });
    test('Basics', async function () {
        let input = createFileInput(toResource.call(this, '/foo/bar/file.js'));
        const otherInput = createFileInput(toResource.call(this, 'foo/bar/otherfile.js'));
        const otherInputSame = createFileInput(toResource.call(this, 'foo/bar/file.js'));
        assert(input.matches(input));
        assert(input.matches(otherInputSame));
        assert(!input.matches(otherInput));
        assert.ok(input.getName());
        assert.ok(input.getDescription());
        assert.ok(input.getTitle(0 /* Verbosity.SHORT */));
        assert.ok(!input.hasCapability(4 /* EditorInputCapabilities.Untitled */));
        assert.ok(!input.hasCapability(2 /* EditorInputCapabilities.Readonly */));
        assert.ok(!input.isReadonly());
        assert.ok(!input.hasCapability(8 /* EditorInputCapabilities.Singleton */));
        assert.ok(!input.hasCapability(16 /* EditorInputCapabilities.RequiresTrust */));
        const untypedInput = input.toUntyped({ preserveViewState: 0 });
        assert.strictEqual(untypedInput.resource.toString(), input.resource.toString());
        assert.strictEqual('file.js', input.getName());
        assert.strictEqual(toResource.call(this, '/foo/bar/file.js').fsPath, input.resource.fsPath);
        assert(input.resource instanceof URI);
        input = createFileInput(toResource.call(this, '/foo/bar.html'));
        const inputToResolve = createFileInput(toResource.call(this, '/foo/bar/file.js'));
        const sameOtherInput = createFileInput(toResource.call(this, '/foo/bar/file.js'));
        let resolved = await inputToResolve.resolve();
        assert.ok(inputToResolve.isResolved());
        const resolvedModelA = resolved;
        resolved = await inputToResolve.resolve();
        assert(resolvedModelA === resolved); // OK: Resolved Model cached globally per input
        try {
            DisposableStore.DISABLE_DISPOSED_WARNING = true; // prevent unwanted warning output from occurring
            const otherResolved = await sameOtherInput.resolve();
            assert(otherResolved === resolvedModelA); // OK: Resolved Model cached globally per input
            inputToResolve.dispose();
            resolved = await inputToResolve.resolve();
            assert(resolvedModelA === resolved); // Model is still the same because we had 2 clients
            inputToResolve.dispose();
            sameOtherInput.dispose();
            resolvedModelA.dispose();
            resolved = await inputToResolve.resolve();
            assert(resolvedModelA !== resolved); // Different instance, because input got disposed
            const stat = getLastResolvedFileStat(resolved);
            resolved = await inputToResolve.resolve();
            await timeout(0);
            assert(stat !== getLastResolvedFileStat(resolved)); // Different stat, because resolve always goes to the server for refresh
        }
        finally {
            DisposableStore.DISABLE_DISPOSED_WARNING = false;
        }
    });
    test('reports as untitled without supported file scheme', async function () {
        const input = createFileInput(toResource.call(this, '/foo/bar/file.js').with({ scheme: 'someTestingScheme' }));
        assert.ok(input.hasCapability(4 /* EditorInputCapabilities.Untitled */));
        assert.ok(!input.hasCapability(2 /* EditorInputCapabilities.Readonly */));
        assert.ok(!input.isReadonly());
    });
    test('reports as readonly with readonly file scheme', async function () {
        const inMemoryFilesystemProvider = disposables.add(new InMemoryFileSystemProvider());
        inMemoryFilesystemProvider.setReadOnly(true);
        disposables.add(accessor.fileService.registerProvider('someTestingReadonlyScheme', inMemoryFilesystemProvider));
        const input = createFileInput(toResource.call(this, '/foo/bar/file.js').with({ scheme: 'someTestingReadonlyScheme' }));
        assert.ok(!input.hasCapability(4 /* EditorInputCapabilities.Untitled */));
        assert.ok(input.hasCapability(2 /* EditorInputCapabilities.Readonly */));
        assert.ok(input.isReadonly());
    });
    test('preferred resource', function () {
        const resource = toResource.call(this, '/foo/bar/updatefile.js');
        const preferredResource = toResource.call(this, '/foo/bar/UPDATEFILE.js');
        const inputWithoutPreferredResource = createFileInput(resource);
        assert.strictEqual(inputWithoutPreferredResource.resource.toString(), resource.toString());
        assert.strictEqual(inputWithoutPreferredResource.preferredResource.toString(), resource.toString());
        const inputWithPreferredResource = createFileInput(resource, preferredResource);
        assert.strictEqual(inputWithPreferredResource.resource.toString(), resource.toString());
        assert.strictEqual(inputWithPreferredResource.preferredResource.toString(), preferredResource.toString());
        let didChangeLabel = false;
        disposables.add(inputWithPreferredResource.onDidChangeLabel(e => {
            didChangeLabel = true;
        }));
        assert.strictEqual(inputWithPreferredResource.getName(), 'UPDATEFILE.js');
        const otherPreferredResource = toResource.call(this, '/FOO/BAR/updateFILE.js');
        inputWithPreferredResource.setPreferredResource(otherPreferredResource);
        assert.strictEqual(inputWithPreferredResource.resource.toString(), resource.toString());
        assert.strictEqual(inputWithPreferredResource.preferredResource.toString(), otherPreferredResource.toString());
        assert.strictEqual(inputWithPreferredResource.getName(), 'updateFILE.js');
        assert.strictEqual(didChangeLabel, true);
    });
    test('preferred language', async function () {
        const languageId = 'file-input-test';
        disposables.add(accessor.languageService.registerLanguage({
            id: languageId,
        }));
        const input = createFileInput(toResource.call(this, '/foo/bar/file.js'), undefined, languageId);
        assert.strictEqual(input.getPreferredLanguageId(), languageId);
        const model = disposables.add(await input.resolve());
        assert.strictEqual(model.textEditorModel.getLanguageId(), languageId);
        input.setLanguageId('text');
        assert.strictEqual(input.getPreferredLanguageId(), 'text');
        assert.strictEqual(model.textEditorModel.getLanguageId(), PLAINTEXT_LANGUAGE_ID);
        const input2 = createFileInput(toResource.call(this, '/foo/bar/file.js'));
        input2.setPreferredLanguageId(languageId);
        const model2 = disposables.add(await input2.resolve());
        assert.strictEqual(model2.textEditorModel.getLanguageId(), languageId);
    });
    test('preferred contents', async function () {
        const input = createFileInput(toResource.call(this, '/foo/bar/file.js'), undefined, undefined, undefined, undefined, 'My contents');
        const model = disposables.add(await input.resolve());
        assert.strictEqual(model.textEditorModel.getValue(), 'My contents');
        assert.strictEqual(input.isDirty(), true);
        const untypedInput = input.toUntyped({ preserveViewState: 0 });
        assert.strictEqual(untypedInput.contents, 'My contents');
        const untypedInputWithoutContents = input.toUntyped();
        assert.strictEqual(untypedInputWithoutContents.contents, undefined);
        input.setPreferredContents('Other contents');
        await input.resolve();
        assert.strictEqual(model.textEditorModel.getValue(), 'Other contents');
        model.textEditorModel?.setValue('Changed contents');
        await input.resolve();
        assert.strictEqual(model.textEditorModel.getValue(), 'Changed contents'); // preferred contents only used once
        const input2 = createFileInput(toResource.call(this, '/foo/bar/file.js'));
        input2.setPreferredContents('My contents');
        const model2 = await input2.resolve();
        assert.strictEqual(model2.textEditorModel.getValue(), 'My contents');
        assert.strictEqual(input2.isDirty(), true);
    });
    test('matches', function () {
        const input1 = createFileInput(toResource.call(this, '/foo/bar/updatefile.js'));
        const input2 = createFileInput(toResource.call(this, '/foo/bar/updatefile.js'));
        const input3 = createFileInput(toResource.call(this, '/foo/bar/other.js'));
        const input2Upper = createFileInput(toResource.call(this, '/foo/bar/UPDATEFILE.js'));
        assert.strictEqual(input1.matches(input1), true);
        assert.strictEqual(input1.matches(input2), true);
        assert.strictEqual(input1.matches(input3), false);
        assert.strictEqual(input1.matches(input2Upper), false);
    });
    test('getEncoding/setEncoding', async function () {
        const input = createFileInput(toResource.call(this, '/foo/bar/updatefile.js'));
        await input.setEncoding('utf16', 0 /* EncodingMode.Encode */);
        assert.strictEqual(input.getEncoding(), 'utf16');
        const resolved = disposables.add(await input.resolve());
        assert.strictEqual(input.getEncoding(), resolved.getEncoding());
    });
    test('save', async function () {
        const input = createFileInput(toResource.call(this, '/foo/bar/updatefile.js'));
        const resolved = disposables.add(await input.resolve());
        resolved.textEditorModel.setValue('changed');
        assert.ok(input.isDirty());
        assert.ok(input.isModified());
        await input.save(0);
        assert.ok(!input.isDirty());
        assert.ok(!input.isModified());
    });
    test('revert', async function () {
        const input = createFileInput(toResource.call(this, '/foo/bar/updatefile.js'));
        const resolved = disposables.add(await input.resolve());
        resolved.textEditorModel.setValue('changed');
        assert.ok(input.isDirty());
        assert.ok(input.isModified());
        await input.revert(0);
        assert.ok(!input.isDirty());
        assert.ok(!input.isModified());
        input.dispose();
        assert.ok(input.isDisposed());
    });
    test('resolve handles binary files', async function () {
        const input = createFileInput(toResource.call(this, '/foo/bar/updatefile.js'));
        accessor.textFileService.setReadStreamErrorOnce(new TextFileOperationError('error', 0 /* TextFileOperationResult.FILE_IS_BINARY */));
        const resolved = disposables.add(await input.resolve());
        assert.ok(resolved);
    });
    test('resolve throws for too large files', async function () {
        const input = createFileInput(toResource.call(this, '/foo/bar/updatefile.js'));
        let e = undefined;
        accessor.textFileService.setReadStreamErrorOnce(new TooLargeFileOperationError('error', 7 /* FileOperationResult.FILE_TOO_LARGE */, 1000));
        try {
            await input.resolve();
        }
        catch (error) {
            e = error;
        }
        assert.ok(e);
    });
    test('attaches to model when created and reports dirty', async function () {
        const input = createFileInput(toResource.call(this, '/foo/bar/updatefile.js'));
        let listenerCount = 0;
        disposables.add(input.onDidChangeDirty(() => {
            listenerCount++;
        }));
        // instead of going through file input resolve method
        // we resolve the model directly through the service
        const model = disposables.add(await accessor.textFileService.files.resolve(input.resource));
        model.textEditorModel?.setValue('hello world');
        assert.strictEqual(listenerCount, 1);
        assert.ok(input.isDirty());
    });
    test('force open text/binary', async function () {
        const input = createFileInput(toResource.call(this, '/foo/bar/updatefile.js'));
        input.setForceOpenAsBinary();
        let resolved = disposables.add(await input.resolve());
        assert.ok(resolved instanceof BinaryEditorModel);
        input.setForceOpenAsText();
        resolved = disposables.add(await input.resolve());
        assert.ok(resolved instanceof TextFileEditorModel);
    });
    test('file editor serializer', async function () {
        instantiationService.invokeFunction(accessor => Registry.as(EditorExtensions.EditorFactory).start(accessor));
        const input = createFileInput(toResource.call(this, '/foo/bar/updatefile.js'));
        disposables.add(Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer('workbench.editors.files.fileEditorInput', FileEditorInputSerializer));
        const editorSerializer = Registry.as(EditorExtensions.EditorFactory).getEditorSerializer(input.typeId);
        if (!editorSerializer) {
            assert.fail('File Editor Input Serializer missing');
        }
        assert.strictEqual(editorSerializer.canSerialize(input), true);
        const inputSerialized = editorSerializer.serialize(input);
        if (!inputSerialized) {
            assert.fail('Unexpected serialized file input');
        }
        const inputDeserialized = editorSerializer.deserialize(instantiationService, inputSerialized);
        assert.strictEqual(inputDeserialized ? input.matches(inputDeserialized) : false, true);
        const preferredResource = toResource.call(this, '/foo/bar/UPDATEfile.js');
        const inputWithPreferredResource = createFileInput(toResource.call(this, '/foo/bar/updatefile.js'), preferredResource);
        const inputWithPreferredResourceSerialized = editorSerializer.serialize(inputWithPreferredResource);
        if (!inputWithPreferredResourceSerialized) {
            assert.fail('Unexpected serialized file input');
        }
        const inputWithPreferredResourceDeserialized = editorSerializer.deserialize(instantiationService, inputWithPreferredResourceSerialized);
        assert.strictEqual(inputWithPreferredResource.resource.toString(), inputWithPreferredResourceDeserialized.resource.toString());
        assert.strictEqual(inputWithPreferredResource.preferredResource.toString(), inputWithPreferredResourceDeserialized.preferredResource.toString());
    });
    test('preferred name/description', async function () {
        // Works with custom file input
        const customFileInput = createFileInput(toResource.call(this, '/foo/bar/updatefile.js').with({ scheme: 'test-custom' }), undefined, undefined, 'My Name', 'My Description');
        let didChangeLabelCounter = 0;
        disposables.add(customFileInput.onDidChangeLabel(() => {
            didChangeLabelCounter++;
        }));
        assert.strictEqual(customFileInput.getName(), 'My Name');
        assert.strictEqual(customFileInput.getDescription(), 'My Description');
        customFileInput.setPreferredName('My Name 2');
        customFileInput.setPreferredDescription('My Description 2');
        assert.strictEqual(customFileInput.getName(), 'My Name 2');
        assert.strictEqual(customFileInput.getDescription(), 'My Description 2');
        assert.strictEqual(didChangeLabelCounter, 2);
        customFileInput.dispose();
        // Disallowed with local file input
        const fileInput = createFileInput(toResource.call(this, '/foo/bar/updatefile.js'), undefined, undefined, 'My Name', 'My Description');
        didChangeLabelCounter = 0;
        disposables.add(fileInput.onDidChangeLabel(() => {
            didChangeLabelCounter++;
        }));
        assert.notStrictEqual(fileInput.getName(), 'My Name');
        assert.notStrictEqual(fileInput.getDescription(), 'My Description');
        fileInput.setPreferredName('My Name 2');
        fileInput.setPreferredDescription('My Description 2');
        assert.notStrictEqual(fileInput.getName(), 'My Name 2');
        assert.notStrictEqual(fileInput.getDescription(), 'My Description 2');
        assert.strictEqual(didChangeLabelCounter, 0);
    });
    test('reports readonly changes', async function () {
        const input = createFileInput(toResource.call(this, '/foo/bar/updatefile.js'));
        let listenerCount = 0;
        disposables.add(input.onDidChangeCapabilities(() => {
            listenerCount++;
        }));
        const model = disposables.add(await accessor.textFileService.files.resolve(input.resource));
        assert.strictEqual(model.isReadonly(), false);
        assert.strictEqual(input.hasCapability(2 /* EditorInputCapabilities.Readonly */), false);
        assert.strictEqual(input.isReadonly(), false);
        const stat = await accessor.fileService.resolve(input.resource, { resolveMetadata: true });
        try {
            accessor.fileService.readShouldThrowError = new NotModifiedSinceFileOperationError('file not modified since', { ...stat, readonly: true });
            await input.resolve();
        }
        finally {
            accessor.fileService.readShouldThrowError = undefined;
        }
        assert.strictEqual(!!model.isReadonly(), true);
        assert.strictEqual(input.hasCapability(2 /* EditorInputCapabilities.Readonly */), true);
        assert.strictEqual(!!input.isReadonly(), true);
        assert.strictEqual(listenerCount, 1);
        try {
            accessor.fileService.readShouldThrowError = new NotModifiedSinceFileOperationError('file not modified since', { ...stat, readonly: false });
            await input.resolve();
        }
        finally {
            accessor.fileService.readShouldThrowError = undefined;
        }
        assert.strictEqual(model.isReadonly(), false);
        assert.strictEqual(input.hasCapability(2 /* EditorInputCapabilities.Readonly */), false);
        assert.strictEqual(input.isReadonly(), false);
        assert.strictEqual(listenerCount, 2);
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmlsZUVkaXRvcklucHV0LnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9maWxlcy90ZXN0L2Jyb3dzZXIvZmlsZUVkaXRvcklucHV0LnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsVUFBVSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDL0csT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxtQkFBbUIsRUFBRSx1QkFBdUIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBRWhKLE9BQU8sRUFBcUMsZ0JBQWdCLEVBQTJCLE1BQU0sOEJBQThCLENBQUM7QUFDNUgsT0FBTyxFQUFnQixzQkFBc0IsRUFBMkIsTUFBTSxtREFBbUQsQ0FBQztBQUNsSSxPQUFPLEVBQXVCLGtDQUFrQyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDcEosT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFDbEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUVuRixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDL0UsT0FBTyxFQUFFLHlCQUF5QixFQUFF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