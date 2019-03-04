/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ITreeNode, ITreeRenderer } from 'vs/base/browser/ui/tree/tree';
import { IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { ObjectTree } from 'vs/base/browser/ui/tree/objectTree';
import { Iterator } from 'vs/base/common/iterator';

suite('ObjectTree', function () {
	suite('TreeNavigator', function () {
		let tree: ObjectTree<number>;
		let filter = (_: number) => true;

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

			tree = new ObjectTree<number>(container, delegate, [renderer], { filter: { filter: (el) => filter(el) } });
			tree.layout(200);
		});

		teardown(() => {
			tree.dispose();
			filter = (_: number) => true;
		});

		test('should be able to navigate', () => {
			tree.setChildren(null, Iterator.fromArray([
				{
					element: 0, children: Iterator.fromArray([
						{ element: 10 },
						{ element: 11 },
						{ element: 12 },
					])
				},
				{ element: 1 },
				{ element: 2 }
			]));

			const navigator = tree.navigate();

			assert.equal(navigator.current(), null);
			assert.equal(navigator.next(), 0);
			assert.equal(navigator.current(), 0);
			assert.equal(navigator.next(), 10);
			assert.equal(navigator.current(), 10);
			assert.equal(navigator.next(), 11);
			assert.equal(navigator.current(), 11);
			assert.equal(navigator.next(), 12);
			assert.equal(navigator.current(), 12);
			assert.equal(navigator.next(), 1);
			assert.equal(navigator.current(), 1);
			assert.equal(navigator.next(), 2);
			assert.equal(navigator.current(), 2);
			assert.equal(navigator.previous(), 1);
			assert.equal(navigator.current(), 1);
			assert.equal(navigator.previous(), 12);
			assert.equal(navigator.previous(), 11);
			assert.equal(navigator.previous(), 10);
			assert.equal(navigator.previous(), 0);
			assert.equal(navigator.previous(), null);
			assert.equal(navigator.next(), 0);
			assert.equal(navigator.next(), 10);
			assert.equal(navigator.parent(), 0);
			assert.equal(navigator.parent(), null);
			assert.equal(navigator.first(), 0);
			assert.equal(navigator.last(), 2);
		});

		test('should skip collapsed nodes', () => {
			tree.setChildren(null, Iterator.fromArray([
				{
					element: 0, collapsed: true, children: Iterator.fromArray([
						{ element: 10 },
						{ element: 11 },
						{ element: 12 },
					])
				},
				{ element: 1 },
				{ element: 2 }
			]));

			const navigator = tree.navigate();

			assert.equal(navigator.current(), null);
			assert.equal(navigator.next(), 0);
			assert.equal(navigator.next(), 1);
			assert.equal(navigator.next(), 2);
			assert.equal(navigator.next(), null);
			assert.equal(navigator.previous(), 2);
			assert.equal(navigator.previous(), 1);
			assert.equal(navigator.previous(), 0);
			assert.equal(navigator.previous(), null);
			assert.equal(navigator.next(), 0);
			assert.equal(navigator.parent(), null);
			assert.equal(navigator.first(), 0);
			assert.equal(navigator.last(), 2);
		});

		test('should skip filtered elements', () => {
			filter = el => el % 2 === 0;

			tree.setChildren(null, Iterator.fromArray([
				{
					element: 0, children: Iterator.fromArray([
						{ element: 10 },
						{ element: 11 },
						{ element: 12 },
					])
				},
				{ element: 1 },
				{ element: 2 }
			]));

			const navigator = tree.navigate();

			assert.equal(navigator.current(), null);
			assert.equal(navigator.next(), 0);
			assert.equal(navigator.next(), 10);
			assert.equal(navigator.next(), 12);
			assert.equal(navigator.next(), 2);
			assert.equal(navigator.next(), null);
			assert.equal(navigator.previous(), 2);
			assert.equal(navigator.previous(), 12);
			assert.equal(navigator.previous(), 10);
			assert.equal(navigator.previous(), 0);
			assert.equal(navigator.previous(), null);
			assert.equal(navigator.next(), 0);
			assert.equal(navigator.next(), 10);
			assert.equal(navigator.parent(), 0);
			assert.equal(navigator.parent(), null);
			assert.equal(navigator.first(), 0);
			assert.equal(navigator.last(), 2);
		});

		test('should be able to start from node', () => {
			tree.setChildren(null, Iterator.fromArray([
				{
					element: 0, children: Iterator.fromArray([
						{ element: 10 },
						{ element: 11 },
						{ element: 12 },
					])
				},
				{ element: 1 },
				{ element: 2 }
			]));

			const navigator = tree.navigate(1);

			assert.equal(navigator.current(), 1);
			assert.equal(navigator.next(), 2);
			assert.equal(navigator.current(), 2);
			assert.equal(navigator.previous(), 1);
			assert.equal(navigator.current(), 1);
			assert.equal(navigator.previous(), 12);
			assert.equal(navigator.previous(), 11);
			assert.equal(navigator.previous(), 10);
			assert.equal(navigator.previous(), 0);
			assert.equal(navigator.previous(), null);
			assert.equal(navigator.next(), 0);
			assert.equal(navigator.next(), 10);
			assert.equal(navigator.parent(), 0);
			assert.equal(navigator.parent(), null);
			assert.equal(navigator.first(), 0);
			assert.equal(navigator.last(), 2);
		});
	});
});