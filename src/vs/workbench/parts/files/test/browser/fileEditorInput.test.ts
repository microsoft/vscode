/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { URI } from 'vs/base/common/uri';
import { join } from 'vs/base/common/paths';
import { FileEditorInput } from 'vs/workbench/parts/files/common/editors/fileEditorInput';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { workbenchInstantiationService, TestTextFileService } from 'vs/workbench/test/workbenchTestServices';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { EncodingMode, Verbosity } from 'vs/workbench/common/editor';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { FileOperationResult, FileOperationError } from 'vs/platform/files/common/files';
import { TextFileEditorModel } from 'vs/workbench/services/textfile/common/textFileEditorModel';
import { IModelService } from 'vs/editor/common/services/modelService';
import { timeout } from 'vs/base/common/async';

function toResource(self, path) {
	return URI.file(join('C:\\', Buffer.from(self.test.fullTitle()).toString('base64'), path));
}

class ServiceAccessor {
	constructor(
		@IEditorService public editorService: IEditorService,
		@ITextFileService public textFileService: TestTextFileService,
		@IModelService public modelService: IModelService
	) {
	}
}

suite('Files - FileEditorInput', () => {

	let instantiationService: IInstantiationService;
	let accessor: ServiceAccessor;

	setup(() => {
		instantiationService = workbenchInstantiationService();
		accessor = instantiationService.createInstance(ServiceAccessor);
	});

	test('Basics', function () {
		let input = instantiationService.createInstance(FileEditorInput, toResource(this, '/foo/bar/file.js'), undefined);
		const otherInput = instantiationService.createInstance(FileEditorInput, toResource(this, 'foo/bar/otherfile.js'), undefined);
		const otherInputSame = instantiationService.createInstance(FileEditorInput, toResource(this, 'foo/bar/file.js'), undefined);

		assert(input.matches(input));
		assert(input.matches(otherInputSame));
		assert(!input.matches(otherInput));
		assert(!input.matches(null));
		assert.ok(input.getName());
		assert.ok(input.getDescription());
		assert.ok(input.getTitle(Verbosity.SHORT));

		assert.strictEqual('file.js', input.getName());

		assert.strictEqual(toResource(this, '/foo/bar/file.js').fsPath, input.getResource().fsPath);
		assert(input.getResource() instanceof URI);

		input = instantiationService.createInstance(FileEditorInput, toResource(this, '/foo/bar.html'), undefined);

		const inputToResolve: FileEditorInput = instantiationService.createInstance(FileEditorInput, toResource(this, '/foo/bar/file.js'), undefined);
		const sameOtherInput: FileEditorInput = instantiationService.createInstance(FileEditorInput, toResource(this, '/foo/bar/file.js'), undefined);

		return inputToResolve.resolve().then(resolved => {
			assert.ok(inputToResolve.isResolved());

			const resolvedModelA = resolved;
			return inputToResolve.resolve().then(resolved => {
				assert(resolvedModelA === resolved); // OK: Resolved Model cached globally per input

				return sameOtherInput.resolve().then(otherResolved => {
					assert(otherResolved === resolvedModelA); // OK: Resolved Model cached globally per input

					inputToResolve.dispose();

					return inputToResolve.resolve().then(resolved => {
						assert(resolvedModelA === resolved); // Model is still the same because we had 2 clients

						inputToResolve.dispose();
						sameOtherInput.dispose();

						resolvedModelA.dispose();

						return inputToResolve.resolve().then(resolved => {
							assert(resolvedModelA !== resolved); // Different instance, because input got disposed

							let stat = (resolved as TextFileEditorModel).getStat();
							return inputToResolve.resolve().then(resolved => {
								return timeout(0).then(() => { // due to file editor input using `reload: { async: true }`
									assert(stat !== (resolved as TextFileEditorModel).getStat()); // Different stat, because resolve always goes to the server for refresh
								});
							});
						});
					});
				});
			});
		});
	});

	test('matches', function () {
		const input1 = instantiationService.createInstance(FileEditorInput, toResource(this, '/foo/bar/updatefile.js'), undefined);
		const input2 = instantiationService.createInstance(FileEditorInput, toResource(this, '/foo/bar/updatefile.js'), undefined);
		const input3 = instantiationService.createInstance(FileEditorInput, toResource(this, '/foo/bar/other.js'), undefined);
		const input2Upper = instantiationService.createInstance(FileEditorInput, toResource(this, '/foo/bar/UPDATEFILE.js'), undefined);

		assert.strictEqual(input1.matches(null), false);
		assert.strictEqual(input1.matches(input1), true);
		assert.strictEqual(input1.matches(input2), true);
		assert.strictEqual(input1.matches(input3), false);

		assert.strictEqual(input1.matches(input2Upper), false);
	});

	test('getEncoding/setEncoding', function () {
		const input = instantiationService.createInstance(FileEditorInput, toResource(this, '/foo/bar/updatefile.js'), undefined);

		input.setEncoding('utf16', EncodingMode.Encode);
		assert.equal(input.getEncoding(), 'utf16');

		return input.resolve().then((resolved: TextFileEditorModel) => {
			assert.equal(input.getEncoding(), resolved.getEncoding());

			resolved.dispose();
		});
	});

	test('save', function () {
		const input = instantiationService.createInstance(FileEditorInput, toResource(this, '/foo/bar/updatefile.js'), undefined);

		return input.resolve().then((resolved: TextFileEditorModel) => {
			resolved.textEditorModel.setValue('changed');
			assert.ok(input.isDirty());

			return input.save().then(() => {
				assert.ok(!input.isDirty());

				resolved.dispose();
			});
		});
	});

	test('revert', function () {
		const input = instantiationService.createInstance(FileEditorInput, toResource(this, '/foo/bar/updatefile.js'), undefined);

		return input.resolve().then((resolved: TextFileEditorModel) => {
			resolved.textEditorModel.setValue('changed');
			assert.ok(input.isDirty());

			return input.revert().then(() => {
				assert.ok(!input.isDirty());

				resolved.dispose();
			});
		});
	});

	test('resolve handles binary files', function () {
		const input = instantiationService.createInstance(FileEditorInput, toResource(this, '/foo/bar/updatefile.js'), undefined);

		accessor.textFileService.setResolveTextContentErrorOnce(new FileOperationError('error', FileOperationResult.FILE_IS_BINARY));

		return input.resolve().then(resolved => {
			assert.ok(resolved);

			resolved.dispose();
		});
	});

	test('resolve handles too large files', function () {
		const input = instantiationService.createInstance(FileEditorInput, toResource(this, '/foo/bar/updatefile.js'), undefined);

		accessor.textFileService.setResolveTextContentErrorOnce(new FileOperationError('error', FileOperationResult.FILE_TOO_LARGE));

		return input.resolve().then(resolved => {
			assert.ok(resolved);

			resolved.dispose();
		});
	});
});
