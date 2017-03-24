/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import URI from 'vs/base/common/uri';
import { join } from 'vs/base/common/paths';
import { FileEditorInput } from 'vs/workbench/parts/files/common/editors/fileEditorInput';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { workbenchInstantiationService, TestTextFileService } from 'vs/workbench/test/workbenchTestServices';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { EncodingMode } from 'vs/workbench/common/editor';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { FileOperationResult, IFileOperationResult } from 'vs/platform/files/common/files';
import { TextFileEditorModel } from 'vs/workbench/services/textfile/common/textFileEditorModel';
import { Verbosity } from 'vs/platform/editor/common/editor';

function toResource(path) {
	return URI.file(join('C:\\', new Buffer(this.test.fullTitle()).toString('base64'), path));
}

class ServiceAccessor {
	constructor(
		@IWorkbenchEditorService public editorService: IWorkbenchEditorService,
		@ITextFileService public textFileService: TestTextFileService
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

	test('Basics', function (done) {
		let input = instantiationService.createInstance(FileEditorInput, toResource.call(this, '/foo/bar/file.js'), void 0);
		const otherInput = instantiationService.createInstance(FileEditorInput, toResource.call(this, 'foo/bar/otherfile.js'), void 0);
		const otherInputSame = instantiationService.createInstance(FileEditorInput, toResource.call(this, 'foo/bar/file.js'), void 0);

		assert(input.matches(input));
		assert(input.matches(otherInputSame));
		assert(!input.matches(otherInput));
		assert(!input.matches(null));
		assert.ok(input.getName());
		assert.ok(input.getDescription());
		assert.ok(input.getTitle(Verbosity.SHORT));

		assert.strictEqual('file.js', input.getName());

		assert.strictEqual(toResource.call(this, '/foo/bar/file.js').fsPath, input.getResource().fsPath);
		assert(input.getResource() instanceof URI);

		input = instantiationService.createInstance(FileEditorInput, toResource.call(this, '/foo/bar.html'), void 0);

		const inputToResolve: FileEditorInput = instantiationService.createInstance(FileEditorInput, toResource.call(this, '/foo/bar/file.js'), void 0);
		const sameOtherInput: FileEditorInput = instantiationService.createInstance(FileEditorInput, toResource.call(this, '/foo/bar/file.js'), void 0);

		return inputToResolve.resolve(true).then(resolved => {
			assert.ok(inputToResolve.isResolved());

			const resolvedModelA = resolved;
			return inputToResolve.resolve(true).then(resolved => {
				assert(resolvedModelA === resolved); // OK: Resolved Model cached globally per input

				return sameOtherInput.resolve(true).then(otherResolved => {
					assert(otherResolved === resolvedModelA); // OK: Resolved Model cached globally per input

					inputToResolve.dispose();

					return inputToResolve.resolve(true).then(resolved => {
						assert(resolvedModelA === resolved); // Model is still the same because we had 2 clients

						inputToResolve.dispose();
						sameOtherInput.dispose();

						resolvedModelA.dispose();

						return inputToResolve.resolve(true).then((resolved: TextFileEditorModel) => {
							assert(resolvedModelA !== resolved); // Different instance, because input got disposed

							let stat = resolved.getStat();
							return inputToResolve.resolve(true).then((resolved: TextFileEditorModel) => {
								assert(stat !== resolved.getStat()); // Different stat, because resolve always goes to the server for refresh

								stat = resolved.getStat();
								return inputToResolve.resolve(false).then((resolved: TextFileEditorModel) => {
									assert(stat === resolved.getStat()); // Same stat, because not refreshed

									done();
								});
							});
						});
					});
				});
			});
		});
	});

	test('matches', function () {
		const input1 = instantiationService.createInstance(FileEditorInput, toResource.call(this, '/foo/bar/updatefile.js'), void 0);
		const input2 = instantiationService.createInstance(FileEditorInput, toResource.call(this, '/foo/bar/updatefile.js'), void 0);
		const input3 = instantiationService.createInstance(FileEditorInput, toResource.call(this, '/foo/bar/other.js'), void 0);
		const input2Upper = instantiationService.createInstance(FileEditorInput, toResource.call(this, '/foo/bar/UPDATEFILE.js'), void 0);

		assert.strictEqual(input1.matches(null), false);
		assert.strictEqual(input1.matches(input1), true);
		assert.strictEqual(input1.matches(input2), true);
		assert.strictEqual(input1.matches(input3), false);

		assert.strictEqual(input1.matches(input2Upper), false);
	});

	test('getEncoding/setEncoding', function (done) {
		const input = instantiationService.createInstance(FileEditorInput, toResource.call(this, '/foo/bar/updatefile.js'), void 0);

		input.setEncoding('utf16', EncodingMode.Encode);
		assert.equal(input.getEncoding(), 'utf16');

		return input.resolve(true).then((resolved: TextFileEditorModel) => {
			assert.equal(input.getEncoding(), resolved.getEncoding());

			resolved.dispose();

			done();
		});
	});

	test('save', function (done) {
		const input = instantiationService.createInstance(FileEditorInput, toResource.call(this, '/foo/bar/updatefile.js'), void 0);

		return input.resolve(true).then((resolved: TextFileEditorModel) => {
			resolved.textEditorModel.setValue('changed');
			assert.ok(input.isDirty());

			input.save().then(() => {
				assert.ok(!input.isDirty());

				resolved.dispose();

				done();
			});
		});
	});

	test('revert', function (done) {
		const input = instantiationService.createInstance(FileEditorInput, toResource.call(this, '/foo/bar/updatefile.js'), void 0);

		return input.resolve(true).then((resolved: TextFileEditorModel) => {
			resolved.textEditorModel.setValue('changed');
			assert.ok(input.isDirty());

			input.revert().then(() => {
				assert.ok(!input.isDirty());

				resolved.dispose();

				done();
			});
		});
	});

	test('resolve handles binary files', function (done) {
		const input = instantiationService.createInstance(FileEditorInput, toResource.call(this, '/foo/bar/updatefile.js'), void 0);

		accessor.textFileService.setResolveTextContentErrorOnce(<IFileOperationResult>{
			message: 'error',
			fileOperationResult: FileOperationResult.FILE_IS_BINARY
		});

		return input.resolve(true).then(resolved => {
			assert.ok(resolved);

			resolved.dispose();

			done();
		});
	});
});