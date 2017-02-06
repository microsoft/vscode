/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { Build, Builder } from 'vs/base/browser/builder';
import { Part } from 'vs/workbench/browser/part';
import * as Types from 'vs/base/common/types';
import { IWorkspaceContextService, WorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { StorageService, InMemoryLocalStorage } from 'vs/platform/storage/common/storageService';
import { TestWorkspace } from 'vs/platform/workspace/test/common/testWorkspace';

class MyPart extends Part {

	constructor(private expectedParent: Builder) {
		super('myPart', { hasTitle: true });
	}

	public createTitleArea(parent: Builder): Builder {
		assert.strictEqual(parent, this.expectedParent);
		return super.createTitleArea(parent);
	}

	public createContentArea(parent: Builder): Builder {
		assert.strictEqual(parent, this.expectedParent);
		return super.createContentArea(parent);
	}

	public getMemento(storageService: IStorageService): any {
		return super.getMemento(storageService);
	}
}

class MyPart2 extends Part {

	constructor() {
		super('myPart2', { hasTitle: true });
	}

	public createTitleArea(parent: Builder): Builder {
		return parent.div(function (div) {
			div.span({
				id: 'myPart.title',
				innerHtml: 'Title'
			});
		});
	}

	public createContentArea(parent: Builder): Builder {
		return parent.div(function (div) {
			div.span({
				id: 'myPart.content',
				innerHtml: 'Content'
			});
		});
	}
}

class MyPart3 extends Part {

	constructor() {
		super('myPart2', { hasTitle: false });
	}

	public createTitleArea(parent: Builder): Builder {
		return null;
	}

	public createContentArea(parent: Builder): Builder {
		return parent.div(function (div) {
			div.span({
				id: 'myPart.content',
				innerHtml: 'Content'
			});
		});
	}
}

suite('Workbench Part', () => {
	let fixture: HTMLElement;
	let fixtureId = 'workbench-part-fixture';
	let context: IWorkspaceContextService;
	let storage: IStorageService;

	setup(() => {
		fixture = document.createElement('div');
		fixture.id = fixtureId;
		document.body.appendChild(fixture);
		context = new WorkspaceContextService(TestWorkspace);
		storage = new StorageService(new InMemoryLocalStorage(), null, context);
	});

	teardown(() => {
		document.body.removeChild(fixture);
	});

	test('Creation', function () {
		let b = Build.withElementById(fixtureId);
		b.div().hide();

		let part = new MyPart(b);
		part.create(b);

		assert.strictEqual(part.getId(), 'myPart');
		assert.strictEqual(part.getContainer(), b);

		// Memento
		let memento = part.getMemento(storage);
		assert(memento);
		memento.foo = 'bar';
		memento.bar = [1, 2, 3];

		part.shutdown();

		// Re-Create to assert memento contents
		part = new MyPart(b);

		memento = part.getMemento(storage);
		assert(memento);
		assert.strictEqual(memento.foo, 'bar');
		assert.strictEqual(memento.bar.length, 3);

		// Empty Memento stores empty object
		delete memento.foo;
		delete memento.bar;

		part.shutdown();
		part = new MyPart(b);
		memento = part.getMemento(storage);
		assert(memento);
		assert.strictEqual(Types.isEmptyObject(memento), true);
	});

	test('Part Layout with Title and Content', function () {
		let b = Build.withElementById(fixtureId);
		b.div().hide();

		let part = new MyPart2();
		part.create(b);

		assert(Build.withElementById('myPart.title'));
		assert(Build.withElementById('myPart.content'));
	});

	test('Part Layout with Content only', function () {
		let b = Build.withElementById(fixtureId);
		b.div().hide();

		let part = new MyPart3();
		part.create(b);

		assert(!Build.withElementById('myPart.title'));
		assert(Build.withElementById('myPart.content'));
	});
});