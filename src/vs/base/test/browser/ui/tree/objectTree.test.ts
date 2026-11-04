/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IIdentityProvider, IListVirtualDelegate } from '../../../../browser/ui/list/list.js';
import { TreeRenderer } from '../../../../browser/ui/tree/abstractTree.js';
import { ICompressedTreeNode } from '../../../../browser/ui/tree/compressedObjectTreeModel.js';
import { CompressibleObjectTree, ICompressibleTreeRenderer, IObjectTreeOptions, ObjectTree } from '../../../../browser/ui/tree/objectTree.js';
import { ObjectTreeModel } from '../../../../browser/ui/tree/objectTreeModel.js';
import { ITreeNode, ITreeRenderer } from '../../../../browser/ui/tree/tree.js';
import { mainWindow } from '../../../../browser/window.js';
import { timeout } from '../../../../common/async.js';
import { Emitter, Event } from '../../../../common/event.js';
import { SetMap } from '../../../../common/map.js';
import { runWithFakedTimers } from '../../../common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

function getRowsTextContent(container: HTMLElement): string[] {
	const rows = [...container.querySelectorAll('.monaco-list-row')];
	rows.sort((a, b) => parseInt(a.getAttribute('data-index')!) - parseInt(b.getAttribute('data-index')!));
	return rows.map(row => row.querySelector('.monaco-tl-contents')!.textContent!);
}

function clickElement(element: HTMLElement, ctrlKey = false, altKey = false): void {
	element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, ctrlKey, altKey, button: 0 }));
	element.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey, altKey, button: 0 }));
}

function dispatchKeydown(element: HTMLElement, key: string, code: string, keyCode: number): void {
	const keyboardEvent = new KeyboardEvent('keydown', { bubbles: true, key, code });
	Object.defineProperty(keyboardEvent, 'keyCode', { get: () => keyCode });
	element.dispatchEvent(keyboardEvent);
}

suite('ObjectTree', function () {

	suite('TreeNavigator', function () {
		let tree: ObjectTree<number>;
		let filter = (_: number) => true;

		teardown(() => {
			tree.dispose();
			filter = (_: number) => true;
		});

		ensureNoDisposablesAreLeakedInTestSuite();

		setup(() => {
			const container = document.createElement('div');
			container.style.width = '200px';
			container.style.height = '200px';

			const delegate = new class implements IListVirtualDelegate<number> {
				getHeight() { return 20; }
				getTemplateId(): string { return 'default'; }
			};

			const renderer = new class implements ITreeRenderer<number, void, HTMLElement> {
				readonly templateId = 'default';
				renderTemplate(container: HTMLElement): HTMLElement {
					return container;
				}
				renderElement(element: ITreeNode<number, void>, index: number, templateData: HTMLElement): void {
					templateData.textContent = `${element.element}`;
				}
				disposeTemplate(): void { }
			};

			tree = new ObjectTree<number>('test', container, delegate, [renderer], { filter: { filter: (el) => filter(el) } });
			tree.layout(200);
		});

		test('should be able to navigate', () => {
			tree.setChildren(null, [
				{
					element: 0, children: [
						{ element: 10 },
						{ element: 11 },
						{ element: 12 },
					]
				},
				{ element: 1 },
				{ element: 2 }
			]);

			const navigator = tree.navigate();

			assert.strictEqual(navigator.current(), null);
			assert.strictEqual(navigator.next(), 0);
			assert.strictEqual(navigator.current(), 0);
			assert.strictEqual(navigator.next(), 10);
			assert.strictEqual(navigator.current(), 10);
			assert.strictEqual(navigator.next(), 11);
			assert.strictEqual(navigator.current(), 11);
			assert.strictEqual(navigator.next(), 12);
			assert.strictEqual(navigator.current(), 12);
			assert.strictEqual(navigator.next(), 1);
			assert.strictEqual(navigator.current(), 1);
			assert.strictEqual(navigator.next(), 2);
			assert.strictEqual(navigator.current(), 2);
			assert.strictEqual(navigator.previous(), 1);
			assert.strictEqual(navigator.current(), 1);
			assert.strictEqual(navigator.previous(), 12);
			assert.strictEqual(navigator.previous(), 11);
			assert.strictEqual(navigator.previous(), 10);
			assert.strictEqual(navigator.previous(), 0);
			assert.strictEqual(navigator.previous(), null);
			assert.strictEqual(navigator.next(), 0);
			assert.strictEqual(navigator.next(), 10);
			assert.strictEqual(navigator.first(), 0);
			assert.strictEqual(navigator.last(), 2);
		});

		test('should skip collapsed nodes', () => {
			tree.setChildren(null, [
				{
					element: 0, collapsed: true, children: [
						{ element: 10 },
						{ element: 11 },
						{ element: 12 },
					]
				},
				{ element: 1 },
				{ element: 2 }
			]);

			const navigator = tree.navigate();

			assert.strictEqual(navigator.current(), null);
			assert.strictEqual(navigator.next(), 0);
			assert.strictEqual(navigator.next(), 1);
			assert.strictEqual(navigator.next(), 2);
			assert.strictEqual(navigator.next(), null);
			assert.strictEqual(navigator.previous(), 2);
			assert.strictEqual(navigator.previous(), 1);
			assert.strictEqual(navigator.previous(), 0);
			assert.strictEqual(navigator.previous(), null);
			assert.strictEqual(navigator.next(), 0);
			assert.strictEqual(navigator.first(), 0);
			assert.strictEqual(navigator.last(), 2);
		});

		test('reports the flattened visible render count', () => {
			tree.setChildren(null, [
				{
					element: 0,
					collapsible: true,
					collapsed: false,
					children: [
						{ element: 10 },
						{ element: 11 },
					]
				},
				{
					element: 1,
					collapsible: true,
					collapsed: true,
					children: [
						{ element: 20 },
					]
				},
				{ element: 2 }
			]);

			const expandedRoot = tree.getListRenderCount(null);
			const expandedSubtree = tree.getListRenderCount(0);
			tree.collapse(0);

			assert.deepStrictEqual({
				expandedRoot,
				expandedSubtree,
				collapsedRoot: tree.getListRenderCount(null),
				collapsedSubtree: tree.getListRenderCount(0),
			}, {
				expandedRoot: 5,
				expandedSubtree: 3,
				collapsedRoot: 3,
				collapsedSubtree: 1,
			});
		});

		test('should skip filtered elements', () => {
			filter = el => el % 2 === 0;

			tree.setChildren(null, [
				{
					element: 0, children: [
						{ element: 10 },
						{ element: 11 },
						{ element: 12 },
					]
				},
				{ element: 1 },
				{ element: 2 }
			]);

			const navigator = tree.navigate();

			assert.strictEqual(navigator.current(), null);
			assert.strictEqual(navigator.next(), 0);
			assert.strictEqual(navigator.next(), 10);
			assert.strictEqual(navigator.next(), 12);
			assert.strictEqual(navigator.next(), 2);
			assert.strictEqual(navigator.next(), null);
			assert.strictEqual(navigator.previous(), 2);
			assert.strictEqual(navigator.previous(), 12);
			assert.strictEqual(navigator.previous(), 10);
			assert.strictEqual(navigator.previous(), 0);
			assert.strictEqual(navigator.previous(), null);
			assert.strictEqual(navigator.next(), 0);
			assert.strictEqual(navigator.next(), 10);
			assert.strictEqual(navigator.first(), 0);
			assert.strictEqual(navigator.last(), 2);
		});

		test('should be able to start from node', () => {
			tree.setChildren(null, [
				{
					element: 0, children: [
						{ element: 10 },
						{ element: 11 },
						{ element: 12 },
					]
				},
				{ element: 1 },
				{ element: 2 }
			]);

			const navigator = tree.navigate(1);

			assert.strictEqual(navigator.current(), 1);
			assert.strictEqual(navigator.next(), 2);
			assert.strictEqual(navigator.current(), 2);
			assert.strictEqual(navigator.previous(), 1);
			assert.strictEqual(navigator.current(), 1);
			assert.strictEqual(navigator.previous(), 12);
			assert.strictEqual(navigator.previous(), 11);
			assert.strictEqual(navigator.previous(), 10);
			assert.strictEqual(navigator.previous(), 0);
			assert.strictEqual(navigator.previous(), null);
			assert.strictEqual(navigator.next(), 0);
			assert.strictEqual(navigator.next(), 10);
			assert.strictEqual(navigator.first(), 0);
			assert.strictEqual(navigator.last(), 2);
		});
	});

	class Delegate implements IListVirtualDelegate<number> {
		getHeight() { return 20; }
		getTemplateId(): string { return 'default'; }
	}

	class Renderer implements ITreeRenderer<number, void, HTMLElement> {
		readonly templateId = 'default';
		renderTemplate(container: HTMLElement): HTMLElement {
			return container;
		}
		renderElement(element: ITreeNode<number, void>, index: number, templateData: HTMLElement): void {
			templateData.textContent = `${element.element}`;
		}
		disposeTemplate(): void { }
	}

	suite('collapseRecursive', function () {
		const store = ensureNoDisposablesAreLeakedInTestSuite();

		function createTree(options: IObjectTreeOptions<number> = {}): ObjectTree<number> {
			const container = document.createElement('div');
			container.style.width = '200px';
			container.style.height = '200px';

			const tree = store.add(new ObjectTree<number>('test', container, new Delegate(), [new Renderer()], options));
			tree.layout(200);
			tree.setChildren(null, [
				{
					element: 1, collapsed: false, children: [{
						element: 11, collapsed: false, children: [{
							element: 111, collapsed: false, children: [{ element: 1111 }]
						}]
					}]
				},
				{ element: 2, collapsed: false, children: [{ element: 21 }] }
			]);
			return tree;
		}

		function getCollapsedState(tree: ObjectTree<number>): boolean[] {
			return [1, 11, 111, 2].map(element => tree.isCollapsed(element));
		}

		test('preserves descendant state by default', () => {
			const tree = createTree();
			const collapseChanged = tree.collapse(1);
			const afterCollapse = getCollapsedState(tree);
			tree.expand(1);
			const toggleChanged = tree.toggleCollapsed(1);
			const afterToggle = getCollapsedState(tree);
			tree.expand(1);

			assert.deepStrictEqual({
				collapseChanged,
				afterCollapse,
				toggleChanged,
				afterToggle,
				rowsAfterExpand: getRowsTextContent(tree.getHTMLElement()),
			}, {
				collapseChanged: true,
				afterCollapse: [true, false, false, false],
				toggleChanged: true,
				afterToggle: [true, false, false, false],
				rowsAfterExpand: ['1', '11', '111', '1111', '2', '21'],
			});
		});

		test('collapses descendants through public methods, clicks and keyboard events', () => {
			const tree = createTree({ collapseRecursive: true });
			const actions = [
				{ input: 'collapse', run: () => tree.collapse(1) },
				{ input: 'toggleCollapsed', run: () => tree.toggleCollapsed(1) },
				{ input: 'twistie click', run: () => clickElement(tree.getHTMLElement().querySelector<HTMLElement>('.monaco-list-row[data-index="0"] .monaco-tl-twistie')!) },
				{ input: 'LeftArrow', run: () => dispatchKeydown(tree.getHTMLElement(), 'ArrowLeft', 'ArrowLeft', 37) },
				{ input: 'Space', run: () => dispatchKeydown(tree.getHTMLElement(), ' ', 'Space', 32) },
			];
			const states = actions.map(({ input, run }) => {
				tree.expandAll();
				tree.setFocus([1]);
				run();
				return { input, collapsed: getCollapsedState(tree) };
			});

			assert.deepStrictEqual(states, [
				{ input: 'collapse', collapsed: [true, true, true, false] },
				{ input: 'toggleCollapsed', collapsed: [true, true, true, false] },
				{ input: 'twistie click', collapsed: [true, true, true, false] },
				{ input: 'LeftArrow', collapsed: [true, true, true, false] },
				{ input: 'Space', collapsed: [true, true, true, false] },
			]);
		});

		test('expands only the target node', () => {
			const tree = createTree({ collapseRecursive: true });
			const actions = [
				{ input: 'expand', run: () => tree.expand(1) },
				{ input: 'toggleCollapsed', run: () => tree.toggleCollapsed(1) },
				{ input: 'RightArrow', run: () => dispatchKeydown(tree.getHTMLElement(), 'ArrowRight', 'ArrowRight', 39) },
				{ input: 'Space', run: () => dispatchKeydown(tree.getHTMLElement(), ' ', 'Space', 32) },
			];
			const states = actions.map(({ input, run }) => {
				tree.collapse(1);
				tree.setFocus([1]);
				run();
				return { input, collapsed: getCollapsedState(tree) };
			});

			assert.deepStrictEqual(states, [
				{ input: 'expand', collapsed: [false, true, true, false] },
				{ input: 'toggleCollapsed', collapsed: [false, true, true, false] },
				{ input: 'RightArrow', collapsed: [false, true, true, false] },
				{ input: 'Space', collapsed: [false, true, true, false] },
			]);
		});

		test('keeps Alt-click collapse and expand recursive', () => {
			const states = [undefined, true].map(collapseRecursive => {
				const tree = createTree({ collapseRecursive });
				const twistie = tree.getHTMLElement().querySelector<HTMLElement>('.monaco-list-row[data-index="0"] .monaco-tl-twistie')!;
				clickElement(twistie, false, true);
				const afterCollapse = getCollapsedState(tree);
				clickElement(twistie, false, true);
				return { afterCollapse, afterExpand: getCollapsedState(tree) };
			});

			assert.deepStrictEqual(states, [
				{ afterCollapse: [true, true, true, false], afterExpand: [false, false, false, false] },
				{ afterCollapse: [true, true, true, false], afterExpand: [false, false, false, false] },
			]);
		});

		test('supports enabling and disabling the option at runtime', () => {
			const tree = createTree();
			tree.updateOptions({ collapseRecursive: true });
			tree.updateOptions({ indent: 12 });
			tree.collapse(1);
			const enabled = getCollapsedState(tree);
			tree.expandAll();
			tree.updateOptions({ collapseRecursive: false });
			tree.toggleCollapsed(1);

			assert.deepStrictEqual({ enabled, disabled: getCollapsedState(tree) }, {
				enabled: [true, true, true, false],
				disabled: [true, false, false, false],
			});
		});

		test('keeps explicit recursion and collapseAll recursive without duplicate events', () => {
			const states = [false, true].map(collapseRecursive => {
				const tree = createTree({ collapseRecursive });
				const events: (number | null)[] = [];
				store.add(tree.onDidChangeCollapseState(event => events.push(event.node.element)));
				tree.collapse(1, true);
				const afterRecursiveCollapse = events.splice(0);
				tree.expandAll();
				events.length = 0;
				tree.collapseAll();
				const afterCollapseAll = events.splice(0);
				tree.collapseAll();
				return { afterRecursiveCollapse, afterCollapseAll, repeatedEvents: events, collapsed: getCollapsedState(tree) };
			});

			assert.deepStrictEqual(states, [
				{ afterRecursiveCollapse: [1, 11, 111], afterCollapseAll: [1, 11, 111, 2], repeatedEvents: [], collapsed: [true, true, true, true] },
				{ afterRecursiveCollapse: [1, 11, 111], afterCollapseAll: [1, 11, 111, 2], repeatedEvents: [], collapsed: [true, true, true, true] },
			]);
		});

		test('preserves hidden descendants and LeftArrow parent navigation when already collapsed', () => {
			const tree = createTree();
			tree.collapse(11);
			tree.updateOptions({ collapseRecursive: true });
			tree.setFocus([11]);
			const events: (number | null)[] = [];
			store.add(tree.onDidChangeCollapseState(event => events.push(event.node.element)));
			const changed = tree.collapse(11);
			dispatchKeydown(tree.getHTMLElement(), 'ArrowLeft', 'ArrowLeft', 37);

			assert.deepStrictEqual({ changed, collapsed: getCollapsedState(tree), focus: tree.getFocus(), events }, {
				changed: false,
				collapsed: [false, true, false, false],
				focus: [1],
				events: [],
			});
		});

		test('keeps noncollapsible parents unchanged unless recursion is explicit', () => {
			const tree = createTree({ collapseRecursive: true, allowNonCollapsibleParents: true });
			tree.setCollapsible(1, false);
			const collapseChanged = tree.collapse(1);
			const toggleChanged = tree.toggleCollapsed(1);
			const afterNormalCollapse = getCollapsedState(tree);
			const recursiveChanged = tree.collapse(1, true);

			assert.deepStrictEqual({ collapseChanged, toggleChanged, afterNormalCollapse, recursiveChanged, afterRecursiveCollapse: getCollapsedState(tree) }, {
				collapseChanged: false,
				toggleChanged: false,
				afterNormalCollapse: [false, false, false, false],
				recursiveChanged: true,
				afterRecursiveCollapse: [false, true, true, false],
			});
		});
	});

	test('applies renderer row class names', function () {
		const container = document.createElement('div');
		container.style.width = '200px';
		container.style.height = '200px';

		const renderer = new class extends Renderer {
			readonly rowClassName = 'test-tree-row';
		};
		const tree = new ObjectTree<number>('test', container, new Delegate(), [renderer]);
		try {
			tree.layout(200);
			tree.setChildren(null, [{ element: 0 }, { element: 1 }]);

			assert.strictEqual(container.querySelectorAll('.monaco-list-row.test-tree-row').length, 2);
		} finally {
			tree.dispose();
		}
	});

	test('tracks the sticky scroll DOM node across runtime toggles', function () {
		const disabledContainer = document.createElement('div');
		disabledContainer.style.width = '200px';
		disabledContainer.style.height = '100px';
		const enabledContainer = document.createElement('div');
		enabledContainer.style.width = '200px';
		enabledContainer.style.height = '100px';

		const disabledTree = new ObjectTree<number>('disabled', disabledContainer, new Delegate(), [new Renderer()]);
		const enabledTree = new ObjectTree<number>('enabled', enabledContainer, new Delegate(), [new Renderer()], {
			enableStickyScroll: true,
			stickyScrollMaxItemCount: 1,
		});
		const stickyScrollDomNodeChanges: Array<HTMLElement | undefined> = [];
		const stickyScrollDomNodeListener = enabledTree.onDidChangeStickyScrollDomNode(node => stickyScrollDomNodeChanges.push(node));
		try {
			disabledTree.layout(100);
			enabledTree.layout(100);
			enabledTree.setChildren(null, [{
				element: 0,
				children: [
					{ element: 1 },
					{ element: 2 },
					{ element: 3 },
					{ element: 4 },
					{ element: 5 },
					{ element: 6 },
				]
			}]);

			const stickyScrollDomNode = enabledTree.stickyScrollDomNode;
			const stickyRowsBeforeScroll = stickyScrollDomNode?.querySelectorAll('.monaco-tree-sticky-row').length;
			enabledTree.scrollTop = 1;
			const stickyRowsAfterScroll = stickyScrollDomNode?.querySelectorAll('.monaco-tree-sticky-row').length;
			const isRealContainer = enabledContainer.querySelector('.monaco-tree-sticky-container') === stickyScrollDomNode;
			const stableBeforeToggle = enabledTree.stickyScrollDomNode === stickyScrollDomNode;
			enabledTree.updateOptions({ enableStickyScroll: false });
			const stickyScrollDomNodeWhenDisabled = enabledTree.stickyScrollDomNode;
			const oldDomNodeRemoved = stickyScrollDomNode ? !enabledContainer.contains(stickyScrollDomNode) : false;
			enabledTree.updateOptions({ enableStickyScroll: true });
			const replacementStickyScrollDomNode = enabledTree.stickyScrollDomNode;

			assert.deepStrictEqual({
				disabled: disabledTree.stickyScrollDomNode,
				isRealContainer,
				stableBeforeToggle,
				stickyRowsBeforeScroll,
				stickyRowsAfterScroll,
				stickyScrollDomNodeWhenDisabled,
				oldDomNodeRemoved,
				replacementIsRealContainer: enabledContainer.querySelector('.monaco-tree-sticky-container') === replacementStickyScrollDomNode,
				replacementIsNew: replacementStickyScrollDomNode !== stickyScrollDomNode,
				replacementStickyRows: replacementStickyScrollDomNode?.querySelectorAll('.monaco-tree-sticky-row').length,
				changeKinds: stickyScrollDomNodeChanges.map(node => node ? 'enabled' : 'disabled'),
			}, {
				disabled: undefined,
				isRealContainer: true,
				stableBeforeToggle: true,
				stickyRowsBeforeScroll: 0,
				stickyRowsAfterScroll: 1,
				stickyScrollDomNodeWhenDisabled: undefined,
				oldDomNodeRemoved: true,
				replacementIsRealContainer: true,
				replacementIsNew: true,
				replacementStickyRows: 1,
				changeKinds: ['disabled', 'enabled'],
			});
		} finally {
			stickyScrollDomNodeListener.dispose();
			disabledTree.dispose();
			enabledTree.dispose();
		}
	});

	test('shows the default sticky node after its source row starts scrolling out', function () {
		const container = document.createElement('div');
		container.style.width = '200px';
		container.style.height = '100px';

		const tree = new ObjectTree<number>('test', container, new Delegate(), [new Renderer()], {
			enableStickyScroll: true,
			stickyScrollMaxItemCount: 1,
		});
		try {
			tree.layout(100);
			tree.setChildren(null, [{
				element: 0,
				children: [
					{ element: 1 },
					{ element: 2 },
					{ element: 3 },
					{ element: 4 },
					{ element: 5 },
					{ element: 6 },
				]
			}]);

			const stickyText = () => container.querySelector<HTMLElement>('.monaco-tree-sticky-row')?.textContent;
			const states = [stickyText()];
			tree.scrollTop = 1;
			states.push(stickyText());

			assert.deepStrictEqual(states, [undefined, '0']);
		} finally {
			tree.dispose();
		}
	});

	test('evaluates a custom sticky source range once per scroll update', function () {
		const container = document.createElement('div');
		container.style.width = '200px';
		container.style.height = '100px';
		const providerCalls: { element: number; defaultRange: { start: number; end: number } }[] = [];

		const tree = new ObjectTree<number>('test', container, new Delegate(), [new Renderer()], {
			enableStickyScroll: true,
			stickyScrollMaxItemCount: 1,
			stickyScrollNodeSourceRangeProvider: (element, defaultRange) => {
				providerCalls.push({ element, defaultRange });
				return { start: 5, end: 15 };
			},
		});
		try {
			tree.layout(100);
			tree.setChildren(null, [{
				element: 0,
				children: [
					{ element: 1 },
					{ element: 2 },
					{ element: 3 },
					{ element: 4 },
					{ element: 5 },
					{ element: 6 },
				]
			}]);

			tree.scrollTop = 5;
			const stickyAtRangeStart = container.querySelector('.monaco-tree-sticky-row')?.textContent;
			tree.scrollTop = 6;
			const stickyAfterRangeStart = container.querySelector('.monaco-tree-sticky-row')?.textContent;

			assert.deepStrictEqual({
				stickyAtRangeStart,
				stickyAfterRangeStart,
				providerCalls,
			}, {
				stickyAtRangeStart: undefined,
				stickyAfterRangeStart: '0',
				providerCalls: [
					{ element: 0, defaultRange: { start: 0, end: 20 } },
					{ element: 0, defaultRange: { start: 0, end: 20 } },
				],
			});
		} finally {
			tree.dispose();
		}
	});

	test('shrinks a sticky node to its final pixel before the next root', async function () {
		const container = document.createElement('div');
		container.style.width = '200px';
		container.style.height = '100px';

		const tree = new ObjectTree<number>('test', container, new Delegate(), [new Renderer()], {
			enableStickyScroll: true,
			stickyScrollMaxItemCount: 1,
		});
		try {
			tree.layout(100);
			tree.setChildren(null, [
				{ element: 100, children: [{ element: 1 }, { element: 10 }] },
				{ element: 2 },
				{ element: 3 },
				{ element: 4 },
				{ element: 5 },
				{ element: 6 },
			]);

			tree.scrollTop = 1;
			await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
			tree.scrollTop = 59;
			await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
			const stickyBeforeBoundary = container.querySelector<HTMLElement>('.monaco-tree-sticky-row');
			const positionBeforeBoundary = stickyBeforeBoundary?.style.top;
			const visibleHeightBeforeBoundary = stickyBeforeBoundary ? Number.parseFloat(stickyBeforeBoundary.style.top) + Number.parseFloat(stickyBeforeBoundary.style.height) : undefined;
			tree.scrollTop = 60;
			const positionAtBoundary = container.querySelector<HTMLElement>('.monaco-tree-sticky-row')?.style.top;
			await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
			const stickyAfterBoundary = container.querySelector('.monaco-tree-sticky-row');

			assert.deepStrictEqual({
				positionBeforeBoundary,
				visibleHeightBeforeBoundary,
				positionAtBoundary,
				stickyAfterBoundary: !!stickyAfterBoundary,
			}, {
				positionBeforeBoundary: '-19px',
				visibleHeightBeforeBoundary: 1,
				positionAtBoundary: undefined,
				stickyAfterBoundary: false,
			});
		} finally {
			tree.dispose();
		}
	});

	test('disposing an older render preserves the current node mapping', function () {
		const onDidChangeTwistieState = new Emitter<number>();
		const renderer: ITreeRenderer<number, void, void> = {
			templateId: 'default',
			onDidChangeTwistieState: onDidChangeTwistieState.event,
			renderTemplate() { },
			renderElement() { },
			renderTwistie(_element, twistieElement) {
				twistieElement.dataset.renderCount = String(Number(twistieElement.dataset.renderCount ?? 0) + 1);
				return true;
			},
			disposeTemplate() { }
		};
		const model = new ObjectTreeModel<number>('test');
		model.setChildren(null, [{ element: 1 }]);
		const treeRenderer = new TreeRenderer(
			renderer,
			model,
			model.onDidChangeCollapseState,
			{ elements: [], onDidChange: Event.None },
			new SetMap<ITreeNode<number, void>, HTMLDivElement>()
		);

		try {
			const node = model.getNode(1);
			const firstTemplate = treeRenderer.renderTemplate(document.createElement('div'));
			const secondTemplate = treeRenderer.renderTemplate(document.createElement('div'));
			treeRenderer.renderElement(node, 0, firstTemplate, { height: 100 });
			treeRenderer.renderElement(node, 0, secondTemplate, { height: 100 });

			treeRenderer.disposeElement(node, 0, firstTemplate, { height: 100 });
			onDidChangeTwistieState.fire(1);

			assert.deepStrictEqual({
				firstRenderCount: firstTemplate.twistie.dataset.renderCount,
				secondRenderCount: secondTemplate.twistie.dataset.renderCount
			}, {
				firstRenderCount: '1',
				secondRenderCount: '2'
			});
		} finally {
			treeRenderer.dispose();
			onDidChangeTwistieState.dispose();
		}
	});

	class IdentityProvider implements IIdentityProvider<number> {
		getId(element: number): { toString(): string } {
			return `${element % 100}`;
		}
	}

	test('traits are preserved according to string identity', function () {
		const container = document.createElement('div');
		container.style.width = '200px';
		container.style.height = '200px';

		const delegate = new Delegate();
		const renderer = new Renderer();
		const identityProvider = new IdentityProvider();

		const tree = new ObjectTree<number>('test', container, delegate, [renderer], { identityProvider });
		tree.layout(200);

		tree.setChildren(null, [{ element: 0 }, { element: 1 }, { element: 2 }, { element: 3 }]);
		tree.setFocus([1]);
		assert.deepStrictEqual(tree.getFocus(), [1]);

		tree.setChildren(null, [{ element: 100 }, { element: 101 }, { element: 102 }, { element: 103 }]);
		assert.deepStrictEqual(tree.getFocus(), [101]);
	});

	test('updateOptions preserves wrapped identity provider in view options', function () {
		const container = document.createElement('div');
		container.style.width = '200px';
		container.style.height = '200px';

		const delegate = new Delegate();
		const renderer = new Renderer();
		const identityProvider = {
			getId(element: number): { toString(): string } {
				return `${element}`;
			},
			getGroupId(element: number): number {
				return element % 2;
			}
		};

		const tree = new ObjectTree<number>('test', container, delegate, [renderer], { identityProvider });

		try {
			tree.layout(200);
			tree.setChildren(null, [{ element: 0 }, { element: 1 }, { element: 2 }, { element: 3 }]);

			const firstRow = container.querySelector('.monaco-list-row[data-index="0"]') as HTMLElement;
			const secondRow = container.querySelector('.monaco-list-row[data-index="1"]') as HTMLElement;
			clickElement(firstRow);
			assert.deepStrictEqual(tree.getSelection(), [0]);

			tree.updateOptions({ indent: 12 });

			clickElement(secondRow, true);

			assert.deepStrictEqual(tree.getSelection(), [1]);
		} finally {
			tree.dispose();
		}
	});

	test('updateOptions preserves wrapped accessibility provider for type navigation re-announce', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const container = document.createElement('div');
		container.style.width = '200px';
		container.style.height = '200px';

		const delegate = new Delegate();
		const renderer = new Renderer();
		const accessibilityProvider = {
			getAriaLabel(element: number): string {
				assert.strictEqual(typeof element, 'number');
				return `aria ${element}`;
			},
			getWidgetAriaLabel(): string {
				return 'tree';
			}
		};

		const tree = new ObjectTree<number>('test', container, delegate, [renderer], {
			accessibilityProvider,
			keyboardNavigationLabelProvider: {
				getKeyboardNavigationLabel: () => 'a'
			}
		});

		try {
			tree.layout(200);
			tree.setChildren(null, [{ element: 0 }]);
			tree.setFocus([0]);
			tree.domFocus();

			tree.updateOptions({ indent: 12 });

			dispatchKeydown(tree.getHTMLElement(), 'a', 'KeyA', 65);
			// Let the type navigation clear debounce re-announce the focused element before disposing
			await timeout(800);
		} finally {
			tree.dispose();
		}
	}));
});

suite('CompressibleObjectTree', function () {

	class Delegate implements IListVirtualDelegate<number> {
		getHeight() { return 20; }
		getTemplateId(): string { return 'default'; }
	}

	class Renderer implements ICompressibleTreeRenderer<number, void, HTMLElement> {
		readonly templateId = 'default';
		renderTemplate(container: HTMLElement): HTMLElement {
			return container;
		}
		renderElement(node: ITreeNode<number, void>, _: number, templateData: HTMLElement): void {
			templateData.textContent = `${node.element}`;
		}
		renderCompressedElements(node: ITreeNode<ICompressedTreeNode<number>, void>, _: number, templateData: HTMLElement): void {
			templateData.textContent = `${node.element.elements.join('/')}`;
		}
		disposeTemplate(): void { }
	}

	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	test('empty', function () {
		const container = document.createElement('div');
		container.style.width = '200px';
		container.style.height = '200px';

		const tree = ds.add(new CompressibleObjectTree<number>('test', container, new Delegate(), [new Renderer()]));
		tree.layout(200);

		assert.strictEqual(getRowsTextContent(container).length, 0);
	});

	test('simple', function () {
		const container = document.createElement('div');
		container.style.width = '200px';
		container.style.height = '200px';

		const tree = ds.add(new CompressibleObjectTree<number>('test', container, new Delegate(), [new Renderer()]));
		tree.layout(200);

		tree.setChildren(null, [
			{
				element: 0, children: [
					{ element: 10 },
					{ element: 11 },
					{ element: 12 },
				]
			},
			{ element: 1 },
			{ element: 2 }
		]);

		assert.deepStrictEqual(getRowsTextContent(container), ['0', '10', '11', '12', '1', '2']);
	});

	test('compressed', () => {
		const container = document.createElement('div');
		container.style.width = '200px';
		container.style.height = '200px';

		const tree = ds.add(new CompressibleObjectTree<number>('test', container, new Delegate(), [new Renderer()]));
		tree.layout(200);

		tree.setChildren(null, [
			{
				element: 1, children: [{
					element: 11, children: [{
						element: 111, children: [
							{ element: 1111 },
							{ element: 1112 },
							{ element: 1113 },
						]
					}]
				}]
			}
		]);

		assert.deepStrictEqual(getRowsTextContent(container), ['1/11/111', '1111', '1112', '1113']);

		tree.setChildren(11, [
			{ element: 111 },
			{ element: 112 },
			{ element: 113 },
		]);

		assert.deepStrictEqual(getRowsTextContent(container), ['1/11', '111', '112', '113']);

		tree.setChildren(113, [
			{ element: 1131 }
		]);

		assert.deepStrictEqual(getRowsTextContent(container), ['1/11', '111', '112', '113/1131']);

		tree.setChildren(1131, [
			{ element: 1132 }
		]);

		assert.deepStrictEqual(getRowsTextContent(container), ['1/11', '111', '112', '113/1131/1132']);

		tree.setChildren(1131, [
			{ element: 1132 },
			{ element: 1133 },
		]);

		assert.deepStrictEqual(getRowsTextContent(container), ['1/11', '111', '112', '113/1131', '1132', '1133']);
	});

	test('enableCompression', () => {
		const container = document.createElement('div');
		container.style.width = '200px';
		container.style.height = '200px';

		const tree = ds.add(new CompressibleObjectTree<number>('test', container, new Delegate(), [new Renderer()]));
		tree.layout(200);

		tree.setChildren(null, [
			{
				element: 1, children: [{
					element: 11, children: [{
						element: 111, children: [
							{ element: 1111 },
							{ element: 1112 },
							{ element: 1113 },
						]
					}]
				}]
			}
		]);

		assert.deepStrictEqual(getRowsTextContent(container), ['1/11/111', '1111', '1112', '1113']);

		tree.updateOptions({ compressionEnabled: false });
		assert.deepStrictEqual(getRowsTextContent(container), ['1', '11', '111', '1111', '1112', '1113']);

		tree.updateOptions({ compressionEnabled: true });
		assert.deepStrictEqual(getRowsTextContent(container), ['1/11/111', '1111', '1112', '1113']);
	});
});
