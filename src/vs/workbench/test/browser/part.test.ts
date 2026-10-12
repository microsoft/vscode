/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Part } from '../../browser/part.js';
import { isEmptyObject } from '../../../base/common/types.js';
import { TestThemeService } from '../../../platform/theme/test/common/testThemeService.js';
import { append, $, Dimension, hide } from '../../../base/browser/dom.js';
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

		constructor(layoutService = new TestLayoutService()) {
			super('myPart2', { hasTitle: true }, new TestThemeService(), disposables.add(new TestStorageService()), layoutService);
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

		testSetHeaderArea(headerContainer: HTMLElement): void {
			this.setHeaderArea(headerContainer);
		}

		testSetFooterArea(footerContainer: HTMLElement): void {
			this.setFooterArea(footerContainer);
		}

		testLayoutContents(width: number, height: number) {
			return this.layoutContents(width, height);
		}
	}

	class ModernUITestLayoutService extends TestLayoutService {
		modernUI = false;
		modernUICompact = false;
		override isFloatingPanelsEnabled(): boolean { return this.modernUI; }
		override isModernUICompact(): boolean { return this.modernUICompact; }
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
		// eslint-disable-next-line local/code-no-any-casts
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

	test('Part Layout preserves Modern UI chrome across densities', () => {
		const layoutService = new ModernUITestLayoutService();
		const part = disposables.add(new MyPart2(layoutService));
		part.create(fixture);
		part.testSetHeaderArea(document.createElement('div'));
		part.testSetFooterArea(document.createElement('div'));

		const classicLayout = part.testLayoutContents(100, 200);
		layoutService.modernUI = true;
		const modernUILayout = part.testLayoutContents(100, 200);
		layoutService.modernUICompact = true;
		const compactModernUILayout = part.testLayoutContents(100, 200);

		assert.deepStrictEqual({ classicLayout, modernUILayout, compactModernUILayout }, {
			classicLayout: {
				headerSize: new Dimension(100, 35),
				titleSize: new Dimension(100, 35),
				contentSize: new Dimension(100, 95),
				footerSize: new Dimension(100, 35),
			},
			modernUILayout: {
				headerSize: new Dimension(100, 32),
				titleSize: new Dimension(100, 32),
				contentSize: new Dimension(100, 104),
				footerSize: new Dimension(100, 32),
			},
			compactModernUILayout: {
				headerSize: new Dimension(100, 32),
				titleSize: new Dimension(100, 32),
				contentSize: new Dimension(100, 104),
				footerSize: new Dimension(100, 32),
			},
		});
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
