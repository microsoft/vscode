/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ITreeNode, ITreeRenderer, IAsyncDataSource } from 'vs/base/browser/ui/tree/tree';
import { AsyncDataTree } from 'vs/base/browser/ui/tree/asyncDataTree';
import { IListVirtualDelegate, IIdentityProvider } from 'vs/base/browser/ui/list/list';
import { hasClass } from 'vs/base/browser/dom';
import { timeout } from 'vs/base/common/async';

interface Element {
	id: string;
	children?: Element[];
}

function find(elements: Element[] | undefined, id: string): Element {
	while (elements) {
		for (const element of elements) {
			if (element.id === id) {
				return element;
			}
		}
	}

	throw new Error('element not found');
}

class Renderer implements ITreeRenderer<Element, void, HTMLElement> {
	readonly templateId = 'default';
	renderTemplate(container: HTMLElement): HTMLElement {
		return container;
	}
	renderElement(element: ITreeNode<Element, void>, index: number, templateData: HTMLElement): void {
		templateData.textContent = element.element.id;
	}
	disposeTemplate(templateData: HTMLElement): void {
		// noop
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
		return find(this.root.children, id);
	}
}

suite('AsyncDataTree', function () {

	test('Collapse state should be preserved across refresh calls', async () => {
		const container = document.createElement('div');

		const model = new Model({
			id: 'root',
			children: [{
				id: 'a'
			}]
		});

		const tree = new AsyncDataTree<Element, Element>('test', container, new VirtualDelegate(), [new Renderer()], new DataSource(), { identityProvider: new IdentityProvider() });
		tree.layout(200);
		assert.equal(container.querySelectorAll('.monaco-list-row').length, 0);

		await tree.setInput(model.root);
		assert.equal(container.querySelectorAll('.monaco-list-row').length, 1);
		let twistie = container.querySelector('.monaco-list-row:first-child .monaco-tl-twistie') as HTMLElement;
		assert(!hasClass(twistie, 'collapsible'));
		assert(!hasClass(twistie, 'collapsed'));

		model.get('a').children = [
			{ id: 'aa' },
			{ id: 'ab' },
			{ id: 'ac' }
		];

		await tree.updateChildren(model.root);
		assert.equal(container.querySelectorAll('.monaco-list-row').length, 1);

		await tree.expand(model.get('a'));
		assert.equal(container.querySelectorAll('.monaco-list-row').length, 4);

		model.get('a').children = [];
		await tree.updateChildren(model.root);
		assert.equal(container.querySelectorAll('.monaco-list-row').length, 1);
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

		const tree = new AsyncDataTree<Element, Element>('test', container, new VirtualDelegate(), [new Renderer()], dataSource, { identityProvider: new IdentityProvider() });
		tree.layout(200);

		await tree.setInput(model.root);
		assert.deepStrictEqual(getChildrenCalls, ['root']);

		let twistie = container.querySelector('.monaco-list-row:first-child .monaco-tl-twistie') as HTMLElement;
		assert(!hasClass(twistie, 'collapsible'));
		assert(!hasClass(twistie, 'collapsed'));
		assert(tree.getNode().children[0].collapsed);

		model.get('a').children = [{ id: 'aa' }, { id: 'ab' }, { id: 'ac' }];
		await tree.updateChildren(model.root);

		assert.deepStrictEqual(getChildrenCalls, ['root', 'root']);
		twistie = container.querySelector('.monaco-list-row:first-child .monaco-tl-twistie') as HTMLElement;
		assert(hasClass(twistie, 'collapsible'));
		assert(hasClass(twistie, 'collapsed'));
		assert(tree.getNode().children[0].collapsed);

		model.get('a').children = [];
		await tree.updateChildren(model.root);

		assert.deepStrictEqual(getChildrenCalls, ['root', 'root', 'root']);
		twistie = container.querySelector('.monaco-list-row:first-child .monaco-tl-twistie') as HTMLElement;
		assert(!hasClass(twistie, 'collapsible'));
		assert(!hasClass(twistie, 'collapsed'));
		assert(tree.getNode().children[0].collapsed);

		model.get('a').children = [{ id: 'aa' }, { id: 'ab' }, { id: 'ac' }];
		await tree.updateChildren(model.root);

		assert.deepStrictEqual(getChildrenCalls, ['root', 'root', 'root', 'root']);
		twistie = container.querySelector('.monaco-list-row:first-child .monaco-tl-twistie') as HTMLElement;
		assert(hasClass(twistie, 'collapsible'));
		assert(hasClass(twistie, 'collapsed'));
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

		const tree = new AsyncDataTree<Element, Element>('test', container, new VirtualDelegate(), [new Renderer()], dataSource, { identityProvider: new IdentityProvider() });
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

		const tree = new AsyncDataTree<Element, Element>('test', container, new VirtualDelegate(), [new Renderer()], new DataSource(), { identityProvider: new IdentityProvider() });
		tree.layout(200);

		await tree.setInput(model.root);
		await tree.expand(model.get('a'));

		let twistie = container.querySelector('.monaco-list-row:first-child .monaco-tl-twistie') as HTMLElement;
		assert(hasClass(twistie, 'collapsible'));
		assert(!hasClass(twistie, 'collapsed'));
		assert(!tree.getNode(model.get('a')).collapsed);

		tree.collapse(model.get('a'));
		model.get('a').children = [];
		await tree.updateChildren(model.root);

		twistie = container.querySelector('.monaco-list-row:first-child .monaco-tl-twistie') as HTMLElement;
		assert(!hasClass(twistie, 'collapsible'));
		assert(!hasClass(twistie, 'collapsed'));
		assert(tree.getNode(model.get('a')).collapsed);
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

		const tree = new AsyncDataTree<Element, Element>('test', container, new VirtualDelegate(), [new Renderer()], dataSource, {
			collapseByDefault: el => el.id !== 'a'
		});
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
				return new Promise(c => calls.push(() => c(element.children)));
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

		const tree = new AsyncDataTree<Element, Element>('test', container, new VirtualDelegate(), [new Renderer()], dataSource, { identityProvider: new IdentityProvider() });
		tree.layout(200);

		const pSetInput = tree.setInput(model.root);
		calls.pop()!(); // resolve getChildren(root)
		await pSetInput;

		const pUpdateChildrenA = tree.updateChildren(model.get('a'));
		const pExpandA = tree.expand(model.get('a'));
		assert.equal(calls.length, 1, 'expand(a) still hasn\'t called getChildren(a)');

		calls.pop()!();
		assert.equal(calls.length, 0, 'no pending getChildren calls');

		await pUpdateChildrenA;
		assert.equal(calls.length, 0, 'expand(a) should not have forced a second refresh');

		const result = await pExpandA;
		assert.equal(result, true, 'expand(a) should be done');
	});

	test('issue #80098 - first expand should call getChildren', async () => {
		const container = document.createElement('div');

		const calls: Function[] = [];
		const dataSource = new class implements IAsyncDataSource<Element, Element> {
			hasChildren(element: Element): boolean {
				return !!element.children && element.children.length > 0;
			}
			getChildren(element: Element): Promise<Element[]> {
				return new Promise(c => calls.push(() => c(element.children)));
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

		const tree = new AsyncDataTree<Element, Element>('test', container, new VirtualDelegate(), [new Renderer()], dataSource, { identityProvider: new IdentityProvider() });
		tree.layout(200);

		const pSetInput = tree.setInput(model.root);
		calls.pop()!(); // resolve getChildren(root)
		await pSetInput;

		const pExpandA = tree.expand(model.get('a'));
		assert.equal(calls.length, 1, 'expand(a) should\'ve called getChildren(a)');

		let race = await Promise.race([pExpandA.then(() => 'expand'), timeout(1).then(() => 'timeout')]);
		assert.equal(race, 'timeout', 'expand(a) should not be yet done');

		calls.pop()!();
		assert.equal(calls.length, 0, 'no pending getChildren calls');

		race = await Promise.race([pExpandA.then(() => 'expand'), timeout(1).then(() => 'timeout')]);
		assert.equal(race, 'expand', 'expand(a) should now be done');
	});

	test('issue #78388 - tree should react to hasChildren toggles', async () => {
		const container = document.createElement('div');
		const model = new Model({
			id: 'root',
			children: [{
				id: 'a'
			}]
		});

		const tree = new AsyncDataTree<Element, Element>('test', container, new VirtualDelegate(), [new Renderer()], new DataSource(), { identityProvider: new IdentityProvider() });
		tree.layout(200);

		await tree.setInput(model.root);
		assert.equal(container.querySelectorAll('.monaco-list-row').length, 1);

		let twistie = container.querySelector('.monaco-list-row:first-child .monaco-tl-twistie') as HTMLElement;
		assert(!hasClass(twistie, 'collapsible'));
		assert(!hasClass(twistie, 'collapsed'));

		model.get('a').children = [{ id: 'aa' }];
		await tree.updateChildren(model.get('a'), false);
		assert.equal(container.querySelectorAll('.monaco-list-row').length, 1);
		twistie = container.querySelector('.monaco-list-row:first-child .monaco-tl-twistie') as HTMLElement;
		assert(hasClass(twistie, 'collapsible'));
		assert(hasClass(twistie, 'collapsed'));

		model.get('a').children = [];
		await tree.updateChildren(model.get('a'), false);
		assert.equal(container.querySelectorAll('.monaco-list-row').length, 1);
		twistie = container.querySelector('.monaco-list-row:first-child .monaco-tl-twistie') as HTMLElement;
		assert(!hasClass(twistie, 'collapsible'));
		assert(!hasClass(twistie, 'collapsed'));
	});
});
