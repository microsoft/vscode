/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/workbench/parts/files/browser/files.contribution'; // load our contribution into the test
import * as assert from 'assert';
import {TestInstantiationService} from 'vs/test/utils/instantiationTestUtils';
import URI from 'vs/base/common/uri';
import {join} from 'vs/base/common/paths';
import {FileEditorInput} from 'vs/workbench/parts/files/common/editors/fileEditorInput';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {FileTracker} from 'vs/workbench/parts/files/browser/fileTracker';
import {textFileServiceInstantiationService} from 'vs/test/utils/servicesTestUtils';

function toResource(path) {
	return URI.file(join('C:\\', path));
}

class ServiceAccessor {
	constructor(@IWorkbenchEditorService public editorService: IWorkbenchEditorService) {
	}
}

let accessor: ServiceAccessor;

suite('Files - FileEditorInput', () => {

	let instantiationService: TestInstantiationService;

	setup(() => {
		instantiationService= textFileServiceInstantiationService();
		accessor = instantiationService.createInstance(ServiceAccessor);
	});

	test('FileEditorInput', function (done) {
		let input = instantiationService.createInstance(FileEditorInput, toResource('/foo/bar/file.js'), 'text/javascript', void 0);
		const otherInput = instantiationService.createInstance(FileEditorInput, toResource('foo/bar/otherfile.js'), 'text/javascript', void 0);
		const otherInputSame = instantiationService.createInstance(FileEditorInput, toResource('foo/bar/file.js'), 'text/javascript', void 0);

		assert(input.matches(input));
		assert(input.matches(otherInputSame));
		assert(!input.matches(otherInput));
		assert(!input.matches(null));
		assert(input.getName());

		assert.strictEqual('file.js', input.getName());

		assert.strictEqual(toResource('/foo/bar/file.js').fsPath, input.getResource().fsPath);
		assert(input.getResource() instanceof URI);

		input = instantiationService.createInstance(FileEditorInput, toResource('/foo/bar.html'), 'text/html', void 0);

		const inputToResolve:any = instantiationService.createInstance(FileEditorInput, toResource('/foo/bar/file.js'), 'text/javascript', void 0);
		const sameOtherInput = instantiationService.createInstance(FileEditorInput, toResource('/foo/bar/file.js'), 'text/javascript', void 0);

		return accessor.editorService.resolveEditorModel(inputToResolve, true).then(function (resolved) {
			const resolvedModelA = resolved;
			return accessor.editorService.resolveEditorModel(inputToResolve, true).then(function (resolved) {
				assert(resolvedModelA === resolved); // OK: Resolved Model cached globally per input

				return accessor.editorService.resolveEditorModel(sameOtherInput, true).then(function (otherResolved) {
					assert(otherResolved === resolvedModelA); // OK: Resolved Model cached globally per input

					inputToResolve.dispose(false);

					return accessor.editorService.resolveEditorModel(inputToResolve, true).then(function (resolved) {
						assert(resolvedModelA === resolved); // Model is still the same because we had 2 clients

						inputToResolve.dispose();
						sameOtherInput.dispose();

						resolvedModelA.dispose();

						return accessor.editorService.resolveEditorModel(inputToResolve, true).then(function (resolved) {
							assert(resolvedModelA !== resolved); // Different instance, because input got disposed

							let stat = (<any>resolved).versionOnDiskStat;
							return accessor.editorService.resolveEditorModel(inputToResolve, true).then(function (resolved) {
								assert(stat !== (<any>resolved).versionOnDiskStat); // Different stat, because resolve always goes to the server for refresh

								stat = (<any>resolved).versionOnDiskStat;
								return accessor.editorService.resolveEditorModel(inputToResolve, false).then(function (resolved) {
									assert(stat === (<any>resolved).versionOnDiskStat); // Same stat, because not refreshed

									done();
								});
							});
						});
					});
				});
			});
		});
	});

	test('Input.matches() - FileEditorInput', function () {
		const fileEditorInput = instantiationService.createInstance(FileEditorInput, toResource('/foo/bar/updatefile.js'), 'text/javascript', void 0);
		const contentEditorInput2 = instantiationService.createInstance(FileEditorInput, toResource('/foo/bar/updatefile.js'), 'text/javascript', void 0);

		assert.strictEqual(fileEditorInput.matches(null), false);
		assert.strictEqual(fileEditorInput.matches(fileEditorInput), true);
		assert.strictEqual(fileEditorInput.matches(contentEditorInput2), true);
	});

	test('FileTracker - dispose()', function (done) {
		const tracker = instantiationService.createInstance(FileTracker);

		const inputToResolve = instantiationService.createInstance(FileEditorInput, toResource('/fooss5/bar/file2.js'), 'text/javascript', void 0);
		const sameOtherInput = instantiationService.createInstance(FileEditorInput, toResource('/fooss5/bar/file2.js'), 'text/javascript', void 0);
		return accessor.editorService.resolveEditorModel(inputToResolve).then(function (resolved) {
			return accessor.editorService.resolveEditorModel(sameOtherInput).then(function (resolved) {
				tracker.handleDeleteOrMove(toResource('/bar'), []);
				assert(!inputToResolve.isDisposed());
				assert(!sameOtherInput.isDisposed());

				tracker.handleDeleteOrMove(toResource('/fooss5/bar/file2.js'), []);

				assert(inputToResolve.isDisposed());
				assert(sameOtherInput.isDisposed());

				done();
			});
		});
	});

	test('FileEditorInput - dispose() also works for folders', function (done) {
		const tracker = instantiationService.createInstance(FileTracker);

		const inputToResolve = instantiationService.createInstance(FileEditorInput, toResource('/foo6/bar/file.js'), 'text/javascript', void 0);
		const sameOtherInput = instantiationService.createInstance(FileEditorInput, toResource('/foo6/bar/file.js'), 'text/javascript', void 0);
		return accessor.editorService.resolveEditorModel(inputToResolve, true).then(function (resolved) {
			return accessor.editorService.resolveEditorModel(sameOtherInput, true).then(function (resolved) {
				tracker.handleDeleteOrMove(toResource('/bar'), []);
				assert(!inputToResolve.isDisposed());
				assert(!sameOtherInput.isDisposed());

				tracker.handleDeleteOrMove(toResource('/foo6'), []);

				assert(inputToResolve.isDisposed());
				assert(sameOtherInput.isDisposed());

				done();
			});
		});
	});
});