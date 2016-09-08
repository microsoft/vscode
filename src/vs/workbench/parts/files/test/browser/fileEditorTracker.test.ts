/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import URI from 'vs/base/common/uri';
import {join} from 'vs/base/common/paths';
import {FileEditorInput} from 'vs/workbench/parts/files/common/editors/fileEditorInput';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {FileEditorTracker} from 'vs/workbench/parts/files/common/editors/fileEditorTracker';
import {workbenchInstantiationService} from 'vs/test/utils/servicesTestUtils';

function toResource(path) {
	return URI.file(join('C:\\', path));
}

class ServiceAccessor {
	constructor( @IWorkbenchEditorService public editorService: IWorkbenchEditorService) {
	}
}

suite('Files - FileEditorTracker', () => {

	let instantiationService: IInstantiationService;
	let accessor: ServiceAccessor;

	setup(() => {
		instantiationService = workbenchInstantiationService();
		accessor = instantiationService.createInstance(ServiceAccessor);
	});

	test('FileEditorTracker - dispose()', function (done) {
		const tracker = instantiationService.createInstance(FileEditorTracker);

		const inputToResolve = instantiationService.createInstance(FileEditorInput, toResource('/fooss5/bar/file2.js'), 'text/javascript', void 0);
		const sameOtherInput = instantiationService.createInstance(FileEditorInput, toResource('/fooss5/bar/file2.js'), 'text/javascript', void 0);
		return accessor.editorService.resolveEditorModel(inputToResolve).then(function (resolved) {
			return accessor.editorService.resolveEditorModel(sameOtherInput).then(function (resolved) {
				tracker.handleDeleteOrMove(toResource('/bar'));
				assert(!inputToResolve.isDisposed());
				assert(!sameOtherInput.isDisposed());

				tracker.handleDeleteOrMove(toResource('/fooss5/bar/file2.js'));

				assert(inputToResolve.isDisposed());
				assert(sameOtherInput.isDisposed());

				done();
			});
		});
	});

	test('FileEditorTracker - dispose() also works for folders', function (done) {
		const tracker = instantiationService.createInstance(FileEditorTracker);

		const inputToResolve = instantiationService.createInstance(FileEditorInput, toResource('/foo6/bar/file.js'), 'text/javascript', void 0);
		const sameOtherInput = instantiationService.createInstance(FileEditorInput, toResource('/foo6/bar/file.js'), 'text/javascript', void 0);
		return accessor.editorService.resolveEditorModel(inputToResolve, true).then(function (resolved) {
			return accessor.editorService.resolveEditorModel(sameOtherInput, true).then(function (resolved) {
				tracker.handleDeleteOrMove(toResource('/bar'));
				assert(!inputToResolve.isDisposed());
				assert(!sameOtherInput.isDisposed());

				tracker.handleDeleteOrMove(toResource('/foo6'));

				assert(inputToResolve.isDisposed());
				assert(sameOtherInput.isDisposed());

				done();
			});
		});
	});
});