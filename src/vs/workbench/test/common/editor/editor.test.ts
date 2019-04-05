/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { EditorInput, toResource, SideBySideEditor } from 'vs/workbench/common/editor';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { IEditorModel } from 'vs/platform/editor/common/editor';
import { URI } from 'vs/base/common/uri';
import { IUntitledEditorService, UntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { workbenchInstantiationService } from 'vs/workbench/test/workbenchTestServices';
import { Schemas } from 'vs/base/common/network';

class ServiceAccessor {
	constructor(@IUntitledEditorService public untitledEditorService: UntitledEditorService) {
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

	resolve(): Promise<IEditorModel | null> {
		return Promise.resolve(null);
	}
}

suite('Workbench editor', () => {

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

	test('toResource', () => {
		const service = accessor.untitledEditorService;

		assert.ok(!toResource(null!));

		const untitled = service.createOrGet();

		assert.equal(toResource(untitled)!.toString(), untitled.getResource().toString());
		assert.equal(toResource(untitled, { supportSideBySide: SideBySideEditor.MASTER })!.toString(), untitled.getResource().toString());
		assert.equal(toResource(untitled, { filterByScheme: Schemas.untitled })!.toString(), untitled.getResource().toString());
		assert.equal(toResource(untitled, { filterByScheme: [Schemas.file, Schemas.untitled] })!.toString(), untitled.getResource().toString());
		assert.ok(!toResource(untitled, { filterByScheme: Schemas.file }));

		const file = new FileEditorInput(URI.file('/some/path.txt'));

		assert.equal(toResource(file)!.toString(), file.getResource().toString());
		assert.equal(toResource(file, { supportSideBySide: SideBySideEditor.MASTER })!.toString(), file.getResource().toString());
		assert.equal(toResource(file, { filterByScheme: Schemas.file })!.toString(), file.getResource().toString());
		assert.equal(toResource(file, { filterByScheme: [Schemas.file, Schemas.untitled] })!.toString(), file.getResource().toString());
		assert.ok(!toResource(file, { filterByScheme: Schemas.untitled }));

		const diffEditorInput = new DiffEditorInput('name', 'description', untitled, file);

		assert.ok(!toResource(diffEditorInput));
		assert.ok(!toResource(diffEditorInput, { filterByScheme: Schemas.file }));

		assert.equal(toResource(file, { supportSideBySide: SideBySideEditor.MASTER })!.toString(), file.getResource().toString());
		assert.equal(toResource(file, { supportSideBySide: SideBySideEditor.MASTER, filterByScheme: Schemas.file })!.toString(), file.getResource().toString());
		assert.equal(toResource(file, { supportSideBySide: SideBySideEditor.MASTER, filterByScheme: [Schemas.file, Schemas.untitled] })!.toString(), file.getResource().toString());
	});
});