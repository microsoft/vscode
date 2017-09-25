/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { TPromise } from 'vs/base/common/winjs.base';
import { EditorInput, toResource } from 'vs/workbench/common/editor';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { IEditorModel } from 'vs/platform/editor/common/editor';
import URI from 'vs/base/common/uri';
import { IUntitledEditorService, UntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { workbenchInstantiationService } from 'vs/workbench/test/workbenchTestServices';

class ServiceAccessor {
	constructor( @IUntitledEditorService public untitledEditorService: UntitledEditorService) {
	}
}

class FileEditorInput extends EditorInput {

	constructor(private resource: URI) {
		super();
	}

	getTypeId(): string {
		return 'editorResourceFileTest';
	}

	getResource(): URI {
		return this.resource;
	}

	resolve(refresh?: boolean): TPromise<IEditorModel> {
		return TPromise.as(null);
	}
}

suite('Workbench - Editor', () => {

	let instantiationService: IInstantiationService;
	let accessor: ServiceAccessor;

	setup(() => {
		instantiationService = workbenchInstantiationService();
		accessor = instantiationService.createInstance(ServiceAccessor);
	});

	teardown(() => {
		accessor.untitledEditorService.revertAll();
		accessor.untitledEditorService.dispose();
	});

	test('toResource', function () {
		const service = accessor.untitledEditorService;

		assert.ok(!toResource(null));

		const untitled = service.createOrGet();

		assert.equal(toResource(untitled).toString(), untitled.getResource().toString());
		assert.equal(toResource(untitled, { supportSideBySide: true }).toString(), untitled.getResource().toString());
		assert.equal(toResource(untitled, { filter: 'untitled' }).toString(), untitled.getResource().toString());
		assert.equal(toResource(untitled, { filter: ['file', 'untitled'] }).toString(), untitled.getResource().toString());
		assert.ok(!toResource(untitled, { filter: 'file' }));

		const file = new FileEditorInput(URI.file('/some/path.txt'));

		assert.equal(toResource(file).toString(), file.getResource().toString());
		assert.equal(toResource(file, { supportSideBySide: true }).toString(), file.getResource().toString());
		assert.equal(toResource(file, { filter: 'file' }).toString(), file.getResource().toString());
		assert.equal(toResource(file, { filter: ['file', 'untitled'] }).toString(), file.getResource().toString());
		assert.ok(!toResource(file, { filter: 'untitled' }));

		const diffEditorInput = new DiffEditorInput('name', 'description', untitled, file);

		assert.ok(!toResource(diffEditorInput));
		assert.ok(!toResource(diffEditorInput, { filter: 'file' }));
		assert.ok(!toResource(diffEditorInput, { supportSideBySide: false }));

		assert.equal(toResource(file, { supportSideBySide: true }).toString(), file.getResource().toString());
		assert.equal(toResource(file, { supportSideBySide: true, filter: 'file' }).toString(), file.getResource().toString());
		assert.equal(toResource(file, { supportSideBySide: true, filter: ['file', 'untitled'] }).toString(), file.getResource().toString());
	});
});