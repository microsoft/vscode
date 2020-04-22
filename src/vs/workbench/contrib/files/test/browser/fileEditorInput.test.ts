/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from 'vs/base/common/uri';
import { toResource } from 'vs/base/test/common/utils';
import { FileEditorInput } from 'vs/workbench/contrib/files/common/editors/fileEditorInput';
import { workbenchInstantiationService, TestServiceAccessor } from 'vs/workbench/test/browser/workbenchTestServices';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { EncodingMode, Verbosity } from 'vs/workbench/common/editor';
import { TextFileOperationError, TextFileOperationResult } from 'vs/workbench/services/textfile/common/textfiles';
import { FileOperationResult, FileOperationError } from 'vs/platform/files/common/files';
import { TextFileEditorModel } from 'vs/workbench/services/textfile/common/textFileEditorModel';
import { timeout } from 'vs/base/common/async';
import { ModesRegistry, PLAINTEXT_MODE_ID } from 'vs/editor/common/modes/modesRegistry';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { BinaryEditorModel } from 'vs/workbench/common/editor/binaryEditorModel';

suite('Files - FileEditorInput', () => {
	let instantiationService: IInstantiationService;
	let accessor: TestServiceAccessor;

	setup(() => {
		instantiationService = workbenchInstantiationService();
		accessor = instantiationService.createInstance(TestServiceAccessor);
	});

	test('Basics', async function () {
		let input = instantiationService.createInstance(FileEditorInput, toResource.call(this, '/foo/bar/file.js'), undefined, undefined);
		const otherInput = instantiationService.createInstance(FileEditorInput, toResource.call(this, 'foo/bar/otherfile.js'), undefined, undefined);
		const otherInputSame = instantiationService.createInstance(FileEditorInput, toResource.call(this, 'foo/bar/file.js'), undefined, undefined);

		assert(input.matches(input));
		assert(input.matches(otherInputSame));
		assert(!input.matches(otherInput));
		assert(!input.matches(null));
		assert.ok(input.getName());
		assert.ok(input.getDescription());
		assert.ok(input.getTitle(Verbosity.SHORT));

		assert.strictEqual('file.js', input.getName());

		assert.strictEqual(toResource.call(this, '/foo/bar/file.js').fsPath, input.resource.fsPath);
		assert(input.resource instanceof URI);

		input = instantiationService.createInstance(FileEditorInput, toResource.call(this, '/foo/bar.html'), undefined, undefined);

		const inputToResolve: FileEditorInput = instantiationService.createInstance(FileEditorInput, toResource.call(this, '/foo/bar/file.js'), undefined, undefined);
		const sameOtherInput: FileEditorInput = instantiationService.createInstance(FileEditorInput, toResource.call(this, '/foo/bar/file.js'), undefined, undefined);

		let resolved = await inputToResolve.resolve();
		assert.ok(inputToResolve.isResolved());

		const resolvedModelA = resolved;
		resolved = await inputToResolve.resolve();
		assert(resolvedModelA === resolved); // OK: Resolved Model cached globally per input

		try {
			DisposableStore.DISABLE_DISPOSED_WARNING = true; // prevent unwanted warning output from occuring

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

			const stat = (resolved as TextFileEditorModel).getStat();
			resolved = await inputToResolve.resolve();
			await timeout(0);
			assert(stat !== (resolved as TextFileEditorModel).getStat()); // Different stat, because resolve always goes to the server for refresh
		} finally {
			DisposableStore.DISABLE_DISPOSED_WARNING = false;
		}
	});

	test('preferred mode', async function () {
		const mode = 'file-input-test';
		ModesRegistry.registerLanguage({
			id: mode,
		});

		const input = instantiationService.createInstance(FileEditorInput, toResource.call(this, '/foo/bar/file.js'), undefined, mode);
		assert.equal(input.getPreferredMode(), mode);

		const model = await input.resolve() as TextFileEditorModel;
		assert.equal(model.textEditorModel!.getModeId(), mode);

		input.setMode('text');
		assert.equal(input.getPreferredMode(), 'text');
		assert.equal(model.textEditorModel!.getModeId(), PLAINTEXT_MODE_ID);

		const input2 = instantiationService.createInstance(FileEditorInput, toResource.call(this, '/foo/bar/file.js'), undefined, undefined);
		input2.setPreferredMode(mode);

		const model2 = await input2.resolve() as TextFileEditorModel;
		assert.equal(model2.textEditorModel!.getModeId(), mode);
	});

	test('matches', function () {
		const input1 = instantiationService.createInstance(FileEditorInput, toResource.call(this, '/foo/bar/updatefile.js'), undefined, undefined);
		const input2 = instantiationService.createInstance(FileEditorInput, toResource.call(this, '/foo/bar/updatefile.js'), undefined, undefined);
		const input3 = instantiationService.createInstance(FileEditorInput, toResource.call(this, '/foo/bar/other.js'), undefined, undefined);
		const input2Upper = instantiationService.createInstance(FileEditorInput, toResource.call(this, '/foo/bar/UPDATEFILE.js'), undefined, undefined);

		assert.strictEqual(input1.matches(null), false);
		assert.strictEqual(input1.matches(input1), true);
		assert.strictEqual(input1.matches(input2), true);
		assert.strictEqual(input1.matches(input3), false);

		assert.strictEqual(input1.matches(input2Upper), false);
	});

	test('getEncoding/setEncoding', async function () {
		const input = instantiationService.createInstance(FileEditorInput, toResource.call(this, '/foo/bar/updatefile.js'), undefined, undefined);

		input.setEncoding('utf16', EncodingMode.Encode);
		assert.equal(input.getEncoding(), 'utf16');

		const resolved = await input.resolve() as TextFileEditorModel;
		assert.equal(input.getEncoding(), resolved.getEncoding());
		resolved.dispose();
	});

	test('save', async function () {
		const input = instantiationService.createInstance(FileEditorInput, toResource.call(this, '/foo/bar/updatefile.js'), undefined, undefined);

		const resolved = await input.resolve() as TextFileEditorModel;
		resolved.textEditorModel!.setValue('changed');
		assert.ok(input.isDirty());

		await input.save(0);
		assert.ok(!input.isDirty());
		resolved.dispose();
	});

	test('revert', async function () {
		const input = instantiationService.createInstance(FileEditorInput, toResource.call(this, '/foo/bar/updatefile.js'), undefined, undefined);

		const resolved = await input.resolve() as TextFileEditorModel;
		resolved.textEditorModel!.setValue('changed');
		assert.ok(input.isDirty());

		await input.revert(0);
		assert.ok(!input.isDirty());

		input.dispose();
		assert.ok(input.isDisposed());

		resolved.dispose();
	});

	test('resolve handles binary files', async function () {
		const input = instantiationService.createInstance(FileEditorInput, toResource.call(this, '/foo/bar/updatefile.js'), undefined, undefined);

		accessor.textFileService.setResolveTextContentErrorOnce(new TextFileOperationError('error', TextFileOperationResult.FILE_IS_BINARY));

		const resolved = await input.resolve();
		assert.ok(resolved);
		resolved.dispose();
	});

	test('resolve handles too large files', async function () {
		const input = instantiationService.createInstance(FileEditorInput, toResource.call(this, '/foo/bar/updatefile.js'), undefined, undefined);

		accessor.textFileService.setResolveTextContentErrorOnce(new FileOperationError('error', FileOperationResult.FILE_TOO_LARGE));

		const resolved = await input.resolve();
		assert.ok(resolved);
		resolved.dispose();
	});

	test('attaches to model when created and reports dirty', async function () {
		const input = instantiationService.createInstance(FileEditorInput, toResource.call(this, '/foo/bar/updatefile.js'), undefined, undefined);

		let listenerCount = 0;
		const listener = input.onDidChangeDirty(() => {
			listenerCount++;
		});

		// instead of going through file input resolve method
		// we resolve the model directly through the service
		const model = await accessor.textFileService.files.resolve(input.resource);
		model.textEditorModel?.setValue('hello world');

		assert.equal(listenerCount, 1);
		assert.ok(input.isDirty());

		input.dispose();
		listener.dispose();
	});

	test('force open text/binary', async function () {
		const input = instantiationService.createInstance(FileEditorInput, toResource.call(this, '/foo/bar/updatefile.js'), undefined, undefined);
		input.setForceOpenAsBinary();

		let resolved = await input.resolve();
		assert.ok(resolved instanceof BinaryEditorModel);

		input.setForceOpenAsText();

		resolved = await input.resolve();
		assert.ok(resolved instanceof TextFileEditorModel);

		resolved.dispose();
	});
});
