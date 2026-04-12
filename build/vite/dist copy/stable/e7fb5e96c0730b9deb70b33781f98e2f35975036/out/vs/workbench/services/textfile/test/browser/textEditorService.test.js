/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { isResourceDiffEditorInput, isResourceSideBySideEditorInput, isUntitledResourceEditorInput } from '../../../../common/editor.js';
import { workbenchInstantiationService, registerTestEditor, TestFileEditorInput, registerTestResourceEditor, registerTestSideBySideEditor } from '../../../../test/browser/workbenchTestServices.js';
import { TextResourceEditorInput } from '../../../../common/editor/textResourceEditorInput.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { FileEditorInput } from '../../../../contrib/files/browser/editors/fileEditorInput.js';
import { UntitledTextEditorInput } from '../../../untitled/common/untitledTextEditorInput.js';
import { ensureNoDisposablesAreLeakedInTestSuite, toResource } from '../../../../../base/test/common/utils.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { NullFileSystemProvider } from '../../../../../platform/files/test/common/nullFileSystemProvider.js';
import { DiffEditorInput } from '../../../../common/editor/diffEditorInput.js';
import { isLinux } from '../../../../../base/common/platform.js';
import { SideBySideEditorInput } from '../../../../common/editor/sideBySideEditorInput.js';
import { TextEditorService } from '../../common/textEditorService.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
suite('TextEditorService', () => {
    const TEST_EDITOR_ID = 'MyTestEditorForEditorService';
    const TEST_EDITOR_INPUT_ID = 'testEditorInputForEditorService';
    let FileServiceProvider = class FileServiceProvider extends Disposable {
        constructor(scheme, fileService) {
            super();
            this._register(fileService.registerProvider(scheme, new NullFileSystemProvider()));
        }
    };
    FileServiceProvider = __decorate([
        __param(1, IFileService)
    ], FileServiceProvider);
    const disposables = new DisposableStore();
    setup(() => {
        disposables.add(registerTestEditor(TEST_EDITOR_ID, [new SyncDescriptor(TestFileEditorInput)], TEST_EDITOR_INPUT_ID));
        disposables.add(registerTestResourceEditor());
        disposables.add(registerTestSideBySideEditor());
    });
    teardown(() => {
        disposables.clear();
    });
    test('createTextEditor - basics', async function () {
        const instantiationService = workbenchInstantiationService(undefined, disposables);
        const languageService = instantiationService.get(ILanguageService);
        const service = disposables.add(instantiationService.createInstance(TextEditorService));
        const languageId = 'create-input-test';
        disposables.add(languageService.registerLanguage({
            id: languageId,
        }));
        // Untyped Input (file)
        let input = disposables.add(service.createTextEditor({ resource: toResource.call(this, '/index.html'), options: { selection: { startLineNumber: 1, startColumn: 1 } } }));
        assert(input instanceof FileEditorInput);
        let contentInput = input;
        assert.strictEqual(contentInput.resource.fsPath, toResource.call(this, '/index.html').fsPath);
        // Untyped Input (file casing)
        input = disposables.add(service.createTextEditor({ resource: toResource.call(this, '/index.html') }));
        const inputDifferentCase = disposables.add(service.createTextEditor({ resource: toResource.call(this, '/INDEX.html') }));
        if (!isLinux) {
            assert.strictEqual(input, inputDifferentCase);
            assert.strictEqual(input.resource?.toString(), inputDifferentCase.resource?.toString());
        }
        else {
            assert.notStrictEqual(input, inputDifferentCase);
            assert.notStrictEqual(input.resource?.toString(), inputDifferentCase.resource?.toString());
        }
        // Typed Input
        assert.strictEqual(disposables.add(service.createTextEditor(input)), input);
        // Untyped Input (file, encoding)
        input = disposables.add(service.createTextEditor({ resource: toResource.call(this, '/index.html'), encoding: 'utf16le', options: { selection: { startLineNumber: 1, startColumn: 1 } } }));
        assert(input instanceof FileEditorInput);
        contentInput = input;
        assert.strictEqual(contentInput.getPreferredEncoding(), 'utf16le');
        // Untyped Input (file, language)
        input = disposables.add(service.createTextEditor({ resource: toResource.call(this, '/index.html'), languageId: languageId }));
        assert(input instanceof FileEditorInput);
        contentInput = input;
        assert.strictEqual(contentInput.getPreferredLanguageId(), languageId);
        let fileModel = disposables.add(await contentInput.resolve());
        assert.strictEqual(fileModel.textEditorModel?.getLanguageId(), languageId);
        // Untyped Input (file, contents)
        input = disposables.add(service.createTextEditor({ resource: toResource.call(this, '/index.html'), contents: 'My contents' }));
        assert(input instanceof FileEditorInput);
        contentInput = input;
        fileModel = disposables.add(await contentInput.resolve());
        assert.strictEqual(fileModel.textEditorModel?.getValue(), 'My contents');
        assert.strictEqual(fileModel.isDirty(), true);
        // Untyped Input (file, different language)
        input = disposables.add(service.createTextEditor({ resource: toResource.call(this, '/index.html'), languageId: 'text' }));
        assert(input instanceof FileEditorInput);
        contentInput = input;
        assert.strictEqual(contentInput.getPreferredLanguageId(), 'text');
        // Untyped Input (untitled)
        input = disposables.add(service.createTextEditor({ resource: undefined, options: { selection: { startLineNumber: 1, startColumn: 1 } } }));
        assert(input instanceof UntitledTextEditorInput);
        // Untyped Input (untitled with contents)
        let untypedInput = { contents: 'Hello Untitled', options: { selection: { startLineNumber: 1, startColumn: 1 } } };
        input = disposables.add(service.createTextEditor(untypedInput));
        assert.ok(isUntitledResourceEditorInput(untypedInput));
        assert(input instanceof UntitledTextEditorInput);
        let model = disposables.add(await input.resolve());
        assert.strictEqual(model.textEditorModel?.getValue(), 'Hello Untitled');
        // Untyped Input (untitled with language id)
        input = disposables.add(service.createTextEditor({ resource: undefined, languageId: languageId, options: { selection: { startLineNumber: 1, startColumn: 1 } } }));
        assert(input instanceof UntitledTextEditorInput);
        model = disposables.add(await input.resolve());
        assert.strictEqual(model.getLanguageId(), languageId);
        // Untyped Input (untitled with file path)
        input = disposables.add(service.createTextEditor({ resource: URI.file('/some/path.txt'), forceUntitled: true, options: { selection: { startLineNumber: 1, startColumn: 1 } } }));
        assert(input instanceof UntitledTextEditorInput);
        assert.ok(input.hasAssociatedFilePath);
        // Untyped Input (untitled with untitled resource)
        untypedInput = { resource: URI.parse('untitled://Untitled-1'), forceUntitled: true, options: { selection: { startLineNumber: 1, startColumn: 1 } } };
        assert.ok(isUntitledResourceEditorInput(untypedInput));
        input = disposables.add(service.createTextEditor(untypedInput));
        assert(input instanceof UntitledTextEditorInput);
        assert.ok(!input.hasAssociatedFilePath);
        // Untyped input (untitled with custom resource, but forceUntitled)
        untypedInput = { resource: URI.file('/fake'), forceUntitled: true };
        assert.ok(isUntitledResourceEditorInput(untypedInput));
        input = disposables.add(service.createTextEditor(untypedInput));
        assert(input instanceof UntitledTextEditorInput);
        // Untyped Input (untitled with custom resource)
        const provider = disposables.add(instantiationService.createInstance(FileServiceProvider, 'untitled-custom'));
        input = disposables.add(service.createTextEditor({ resource: URI.parse('untitled-custom://some/path'), forceUntitled: true, options: { selection: { startLineNumber: 1, startColumn: 1 } } }));
        assert(input instanceof UntitledTextEditorInput);
        assert.ok(input.hasAssociatedFilePath);
        provider.dispose();
        // Untyped Input (resource)
        input = disposables.add(service.createTextEditor({ resource: URI.parse('custom:resource') }));
        assert(input instanceof TextResourceEditorInput);
        // Untyped Input (diff)
        const resourceDiffInput = {
            modified: { resource: toResource.call(this, '/modified.html') },
            original: { resource: toResource.call(this, '/original.html') }
        };
        assert.strictEqual(isResourceDiffEditorInput(resourceDiffInput), true);
        input = disposables.add(service.createTextEditor(resourceDiffInput));
        assert(input instanceof DiffEditorInput);
        disposables.add(input.modified);
        disposables.add(input.original);
        assert.strictEqual(input.original.resource?.toString(), resourceDiffInput.original.resource.toString());
        assert.strictEqual(input.modified.resource?.toString(), resourceDiffInput.modified.resource.toString());
        const untypedDiffInput = input.toUntyped();
        assert.strictEqual(untypedDiffInput.original.resource?.toString(), resourceDiffInput.original.resource.toString());
        assert.strictEqual(untypedDiffInput.modified.resource?.toString(), resourceDiffInput.modified.resource.toString());
        // Untyped Input (side by side)
        const sideBySideResourceInput = {
            primary: { resource: toResource.call(this, '/primary.html') },
            secondary: { resource: toResource.call(this, '/secondary.html') }
        };
        assert.strictEqual(isResourceSideBySideEditorInput(sideBySideResourceInput), true);
        input = disposables.add(service.createTextEditor(sideBySideResourceInput));
        assert(input instanceof SideBySideEditorInput);
        disposables.add(input.primary);
        disposables.add(input.secondary);
        assert.strictEqual(input.primary.resource?.toString(), sideBySideResourceInput.primary.resource.toString());
        assert.strictEqual(input.secondary.resource?.toString(), sideBySideResourceInput.secondary.resource.toString());
        const untypedSideBySideInput = input.toUntyped();
        assert.strictEqual(untypedSideBySideInput.primary.resource?.toString(), sideBySideResourceInput.primary.resource.toString());
        assert.strictEqual(untypedSideBySideInput.secondary.resource?.toString(), sideBySideResourceInput.secondary.resource.toString());
    });
    test('createTextEditor- caching', function () {
        const instantiationService = workbenchInstantiationService(undefined, disposables);
        const service = disposables.add(instantiationService.createInstance(TextEditorService));
        // Cached Input (Files)
        const fileResource1 = toResource.call(this, '/foo/bar/cache1.js');
        const fileEditorInput1 = disposables.add(service.createTextEditor({ resource: fileResource1 }));
        assert.ok(fileEditorInput1);
        const fileResource2 = toResource.call(this, '/foo/bar/cache2.js');
        const fileEditorInput2 = disposables.add(service.createTextEditor({ resource: fileResource2 }));
        assert.ok(fileEditorInput2);
        assert.notStrictEqual(fileEditorInput1, fileEditorInput2);
        const fileEditorInput1Again = disposables.add(service.createTextEditor({ resource: fileResource1 }));
        assert.strictEqual(fileEditorInput1Again, fileEditorInput1);
        fileEditorInput1Again.dispose();
        assert.ok(fileEditorInput1.isDisposed());
        const fileEditorInput1AgainAndAgain = disposables.add(service.createTextEditor({ resource: fileResource1 }));
        assert.notStrictEqual(fileEditorInput1AgainAndAgain, fileEditorInput1);
        assert.ok(!fileEditorInput1AgainAndAgain.isDisposed());
        // Cached Input (Resource)
        const resource1 = URI.from({ scheme: 'custom', path: '/foo/bar/cache1.js' });
        const input1 = disposables.add(service.createTextEditor({ resource: resource1 }));
        assert.ok(input1);
        const resource2 = URI.from({ scheme: 'custom', path: '/foo/bar/cache2.js' });
        const input2 = disposables.add(service.createTextEditor({ resource: resource2 }));
        assert.ok(input2);
        assert.notStrictEqual(input1, input2);
        const input1Again = disposables.add(service.createTextEditor({ resource: resource1 }));
        assert.strictEqual(input1Again, input1);
        input1Again.dispose();
        assert.ok(input1.isDisposed());
        const input1AgainAndAgain = disposables.add(service.createTextEditor({ resource: resource1 }));
        assert.notStrictEqual(input1AgainAndAgain, input1);
        assert.ok(!input1AgainAndAgain.isDisposed());
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dEVkaXRvclNlcnZpY2UudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90ZXh0ZmlsZS90ZXN0L2Jyb3dzZXIvdGV4dEVkaXRvclNlcnZpY2UudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBNEQseUJBQXlCLEVBQUUsK0JBQStCLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNuTSxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsa0JBQWtCLEVBQUUsbUJBQW1CLEVBQUUsMEJBQTBCLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNyTSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMvRixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFDN0YsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBQy9GLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQzlGLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxVQUFVLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUMvRyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDN0UsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUV0RixPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxxRUFBcUUsQ0FBQztBQUM3RyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDL0UsT0FBTyxFQUFF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