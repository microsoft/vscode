/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { TPromise } from 'vs/base/common/winjs.base';
import { EditorInput, toResource, EditorViewStateMemento } from 'vs/workbench/common/editor';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { IEditorModel } from 'vs/platform/editor/common/editor';
import URI from 'vs/base/common/uri';
import { IUntitledEditorService, UntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { workbenchInstantiationService, TestNextEditorGroupsService, TestNextEditorGroup } from 'vs/workbench/test/workbenchTestServices';
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

	resolve(refresh?: boolean): TPromise<IEditorModel> {
		return TPromise.as(null);
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

	test('toResource', function () {
		const service = accessor.untitledEditorService;

		assert.ok(!toResource(null));

		const untitled = service.createOrGet();

		assert.equal(toResource(untitled).toString(), untitled.getResource().toString());
		assert.equal(toResource(untitled, { supportSideBySide: true }).toString(), untitled.getResource().toString());
		assert.equal(toResource(untitled, { filter: Schemas.untitled }).toString(), untitled.getResource().toString());
		assert.equal(toResource(untitled, { filter: [Schemas.file, Schemas.untitled] }).toString(), untitled.getResource().toString());
		assert.ok(!toResource(untitled, { filter: Schemas.file }));

		const file = new FileEditorInput(URI.file('/some/path.txt'));

		assert.equal(toResource(file).toString(), file.getResource().toString());
		assert.equal(toResource(file, { supportSideBySide: true }).toString(), file.getResource().toString());
		assert.equal(toResource(file, { filter: Schemas.file }).toString(), file.getResource().toString());
		assert.equal(toResource(file, { filter: [Schemas.file, Schemas.untitled] }).toString(), file.getResource().toString());
		assert.ok(!toResource(file, { filter: Schemas.untitled }));

		const diffEditorInput = new DiffEditorInput('name', 'description', untitled, file);

		assert.ok(!toResource(diffEditorInput));
		assert.ok(!toResource(diffEditorInput, { filter: Schemas.file }));
		assert.ok(!toResource(diffEditorInput, { supportSideBySide: false }));

		assert.equal(toResource(file, { supportSideBySide: true }).toString(), file.getResource().toString());
		assert.equal(toResource(file, { supportSideBySide: true, filter: Schemas.file }).toString(), file.getResource().toString());
		assert.equal(toResource(file, { supportSideBySide: true, filter: [Schemas.file, Schemas.untitled] }).toString(), file.getResource().toString());
	});

	test('EditorViewStateMemento - basics', function () {
		const groupService = new TestNextEditorGroupsService([
			new TestNextEditorGroup(0),
			new TestNextEditorGroup(1),
			new TestNextEditorGroup(2)
		]);

		interface TestViewState {
			line: number;
		}

		const rawMemento = Object.create(null);
		let memento = new EditorViewStateMemento<TestViewState>(groupService, rawMemento, 'key', 3);

		let res = memento.loadState(0, URI.file('/A'));
		assert.ok(!res);

		memento.saveState(0, URI.file('/A'), { line: 3 });
		res = memento.loadState(0, URI.file('/A'));
		assert.ok(res);
		assert.equal(res.line, 3);

		memento.saveState(1, URI.file('/A'), { line: 5 });
		res = memento.loadState(1, URI.file('/A'));
		assert.ok(res);
		assert.equal(res.line, 5);

		// Ensure capped at 3 elements
		memento.saveState(0, URI.file('/B'), { line: 1 });
		memento.saveState(0, URI.file('/C'), { line: 1 });
		memento.saveState(0, URI.file('/D'), { line: 1 });
		memento.saveState(0, URI.file('/E'), { line: 1 });

		assert.ok(!memento.loadState(0, URI.file('/A')));
		assert.ok(!memento.loadState(0, URI.file('/B')));
		assert.ok(memento.loadState(0, URI.file('/C')));
		assert.ok(memento.loadState(0, URI.file('/D')));
		assert.ok(memento.loadState(0, URI.file('/E')));

		// Save at an unknown group
		memento.saveState(4, URI.file('/E'), { line: 1 });
		assert.ok(memento.loadState(4, URI.file('/E'))); // only gets removed when memento is saved
		memento.saveState(4, URI.file('/C'), { line: 1 });
		assert.ok(memento.loadState(4, URI.file('/C'))); // only gets removed when memento is saved

		memento.save();

		memento = new EditorViewStateMemento(groupService, rawMemento, 'key', 3);
		assert.ok(memento.loadState(0, URI.file('/C')));
		assert.ok(memento.loadState(0, URI.file('/D')));
		assert.ok(memento.loadState(0, URI.file('/E')));

		// Check on entries no longer there from invalid groups
		assert.ok(!memento.loadState(4, URI.file('/E')));
		assert.ok(!memento.loadState(4, URI.file('/C')));

		memento.clearState(URI.file('/C'));
		memento.clearState(URI.file('/E'));

		assert.ok(!memento.loadState(0, URI.file('/C')));
		assert.ok(memento.loadState(0, URI.file('/D')));
		assert.ok(!memento.loadState(0, URI.file('/E')));
	});

	test('EditorViewStateMemento - use with editor input', function () {
		interface TestViewState {
			line: number;
		}

		class TestEditorInput extends EditorInput {
			constructor(private resource: URI, private id = 'testEditorInput') {
				super();
			}
			public getTypeId() { return 'testEditorInput'; }
			public resolve(): TPromise<IEditorModel> { return null; }

			public matches(other: TestEditorInput): boolean {
				return other && this.id === other.id && other instanceof TestEditorInput;
			}

			public getResource(): URI {
				return this.resource;
			}
		}

		const rawMemento = Object.create(null);
		let memento = new EditorViewStateMemento<TestViewState>(new TestNextEditorGroupsService(), rawMemento, 'key', 3);

		const testInputA = new TestEditorInput(URI.file('/A'));

		let res = memento.loadState(0, testInputA);
		assert.ok(!res);

		memento.saveState(0, testInputA, { line: 3 });
		res = memento.loadState(0, testInputA);
		assert.ok(res);
		assert.equal(res.line, 3);

		// State removed when input gets disposed
		testInputA.dispose();
		res = memento.loadState(0, testInputA);
		assert.ok(!res);
	});
});