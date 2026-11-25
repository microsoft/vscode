/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Part, relayoutWorkbenchParts, updateSashEndpoints } from '../../browser/part.js';
import { isEmptyObject } from '../../../base/common/types.js';
import { TestThemeService } from '../../../platform/theme/test/common/testThemeService.js';
import { append, $, Dimension, hide } from '../../../base/browser/dom.js';
import { TestLayoutService } from './workbenchTestServices.js';
import { StorageScope, StorageTarget } from '../../../platform/storage/common/storage.js';
import { TestStorageService } from '../common/workbenchTestServices.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { mainWindow } from '../../../base/browser/window.js';
import { Grid, ISerializableView } from '../../../base/browser/ui/grid/grid.js';
import { Event } from '../../../base/common/event.js';
import '../../../base/browser/ui/sash/sash.css';

suite('Workbench parts', () => {

	const disposables = new DisposableStore();

	for (const gap of [0, 1, 4, 7, 16]) {
		for (const junction of ['start', 'end', 'horizontal'] as const) {
			test(`thin ${junction} sashes reach the center of adjoining ${gap}px gaps`, () => {
				const root = append(mainWindow.document.body, $('.monaco-workbench.floating-panels.panel-position-bottom'));
				root.style.cssText = `position: relative; width: 800px; height: 600px; --vscode-panels-spacing: ${gap}px; --vscode-sash-size: 4px; --vscode-sash-hover-size: 4px; --vscode-spacing-size40: 4px; --vscode-spacing-sizeNone: 0px;`;
				const grid = append(root, $('.monaco-grid-view'));
				const outerBranch = append(grid, $('.monaco-grid-branch-node'));
				const outerSplit = append(outerBranch, $('.monaco-split-view2.vertical'));
				const scrollable = append(outerSplit, $('.monaco-scrollable-element'));
				const views = append(scrollable, $('.split-view-container'));
				const nestedView = append(views, $('.split-view-view.visible'));
				nestedView.style.cssText = 'width: 800px; height: 600px; top: 0; left: 0;';
				const innerBranch = append(nestedView, $('.monaco-grid-branch-node'));
				const innerSplit = append(innerBranch, $('.monaco-split-view2.horizontal'));
				const verticalContainer = append(innerSplit, $('.sash-container'));
				verticalContainer.style.cssText = `position: absolute; left: 0; top: ${junction === 'start' ? 300 : 0}px; width: 800px; height: ${junction === 'horizontal' ? 600 : 300}px;`;
				const vertical = append(verticalContainer, $('.monaco-sash.vertical'));
				vertical.style.left = `${junction === 'horizontal' ? 198 : 398}px`;
				const horizontalContainer = append(outerSplit, $('.sash-container'));
				horizontalContainer.style.cssText = `position: absolute; left: ${junction === 'horizontal' ? 200 : 0}px; top: 0; width: ${junction === 'horizontal' ? 400 : 800}px; height: 600px;`;
				const horizontal = append(horizontalContainer, $('.monaco-sash.horizontal'));
				horizontal.style.top = '298px';
				const trailing = junction === 'horizontal' ? append(verticalContainer, $('.monaco-sash.vertical')) : undefined;
				if (trailing) {
					trailing.style.left = '598px';
				}
				try {
					const beforeThickness = [vertical.getBoundingClientRect().width, horizontal.getBoundingClientRect().height];
					updateSashEndpoints(grid, true);
					const verticalBounds = vertical.getBoundingClientRect();
					const horizontalBounds = horizontal.getBoundingClientRect();
					const horizontalCenter = horizontalBounds.top + horizontalBounds.height / 2;
					const hover = mainWindow.getComputedStyle(junction === 'horizontal' ? horizontal : vertical, '::before');
					const endpoint = junction === 'horizontal' ? horizontalBounds.left : junction === 'start' ? verticalBounds.top : verticalBounds.bottom;
					const crossing = junction === 'horizontal' ? verticalBounds.left + verticalBounds.width / 2 : horizontalCenter;
					const hoverEndpoint = junction === 'horizontal' ? horizontalBounds.left + parseFloat(hover.left)
						: junction === 'start' ? verticalBounds.top + parseFloat(hover.top) : verticalBounds.bottom - parseFloat(hover.bottom);
					const actual = {
						beforeThickness,
						thickness: [verticalBounds.width, horizontalBounds.height],
						hoverThickness: Number.parseFloat(junction === 'horizontal' ? hover.height : hover.width),
						endpointOffset: endpoint - crossing,
						hoverEndpointOffset: hoverEndpoint - crossing,
						trailingOffset: trailing ? horizontalBounds.right - (trailing.getBoundingClientRect().left + trailing.getBoundingClientRect().width / 2) : 0,
					};
					updateSashEndpoints(grid, false);
					assert.deepStrictEqual({
						...actual,
						cleared: Array.from(grid.querySelectorAll<HTMLElement>('.monaco-sash')).every(sash => !sash.classList.contains('workbench-sash-start-at-gap')
							&& !sash.classList.contains('workbench-sash-end-at-gap')
							&& sash.style.getPropertyValue('--workbench-sash-start') === '' && sash.style.getPropertyValue('--workbench-sash-end') === ''),
					}, {
						beforeThickness: [4, 4],
						thickness: [4, 4],
						hoverThickness: 4,
						endpointOffset: 0,
						hoverEndpointOffset: 0,
						trailingOffset: 0,
						cleared: true,
					});
				} finally {
					root.remove();
				}
			});
		}
	}

	test('reapplies content spacing without changing grid allocations', () => {
		let spacing = 4;
		const layouts: { width: number; height: number; top: number; left: number; contentWidth: number }[] = [];
		const view: ISerializableView = {
			element: $('div'),
			minimumWidth: 0,
			maximumWidth: Number.POSITIVE_INFINITY,
			minimumHeight: 0,
			maximumHeight: Number.POSITIVE_INFINITY,
			onDidChange: Event.None,
			layout: (width, height, top, left) => layouts.push({ width, height, top, left, contentWidth: width - spacing }),
			toJSON: () => ({}),
		};
		const grid = disposables.add(new Grid(view));
		grid.layout(800, 600);
		layouts.length = 0;
		spacing = 16;
		grid.layout(800, 600);
		const cachedLayouts = layouts.length;
		relayoutWorkbenchParts(grid);
		assert.deepStrictEqual({ cachedLayouts, layouts }, {
			cachedLayouts: 0,
			layouts: [{ width: 800, height: 600, top: 0, left: 0, contentWidth: 784 }],
		});
	});

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

		constructor(layoutService = new TestLayoutService(), titleHeight?: () => number | undefined) {
			super('myPart2', { hasTitle: true, titleHeight }, new TestThemeService(), disposables.add(new TestStorageService()), layoutService);
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

		testRemoveFooterArea(): void {
			this.removeFooterArea();
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

	test('Part reflects footer presence on its container', () => {
		const part = disposables.add(new MyPart2());
		part.create(fixture);
		const footer = document.createElement('div');

		part.testSetFooterArea(footer);
		const withFooter = {
			hasClass: fixture.classList.contains('has-footer'),
			footerClass: footer.classList.contains('footer'),
		};
		part.testRemoveFooterArea();

		assert.deepStrictEqual({
			withFooter,
			afterRemoval: {
				hasClass: fixture.classList.contains('has-footer'),
				footerConnected: footer.isConnected,
			},
		}, {
			withFooter: { hasClass: true, footerClass: true },
			afterRemoval: { hasClass: false, footerConnected: false },
		});
	});

	test('Part Layout supports a custom title height', () => {
		let titleHeight: number | undefined = 28;
		const part = disposables.add(new MyPart2(new TestLayoutService(), () => titleHeight));
		part.create(fixture);

		const customLayout = part.testLayoutContents(100, 200);
		titleHeight = undefined;
		const defaultLayout = part.testLayoutContents(100, 200);

		assert.deepStrictEqual({ customLayout, defaultLayout }, {
			customLayout: {
				headerSize: Dimension.None,
				titleSize: new Dimension(100, 28),
				contentSize: new Dimension(100, 172),
				footerSize: Dimension.None,
			},
			defaultLayout: {
				headerSize: Dimension.None,
				titleSize: new Dimension(100, 35),
				contentSize: new Dimension(100, 165),
				footerSize: Dimension.None,
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
