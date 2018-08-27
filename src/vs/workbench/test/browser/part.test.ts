/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { Part } from 'vs/workbench/browser/part';
import * as Types from 'vs/base/common/types';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { StorageService, InMemoryLocalStorage } from 'vs/platform/storage/common/storageService';
import { TestThemeService } from 'vs/platform/theme/test/common/testThemeService';
import { TestWorkspace } from 'vs/platform/workspace/test/common/testWorkspace';
import { append, $, hide } from 'vs/base/browser/dom';

class MyPart extends Part {

	constructor(private expectedParent: HTMLElement) {
		super('myPart', { hasTitle: true }, new TestThemeService());
	}

	public createTitleArea(parent: HTMLElement): HTMLElement {
		assert.strictEqual(parent, this.expectedParent);
		return super.createTitleArea(parent);
	}

	public createContentArea(parent: HTMLElement): HTMLElement {
		assert.strictEqual(parent, this.expectedParent);
		return super.createContentArea(parent);
	}

	public getMemento(storageService: IStorageService): any {
		return super.getMemento(storageService);
	}
}

class MyPart2 extends Part {

	constructor() {
		super('myPart2', { hasTitle: true }, new TestThemeService());
	}

	public createTitleArea(parent: HTMLElement): HTMLElement {
		const titleContainer = append(parent, $('div'));
		const titleLabel = append(titleContainer, $('span'));
		titleLabel.id = 'myPart.title';
		titleLabel.innerHTML = 'Title';

		return titleContainer;
	}

	public createContentArea(parent: HTMLElement): HTMLElement {
		const contentContainer = append(parent, $('div'));
		const contentSpan = append(contentContainer, $('span'));
		contentSpan.id = 'myPart.content';
		contentSpan.innerHTML = 'Content';

		return contentContainer;
	}
}

class MyPart3 extends Part {

	constructor() {
		super('myPart2', { hasTitle: false }, new TestThemeService());
	}

	public createTitleArea(parent: HTMLElement): HTMLElement {
		return null;
	}

	public createContentArea(parent: HTMLElement): HTMLElement {
		const contentContainer = append(parent, $('div'));
		const contentSpan = append(contentContainer, $('span'));
		contentSpan.id = 'myPart.content';
		contentSpan.innerHTML = 'Content';

		return contentContainer;
	}
}

suite('Workbench parts', () => {
	let fixture: HTMLElement;
	let fixtureId = 'workbench-part-fixture';
	let storage: IStorageService;

	setup(() => {
		fixture = document.createElement('div');
		fixture.id = fixtureId;
		document.body.appendChild(fixture);
		storage = new StorageService(new InMemoryLocalStorage(), null, TestWorkspace.id);
	});

	teardown(() => {
		document.body.removeChild(fixture);
	});

	test('Creation', function () {
		let b = document.createElement('div');
		document.getElementById(fixtureId).appendChild(b);
		hide(b);

		let part = new MyPart(b);
		part.create(b);

		assert.strictEqual(part.getId(), 'myPart');

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
		let b = document.createElement('div');
		document.getElementById(fixtureId).appendChild(b);
		hide(b);

		let part = new MyPart2();
		part.create(b);

		assert(document.getElementById('myPart.title'));
		assert(document.getElementById('myPart.content'));
	});

	test('Part Layout with Content only', function () {
		let b = document.createElement('div');
		document.getElementById(fixtureId).appendChild(b);
		hide(b);

		let part = new MyPart3();
		part.create(b);

		assert(!document.getElementById('myPart.title'));
		assert(document.getElementById('myPart.content'));
	});
});