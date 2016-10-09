/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import URI from 'vs/base/common/uri';
import { join, basename } from 'vs/base/common/paths';
import { FileEditorInput } from 'vs/workbench/parts/files/common/editors/fileEditorInput';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { workbenchInstantiationService, TestTextFileService } from 'vs/test/utils/servicesTestUtils';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { EncodingMode } from 'vs/workbench/common/editor';
import { IEventService } from 'vs/platform/event/common/event';
import { ITextFileEditorModel, ITextFileService, LocalFileChangeEvent } from 'vs/workbench/services/textfile/common/textfiles';
import { FileOperationResult, IFileOperationResult, FileChangesEvent, FileChangeType, EventType } from 'vs/platform/files/common/files';

function toResource(path) {
	return URI.file(join('C:\\', path));
}

function toStat(resource: URI) {
	return {
		resource,
		isDirectory: false,
		hasChildren: false,
		name: basename(resource.fsPath),
		mtime: Date.now(),
		etag: 'etag'
	};
}

class ServiceAccessor {
	constructor(
		@IWorkbenchEditorService public editorService: IWorkbenchEditorService,
		@ITextFileService public textFileService: TestTextFileService,
		@IEventService public eventService: IEventService
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
		let input = instantiationService.createInstance(FileEditorInput, toResource('/foo/bar/file.js'), void 0);
		const otherInput = instantiationService.createInstance(FileEditorInput, toResource('foo/bar/otherfile.js'), void 0);
		const otherInputSame = instantiationService.createInstance(FileEditorInput, toResource('foo/bar/file.js'), void 0);

		assert(input.matches(input));
		assert(input.matches(otherInputSame));
		assert(!input.matches(otherInput));
		assert(!input.matches(null));
		assert.ok(input.getName());
		assert.ok(input.getDescription());
		assert.ok(input.getDescription(true));

		assert.strictEqual('file.js', input.getName());

		assert.strictEqual(toResource('/foo/bar/file.js').fsPath, input.getResource().fsPath);
		assert(input.getResource() instanceof URI);

		input = instantiationService.createInstance(FileEditorInput, toResource('/foo/bar.html'), void 0);

		const inputToResolve: any = instantiationService.createInstance(FileEditorInput, toResource('/foo/bar/file.js'), void 0);
		const sameOtherInput = instantiationService.createInstance(FileEditorInput, toResource('/foo/bar/file.js'), void 0);

		return accessor.editorService.resolveEditorModel(inputToResolve, true).then(resolved => {
			const resolvedModelA = resolved;
			return accessor.editorService.resolveEditorModel(inputToResolve, true).then(resolved => {
				assert(resolvedModelA === resolved); // OK: Resolved Model cached globally per input

				return accessor.editorService.resolveEditorModel(sameOtherInput, true).then(otherResolved => {
					assert(otherResolved === resolvedModelA); // OK: Resolved Model cached globally per input

					inputToResolve.dispose(false);

					return accessor.editorService.resolveEditorModel(inputToResolve, true).then(resolved => {
						assert(resolvedModelA === resolved); // Model is still the same because we had 2 clients

						inputToResolve.dispose();
						sameOtherInput.dispose();

						resolvedModelA.dispose();

						return accessor.editorService.resolveEditorModel(inputToResolve, true).then(resolved => {
							assert(resolvedModelA !== resolved); // Different instance, because input got disposed

							let stat = (<any>resolved).versionOnDiskStat;
							return accessor.editorService.resolveEditorModel(inputToResolve, true).then(resolved => {
								assert(stat !== (<any>resolved).versionOnDiskStat); // Different stat, because resolve always goes to the server for refresh

								stat = (<any>resolved).versionOnDiskStat;
								return accessor.editorService.resolveEditorModel(inputToResolve, false).then(resolved => {
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

	test('matches', function () {
		const input1 = instantiationService.createInstance(FileEditorInput, toResource('/foo/bar/updatefile.js'), void 0);
		const input2 = instantiationService.createInstance(FileEditorInput, toResource('/foo/bar/updatefile.js'), void 0);

		assert.strictEqual(input1.matches(null), false);
		assert.strictEqual(input1.matches(input1), true);
		assert.strictEqual(input1.matches(input2), true);
	});

	test('getEncoding/setEncoding', function (done) {
		const input = instantiationService.createInstance(FileEditorInput, toResource('/foo/bar/updatefile.js'), void 0);

		input.setEncoding('utf16', EncodingMode.Encode);
		assert.equal(input.getEncoding(), 'utf16');

		return accessor.editorService.resolveEditorModel(input, true).then((resolved: ITextFileEditorModel) => {
			assert.equal(input.getEncoding(), resolved.getEncoding());

			resolved.dispose();

			done();
		});
	});

	test('save', function (done) {
		const input = instantiationService.createInstance(FileEditorInput, toResource('/foo/bar/updatefile.js'), void 0);

		return accessor.editorService.resolveEditorModel(input, true).then((resolved: ITextFileEditorModel) => {
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
		const input = instantiationService.createInstance(FileEditorInput, toResource('/foo/bar/updatefile.js'), void 0);

		return accessor.editorService.resolveEditorModel(input, true).then((resolved: ITextFileEditorModel) => {
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
		const input = instantiationService.createInstance(FileEditorInput, toResource('/foo/bar/updatefile.js'), void 0);

		accessor.textFileService.setResolveTextContentErrorOnce(<IFileOperationResult>{
			message: 'error',
			fileOperationResult: FileOperationResult.FILE_IS_BINARY
		});

		return accessor.editorService.resolveEditorModel(input, true).then(resolved => {
			assert.ok(resolved);

			resolved.dispose();

			done();
		});
	});

	test('disposes when resource gets deleted - local file changes', function () {
		const parent = toResource('/foo/bar');
		const resource = toResource('/foo/bar/updatefile.js');
		let input = instantiationService.createInstance(FileEditorInput, resource, void 0);

		assert.ok(!input.isDisposed());

		accessor.eventService.emit('files.internal:fileChanged', new LocalFileChangeEvent(toStat(resource)));
		assert.ok(input.isDisposed());

		input = instantiationService.createInstance(FileEditorInput, resource, void 0);

		const other = toResource('/foo/barfoo');

		accessor.eventService.emit('files.internal:fileChanged', new LocalFileChangeEvent(toStat(other)));
		assert.ok(!input.isDisposed());

		accessor.eventService.emit('files.internal:fileChanged', new LocalFileChangeEvent(toStat(parent)));
		assert.ok(input.isDisposed());

		// Move
		const to = toResource('/foo/barfoo/change.js');
		accessor.eventService.emit('files.internal:fileChanged', new LocalFileChangeEvent(toStat(resource), toStat(to)));
		assert.ok(input.isDisposed());
	});

	test('disposes when resource gets deleted - remote file changes', function () {
		const parent = toResource('/foo/bar');
		const resource = toResource('/foo/bar/updatefile.js');
		let input = instantiationService.createInstance(FileEditorInput, resource, void 0);

		assert.ok(!input.isDisposed());

		accessor.eventService.emit(EventType.FILE_CHANGES, new FileChangesEvent([{ resource, type: FileChangeType.DELETED }]));
		assert.ok(input.isDisposed());

		input = instantiationService.createInstance(FileEditorInput, resource, void 0);

		const other = toResource('/foo/barfoo');

		accessor.eventService.emit(EventType.FILE_CHANGES, new FileChangesEvent([{ resource: other, type: FileChangeType.DELETED }]));
		assert.ok(!input.isDisposed());

		accessor.eventService.emit(EventType.FILE_CHANGES, new FileChangesEvent([{ resource: parent, type: FileChangeType.DELETED }]));
		assert.ok(input.isDisposed());
	});
});