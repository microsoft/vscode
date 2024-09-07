/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { IResourceDiffEditorInput, IResourceSideBySideEditorInput, isResourceDiffEditorInput, isResourceSideBySideEditorInput, isUntitledResourceEditorInput } from '../../../../common/editor.js';
import { workbenchInstantiationService, registerTestEditor, TestFileEditorInput, registerTestResourceEditor, registerTestSideBySideEditor } from '../../../../test/browser/workbenchTestServices.js';
import { TextResourceEditorInput } from '../../../../common/editor/textResourceEditorInput.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { FileEditorInput } from '../../../../contrib/files/browser/editors/fileEditorInput.js';
import { UntitledTextEditorInput } from '../../../untitled/common/untitledTextEditorInput.js';
import { ensureNoDisposablesAreLeakedInTestSuite, toResource } from '../../../../../base/test/common/utils.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { UntitledTextEditorModel } from '../../../untitled/common/untitledTextEditorModel.js';
import { NullFileSystemProvider } from '../../../../../platform/files/test/common/nullFileSystemProvider.js';
import { DiffEditorInput } from '../../../../common/editor/diffEditorInput.js';
import { isLinux } from '../../../../../base/common/platform.js';
import { SideBySideEditorInput } from '../../../../common/editor/sideBySideEditorInput.js';
import { ITextFileEditorModel } from '../../common/textfiles.js';
import { TextEditorService } from '../../common/textEditorService.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';

suite('TextEditorService', () => {

	const TEST_EDITOR_ID = 'MyTestEditorForEditorService';
	const TEST_EDITOR_INPUT_ID = 'testEditorInputForEditorService';

	class FileServiceProvider extends Disposable {
		constructor(scheme: string, @IFileService fileService: IFileService) {
			super();

			this._register(fileService.registerProvider(scheme, new NullFileSystemProvider()));
		}
	}

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
		let input: EditorInput = disposables.add(service.createTextEditor({ resource: toResource.call(this, '/index.html'), options: { selection: { startLineNumber: 1, startColumn: 1 } } }));
		assert(input instanceof FileEditorInput);
		let contentInput = <FileEditorInput>input;
		assert.strictEqual(contentInput.resource.fsPath, toResource.call(this, '/index.html').fsPath);

		// Untyped Input (file casing)
		input = disposables.add(service.createTextEditor({ resource: toResource.call(this, '/index.html') }));
		const inputDifferentCase = disposables.add(service.createTextEditor({ resource: toResource.call(this, '/INDEX.html') }));

		if (!isLinux) {
			assert.strictEqual(input, inputDifferentCase);
			assert.strictEqual(input.resource?.toString(), inputDifferentCase.resource?.toString());
		} else {
			assert.notStrictEqual(input, inputDifferentCase);
			assert.notStrictEqual(input.resource?.toString(), inputDifferentCase.resource?.toString());
		}

		// Typed Input
		assert.strictEqual(disposables.add(service.createTextEditor(input)), input);

		// Untyped Input (file, encoding)
		input = disposables.add(service.createTextEditor({ resource: toResource.call(this, '/index.html'), encoding: 'utf16le', options: { selection: { startLineNumber: 1, startColumn: 1 } } }));
		assert(input instanceof FileEditorInput);
		contentInput = <FileEditorInput>input;
		assert.strictEqual(contentInput.getPreferredEncoding(), 'utf16le');

		// Untyped Input (file, language)
		input = disposables.add(service.createTextEditor({ resource: toResource.call(this, '/index.html'), languageId: languageId }));
		assert(input instanceof FileEditorInput);
		contentInput = <FileEditorInput>input;
		assert.strictEqual(contentInput.getPreferredLanguageId(), languageId);
		let fileModel = disposables.add((await contentInput.resolve() as ITextFileEditorModel));
		assert.strictEqual(fileModel.textEditorModel?.getLanguageId(), languageId);

		// Untyped Input (file, contents)
		input = disposables.add(service.createTextEditor({ resource: toResource.call(this, '/index.html'), contents: 'My contents' }));
		assert(input instanceof FileEditorInput);
		contentInput = <FileEditorInput>input;
		fileModel = disposables.add((await contentInput.resolve() as ITextFileEditorModel));
		assert.strictEqual(fileModel.textEditorModel?.getValue(), 'My contents');
		assert.strictEqual(fileModel.isDirty(), true);

		// Untyped Input (file, different language)
		input = disposables.add(service.createTextEditor({ resource: toResource.call(this, '/index.html'), languageId: 'text' }));
		assert(input instanceof FileEditorInput);
		contentInput = <FileEditorInput>input;
		assert.strictEqual(contentInput.getPreferredLanguageId(), 'text');

		// Untyped Input (untitled)
		input = disposables.add(service.createTextEditor({ resource: undefined, options: { selection: { startLineNumber: 1, startColumn: 1 } } }));
		assert(input instanceof UntitledTextEditorInput);

		// Untyped Input (untitled with contents)
		let untypedInput: any = { contents: 'Hello Untitled', options: { selection: { startLineNumber: 1, startColumn: 1 } } };
		input = disposables.add(service.createTextEditor(untypedInput));
		assert.ok(isUntitledResourceEditorInput(untypedInput));
		assert(input instanceof UntitledTextEditorInput);
		let model = disposables.add(await input.resolve() as UntitledTextEditorModel);
		assert.strictEqual(model.textEditorModel?.getValue(), 'Hello Untitled');

		// Untyped Input (untitled with language id)
		input = disposables.add(service.createTextEditor({ resource: undefined, languageId: languageId, options: { selection: { startLineNumber: 1, startColumn: 1 } } }));
		assert(input instanceof UntitledTextEditorInput);
		model = disposables.add(await input.resolve() as UntitledTextEditorModel);
		assert.strictEqual(model.getLanguageId(), languageId);

		// Untyped Input (untitled with file path)
		input = disposables.add(service.createTextEditor({ resource: URI.file('/some/path.txt'), forceUntitled: true, options: { selection: { startLineNumber: 1, startColumn: 1 } } }));
		assert(input instanceof UntitledTextEditorInput);
		assert.ok((input as UntitledTextEditorInput).hasAssociatedFilePath);

		// Untyped Input (untitled with untitled resource)
		untypedInput = { resource: URI.parse('untitled://Untitled-1'), forceUntitled: true, options: { selection: { startLineNumber: 1, startColumn: 1 } } };
		assert.ok(isUntitledResourceEditorInput(untypedInput));
		input = disposables.add(service.createTextEditor(untypedInput));
		assert(input instanceof UntitledTextEditorInput);
		assert.ok(!(input as UntitledTextEditorInput).hasAssociatedFilePath);

		// Untyped input (untitled with custom resource, but forceUntitled)
		untypedInput = { resource: URI.file('/fake'), forceUntitled: true };
		assert.ok(isUntitledResourceEditorInput(untypedInput));
		input = disposables.add(service.createTextEditor(untypedInput));
		assert(input instanceof UntitledTextEditorInput);

		// Untyped Input (untitled with custom resource)
		const provider = disposables.add(instantiationService.createInstance(FileServiceProvider, 'untitled-custom'));

		input = disposables.add(service.createTextEditor({ resource: URI.parse('untitled-custom://some/path'), forceUntitled: true, options: { selection: { startLineNumber: 1, startColumn: 1 } } }));
		assert(input instanceof UntitledTextEditorInput);
		assert.ok((input as UntitledTextEditorInput).hasAssociatedFilePath);

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
		const untypedDiffInput = input.toUntyped() as IResourceDiffEditorInput;
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
		const untypedSideBySideInput = input.toUntyped() as IResourceSideBySideEditorInput;
		assert.strictEqual(untypedSideBySideInput.primary.resource?.toString(), sideBySideResourceInput.primary.resource.toString());
		assert.strictEqual(untypedSideBySideInput.secondary.resource?.toString(), sideBySideResourceInput.secondary.resource.toString());
	});

	test('createTextEditor- caching', function () {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const service = disposables.add(instantiationService.createInstance(TextEditorService));

		// Cached Input (Files)
		const fileResource1: URI = toResource.call(this, '/foo/bar/cache1.js');
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
