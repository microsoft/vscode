/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Part } from '../../browser/part.js';
import { isEmptyObject } from '../../../base/common/types.js';
import { TestThemeService } from '../../../platform/theme/test/common/testThemeService.js';
import { append, $, hide } from '../../../base/browser/dom.js';
import { TestLayoutService } from './workbenchTestServices.js';
import { StorageScope, StorageTarget } from '../../../platform/storage/common/storage.js';
import { TestStorageService } from '../common/workbenchTestServices.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { mainWindow } from '../../../base/browser/window.js';

suite('Workbench parts', () => {

	const disposables = new DisposableStore();

	class SimplePart extends Part {

		minimumWidth: number = 50;
		maximumWidth: number = 50;
		minimumHeight: number = 50;
		maximumHeight: number = 50;

		override layout(width: number, height: number): void {
			throw new Error('Method not implemented.');
		}

		toJSON(): object {
			throw new Error('Method not implemented.');
		}
	}

	class MyPart extends SimplePart {

		constructor(private expectedParent: HTMLElement) {
			super('myPart', { hasTitle: true }, new TestThemeService(), disposables.add(new TestStorageService()), new TestLayoutService());
		}

		protected override createTitleArea(parent: HTMLElement): HTMLElement {
			assert.strictEqual(parent, this.expectedParent);
			return super.createTitleArea(parent)!;
		}

		protected override createContentArea(parent: HTMLElement): HTMLElement {
			assert.strictEqual(parent, this.expectedParent);
			return super.createContentArea(parent)!;
		}

		testGetMemento(scope: StorageScope, target: StorageTarget) {
			return super.getMemento(scope, target);
		}

		testSaveState(): void {
			return super.saveState();
		}
	}

	class MyPart2 extends SimplePart {

		constructor() {
			super('myPart2', { hasTitle: true }, new TestThemeService(), disposables.add(new TestStorageService()), new TestLayoutService());
		}

		protected override createTitleArea(parent: HTMLElement): HTMLElement {
			const titleContainer = append(parent, $('div'));
			const titleLabel = append(titleContainer, $('span'));
			titleLabel.id = 'myPart.title';
			titleLabel.innerText = 'Title';

			return titleContainer;
		}

		protected override createContentArea(parent: HTMLElement): HTMLElement {
			const contentContainer = append(parent, $('div'));
			const contentSpan = append(contentContainer, $('span'));
			contentSpan.id = 'myPart.content';
			contentSpan.innerText = 'Content';

			return contentContainer;
		}
	}

	class MyPart3 extends SimplePart {

		constructor() {
			super('myPart2', { hasTitle: false }, new TestThemeService(), disposables.add(new TestStorageService()), new TestLayoutService());
		}

		protected override createTitleArea(parent: HTMLElement): HTMLElement {
			return null!;
		}

		protected override createContentArea(parent: HTMLElement): HTMLElement {
			const contentContainer = append(parent, $('div'));
			const contentSpan = append(contentContainer, $('span'));
			contentSpan.id = 'myPart.content';
			contentSpan.innerText = 'Content';

			return contentContainer;
		}
	}

	let fixture: HTMLElement;
	const fixtureId = 'workbench-part-fixture';

	setup(() => {
		fixture = document.createElement('div');
		fixture.id = fixtureId;
		mainWindow.document.body.appendChild(fixture);
	});

	teardown(() => {
		fixture.remove();
		disposables.clear();
	});

	test('Creation', () => {
		const b = document.createElement('div');
		mainWindow.document.getElementById(fixtureId)!.appendChild(b);
		hide(b);

		let part = disposables.add(new MyPart(b));
		part.create(b);

		assert.strictEqual(part.getId(), 'myPart');

		// Memento
		let memento = part.testGetMemento(StorageScope.PROFILE, StorageTarget.MACHINE) as any;
		assert(memento);
		memento.foo = 'bar';
		memento.bar = [1, 2, 3];

		part.testSaveState();

		// Re-Create to assert memento contents
		part = disposables.add(new MyPart(b));

		memento = part.testGetMemento(StorageScope.PROFILE, StorageTarget.MACHINE);
		assert(memento);
		assert.strictEqual(memento.foo, 'bar');
		assert.strictEqual(memento.bar.length, 3);

		// Empty Memento stores empty object
		delete memento.foo;
		delete memento.bar;

		part.testSaveState();
		part = disposables.add(new MyPart(b));
		memento = part.testGetMemento(StorageScope.PROFILE, StorageTarget.MACHINE);
		assert(memento);
		assert.strictEqual(isEmptyObject(memento), true);
	});

	test('Part Layout with Title and Content', function () {
		const b = document.createElement('div');
		mainWindow.document.getElementById(fixtureId)!.appendChild(b);
		hide(b);

		const part = disposables.add(new MyPart2());
		part.create(b);

		assert(mainWindow.document.getElementById('myPart.title'));
		assert(mainWindow.document.getElementById('myPart.content'));
	});

	test('Part Layout with Content only', function () {
		const b = document.createElement('div');
		mainWindow.document.getElementById(fixtureId)!.appendChild(b);
		hide(b);

		const part = disposables.add(new MyPart3());
		part.create(b);

		assert(!mainWindow.document.getElementById('myPart.title'));
		assert(mainWindow.document.getElementById('myPart.content'));
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
