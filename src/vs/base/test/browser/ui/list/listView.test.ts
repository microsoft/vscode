/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CachedListVirtualDelegate, IListRenderer, IListVirtualDelegate } from '../../../../browser/ui/list/list.js';
import { ListView } from '../../../../browser/ui/list/listView.js';
import { range } from '../../../../common/arrays.js';
import { IRange } from '../../../../common/range.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

suite('ListView', function () {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('all rows get disposed', function () {
		const element = document.createElement('div');
		element.style.height = '200px';
		element.style.width = '200px';

		const delegate: IListVirtualDelegate<number> = {
			getHeight() { return 20; },
			getTemplateId() { return 'template'; }
		};

		let templatesCount = 0;

		const renderer: IListRenderer<number, void> = {
			templateId: 'template',
			renderTemplate() { templatesCount++; },
			renderElement() { },
			disposeTemplate() { templatesCount--; }
		};

		const listView = new ListView<number>(element, delegate, [renderer]);
		listView.layout(200);

		assert.strictEqual(templatesCount, 0, 'no templates have been allocated');
		listView.splice(0, 0, range(100));
		assert.strictEqual(templatesCount, 10, 'some templates have been allocated');
		listView.dispose();
		assert.strictEqual(templatesCount, 0, 'all templates have been disposed');
	});

	test('batches horizontal width measurements', function () {
		const element = document.createElement('div');
		element.style.height = '100px';
		element.style.width = '200px';
		document.body.appendChild(element);

		const delegate: IListVirtualDelegate<number> = {
			getHeight() { return 20; },
			getTemplateId() { return 'template'; }
		};

		const rows: HTMLElement[] = [];
		const widthReads: { renderedRows: number; fitContentRows: number }[] = [];
		const renderer: IListRenderer<number, void> = {
			templateId: 'template',
			renderTemplate(container) {
				const rowIndex = rows.length;
				const paddingLeft = rowIndex;
				const paddingRight = rowIndex * 2;
				rows.push(container);
				container.style.paddingLeft = `${paddingLeft}px`;
				container.style.paddingRight = `${paddingRight}px`;
				container.style.borderLeft = '1px solid';
				container.style.borderRight = '2px solid';
				Object.defineProperty(container, 'offsetWidth', {
					configurable: true,
					get: () => {
						widthReads.push({
							renderedRows: rows.length,
							fitContentRows: rows.filter(row => row.style.width === 'fit-content').length
						});
						return 100 + rowIndex + paddingLeft + paddingRight + 3;
					}
				});
			},
			renderElement() { },
			disposeTemplate() { }
		};

		const listView = new ListView<number>(element, delegate, [renderer], { horizontalScrolling: true });
		try {
			const expectedBatch = range(5).map(() => ({ renderedRows: 5, fitContentRows: 5 }));
			const results: { phase: string; widthReads: typeof widthReads; contentWidth: number; rowWidths: string[] }[] = [];
			listView.layout(100, 200);
			listView.splice(0, 0, range(10));
			results.push({
				phase: 'splice',
				widthReads: widthReads.slice(),
				contentWidth: listView.contentWidth,
				rowWidths: rows.map(row => row.style.width)
			});

			widthReads.length = 0;
			listView.setScrollTop(100);
			results.push({
				phase: 'scroll',
				widthReads: widthReads.slice(),
				contentWidth: listView.contentWidth,
				rowWidths: rows.map(row => row.style.width)
			});

			widthReads.length = 0;
			listView.updateOptions({ horizontalScrolling: false });
			listView.updateOptions({ horizontalScrolling: true });
			results.push({
				phase: 'enable',
				widthReads: widthReads.slice(),
				contentWidth: listView.contentWidth,
				rowWidths: rows.map(row => row.style.width)
			});

			assert.deepStrictEqual(results, [
				{ phase: 'splice', widthReads: expectedBatch, contentWidth: 0, rowWidths: ['', '', '', '', ''] },
				{ phase: 'scroll', widthReads: expectedBatch, contentWidth: 0, rowWidths: ['', '', '', '', ''] },
				{ phase: 'enable', widthReads: expectedBatch, contentWidth: 116, rowWidths: ['', '', '', '', ''] }
			]);
		} finally {
			listView.dispose();
			element.remove();
		}
	});

	test('batches dynamic height measurements', function () {
		const element = document.createElement('div');
		element.style.height = '100px';
		element.style.width = '200px';
		document.body.appendChild(element);

		type TestElement = { height: number };
		const publishedHeights = new Map<TestElement, number>();
		const delegate: IListVirtualDelegate<TestElement> = {
			getHeight() { return 25; },
			getTemplateId() { return 'template'; },
			hasDynamicHeight() { return true; },
			setDynamicHeight(element, height) { publishedHeights.set(element, height); }
		};

		const rows: HTMLElement[] = [];
		const heightReads: { renderedRows: number; unconstrainedRows: number }[] = [];
		const renderCounts = new Map<TestElement, number>();
		let disposedElements = 0;
		const renderer: IListRenderer<TestElement, HTMLElement> = {
			templateId: 'template',
			renderTemplate(container) {
				rows.push(container);
				container.style.height = '999px';
				Object.defineProperty(container, 'offsetHeight', {
					configurable: true,
					get: () => {
						heightReads.push({
							renderedRows: rows.filter(row => row.dataset.testHeight !== undefined).length,
							unconstrainedRows: rows.filter(row => row.style.height === '').length
						});
						return Number(container.dataset.testHeight);
					}
				});
				return container;
			},
			renderElement(element, _index, templateData) {
				templateData.dataset.testHeight = String(element.height);
				renderCounts.set(element, (renderCounts.get(element) ?? 0) + 1);
			},
			disposeElement() {
				disposedElements++;
			},
			disposeTemplate() { }
		};

		const elements: TestElement[] = range(10).map(() => ({ height: 5 }));
		const listView = new ListView<TestElement>(element, delegate, [renderer], { supportDynamicHeights: true });
		try {
			listView.layout(100, 200);
			listView.splice(0, 0, elements);

			assert.deepStrictEqual({
				heightReads,
				publishedHeights: elements.map(element => publishedHeights.get(element)),
				renderCounts: elements.map(element => renderCounts.get(element)),
				renderedRows: elements.map((_element, index) => listView.domElement(index) !== null),
				disposedElements
			}, {
				heightReads: [
					{ renderedRows: 4, unconstrainedRows: 4 },
					{ renderedRows: 4, unconstrainedRows: 4 },
					{ renderedRows: 4, unconstrainedRows: 4 },
					{ renderedRows: 4, unconstrainedRows: 4 },
					{ renderedRows: 8, unconstrainedRows: 8 },
					{ renderedRows: 8, unconstrainedRows: 8 },
					{ renderedRows: 8, unconstrainedRows: 8 },
					{ renderedRows: 8, unconstrainedRows: 8 },
					{ renderedRows: 10, unconstrainedRows: 10 },
					{ renderedRows: 10, unconstrainedRows: 10 },
				],
				publishedHeights: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
				renderCounts: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
				renderedRows: [true, true, true, true, true, true, true, true, true, true],
				disposedElements: 0
			});
		} finally {
			listView.dispose();
			element.remove();
		}
	});

	test('cleans up retained dynamic height rows after a render error', function () {
		const element = document.createElement('div');
		element.style.height = '100px';
		element.style.width = '200px';
		document.body.appendChild(element);

		type TestElement = { height: number; throwOnRender?: boolean };
		const delegate: IListVirtualDelegate<TestElement> = {
			getHeight() { return 100; },
			getTemplateId() { return 'template'; },
			hasDynamicHeight() { return true; }
		};

		let disposedElements = 0;
		const renderer: IListRenderer<TestElement, HTMLElement> = {
			templateId: 'template',
			renderTemplate(container) {
				Object.defineProperty(container, 'offsetHeight', {
					configurable: true,
					get: () => Number(container.dataset.testHeight)
				});
				return container;
			},
			renderElement(element, _index, templateData) {
				templateData.dataset.testHeight = String(element.height);
				if (element.throwOnRender) {
					throw new Error('render failed');
				}
			},
			disposeElement() {
				disposedElements++;
			},
			disposeTemplate() { }
		};

		const listView = new ListView<TestElement>(element, delegate, [renderer], { supportDynamicHeights: true });
		try {
			listView.layout(100, 200);
			assert.throws(() => listView.splice(0, 0, [
				{ height: 20 },
				{ height: 20, throwOnRender: true },
			]), /render failed/);
			assert.deepStrictEqual({
				rowsInDom: element.querySelectorAll('.monaco-list-row').length,
				disposedElements
			}, {
				rowsInDom: 1,
				disposedElements: 1
			});
		} finally {
			listView.dispose();
			element.remove();
		}
	});

	test('does not promote a retained row after a reentrant splice', function () {
		const element = document.createElement('div');
		element.style.height = '100px';
		element.style.width = '200px';
		document.body.appendChild(element);

		type TestElement = { id: string; height: number };
		const delegate: IListVirtualDelegate<TestElement> = {
			getHeight() { return 100; },
			getTemplateId() { return 'template'; },
			hasDynamicHeight() { return true; }
		};

		const listViewRef: { value?: ListView<TestElement> } = {};
		let spliceOnRender: TestElement | undefined;
		const renderer: IListRenderer<TestElement, HTMLElement> = {
			templateId: 'template',
			renderTemplate(container) {
				Object.defineProperty(container, 'offsetHeight', {
					configurable: true,
					get: () => Number(container.dataset.testHeight)
				});
				return container;
			},
			renderElement(element, _index, templateData) {
				templateData.textContent = element.id;
				templateData.dataset.testHeight = String(element.height);
				if (spliceOnRender === element) {
					spliceOnRender = undefined;
					listViewRef.value!.splice(0, 1);
				}
			},
			disposeTemplate() { }
		};

		const elements: TestElement[] = range(10).map(index => ({ id: String(index), height: 100 }));
		const listView = listViewRef.value = new ListView<TestElement>(element, delegate, [renderer], { supportDynamicHeights: true });
		try {
			listView.layout(100, 200);
			listView.splice(0, 0, elements);
			elements[0].height = 20;
			elements[1].height = 20;
			listView.domElement(0)!.dataset.testHeight = String(elements[0].height);
			spliceOnRender = elements[1];

			listView.layout(100, 201);

			const renderedRows = range(listView.length)
				.filter(index => listView.domElement(index) !== null)
				.map(index => ({
					element: listView.element(index).id,
					rendered: listView.domElement(index)!.textContent
				}));
			assert.deepStrictEqual({
				length: listView.length,
				renderedRows
			}, {
				length: elements.length - 1,
				renderedRows: [
					{ element: '1', rendered: '1' },
					{ element: '2', rendered: '2' }
				]
			});
		} finally {
			listView.dispose();
			element.remove();
		}
	});

	test('preserves delegated height measurements after a reentrant replacement', function () {
		const element = document.createElement('div');
		element.style.height = '100px';
		element.style.width = '200px';
		document.body.appendChild(element);

		type TestElement = { id: string; height: number; delegated?: boolean };
		const delegate: IListVirtualDelegate<TestElement> = {
			getHeight() { return 100; },
			getTemplateId() { return 'template'; },
			hasDynamicHeight() { return true; },
			getDynamicHeight(element) { return element.delegated ? element.height : null; }
		};

		const listViewRef: { value?: ListView<TestElement> } = {};
		let replaceOnRender: TestElement | undefined;
		const replacement: TestElement = { id: 'replacement', height: 100 };
		const renderer: IListRenderer<TestElement, HTMLElement> = {
			templateId: 'template',
			renderTemplate(container) {
				Object.defineProperty(container, 'offsetHeight', {
					configurable: true,
					get: () => Number(container.dataset.testHeight)
				});
				return container;
			},
			renderElement(element, index, templateData) {
				templateData.textContent = element.id;
				templateData.dataset.testHeight = String(element.height);
				if (replaceOnRender === element) {
					replaceOnRender = undefined;
					listViewRef.value!.splice(index, 1, [replacement]);
				}
			},
			disposeTemplate() { }
		};

		const elements: TestElement[] = [
			{ id: 'delegated', height: 100, delegated: true },
			{ id: 'dom', height: 100 },
			{ id: 'last', height: 100 }
		];
		const listView = listViewRef.value = new class extends ListView<TestElement> {
			includeSecond = false;

			protected override getRenderRange(renderTop: number, renderHeight: number): IRange {
				const renderRange = super.getRenderRange(renderTop, renderHeight);
				if (this.includeSecond) {
					renderRange.end = Math.min(this.length, Math.max(renderRange.end, 2));
				}
				return renderRange;
			}
		}(element, delegate, [renderer], { supportDynamicHeights: true });
		try {
			listView.layout(100, 200);
			listView.splice(0, 0, elements);
			elements[0].height = 20;
			listView.includeSecond = true;
			replaceOnRender = elements[1];

			listView.layout(100, 201);

			assert.deepStrictEqual({
				contentHeight: listView.contentHeight,
				elementHeights: range(listView.length).map(index => listView.elementHeight(index)),
				elements: range(listView.length).map(index => listView.element(index).id)
			}, {
				contentHeight: 220,
				elementHeights: [20, 100, 100],
				elements: ['delegated', 'replacement', 'last']
			});
		} finally {
			listView.dispose();
			element.remove();
		}
	});

	test('handles removing all items during dynamic height measurement', function () {
		const element = document.createElement('div');
		element.style.height = '100px';
		element.style.width = '200px';
		document.body.appendChild(element);

		type TestElement = { id: string; height: number };
		const delegate: IListVirtualDelegate<TestElement> = {
			getHeight() { return 100; },
			getTemplateId() { return 'template'; },
			hasDynamicHeight() { return true; }
		};

		const listViewRef: { value?: ListView<TestElement> } = {};
		let removeAllOnRender: TestElement | undefined;
		const renderer: IListRenderer<TestElement, HTMLElement> = {
			templateId: 'template',
			renderTemplate(container) {
				Object.defineProperty(container, 'offsetHeight', {
					configurable: true,
					get: () => Number(container.dataset.testHeight)
				});
				return container;
			},
			renderElement(element, _index, templateData) {
				templateData.dataset.testHeight = String(element.height);
				if (removeAllOnRender === element) {
					removeAllOnRender = undefined;
					listViewRef.value!.splice(0, listViewRef.value!.length);
				}
			},
			disposeTemplate() { }
		};

		const elements: TestElement[] = range(3).map(index => ({ id: String(index), height: 100 }));
		const listView = listViewRef.value = new ListView<TestElement>(element, delegate, [renderer], { supportDynamicHeights: true });
		try {
			listView.layout(100, 200);
			listView.splice(0, 0, elements);
			elements[0].height = 20;
			listView.domElement(0)!.dataset.testHeight = String(elements[0].height);
			removeAllOnRender = elements[1];

			listView.layout(100, 201);

			assert.deepStrictEqual({
				length: listView.length,
				rowsInDom: element.querySelectorAll('.monaco-list-row').length
			}, {
				length: 0,
				rowsInDom: 0
			});
		} finally {
			listView.dispose();
			element.remove();
		}
	});

	test('publishes freshly measured dynamic heights', function () {
		const element = document.createElement('div');
		element.style.height = '200px';
		element.style.width = '200px';
		document.body.appendChild(element);

		type TestElement = { height: number };
		const delegate = new class extends CachedListVirtualDelegate<TestElement> {
			protected estimateHeight() { return 100; }
			getTemplateId() { return 'template'; }
			hasDynamicHeight() { return true; }
			getMeasuredHeight(element: TestElement) { return this.getCachedHeight(element); }
		};
		const renderer: IListRenderer<TestElement, HTMLElement> = {
			templateId: 'template',
			renderTemplate(container) {
				const content = document.createElement('div');
				container.appendChild(content);
				return content;
			},
			renderElement(element, _index, templateData) { templateData.style.height = `${element.height}px`; },
			disposeTemplate() { }
		};

		const elements: TestElement[] = [{ height: 40 }, { height: 100 }, { height: 160 }];
		const listView = new ListView<TestElement>(element, delegate, [renderer], { supportDynamicHeights: true });
		try {
			listView.layout(200, 200);
			listView.splice(0, 0, elements);
			assert.deepStrictEqual(elements.map(element => delegate.getMeasuredHeight(element)), [40, 100, 160]);
		} finally {
			listView.dispose();
			element.remove();
		}
	});

	test('publishes positive delegate-provided dynamic heights', function () {
		type TestElement = { height: number };
		const publishedHeights = new Map<TestElement, number>();
		const delegate: IListVirtualDelegate<TestElement> = {
			getHeight() { return 100; },
			getTemplateId() { return 'template'; },
			getDynamicHeight(element) { return element.height; },
			setDynamicHeight(element, height) { publishedHeights.set(element, height); }
		};
		const renderer: IListRenderer<TestElement, void> = {
			templateId: 'template',
			renderTemplate() { },
			renderElement() { },
			disposeTemplate() { }
		};

		const elements: TestElement[] = [{ height: 0 }, { height: 40 }, { height: 100 }, { height: 160 }];
		const listView = new ListView<TestElement>(document.createElement('div'), delegate, [renderer], { supportDynamicHeights: true });
		try {
			listView.layout(400, 200);
			listView.splice(0, 0, elements);
			assert.deepStrictEqual(elements.map(element => publishedHeights.get(element)), [undefined, 40, 100, 160]);
		} finally {
			listView.dispose();
		}
	});

	test('preserves offscreen rows when extending user selection with shift click', function () {
		const element = document.createElement('div');
		document.body.appendChild(element);

		const delegate: IListVirtualDelegate<number> = {
			getHeight() { return 20; },
			getTemplateId() { return 'template'; }
		};
		const renderer: IListRenderer<number, HTMLElement> = {
			templateId: 'template',
			renderTemplate(container) { return container; },
			renderElement(element, _index, container) { container.textContent = String(element); },
			disposeTemplate() { }
		};

		const listView = new ListView<number>(element, delegate, [renderer], { userSelection: true });
		const selection = document.getSelection()!;
		try {
			listView.layout(60, 200);
			listView.splice(0, 0, range(10));

			const firstRow = listView.domElement(0)!;
			const lastSelectedRow = listView.domElement(2)!;
			firstRow.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
			firstRow.dispatchEvent(new Event('selectstart', { bubbles: true }));

			const selectionRange = document.createRange();
			selectionRange.setStart(firstRow.firstChild!, 0);
			selectionRange.setEnd(lastSelectedRow.firstChild!, lastSelectedRow.textContent!.length);
			selection.removeAllRanges();
			selection.addRange(selectionRange);
			document.dispatchEvent(new Event('selectionchange'));
			document.dispatchEvent(new MouseEvent('mouseup'));

			listView.setScrollTop(100);
			const extensionRow = listView.domElement(7)!;
			extensionRow.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, shiftKey: true }));
			extensionRow.dispatchEvent(new Event('selectstart', { bubbles: true }));
			document.dispatchEvent(new MouseEvent('mousemove', { clientY: 30 }));
			document.dispatchEvent(new MouseEvent('mouseup'));

			assert.strictEqual(listView.domElement(0), firstRow);
		} finally {
			listView.dispose();
			selection.removeAllRanges();
			document.dispatchEvent(new Event('selectionchange'));
			element.remove();
		}
	});

	test('does not throw when laid out with a collapsed viewport and zero-height dynamic items', function () {
		type TestElement = { height: number };
		const delegate: IListVirtualDelegate<TestElement> = {
			getHeight() { return 0; },
			getTemplateId() { return 'template'; },
			getDynamicHeight(element) { return element.height; }
		};
		const renderer: IListRenderer<TestElement, void> = {
			templateId: 'template',
			renderTemplate() { },
			renderElement() { },
			disposeTemplate() { }
		};

		const elements: TestElement[] = [{ height: 0 }, { height: 0 }, { height: 0 }];
		const listView = new ListView<TestElement>(document.createElement('div'), delegate, [renderer], { supportDynamicHeights: true });
		try {
			// Collapsing the viewport before splicing zero-height items previously yielded an inverted range that crashed probeDynamicHeights.
			listView.layout(0, 200);
			assert.doesNotThrow(() => listView.splice(0, 0, elements));
		} finally {
			listView.dispose();
		}
	});
});
