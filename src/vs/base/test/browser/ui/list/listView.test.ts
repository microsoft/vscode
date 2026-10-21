/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../browser/dom.js';
import { CachedListVirtualDelegate, IListRenderer, IListVirtualDelegate } from '../../../../browser/ui/list/list.js';
import { ListView } from '../../../../browser/ui/list/listView.js';
import { range } from '../../../../common/arrays.js';
import { DisposableStore, toDisposable } from '../../../../common/lifecycle.js';
import { IRange } from '../../../../common/range.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

suite('ListView', function () {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('retains only the requested live row across scrolling, identity updates and deletion', () => {
		const container = document.createElement('div');
		const disposed: number[] = [];
		const rendered: number[] = [];
		const renderer: IListRenderer<{ id: number; label: string }, HTMLElement> = {
			templateId: 'retained',
			renderTemplate: container => container,
			renderElement: (element, _index, container) => {
				rendered.push(element.id);
				container.textContent = element.label;
			},
			disposeElement: element => disposed.push(element.id),
			disposeTemplate: () => { },
		};
		const list = store.add(new ListView<{ id: number; label: string }>(container, {
			getHeight: () => 20,
			getTemplateId: () => 'retained',
		}, [renderer], { identityProvider: { getId: element => String(element.id) } }));
		list.layout(200, 200);
		list.splice(0, 0, Array.from({ length: 100 }, (_, id) => ({ id, label: String(id) })));
		list.setScrollTop(1800);
		const originalRow = list.domElement(99);
		const hold = store.add(list.retainElement(99));
		const secondHold = store.add(list.retainElement(99));
		list.setScrollTop(0);
		const outsideViewport = {
			sameRow: list.domElement(99) === originalRow,
			rowCount: container.querySelectorAll('.monaco-list-row').length,
			disposals: disposed.filter(id => id === 99).length,
		};
		list.splice(0, 0, [{ id: -1, label: 'Inserted' }]);
		const shiftedTop = list.domElement(100)?.style.top;
		list.splice(100, 1, [{ id: 99, label: 'Updated' }]);
		const updated = { sameRow: list.domElement(100) === originalRow, label: originalRow?.textContent };
		list.setScrollTop(1820);
		const rendersAfterReturn = rendered.filter(id => id === 99).length;
		list.setScrollTop(0);
		hold.dispose();
		const heldTwice = list.domElement(100) === originalRow;
		secondHold.dispose();
		const released = list.domElement(100);

		list.setScrollTop(1820);
		const deletedHold = store.add(list.retainElement(100));
		list.setScrollTop(0);
		list.splice(100, 1);
		deletedHold.dispose();

		assert.deepStrictEqual({
			outsideViewport,
			shiftedTop,
			updated,
			rendersAfterReturn,
			heldTwice,
			released,
			rowsAfterDeletion: container.querySelectorAll('.monaco-list-row').length,
			disposals: disposed.filter(id => id === 99).length,
		}, {
			outsideViewport: { sameRow: true, rowCount: 11, disposals: 0 },
			shiftedTop: '2000px',
			updated: { sameRow: true, label: 'Updated' },
			rendersAfterReturn: 2,
			heldTwice: true,
			released: null,
			rowsAfterDeletion: 10,
			disposals: 3,
		});
	});

	test('updates retained row geometry and does not rerender it when a splice reveals it', () => {
		const container = document.createElement('div');
		let targetRenders = 0;
		const renderer: IListRenderer<number, HTMLElement> = {
			templateId: 'row',
			renderTemplate: container => container,
			renderElement: (element, _index, container) => {
				if (element === 19) {
					targetRenders++;
				}
				container.textContent = String(element);
			},
			disposeTemplate: () => { },
		};
		const list = store.add(new ListView<number>(container, {
			getHeight: () => 20,
			getTemplateId: () => 'row',
		}, [renderer]));
		list.layout(100, 200);
		list.splice(0, 0, range(20));
		list.setScrollTop(300);
		const row = list.domElement(19)!;
		store.add(list.retainElement(19));
		list.setScrollTop(0);
		list.updateElementHeight(0, 40, null);
		list.updateElementHeight(19, 30, null);
		const resized = { top: row.style.top, height: row.style.height };
		list.splice(0, 17);
		assert.deepStrictEqual({
			resized,
			sameRow: list.domElement(2) === row,
			targetRenders,
			top: row.style.top,
			height: row.style.height,
		}, {
			resized: { top: '400px', height: '30px' },
			sameRow: true,
			targetRenders: 1,
			top: '40px',
			height: '30px',
		});
	});

	test('keeps retained rows in document order without restarting focus or animation on refresh', () => {
		const container = dom.append(document.body, dom.$('.retained-row-order-test'));
		store.add(toDisposable(() => container.remove()));
		const style = dom.append(container, dom.$('style'));
		style.textContent = '.retained-row-order-test button { animation: retained-row-order 10s linear infinite; } @keyframes retained-row-order { from { opacity: 0.8; } to { opacity: 1; } }';
		const renderer: IListRenderer<number, HTMLButtonElement> = {
			templateId: 'row',
			renderTemplate: container => dom.append(container, dom.$<HTMLButtonElement>('button')),
			renderElement: (element, _index, button) => button.textContent = String(element),
			disposeTemplate: () => { },
		};
		const list = store.add(new ListView<number>(container, {
			getHeight: () => 20,
			getTemplateId: () => 'row',
		}, [renderer], { identityProvider: { getId: element => String(element) } }));
		list.layout(200, 300);
		list.splice(0, 0, range(100));
		list.setScrollTop(1800);
		store.add(list.retainElement(99));
		const row = list.domElement(99)!;
		const button = row.querySelector('button')!;
		button.focus({ preventScroll: true });
		const animation = button.getAnimations()[0];
		assert.ok(animation);
		list.setScrollTop(0);
		const orderBeforeRefresh = Array.from(container.querySelectorAll('.monaco-list-row'), row => Number(row.getAttribute('data-index')));
		const observer = new MutationObserver(() => { });
		store.add(toDisposable(() => observer.disconnect()));
		observer.observe(list.containerDomNode, { childList: true });
		list.splice(99, 1, [99]);
		const removed = observer.takeRecords().some(record => Array.from(record.removedNodes).includes(row));
		assert.deepStrictEqual({
			orderBeforeRefresh,
			removed,
			sameRow: list.domElement(99) === row,
			focused: document.activeElement === button,
			sameAnimation: button.getAnimations()[0] === animation,
		}, {
			orderBeforeRefresh: [...range(10), 99],
			removed: false,
			sameRow: true,
			focused: true,
			sameAnimation: true,
		});
	});

	test('tracks multiple retained indexes through insertions, replacements and removals', () => {
		const container = dom.append(document.body, dom.$('div'));
		store.add(toDisposable(() => container.remove()));
		const renderer: IListRenderer<number, HTMLButtonElement> = {
			templateId: 'row',
			renderTemplate: container => dom.append(container, dom.$<HTMLButtonElement>('button')),
			renderElement: (element, _index, button) => button.textContent = String(element),
			disposeTemplate: () => { },
		};
		const list = store.add(new ListView<number>(container, {
			getHeight: () => 20,
			getTemplateId: () => 'row',
		}, [renderer], { identityProvider: { getId: element => String(element) } }));
		list.layout(100, 300);
		list.splice(0, 0, range(30));
		list.setScrollTop(200);
		const first = list.domElement(10)!;
		const firstHold = store.add(list.retainElement(10));
		list.setScrollTop(500);
		const last = list.domElement(29)!;
		const lastHold = store.add(list.retainElement(29));
		last.querySelector('button')!.focus({ preventScroll: true });
		list.setScrollTop(0);
		list.splice(0, 0, [-2, -1]);
		list.splice(4, 3);
		list.splice(8, 3, [80, 10, 90, 91]);
		const shifted = {
			first: list.domElement(9) === first,
			last: list.domElement(29) === last,
			firstTop: first.style.top,
			lastTop: last.style.top,
			focused: document.activeElement === last.querySelector('button'),
			order: Array.from(container.querySelectorAll('.monaco-list-row'), row => Number(row.getAttribute('data-index'))),
		};
		list.splice(0, 5);
		firstHold.dispose();
		const releasedInViewport = list.domElement(4) === first;
		list.splice(24, Number.MAX_VALUE);
		lastHold.dispose();
		assert.deepStrictEqual({
			shifted,
			releasedInViewport,
			removed: !last.isConnected,
			length: list.length,
		}, {
			shifted: { first: true, last: true, firstTop: '180px', lastTop: '580px', focused: true, order: [0, 1, 2, 3, 4, 9, 29] },
			releasedInViewport: true,
			removed: true,
			length: 24,
		});
	});

	test('keeps a retained successor ahead of cached rows across a large unrendered gap', () => {
		const container = document.createElement('div');
		const list = store.add(new ListView<number>(container, {
			getHeight: () => 20,
			getTemplateId: () => 'row',
		}, [{
			templateId: 'row',
			renderTemplate: (container: HTMLElement) => container,
			renderElement: (element: number, _index: number, container: HTMLElement) => container.textContent = String(element),
			disposeTemplate: () => { },
		}], { identityProvider: { getId: element => String(element) }, supportDynamicHeights: true }));
		list.layout(100, 200);
		list.splice(0, 0, range(10000));
		list.setScrollTop(199900);
		store.add(list.retainElement(9999));
		const retained = list.domElement(9999);
		list.setScrollTop(0);
		list.splice(0, 0, [-1]);
		list.setScrollTop(50000);
		list.setScrollTop(0);
		const observer = new MutationObserver(() => { });
		store.add(toDisposable(() => observer.disconnect()));
		observer.observe(retained!, { attributes: true });
		for (let scrollTop = 1; scrollTop <= 10; scrollTop++) {
			list.setScrollTop(scrollTop);
		}
		assert.deepStrictEqual({
			retained: list.domElement(10000) === retained,
			top: retained?.style.top,
			unchangedGeometryWrites: observer.takeRecords().length,
			order: Array.from(container.querySelectorAll('.monaco-list-row'), row => Number(row.getAttribute('data-index'))),
		}, { retained: true, top: '200000px', unchangedGeometryWrites: 0, order: [0, 1, 2, 3, 4, 5, 10000] });
	});

	for (const horizontalScrolling of [false, true]) {
		for (const supportDynamicHeights of [false, true]) {
			if (horizontalScrolling && supportDynamicHeights) {
				continue;
			}
			test(`recovers when rendering collapses the viewport (horizontal: ${horizontalScrolling}, dynamic: ${supportDynamicHeights})`, () => {
				const disposables = store.add(new DisposableStore());
				const element = document.createElement('div');
				const delegate: IListVirtualDelegate<number> = {
					getHeight() { return 20; },
					getTemplateId() { return 'template'; },
					getDynamicHeight() { return 20; }
				};
				const rendered: number[] = [];
				const disposed: number[] = [];
				const dragURIs: number[] = [];
				let templates = 0;
				let collapseOnRender = true;
				const renderer: IListRenderer<number, HTMLElement> = {
					templateId: 'template',
					renderTemplate(container) {
						templates++;
						return container;
					},
					renderElement(value, _index, container) {
						rendered.push(value);
						container.textContent = String(value);
						if (collapseOnRender) {
							collapseOnRender = false;
							listView.layout(0, 200);
						}
					},
					disposeElement(value) { disposed.push(value); },
					disposeTemplate() { templates--; }
				};
				const listView = disposables.add(new ListView<number>(element, delegate, [renderer], {
					horizontalScrolling,
					supportDynamicHeights,
					dnd: {
						getDragElements(value) { return [value]; },
						getDragURI(value) {
							dragURIs.push(value);
							return value === 42 ? 'test:42' : null;
						},
						onDragStart() { },
						onDragOver() { return false; },
						drop() { },
						dispose() { }
					}
				}));
				listView.layout(200, 200);
				listView.splice(0, 0, [42]);

				assert.deepStrictEqual({
					length: listView.length,
					row: listView.domElement(0),
					rowsInDOM: element.querySelectorAll('.monaco-list-row').length,
					rendered,
					disposed,
					dragURIs
				}, {
					length: 1,
					row: null,
					rowsInDOM: 0,
					rendered: [42],
					disposed: [42],
					dragURIs: []
				});

				listView.layout(200, 200);
				const row = listView.domElement(0)!;
				assert.deepStrictEqual({
					text: row.textContent,
					draggable: row.draggable,
					rendered,
					dragURIs,
					templates
				}, {
					text: '42',
					draggable: true,
					rendered: [42, 42],
					dragURIs: [42],
					templates: 1
				});

				listView.splice(0, 1, [7]);
				assert.deepStrictEqual({
					reused: listView.domElement(0) === row,
					text: row.textContent,
					draggable: row.draggable,
					rendered,
					disposed,
					dragURIs
				}, {
					reused: true,
					text: '7',
					draggable: false,
					rendered: [42, 42, 7],
					disposed: [42, 42],
					dragURIs: [42, 7]
				});

				disposables.dispose();
				assert.deepStrictEqual({ templates, disposed }, { templates: 0, disposed: [42, 42, 7] });
			});
		}
	}

	test('does not render stale insertion ranges after a reentrant viewport collapse', () => {
		const element = document.createElement('div');
		let collapseOnRender = false;
		const renderer: IListRenderer<number, HTMLElement> = {
			templateId: 'template',
			renderTemplate(container) { return container; },
			renderElement(value, _index, container) {
				container.textContent = String(value);
				if (collapseOnRender) {
					collapseOnRender = false;
					listView.layout(0, 200);
				}
			},
			disposeTemplate() { }
		};
		const listView = store.add(new ListView<number>(element, {
			getHeight() { return 20; },
			getTemplateId() { return 'template'; }
		}, [renderer]));
		listView.layout(200, 200);
		listView.splice(0, 0, [1, 2, 3]);
		collapseOnRender = true;
		listView.splice(0, 3, [4, 5, 6]);
		const collapsedRows = element.querySelectorAll('.monaco-list-row').length;

		listView.splice(0, 3, [7]);
		listView.layout(200, 200);

		assert.deepStrictEqual({
			collapsedRows,
			length: listView.length,
			renderedRows: Array.from(element.querySelectorAll('.monaco-list-row'), row => row.textContent)
		}, {
			collapsedRows: 0,
			length: 1,
			renderedRows: ['7']
		});
	});

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

	test('preserves existing rows while measuring overestimated appended rows', function () {
		const container = document.createElement('div');
		container.style.height = '300px';
		container.style.width = '200px';
		document.body.appendChild(container);

		type TestElement = { height: number };
		type Template = { container: HTMLElement; element?: TestElement };
		const delegate = new class extends CachedListVirtualDelegate<TestElement> {
			protected estimateHeight() { return 200; }
			getTemplateId() { return 'template'; }
			hasDynamicHeight() { return true; }
		};
		const renderer: IListRenderer<TestElement, Template> = {
			templateId: 'template',
			renderTemplate(container) { return { container }; },
			renderElement(element, _index, template) {
				if (template.element !== element) {
					template.element = element;
					const content = document.createElement('div');
					content.style.height = `${element.height}px`;
					template.container.replaceChildren(content);
				}
			},
			disposeTemplate() { }
		};
		const listView = new ListView<TestElement>(container, delegate, [renderer], { supportDynamicHeights: true });
		try {
			listView.layout(300, 200);
			listView.splice(0, 0, [{ height: 400 }]);
			listView.scrollTop = listView.scrollHeight;
			const originalContent = listView.domElement(0)?.firstElementChild;
			assert.ok(originalContent);

			listView.splice(1, 0, [{ height: 30 }, { height: 20 }]);
			listView.scrollTop = listView.scrollHeight;

			assert.deepStrictEqual({
				sameContent: listView.domElement(0)?.firstElementChild === originalContent,
				connected: originalContent.isConnected,
				contentHeight: listView.contentHeight,
				scrollTop: listView.scrollTop,
			}, {
				sameContent: true,
				connected: true,
				contentHeight: 450,
				scrollTop: 150,
			});
		} finally {
			listView.dispose();
			container.remove();
		}
	});

	test('reuses a bounded row pool while measuring appended rows', function () {
		const container = document.createElement('div');
		document.body.appendChild(container);

		type TestElement = { height: number };
		const delegate = new class extends CachedListVirtualDelegate<TestElement> {
			protected estimateHeight() { return 200; }
			getTemplateId() { return 'template'; }
			hasDynamicHeight() { return true; }
		};
		let templatesCount = 0;
		const renderer: IListRenderer<TestElement, HTMLElement> = {
			templateId: 'template',
			renderTemplate(container) {
				templatesCount++;
				const content = document.createElement('div');
				container.appendChild(content);
				return content;
			},
			renderElement(element, _index, content) {
				content.style.height = `${element.height}px`;
			},
			disposeTemplate() { templatesCount--; }
		};
		const listView = new ListView<TestElement>(container, delegate, [renderer], { supportDynamicHeights: true });
		let warmedTemplatesCount = 0;
		let finalTemplatesCount = 0;
		try {
			listView.layout(300, 200);
			for (let batch = 0; batch < 100; batch++) {
				listView.splice(listView.length, 0, [{ height: 30 }, { height: 20 }]);
				listView.scrollTop = listView.scrollHeight;
				if (batch === 49) {
					warmedTemplatesCount = templatesCount;
				}
			}
			finalTemplatesCount = templatesCount;
		} finally {
			listView.dispose();
			container.remove();
		}
		assert.deepStrictEqual({
			allocatedTemplates: warmedTemplatesCount > 0,
			templatesAfterMoreRows: finalTemplatesCount,
			templatesAfterDisposal: templatesCount,
		}, {
			allocatedTemplates: true,
			templatesAfterMoreRows: warmedTemplatesCount,
			templatesAfterDisposal: 0,
		});
	});

	test('updates data-index when reusing dynamic height measurement rows', function () {
		const container = document.createElement('div');
		document.body.appendChild(container);

		type TestElement = { id: string; height: number };
		type Template = { row: HTMLElement; content: HTMLElement };
		const delegate: IListVirtualDelegate<TestElement> = {
			getHeight() { return 25; },
			getTemplateId() { return 'template'; },
			hasDynamicHeight() { return true; }
		};

		const cachedRows = new Set<HTMLElement>();
		let phase: 'single' | 'batched' | undefined;
		const renderedIndices: { phase: string; index: number; dataIndex: string | undefined; reused: boolean }[] = [];
		const contextMenuTargets: { index: number | undefined; element: string | undefined }[] = [];
		const renderer: IListRenderer<TestElement, Template> = {
			templateId: 'template',
			renderTemplate(row) {
				const content = document.createElement('div');
				row.appendChild(content);
				return { row, content };
			},
			renderElement(element, index, { row, content }) {
				content.style.height = `${element.height}px`;
				if (phase) {
					renderedIndices.push({ phase, index, dataIndex: row.dataset.index, reused: cachedRows.has(row) });
					content.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
				}
			},
			disposeTemplate() { }
		};

		const elements: TestElement[] = range(10).map(index => ({ id: String(index), height: 25 }));
		const listView = new ListView<TestElement>(container, delegate, [renderer], { supportDynamicHeights: true });
		store.add(listView.onContextMenu(event => {
			contextMenuTargets.push({ index: event.index, element: event.element?.id });
		}));
		try {
			listView.layout(250, 200);
			listView.splice(0, 0, elements);
			for (let index = 1; index < listView.length; index++) {
				cachedRows.add(listView.domElement(index)!);
			}

			listView.layout(25, 200);
			listView.splice(3, 7);
			assert.strictEqual(listView.domElement(2), null);

			phase = 'single';
			listView.updateElementHeight(2, undefined, null);

			phase = 'batched';
			for (const element of elements) {
				element.height = 5;
			}
			listView.domElement(0)!.querySelector<HTMLElement>('div')!.style.height = '5px';
			listView.rerender();

			assert.deepStrictEqual({
				renderedIndices,
				contextMenuTargets,
				finalIndices: range(listView.length).map(index => listView.domElement(index)?.dataset.index)
			}, {
				renderedIndices: [
					{ phase: 'single', index: 2, dataIndex: '2', reused: true },
					{ phase: 'batched', index: 1, dataIndex: '1', reused: true },
					{ phase: 'batched', index: 2, dataIndex: '2', reused: true }
				],
				contextMenuTargets: [
					{ index: 2, element: '2' },
					{ index: 1, element: '1' },
					{ index: 2, element: '2' }
				],
				finalIndices: ['0', '1', '2']
			});
		} finally {
			listView.dispose();
			container.remove();
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
