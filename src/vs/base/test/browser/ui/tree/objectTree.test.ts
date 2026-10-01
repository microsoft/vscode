/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { IIdentityProvider, IListVirtualDelegate } from '../../../../browser/ui/list/list.js';
import { TreeRenderer } from '../../../../browser/ui/tree/abstractTree.js';
import { ICompressedTreeNode } from '../../../../browser/ui/tree/compressedObjectTreeModel.js';
import { CompressibleObjectTree, ICompressibleTreeRenderer, ObjectTree } from '../../../../browser/ui/tree/objectTree.js';
import { ObjectTreeModel } from '../../../../browser/ui/tree/objectTreeModel.js';
import { ITreeElement, ITreeNode, ITreeRenderer } from '../../../../browser/ui/tree/tree.js';
import { mainWindow } from '../../../../browser/window.js';
import { Emitter, Event } from '../../../../common/event.js';
import { SetMap } from '../../../../common/map.js';
import { runWithFakedTimers } from '../../../common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

function getRowsTextContent(container: HTMLElement): string[] {
	const rows = [...container.querySelectorAll('.monaco-list-row')];
	rows.sort((a, b) => parseInt(a.getAttribute('data-index')!) - parseInt(b.getAttribute('data-index')!));
	return rows.map(row => row.querySelector('.monaco-tl-contents')!.textContent!);
}

function clickElement(element: HTMLElement, ctrlKey = false): void {
	element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, ctrlKey, button: 0 }));
	element.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey, button: 0 }));
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

	test('shows a sticky section node without children', function () {
		const container = document.createElement('div');
		container.style.width = '200px';
		container.style.height = '100px';

		const tree = new ObjectTree<number>('test', container, new Delegate(), [new Renderer()], {
			enableStickyScroll: true,
			stickyScrollMaxItemCount: 1,
			stickyScrollNodeCandidateProvider: element => element === 100,
		});
		try {
			tree.layout(100);
			tree.setChildren(null, [
				{ element: 100 },
				{ element: 1 },
				{ element: 2 },
				{ element: 3 },
				{ element: 4 },
				{ element: 5 },
				{ element: 6 },
				{ element: 7 },
			]);

			const stickyText = () => container.querySelector<HTMLElement>('.monaco-tree-sticky-row')?.textContent;
			const states = [stickyText()];
			tree.scrollTop = 1;
			states.push(stickyText());

			assert.deepStrictEqual(states, [undefined, '100']);
		} finally {
			tree.dispose();
		}
	});

	test('stacks sticky sibling nodes until their parent ends', function () {
		const container = document.createElement('div');
		container.style.width = '200px';
		container.style.height = '100px';

		const tree = new ObjectTree<number>('test', container, new Delegate(), [new Renderer()], {
			enableStickyScroll: true,
			stickyScrollMaxItemCount: 2,
			stickyScrollNodeCandidateProvider: element => element >= 100,
		});
		try {
			tree.layout(100);
			tree.setChildren(null, [
				{ element: 100 },
				{ element: 1 },
				{ element: 2 },
				{ element: 200 },
				{ element: 3 },
				{ element: 4 },
				{ element: 5 },
				{ element: 6 },
				{ element: 7 },
			]);

			const stickyState = () => [...container.querySelectorAll<HTMLElement>('.monaco-tree-sticky-row')]
				.sort((first, second) => Number.parseFloat(first.style.top) - Number.parseFloat(second.style.top))
				.map(row => ({ text: row.textContent, top: row.style.top }));
			tree.scrollTop = 41;
			const beforeReplacement = stickyState();
			tree.scrollTop = 61;
			const afterReplacement = stickyState();

			assert.deepStrictEqual({
				beforeReplacement,
				afterReplacement,
			}, {
				beforeReplacement: [{ text: '100', top: '0px' }, { text: '200', top: '20px' }],
				afterReplacement: [{ text: '100', top: '0px' }, { text: '200', top: '20px' }],
			});
		} finally {
			tree.dispose();
		}
	});

	test('contains a sticky section node within its direct parent', function () {
		const container = document.createElement('div');
		container.style.width = '200px';
		container.style.height = '100px';

		const tree = new ObjectTree<number>('test', container, new Delegate(), [new Renderer()], {
			enableStickyScroll: true,
			stickyScrollMaxItemCount: 2,
			stickyScrollNodeCandidateProvider: element => element === 100,
		});
		try {
			tree.layout(100);
			tree.setChildren(null, [
				{
					element: 0,
					children: [
						{ element: 100 },
						{ element: 1 },
						{ element: 2 },
					]
				},
				{ element: 3 },
				{ element: 4 },
				{ element: 5 },
				{ element: 6 },
				{ element: 7 },
				{ element: 8 },
			]);

			const stickyTexts = () => [...container.querySelectorAll<HTMLElement>('.monaco-tree-sticky-row')].map(row => row.textContent);
			tree.scrollTop = 21;
			const insideParent = stickyTexts();
			tree.scrollTop = 80;
			const outsideParent = stickyTexts();

			assert.deepStrictEqual({
				insideParent,
				outsideParent,
			}, {
				insideParent: ['100', '0'],
				outsideParent: [],
			});
		} finally {
			tree.dispose();
		}
	});

	test('does not reevaluate sticky section candidates while scrolling', function () {
		const container = document.createElement('div');
		container.style.width = '200px';
		container.style.height = '100px';
		const providerCalls: number[] = [];

		const tree = new ObjectTree<number>('test', container, new Delegate(), [new Renderer()], {
			enableStickyScroll: true,
			stickyScrollMaxItemCount: 1,
			stickyScrollNodeCandidateProvider: element => {
				providerCalls.push(element);
				return true;
			},
		});
		try {
			tree.layout(100);
			tree.setChildren(null, [
				{ element: 0 },
				{ element: 1 },
				{ element: 2 },
				{ element: 3 },
				{ element: 4 },
				{ element: 5 },
				{ element: 6 },
			]);

			const callsAfterSetChildren = [...providerCalls];
			tree.scrollTop = 1;
			tree.scrollTop = 21;
			tree.scrollTop = 39;
			const callsAfterScroll = [...providerCalls];
			const stickyText = container.querySelector<HTMLElement>('.monaco-tree-sticky-row')?.textContent;

			assert.deepStrictEqual({
				callsAfterSetChildren,
				callsAfterScroll,
				stickyText,
			}, {
				callsAfterSetChildren: [0, 1, 2, 3, 4, 5, 6],
				callsAfterScroll: [0, 1, 2, 3, 4, 5, 6],
				stickyText: '0',
			});
		} finally {
			tree.dispose();
		}
	});

	test('removes deleted sticky section candidates', function () {
		const container = document.createElement('div');
		container.style.width = '200px';
		container.style.height = '100px';

		const tree = new ObjectTree<number>('test', container, new Delegate(), [new Renderer()], {
			enableStickyScroll: true,
			stickyScrollMaxItemCount: 1,
			stickyScrollNodeCandidateProvider: element => element === 100,
		});
		try {
			tree.layout(100);
			tree.setChildren(null, [
				{ element: 100 },
				{ element: 1 },
				{ element: 2 },
				{ element: 3 },
				{ element: 4 },
				{ element: 5 },
				{ element: 6 },
			]);
			tree.scrollTop = 1;
			const beforeDeletion = container.querySelector<HTMLElement>('.monaco-tree-sticky-row')?.textContent;

			tree.setChildren(null, [
				{ element: 1 },
				{ element: 2 },
				{ element: 3 },
				{ element: 4 },
				{ element: 5 },
				{ element: 6 },
			]);
			const afterDeletion = container.querySelector<HTMLElement>('.monaco-tree-sticky-row')?.textContent;

			assert.deepStrictEqual({ beforeDeletion, afterDeletion }, { beforeDeletion: '100', afterDeletion: undefined });
		} finally {
			tree.dispose();
		}
	});

	test('updates sticky sections after equal-height splices even without a previous sticky node', function () {
		const container = document.createElement('div');
		const tree = new ObjectTree<number>('test', container, new Delegate(), [new Renderer()], {
			enableStickyScroll: true,
			stickyScrollNodeCandidateProvider: element => element >= 100,
		});
		try {
			tree.layout(100);
			const tail = Array.from({ length: 10 }, (_, index) => ({ element: index + 1 }));
			tree.setChildren(null, [{ element: 0 }, ...tail]);
			tree.scrollTop = 81;
			const stickyText = () => container.querySelector('.monaco-tree-sticky-row')?.textContent;
			const states = [stickyText()];

			tree.setChildren(null, [{ element: 100 }, ...tail]);
			states.push(stickyText());
			tree.setChildren(null, [{ element: 100 }, { element: 1 }, { element: 200 }, ...tail.slice(2)]);
			states.push(stickyText());

			assert.deepStrictEqual(states, [undefined, '100', '200']);
		} finally {
			tree.dispose();
		}
	});

	test('retains earlier sticky siblings when a later source range is suppressed', function () {
		const container = document.createElement('div');
		const tree = new ObjectTree<number>('test', container, new Delegate(), [new Renderer()], {
			enableStickyScroll: true,
			stickyScrollNodeCandidateProvider: element => element >= 100,
			stickyScrollNodeSourceRangeProvider: (element, range) => element === 200 ? undefined : range,
		});
		try {
			tree.layout(100);
			tree.setChildren(null, [
				{ element: 100 }, { element: 1 }, { element: 200 },
				...Array.from({ length: 15 }, (_, index) => ({ element: index + 2 })),
			]);
			tree.scrollTop = 1;
			const beforeBoundary = container.querySelector('.monaco-tree-sticky-row')?.textContent;
			tree.scrollTop = 101;
			const afterBoundary = container.querySelector('.monaco-tree-sticky-row')?.textContent;

			assert.deepStrictEqual({ beforeBoundary, afterBoundary }, { beforeBoundary: '100', afterBoundary: '100' });
		} finally {
			tree.dispose();
		}
	});

	test('rerenders a sticky section when a splice retains its element and geometry', function () {
		const container = document.createElement('div');
		let label = 'before';
		const renderer = new class extends Renderer {
			override renderElement(node: ITreeNode<number, void>, index: number, templateData: HTMLElement): void {
				templateData.textContent = `${node.element}: ${label}`;
			}
		};
		const tree = new ObjectTree<number>('test', container, new Delegate(), [renderer], {
			enableStickyScroll: true,
			stickyScrollNodeCandidateProvider: element => element === 100,
		});
		try {
			tree.layout(100);
			const elements = [{ element: 100 }, ...Array.from({ length: 10 }, (_, index) => ({ element: index }))];
			tree.setChildren(null, elements);
			tree.scrollTop = 81;
			const states = [container.querySelector('.monaco-tree-sticky-row')?.textContent];
			label = 'after';
			tree.setChildren(null, elements);
			states.push(container.querySelector('.monaco-tree-sticky-row')?.textContent);

			assert.deepStrictEqual(states, ['100: before', '100: after']);
		} finally {
			tree.dispose();
		}
	});

	test('does not scan expanded sibling candidates during scroll updates', function () {
		class CountingTree extends ObjectTree<number> {
			getModel() {
				return this.model;
			}
		}

		const container = document.createElement('div');
		const tree = new CountingTree('test', container, new Delegate(), [new Renderer()], {
			enableStickyScroll: true,
			stickyScrollNodeCandidateProvider: () => true,
		});
		try {
			tree.layout(100);
			tree.setChildren(null, Array.from({ length: 100 }, (_, index) => ({
				element: index * 2,
				children: [{ element: index * 2 + 1 }],
			})));

			const spy = sinon.spy(tree.getModel(), 'getListRenderCount');
			try {
				tree.scrollTop = 2001;
				assert.ok(spy.callCount < 20, `Expected fewer than 20 render-count queries per scroll, got ${spy.callCount}`);
			} finally {
				spy.restore();
			}
		} finally {
			tree.dispose();
		}
	});

	test('preserves structural sticky traversal with a candidate provider that selects nothing', function () {
		const results: { constraintInput: number[]; rows: (string | null)[] }[][] = [];
		for (const custom of [false, true]) {
			const container = document.createElement('div');
			let constraintInput: number[] = [];
			const tree = new ObjectTree<number>('test', container, new Delegate(), [new Renderer()], {
				enableStickyScroll: true,
				stickyScrollMaxItemCount: 1,
				stickyScrollNodeCandidateProvider: custom ? () => false : undefined,
				stickyScrollDelegate: {
					constrainStickyScrollNodes: nodes => {
						constraintInput = nodes.map(node => node.node.element);
						return nodes.slice(0, 1);
					},
				},
			});
			try {
				tree.layout(100);
				let children: ITreeElement<number>[] = [{ element: 13 }];
				for (let element = 12; element >= 1; element--) {
					children = [{ element, children }];
				}
				tree.setChildren(null, children);
				const states: typeof results[number] = [];
				for (const scrollTop of [1, 21, 81, 161]) {
					constraintInput = [];
					tree.scrollTop = scrollTop;
					states.push({
						constraintInput,
						rows: [...container.querySelectorAll('.monaco-tree-sticky-row')].map(row => row.textContent),
					});
				}
				results.push(states);
			} finally {
				tree.dispose();
			}
		}

		assert.deepStrictEqual({
			firstConstraintInput: results[0][0].constraintInput,
			custom: results[1],
		}, {
			firstConstraintInput: [1, 2],
			custom: results[0],
		});
	});

	test('preserves sticky header DOM and button focus during unrelated equal-height splices', function () {
		const container = document.createElement('div');
		mainWindow.document.body.appendChild(container);
		const renderer = new class extends Renderer {
			override renderElement(node: ITreeNode<number, void>, index: number, templateData: HTMLElement): void {
				super.renderElement(node, index, templateData);
				const button = document.createElement('button');
				button.textContent = 'Action';
				templateData.appendChild(button);
			}
		};
		const tree = new ObjectTree<number>('test', container, new Delegate(), [renderer], {
			enableStickyScroll: true,
			stickyScrollNodeCandidateProvider: element => element === 100,
		});
		try {
			tree.layout(100);
			tree.setChildren(null, [
				{ element: 100 },
				...Array.from({ length: 12 }, (_, index) => ({ element: index })),
				{ element: 200, children: [{ element: 201 }] },
			]);
			tree.scrollTop = 81;
			const header = container.querySelector('.monaco-tree-sticky-row')!;
			const button = header.querySelector('button')!;
			button.focus();
			const focusedBefore = mainWindow.document.activeElement === button;

			tree.setChildren(200, [{ element: 202 }]);

			assert.deepStrictEqual({
				focusedBefore,
				sameHeader: container.querySelector('.monaco-tree-sticky-row') === header,
				sameButton: container.querySelector('.monaco-tree-sticky-row button') === button,
				focusedAfter: mainWindow.document.activeElement === button,
			}, { focusedBefore: true, sameHeader: true, sameButton: true, focusedAfter: true });
		} finally {
			tree.dispose();
			container.remove();
		}
	});

	test('preserves reveal offsets without applicable sticky siblings', function () {
		const scrollPositions: number[] = [];
		for (const custom of [false, true]) {
			const container = document.createElement('div');
			const delegate = new class implements IListVirtualDelegate<number> {
				getHeight(element: number): number {
					return element === 2 ? 40 : 20;
				}
				getTemplateId(): string { return 'default'; }
			};
			const tree = new ObjectTree<number>('test', container, delegate, [new Renderer()], {
				enableStickyScroll: true,
				stickyScrollMaxItemCount: 1,
				stickyScrollNodeCandidateProvider: custom ? () => false : undefined,
			});
			try {
				tree.layout(200);
				tree.setChildren(null, [{
					element: 1, children: [{
						element: 2,
						children: Array.from({ length: 30 }, (_, index) => ({ element: index + 3 })),
					}]
				}]);
				tree.scrollTop = 400;
				tree.reveal(10, 0);
				scrollPositions.push(tree.scrollTop);
			} finally {
				tree.dispose();
			}
		}
		assert.deepStrictEqual(scrollPositions, [160, 160]);
	});

	test('bounds sticky sibling lookup by the item limit rather than the number of preceding candidates', function () {
		const container = document.createElement('div');
		let rangeCalls = 0;
		const tree = new ObjectTree<number>('test', container, new Delegate(), [new Renderer()], {
			enableStickyScroll: true,
			stickyScrollMaxItemCount: 3,
			stickyScrollNodeCandidateProvider: () => true,
			stickyScrollNodeSourceRangeProvider: (element, range) => {
				rangeCalls++;
				return range;
			},
		});
		try {
			tree.layout(200);
			tree.setChildren(null, Array.from({ length: 1000 }, (_, element) => ({ element })));
			rangeCalls = 0;
			tree.scrollTop = 15001;
			assert.deepStrictEqual({
				rangeCalls,
				rows: [...container.querySelectorAll<HTMLElement>('.monaco-tree-sticky-row')]
					.sort((first, second) => Number.parseFloat(first.style.top) - Number.parseFloat(second.style.top))
					.map(row => row.textContent),
			}, { rangeCalls: 4, rows: ['0', '1', '2'] });
		} finally {
			tree.dispose();
		}
	});

	test('updates candidate eligibility when an expanded parent is collapsed and expanded', function () {
		const container = document.createElement('div');
		const tree = new ObjectTree<number>('test', container, new Delegate(), [new Renderer()], {
			enableStickyScroll: true,
			stickyScrollNodeCandidateProvider: element => element === 100,
		});
		try {
			tree.layout(100);
			tree.setChildren(null, [
				{ element: 100, children: [{ element: 1 }, { element: 2 }] },
				...Array.from({ length: 10 }, (_, index) => ({ element: index + 3 })),
			]);
			tree.scrollTop = 81;
			const stickyText = () => container.querySelector('.monaco-tree-sticky-row')?.textContent;
			const states = [stickyText()];
			tree.collapse(100);
			states.push(stickyText());
			tree.expand(100);
			states.push(stickyText());

			assert.deepStrictEqual(states, [undefined, '100', undefined]);
		} finally {
			tree.dispose();
		}
	});

	test('skips cached suppressed siblings during scrolling and reveal and refreshes suppression explicitly', function () {
		const container = document.createElement('div');
		let enabledElement = 750;
		let rangeCalls = 0;
		const tree = new ObjectTree<number>('test', container, new Delegate(), [new Renderer()], {
			enableStickyScroll: true,
			stickyScrollMaxItemCount: 3,
			stickyScrollNodeCandidateProvider: () => true,
			stickyScrollNodeSourceRangeProvider: (element, range) => {
				rangeCalls++;
				return element === enabledElement ? range : undefined;
			},
		});
		try {
			tree.layout(200);
			tree.setChildren(null, Array.from({ length: 1000 }, (_, element) => ({ element })));
			rangeCalls = 0;
			tree.scrollTop = 15001;
			const scrollCalls = rangeCalls;
			const states = [container.querySelector('.monaco-tree-sticky-row')?.textContent];
			rangeCalls = 0;
			tree.reveal(760, 0);
			const revealCalls = rangeCalls;
			enabledElement = 751;
			tree.refreshStickyScroll();
			states.push(container.querySelector('.monaco-tree-sticky-row')?.textContent);

			assert.deepStrictEqual({ scrollCalls, revealCalls, states }, {
				scrollCalls: 1,
				revealCalls: 2,
				states: ['750', '751'],
			});
		} finally {
			tree.dispose();
		}
	});

	test('reserves only the constrained sibling stack height when revealing a row', function () {
		const results: { scrollTop: number; rows: (string | null)[] }[] = [];
		for (const height of [50, 90]) {
			const container = document.createElement('div');
			const delegate: IListVirtualDelegate<number> = {
				getHeight: element => element < 2 ? height : 20,
				getTemplateId: () => 'default',
			};
			const tree = new ObjectTree<number>('test', container, delegate, [new Renderer()], {
				enableStickyScroll: true,
				stickyScrollMaxItemCount: 7,
				stickyScrollNodeCandidateProvider: element => element < 2,
			});
			try {
				tree.layout(200);
				tree.setChildren(null, Array.from({ length: 30 }, (_, element) => ({ element })));
				tree.scrollTop = 400;
				tree.reveal(10, 0);
				results.push({
					scrollTop: tree.scrollTop,
					rows: [...container.querySelectorAll('.monaco-tree-sticky-row')].map(row => row.textContent),
				});
			} finally {
				tree.dispose();
			}
		}
		assert.deepStrictEqual(results, [
			{ scrollTop: 210, rows: ['0'] },
			{ scrollTop: 340, rows: [] },
		]);
	});

	test('reveals a sticky sibling below its preceding sticky header', function () {
		const container = document.createElement('div');
		const tree = new ObjectTree<number>('test', container, new Delegate(), [new Renderer()], {
			enableStickyScroll: true,
			stickyScrollNodeCandidateProvider: element => element >= 100,
		});
		try {
			tree.layout(100);
			tree.setChildren(null, [
				{ element: 100 }, { element: 1 }, { element: 200 },
				...Array.from({ length: 15 }, (_, index) => ({ element: index + 2 })),
			]);
			tree.scrollTop = 200;
			tree.reveal(200, 0);
			assert.strictEqual(tree.scrollTop, 20);
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

	test('updateOptions preserves wrapped accessibility provider for type navigation re-announce', async function () {
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
			await runWithFakedTimers({ useFakeTimers: true }, async () => {
				tree.layout(200);
				tree.setChildren(null, [{ element: 0 }]);
				tree.setFocus([0]);
				tree.domFocus();

				tree.updateOptions({ indent: 12 });

				dispatchKeydown(tree.getHTMLElement(), 'a', 'KeyA', 65);
				await Promise.resolve();
			});
		} finally {
			tree.dispose();
		}
	});
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

	test('does not compress sibling sticky sections into an ancestor path', function () {
		const container = document.createElement('div');
		const tree = ds.add(new CompressibleObjectTree<number>('test', container, new Delegate(), [new Renderer()], {
			enableStickyScroll: true,
			stickyScrollMaxItemCount: 1,
			stickyScrollNodeCandidateProvider: element => element === 100,
		}));
		tree.layout(100);
		tree.setChildren(null, [
			{ element: 100 },
			{ element: 200, children: Array.from({ length: 10 }, (_, index) => ({ element: index + 1 })) },
		]);
		tree.scrollTop = 41;

		assert.deepStrictEqual([...container.querySelectorAll('.monaco-tree-sticky-row')].map(row => row.textContent), ['100']);
	});

	test('preserves compressed sticky rendering after constrained reveal and rerender', function () {
		const container = document.createElement('div');
		const tree = ds.add(new CompressibleObjectTree<number>('test', container, new Delegate(), [new Renderer()], {
			enableStickyScroll: true,
			stickyScrollMaxItemCount: 2,
			stickyScrollNodeCandidateProvider: element => element === 100,
		}));
		tree.layout(200);
		tree.setChildren(null, [
			{ element: 100 },
			{
				element: 1, children: [
					{ element: 90 },
					{ element: 2, children: Array.from({ length: 20 }, (_, index) => ({ element: index + 3 })) },
				]
			},
		]);
		tree.scrollTop = 181;
		const rows = () => [...container.querySelectorAll<HTMLElement>('.monaco-tree-sticky-row')]
			.sort((first, second) => Number.parseFloat(first.style.top) - Number.parseFloat(second.style.top))
			.map(row => row.textContent);
		const states = [rows()];
		tree.reveal(10, 0);
		states.push(rows());
		tree.reveal(10, 0);
		tree.rerenderStickyScroll();
		states.push(rows());

		assert.deepStrictEqual({ scrollTop: tree.scrollTop, states }, {
			scrollTop: 180,
			states: [['100', '1/2'], ['100', '1/2'], ['100', '1/2']],
		});
	});

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
