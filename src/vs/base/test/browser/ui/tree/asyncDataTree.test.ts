/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable no-restricted-syntax */

import assert from 'assert';
import { IIdentityProvider, IListVirtualDelegate } from '../../../../browser/ui/list/list.js';
import { AsyncDataTree, CompressibleAsyncDataTree, ITreeCompressionDelegate } from '../../../../browser/ui/tree/asyncDataTree.js';
import { ICompressedTreeNode } from '../../../../browser/ui/tree/compressedObjectTreeModel.js';
import { ICompressibleTreeRenderer } from '../../../../browser/ui/tree/objectTree.js';
import { IAsyncDataSource, ITreeNode } from '../../../../browser/ui/tree/tree.js';
import { timeout } from '../../../../common/async.js';
import { Iterable } from '../../../../common/iterator.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';
import { runWithFakedTimers } from '../../../common/timeTravelScheduler.js';

interface Element {
	id: string;
	suffix?: string;
	children?: Element[];
}

function find(element: Element, id: string): Element | undefined {
	if (element.id === id) {
		return element;
	}

	if (!element.children) {
		return undefined;
	}

	for (const child of element.children) {
		const result = find(child, id);

		if (result) {
			return result;
		}
	}

	return undefined;
}

class Renderer implements ICompressibleTreeRenderer<Element, void, HTMLElement> {
	readonly templateId = 'default';
	renderTemplate(container: HTMLElement): HTMLElement {
		return container;
	}
	renderElement(element: ITreeNode<Element, void>, index: number, templateData: HTMLElement): void {
		templateData.textContent = element.element.id + (element.element.suffix || '');
	}
	disposeTemplate(templateData: HTMLElement): void {
		// noop
	}
	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<Element>, void>, index: number, templateData: HTMLElement): void {
		const result: string[] = [];

		for (const element of node.element.elements) {
			result.push(element.id + (element.suffix || ''));
		}

		templateData.textContent = result.join('/');
	}
}

class IdentityProvider implements IIdentityProvider<Element> {
	getId(element: Element) {
		return element.id;
	}
}

class VirtualDelegate implements IListVirtualDelegate<Element> {
	getHeight() { return 20; }
	getTemplateId(element: Element): string { return 'default'; }
}

class DataSource implements IAsyncDataSource<Element, Element> {
	hasChildren(element: Element): boolean {
		return !!element.children && element.children.length > 0;
	}
	getChildren(element: Element): Promise<Element[]> {
		return Promise.resolve(element.children || []);
	}
}

class Model {

	constructor(readonly root: Element) { }

	get(id: string): Element {
		const result = find(this.root, id);

		if (!result) {
			throw new Error('element not found');
		}

		return result;
	}
}

suite('AsyncDataTree', function () {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('Collapse state should be preserved across refresh calls', async () => {
		const container = document.createElement('div');

		const model = new Model({
			id: 'root',
			children: [{
				id: 'a'
			}]
		});

		const tree = store.add(new AsyncDataTree<Element, Element>('test', container, new VirtualDelegate(), [new Renderer()], new DataSource(), { identityProvider: new IdentityProvider() }));
		tree.layout(200);
		assert.strictEqual(container.querySelectorAll('.monaco-list-row').length, 0);

		await tree.setInput(model.root);
		assert.strictEqual(container.querySelectorAll('.monaco-list-row').length, 1);
		const twistie = container.querySelector('.monaco-list-row:first-child .monaco-tl-twistie') as HTMLElement;
		assert(!twistie.classList.contains('collapsible'));
		assert(!twistie.classList.contains('collapsed'));

		model.get('a').children = [
			{ id: 'aa' },
			{ id: 'ab' },
			{ id: 'ac' }
		];

		await tree.updateChildren(model.root);
		assert.strictEqual(container.querySelectorAll('.monaco-list-row').length, 1);

		await tree.expand(model.get('a'));
		assert.strictEqual(container.querySelectorAll('.monaco-list-row').length, 4);

		model.get('a').children = [];
		await tree.updateChildren(model.root);
		assert.strictEqual(container.querySelectorAll('.monaco-list-row').length, 1);
	});

	test('issue #68648', async () => {
		const container = document.createElement('div');

		const getChildrenCalls: string[] = [];
		const dataSource = new class implements IAsyncDataSource<Element, Element> {
			hasChildren(element: Element): boolean {
				return !!element.children && element.children.length > 0;
			}
			getChildren(element: Element): Promise<Element[]> {
				getChildrenCalls.push(element.id);
				return Promise.resolve(element.children || []);
			}
		};

		const model = new Model({
			id: 'root',
			children: [{
				id: 'a'
			}]
		});

		const tree = store.add(new AsyncDataTree<Element, Element>('test', container, new VirtualDelegate(), [new Renderer()], dataSource, { identityProvider: new IdentityProvider() }));
		tree.layout(200);

		await tree.setInput(model.root);
		assert.deepStrictEqual(getChildrenCalls, ['root']);

		let twistie = container.querySelector('.monaco-list-row:first-child .monaco-tl-twistie') as HTMLElement;
		assert(!twistie.classList.contains('collapsible'));
		assert(!twistie.classList.contains('collapsed'));
		assert(tree.getNode().children[0].collapsed);

		model.get('a').children = [{ id: 'aa' }, { id: 'ab' }, { id: 'ac' }];
		await tree.updateChildren(model.root);

		assert.deepStrictEqual(getChildrenCalls, ['root', 'root']);
		twistie = container.querySelector('.monaco-list-row:first-child .monaco-tl-twistie') as HTMLElement;
		assert(twistie.classList.contains('collapsible'));
		assert(twistie.classList.contains('collapsed'));
		assert(tree.getNode().children[0].collapsed);

		model.get('a').children = [];
		await tree.updateChildren(model.root);

		assert.deepStrictEqual(getChildrenCalls, ['root', 'root', 'root']);
		twistie = container.querySelector('.monaco-list-row:first-child .monaco-tl-twistie') as HTMLElement;
		assert(!twistie.classList.contains('collapsible'));
		assert(!twistie.classList.contains('collapsed'));
		assert(tree.getNode().children[0].collapsed);

		model.get('a').children = [{ id: 'aa' }, { id: 'ab' }, { id: 'ac' }];
		await tree.updateChildren(model.root);

		assert.deepStrictEqual(getChildrenCalls, ['root', 'root', 'root', 'root']);
		twistie = container.querySelector('.monaco-list-row:first-child .monaco-tl-twistie') as HTMLElement;
		assert(twistie.classList.contains('collapsible'));
		assert(twistie.classList.contains('collapsed'));
		assert(tree.getNode().children[0].collapsed);
	});

	test('issue #67722 - once resolved, refreshed collapsed nodes should only get children when expanded', async () => {
		const container = document.createElement('div');

		const getChildrenCalls: string[] = [];
		const dataSource = new class implements IAsyncDataSource<Element, Element> {
			hasChildren(element: Element): boolean {
				return !!element.children && element.children.length > 0;
			}
			getChildren(element: Element): Promise<Element[]> {
				getChildrenCalls.push(element.id);
				return Promise.resolve(element.children || []);
			}
		};

		const model = new Model({
			id: 'root',
			children: [{
				id: 'a', children: [{ id: 'aa' }, { id: 'ab' }, { id: 'ac' }]
			}]
		});

		const tree = store.add(new AsyncDataTree<Element, Element>('test', container, new VirtualDelegate(), [new Renderer()], dataSource, { identityProvider: new IdentityProvider() }));
		tree.layout(200);

		await tree.setInput(model.root);
		assert(tree.getNode(model.get('a')).collapsed);
		assert.deepStrictEqual(getChildrenCalls, ['root']);

		await tree.expand(model.get('a'));
		assert(!tree.getNode(model.get('a')).collapsed);
		assert.deepStrictEqual(getChildrenCalls, ['root', 'a']);

		tree.collapse(model.get('a'));
		assert(tree.getNode(model.get('a')).collapsed);
		assert.deepStrictEqual(getChildrenCalls, ['root', 'a']);

		await tree.updateChildren();
		assert(tree.getNode(model.get('a')).collapsed);
		assert.deepStrictEqual(getChildrenCalls, ['root', 'a', 'root'], 'a should not be refreshed, since it\' collapsed');
	});

	test('resolved collapsed nodes which lose children should lose twistie as well', async () => {
		const container = document.createElement('div');

		const model = new Model({
			id: 'root',
			children: [{
				id: 'a', children: [{ id: 'aa' }, { id: 'ab' }, { id: 'ac' }]
			}]
		});

		const tree = store.add(new AsyncDataTree<Element, Element>('test', container, new VirtualDelegate(), [new Renderer()], new DataSource(), { identityProvider: new IdentityProvider() }));
		tree.layout(200);

		await tree.setInput(model.root);
		await tree.expand(model.get('a'));

		let twistie = container.querySelector('.monaco-list-row:first-child .monaco-tl-twistie') as HTMLElement;
		assert(twistie.classList.contains('collapsible'));
		assert(!twistie.classList.contains('collapsed'));
		assert(!tree.getNode(model.get('a')).collapsed);

		tree.collapse(model.get('a'));
		model.get('a').children = [];
		await tree.updateChildren(model.root);

		twistie = container.querySelector('.monaco-list-row:first-child .monaco-tl-twistie') as HTMLElement;
		assert(!twistie.classList.contains('collapsible'));
		assert(!twistie.classList.contains('collapsed'));
		assert(tree.getNode(model.get('a')).collapsed);
	});

	test('issue #192422 - resolved collapsed nodes with changed children don\'t show old children', async () => {
		const container = document.createElement('div');
		let hasGottenAChildren = false;
		const dataSource = new class implements IAsyncDataSource<Element, Element> {
			hasChildren(element: Element): boolean {
				return !!element.children && element.children.length > 0;
			}
			async getChildren(element: Element): Promise<Element[]> {
				if (element.id === 'a') {
					if (!hasGottenAChildren) {
						hasGottenAChildren = true;
					} else {
						return [{ id: 'c' }];
					}
				}
				return element.children || [];
			}
		};

		const model = new Model({
			id: 'root',
			children: [{
				id: 'a', children: [{ id: 'b' }]
			}]
		});

		const tree = store.add(new AsyncDataTree<Element, Element>('test', container, new VirtualDelegate(), [new Renderer()], dataSource, { identityProvider: new IdentityProvider() }));
		tree.layout(200);

		await tree.setInput(model.root);
		const a = model.get('a');
		const aNode = tree.getNode(a);
		assert(aNode.collapsed);
		await tree.expand(a);
		assert(!aNode.collapsed);
		assert.equal(aNode.children.length, 1);
		assert.equal(aNode.children[0].element.id, 'b');
		const bChild = container.querySelector('.monaco-list-row:nth-child(2)');
		assert.equal(bChild?.textContent, 'b');
		tree.collapse(a);
		assert(aNode.collapsed);

		await tree.updateChildren(a);
		const aUpdated1 = model.get('a');
		const aNodeUpdated1 = tree.getNode(a);
		assert(aNodeUpdated1.collapsed);
		assert.equal(aNodeUpdated1.children.length, 0);
		let didCheckNoChildren = false;
		const event = tree.onDidChangeCollapseState(e => {
			const child = container.querySelector('.monaco-list-row:nth-child(2)');
			assert.equal(child, null);
			didCheckNoChildren = true;
		});
		await tree.expand(aUpdated1);
		event.dispose();
		assert(didCheckNoChildren);

		const aNodeUpdated2 = tree.getNode(a);
		assert(!aNodeUpdated2.collapsed);
		assert.equal(aNodeUpdated2.children.length, 1);
		assert.equal(aNodeUpdated2.children[0].element.id, 'c');
		const child = container.querySelector('.monaco-list-row:nth-child(2)');
		assert.equal(child?.textContent, 'c');
	});

	test('issue #192422 - resolved collapsed nodes with unchanged children immediately show children', async () => {
		const container = document.createElement('div');
		const dataSource = new class implements IAsyncDataSource<Element, Element> {
			hasChildren(element: Element): boolean {
				return !!element.children && element.children.length > 0;
			}
			async getChildren(element: Element): Promise<Element[]> {
				return element.children || [];
			}
		};

		const model = new Model({
			id: 'root',
			children: [{
				id: 'a', children: [{ id: 'b' }]
			}]
		});

		const tree = store.add(new AsyncDataTree<Element, Element>('test', container, new VirtualDelegate(), [new Renderer()], dataSource, { identityProvider: new IdentityProvider() }));
		tree.layout(200);

		await tree.setInput(model.root);
		const a = model.get('a');
		const aNode = tree.getNode(a);
		assert(aNode.collapsed);
		await tree.expand(a);
		assert(!aNode.collapsed);
		assert.equal(aNode.children.length, 1);
		assert.equal(aNode.children[0].element.id, 'b');
		const bChild = container.querySelector('.monaco-list-row:nth-child(2)');
		assert.equal(bChild?.textContent, 'b');
		tree.collapse(a);
		assert(aNode.collapsed);

		const aUpdated1 = model.get('a');
		const aNodeUpdated1 = tree.getNode(a);
		assert(aNodeUpdated1.collapsed);
		assert.equal(aNodeUpdated1.children.length, 1);
		let didCheckSameChildren = false;
		const event = tree.onDidChangeCollapseState(e => {
			const child = container.querySelector('.monaco-list-row:nth-child(2)');
			assert.equal(child?.textContent, 'b');
			didCheckSameChildren = true;
		});
		await tree.expand(aUpdated1);
		event.dispose();
		assert(didCheckSameChildren);

		const aNodeUpdated2 = tree.getNode(a);
		assert(!aNodeUpdated2.collapsed);
		assert.equal(aNodeUpdated2.children.length, 1);
		assert.equal(aNodeUpdated2.children[0].element.id, 'b');
		const child = container.querySelector('.monaco-list-row:nth-child(2)');
		assert.equal(child?.textContent, 'b');
	});

	test('support default collapse state per element', async () => {
		const container = document.createElement('div');

		const getChildrenCalls: string[] = [];
		const dataSource = new class implements IAsyncDataSource<Element, Element> {
			hasChildren(element: Element): boolean {
				return !!element.children && element.children.length > 0;
			}
			getChildren(element: Element): Promise<Element[]> {
				getChildrenCalls.push(element.id);
				return Promise.resolve(element.children || []);
			}
		};

		const model = new Model({
			id: 'root',
			children: [{
				id: 'a', children: [{ id: 'aa' }, { id: 'ab' }, { id: 'ac' }]
			}]
		});

		const tree = store.add(new AsyncDataTree<Element, Element>('test', container, new VirtualDelegate(), [new Renderer()], dataSource, {
			collapseByDefault: el => el.id !== 'a'
		}));
		tree.layout(200);

		await tree.setInput(model.root);
		assert(!tree.getNode(model.get('a')).collapsed);
		assert.deepStrictEqual(getChildrenCalls, ['root', 'a']);
	});

	test('issue #80098 - concurrent refresh and expand', async () => {
		const container = document.createElement('div');

		const calls: Function[] = [];
		const dataSource = new class implements IAsyncDataSource<Element, Element> {
			hasChildren(element: Element): boolean {
				return !!element.children && element.children.length > 0;
			}
			getChildren(element: Element): Promise<Element[]> {
				return new Promise(c => calls.push(() => c(element.children || [])));
			}
		};

		const model = new Model({
			id: 'root',
			children: [{
				id: 'a', children: [{
					id: 'aa'
				}]
			}]
		});

		const tree = store.add(new AsyncDataTree<Element, Element>('test', container, new VirtualDelegate(), [new Renderer()], dataSource, { identityProvider: new IdentityProvider() }));
		tree.layout(200);

		const pSetInput = tree.setInput(model.root);
		calls.pop()!(); // resolve getChildren(root)
		await pSetInput;

		const pUpdateChildrenA = tree.updateChildren(model.get('a'));
		const pExpandA = tree.expand(model.get('a'));
		assert.strictEqual(calls.length, 1, 'expand(a) still hasn\'t called getChildren(a)');

		calls.pop()!();
		assert.strictEqual(calls.length, 0, 'no pending getChildren calls');

		await pUpdateChildrenA;
		assert.strictEqual(calls.length, 0, 'expand(a) should not have forced a second refresh');

		const result = await pExpandA;
		assert.strictEqual(result, true, 'expand(a) should be done');
	});

	test('issue #80098 - first expand should call getChildren', async () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			const container = document.createElement('div');

			const calls: Function[] = [];
			const dataSource = new class implements IAsyncDataSource<Element, Element> {
				hasChildren(element: Element): boolean {
					return !!element.children && element.children.length > 0;
				}
				getChildren(element: Element): Promise<Element[]> {
					return new Promise(c => calls.push(() => c(element.children || [])));
				}
			};

			const model = new Model({
				id: 'root',
				children: [{
					id: 'a', children: [{
						id: 'aa'
					}]
				}]
			});

			const tree = store.add(new AsyncDataTree<Element, Element>('test', container, new VirtualDelegate(), [new Renderer()], dataSource, { identityProvider: new IdentityProvider() }));
			tree.layout(200);

			const pSetInput = tree.setInput(model.root);
			calls.pop()!(); // resolve getChildren(root)
			await pSetInput;

			const pExpandA = tree.expand(model.get('a'));
			assert.strictEqual(calls.length, 1, 'expand(a) should\'ve called getChildren(a)');

			let race = await Promise.race([pExpandA.then(() => 'expand'), timeout(1).then(() => 'timeout')]);
			assert.strictEqual(race, 'timeout', 'expand(a) should not be yet done');

			calls.pop()!();
			assert.strictEqual(calls.length, 0, 'no pending getChildren calls');

			race = await Promise.race([pExpandA.then(() => 'expand'), timeout(1).then(() => 'timeout')]);
			assert.strictEqual(race, 'expand', 'expand(a) should now be done');
		});
	});

	test('issue #78388 - tree should react to hasChildren toggles', async () => {
		const container = document.createElement('div');
		const model = new Model({
			id: 'root',
			children: [{
				id: 'a'
			}]
		});

		const tree = store.add(new AsyncDataTree<Element, Element>('test', container, new VirtualDelegate(), [new Renderer()], new DataSource(), { identityProvider: new IdentityProvider() }));
		tree.layout(200);

		await tree.setInput(model.root);
		assert.strictEqual(container.querySelectorAll('.monaco-list-row').length, 1);

		let twistie = container.querySelector('.monaco-list-row:first-child .monaco-tl-twistie') as HTMLElement;
		assert(!twistie.classList.contains('collapsible'));
		assert(!twistie.classList.contains('collapsed'));

		model.get('a').children = [{ id: 'aa' }];
		await tree.updateChildren(model.get('a'), false);
		assert.strictEqual(container.querySelectorAll('.monaco-list-row').length, 1);
		twistie = container.querySelector('.monaco-list-row:first-child .monaco-tl-twistie') as HTMLElement;
		assert(twistie.classList.contains('collapsible'));
		assert(twistie.classList.contains('collapsed'));

		model.get('a').children = [];
		await tree.updateChildren(model.get('a'), false);
		assert.strictEqual(container.querySelectorAll('.monaco-list-row').length, 1);
		twistie = container.querySelector('.monaco-list-row:first-child .monaco-tl-twistie') as HTMLElement;
		assert(!twistie.classList.contains('collapsible'));
		assert(!twistie.classList.contains('collapsed'));
	});

	test('issues #84569, #82629 - rerender', async () => {
		const container = document.createElement('div');
		const model = new Model({
			id: 'root',
			children: [{
				id: 'a',
				children: [{
					id: 'b',
					suffix: '1'
				}]
			}]
		});

		const tree = store.add(new AsyncDataTree<Element, Element>('test', container, new VirtualDelegate(), [new Renderer()], new DataSource(), { identityProvider: new IdentityProvider() }));
		tree.layout(200);

		await tree.setInput(model.root);
		await tree.expand(model.get('a'));
		assert.deepStrictEqual(Array.from(container.querySelectorAll('.monaco-list-row')).map(e => e.textContent), ['a', 'b1']);

		const a = model.get('a');
		const b = model.get('b');
		a.children?.splice(0, 1, { id: 'b', suffix: '2' });

		await Promise.all([
			tree.updateChildren(a, true, true),
			tree.updateChildren(b, true, true)
		]);

		assert.deepStrictEqual(Array.from(container.querySelectorAll('.monaco-list-row')).map(e => e.textContent), ['a', 'b2']);
	});

	test('issue #199264 - dispose during render', async () => {
		const container = document.createElement('div');
		const model1 = new Model({
			id: 'root',
			children: [{
				id: 'a', children: [{ id: 'aa' }, { id: 'ab' }, { id: 'ac' }]
			}]
		});
		const model2 = new Model({
			id: 'root',
			children: [{
				id: 'a', children: [{ id: 'aa' }, { id: 'ab' }, { id: 'ac' }]
			}]
		});

		const tree = store.add(new AsyncDataTree<Element, Element>('test', container, new VirtualDelegate(), [new Renderer()], new DataSource(), { identityProvider: new IdentityProvider() }));
		tree.layout(200);

		await tree.setInput(model1.root);
		const input = tree.setInput(model2.root);
		tree.dispose();
		await input;
		assert.strictEqual(container.innerHTML, '');
	});

	test('issue #121567', async () => {
		const container = document.createElement('div');

		const calls: Element[] = [];
		const dataSource = new class implements IAsyncDataSource<Element, Element> {
			hasChildren(element: Element): boolean {
				return !!element.children && element.children.length > 0;
			}
			async getChildren(element: Element) {
				calls.push(element);
				return element.children ?? Iterable.empty();
			}
		};

		const model = new Model({
			id: 'root',
			children: [{
				id: 'a', children: [{
					id: 'aa'
				}]
			}]
		});
		const a = model.get('a');

		const tree = store.add(new AsyncDataTree<Element, Element>('test', container, new VirtualDelegate(), [new Renderer()], dataSource, { identityProvider: new IdentityProvider() }));
		tree.layout(200);

		await tree.setInput(model.root);
		assert.strictEqual(calls.length, 1, 'There should be a single getChildren call for the root');
		assert(tree.isCollapsible(a), 'a is collapsible');
		assert(tree.isCollapsed(a), 'a is collapsed');

		await tree.updateChildren(a, false);
		assert.strictEqual(calls.length, 1, 'There should be no changes to the calls list, since a was collapsed');
		assert(tree.isCollapsible(a), 'a is collapsible');
		assert(tree.isCollapsed(a), 'a is collapsed');

		const children = a.children;
		a.children = [];
		await tree.updateChildren(a, false);
		assert.strictEqual(calls.length, 1, 'There should still be no changes to the calls list, since a was collapsed');
		assert(!tree.isCollapsible(a), 'a is no longer collapsible');
		assert(tree.isCollapsed(a), 'a is collapsed');

		a.children = children;
		await tree.updateChildren(a, false);
		assert.strictEqual(calls.length, 1, 'There should still be no changes to the calls list, since a was collapsed');
		assert(tree.isCollapsible(a), 'a is collapsible again');
		assert(tree.isCollapsed(a), 'a is collapsed');

		await tree.expand(a);
		assert.strictEqual(calls.length, 2, 'Finally, there should be a getChildren call for a');
		assert(tree.isCollapsible(a), 'a is still collapsible');
		assert(!tree.isCollapsed(a), 'a is expanded');
	});

	test('issue #199441', async () => {
		const container = document.createElement('div');

		const dataSource = new class implements IAsyncDataSource<Element, Element> {
			hasChildren(element: Element): boolean {
				return !!element.children && element.children.length > 0;
			}
			async getChildren(element: Element) {
				return element.children ?? Iterable.empty();
			}
		};

		const compressionDelegate = new class implements ITreeCompressionDelegate<Element> {
			isIncompressible(element: Element): boolean {
				return !dataSource.hasChildren(element);
			}
		};

		const model = new Model({
			id: 'root',
			children: [{
				id: 'a', children: [{
					id: 'b',
					children: [{ id: 'b.txt' }]
				}]
			}]
		});

		const collapseByDefault = (element: Element) => false;

		const tree = store.add(new CompressibleAsyncDataTree<Element, Element>('test', container, new VirtualDelegate(), compressionDelegate, [new Renderer()], dataSource, { identityProvider: new IdentityProvider(), collapseByDefault }));
		tree.layout(200);

		await tree.setInput(model.root);
		assert.deepStrictEqual(Array.from(container.querySelectorAll('.monaco-list-row')).map(e => e.textContent), ['a/b', 'b.txt']);

		model.get('a').children!.push({
			id: 'c',
			children: [{ id: 'c.txt' }]
		});

		await tree.updateChildren(model.root, true);
		assert.deepStrictEqual(Array.from(container.querySelectorAll('.monaco-list-row')).map(e => e.textContent), ['a', 'b', 'b.txt', 'c', 'c.txt']);
	});

	test('Tree Navigation: AsyncDataTree', async () => {
		const container = document.createElement('div');

		const model = new Model({
			id: 'root',
			children: [{
				id: 'a', children: [{
					id: 'aa', children: [{ id: 'aa.txt' }]
				}, {
					id: 'ab', children: [{ id: 'ab.txt' }]
				}]
			}, {
				id: 'b', children: [{
					id: 'ba', children: [{ id: 'ba.txt' }]
				}, {
					id: 'bb', children: [{ id: 'bb.txt' }]
				}]
			}, {
				id: 'c', children: [{
					id: 'ca', children: [{ id: 'ca.txt' }]
				}, {
					id: 'cb', children: [{ id: 'cb.txt' }]
				}]
			}]
		});

		const tree = store.add(new AsyncDataTree<Element, Element>('test', container, new VirtualDelegate(), [new Renderer()], new DataSource(), { identityProvider: new IdentityProvider() }));
		tree.layout(200);

		await tree.setInput(model.root);
		assert.deepStrictEqual(Array.from(container.querySelectorAll('.monaco-list-row')).map(e => e.textContent), ['a', 'b', 'c']);

		assert.strictEqual(tree.navigate().current(), null);
		assert.strictEqual(tree.navigate().first()?.id, 'a');
		assert.strictEqual(tree.navigate().last()?.id, 'c');

		assert.strictEqual(tree.navigate(model.get('b')).previous()?.id, 'a');
		assert.strictEqual(tree.navigate(model.get('b')).next()?.id, 'c');

		await tree.expand(model.get('a'));
		await tree.expand(model.get('aa'));
		await tree.expand(model.get('ab'));

		await tree.expand(model.get('b'));
		await tree.expand(model.get('ba'));
		await tree.expand(model.get('bb'));

		await tree.expand(model.get('c'));
		await tree.expand(model.get('ca'));
		await tree.expand(model.get('cb'));

		// Only the first 10 elements are rendered (total height is 200px, each element is 20px)
		assert.deepStrictEqual(Array.from(container.querySelectorAll('.monaco-list-row')).map(e => e.textContent), ['a', 'aa', 'aa.txt', 'ab', 'ab.txt', 'b', 'ba', 'ba.txt', 'bb', 'bb.txt']);

		assert.strictEqual(tree.navigate().first()?.id, 'a');
		assert.strictEqual(tree.navigate().last()?.id, 'cb.txt');

		assert.strictEqual(tree.navigate(model.get('b')).previous()?.id, 'ab.txt');
		assert.strictEqual(tree.navigate(model.get('b')).next()?.id, 'ba');

		assert.strictEqual(tree.navigate(model.get('ab.txt')).previous()?.id, 'ab');
		assert.strictEqual(tree.navigate(model.get('ab.txt')).next()?.id, 'b');

		assert.strictEqual(tree.navigate(model.get('bb.txt')).next()?.id, 'c');

		tree.collapse(model.get('b'), false);
		assert.deepStrictEqual(Array.from(container.querySelectorAll('.monaco-list-row')).map(e => e.textContent), ['a', 'aa', 'aa.txt', 'ab', 'ab.txt', 'b', 'c', 'ca', 'ca.txt', 'cb']);

		assert.strictEqual(tree.navigate(model.get('b')).next()?.id, 'c');
	});

	test('Test Navigation: CompressibleAsyncDataTree', async () => {
		const container = document.createElement('div');

		const dataSource = new class implements IAsyncDataSource<Element, Element> {
			hasChildren(element: Element): boolean {
				return !!element.children && element.children.length > 0;
			}
			async getChildren(element: Element) {
				return element.children ?? Iterable.empty();
			}
		};

		const compressionDelegate = new class implements ITreeCompressionDelegate<Element> {
			isIncompressible(element: Element): boolean {
				return !dataSource.hasChildren(element);
			}
		};

		const model = new Model({
			id: 'root',
			children: [
				{
					id: 'a', children: [{ id: 'aa', children: [{ id: 'aa.txt' }] }]
				}, {
					id: 'b', children: [{ id: 'ba', children: [{ id: 'ba.txt' }] }]
				}, {
					id: 'c', children: [{
						id: 'ca', children: [{ id: 'ca.txt' }]
					}, {
						id: 'cb', children: [{ id: 'cb.txt' }]
					}]
				}
			]
		});

		const tree = store.add(new CompressibleAsyncDataTree<Element, Element>('test', container, new VirtualDelegate(), compressionDelegate, [new Renderer()], dataSource, { identityProvider: new IdentityProvider() }));
		tree.layout(200);

		await tree.setInput(model.root);
		assert.deepStrictEqual(Array.from(container.querySelectorAll('.monaco-list-row')).map(e => e.textContent), ['a', 'b', 'c']);

		assert.strictEqual(tree.navigate().current(), null);
		assert.strictEqual(tree.navigate().first()?.id, 'a');
		assert.strictEqual(tree.navigate().last()?.id, 'c');

		assert.strictEqual(tree.navigate(model.get('b')).previous()?.id, 'a');
		assert.strictEqual(tree.navigate(model.get('b')).next()?.id, 'c');

		await tree.expand(model.get('a'));
		await tree.expand(model.get('aa'));

		await tree.expand(model.get('b'));
		await tree.expand(model.get('ba'));

		await tree.expand(model.get('c'));
		await tree.expand(model.get('ca'));
		await tree.expand(model.get('cb'));

		// Only the first 10 elements are rendered (total height is 200px, each element is 20px)
		assert.deepStrictEqual(Array.from(container.querySelectorAll('.monaco-list-row')).map(e => e.textContent), ['a/aa', 'aa.txt', 'b/ba', 'ba.txt', 'c', 'ca', 'ca.txt', 'cb', 'cb.txt']);

		assert.strictEqual(tree.navigate().first()?.id, 'aa');
		assert.strictEqual(tree.navigate().last()?.id, 'cb.txt');

		assert.strictEqual(tree.navigate(model.get('b')).previous()?.id, 'aa.txt');
		assert.strictEqual(tree.navigate(model.get('ba')).previous()?.id, 'aa.txt');

		assert.strictEqual(tree.navigate(model.get('b')).next()?.id, 'ba.txt');
		assert.strictEqual(tree.navigate(model.get('ba')).next()?.id, 'ba.txt');

		assert.strictEqual(tree.navigate(model.get('aa.txt')).previous()?.id, 'aa');
		assert.strictEqual(tree.navigate(model.get('aa.txt')).next()?.id, 'ba');
	});
});
