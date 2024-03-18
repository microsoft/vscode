/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ObjectTree } from 'vs/base/browser/ui/tree/objectTree';
import { Emitter } from 'vs/base/common/event';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { IWorkspaceFoldersChangeEvent } from 'vs/platform/workspace/common/workspace';
import { ITestTreeProjection, TestExplorerTreeElement, TestItemTreeElement, TestTreeErrorMessage } from 'vs/workbench/contrib/testing/browser/explorerProjections/index';
import { MainThreadTestCollection } from 'vs/workbench/contrib/testing/common/mainThreadTestCollection';
import { TestsDiff, TestsDiffOp } from 'vs/workbench/contrib/testing/common/testTypes';
import { ITestService } from 'vs/workbench/contrib/testing/common/testService';
import { testStubs } from 'vs/workbench/contrib/testing/test/common/testStubs';
import { ITreeRenderer, ITreeSorter } from 'vs/base/browser/ui/tree/tree';

type SerializedTree = { e: string; children?: SerializedTree[]; data?: string };

const element = document.createElement('div');
element.style.height = '1000px';
element.style.width = '200px';

class TestObjectTree<T> extends ObjectTree<T, any> {
	constructor(serializer: (node: T) => string, sorter?: ITreeSorter<T>) {
		super(
			'test',
			element,
			{
				getHeight: () => 20,
				getTemplateId: () => 'default'
			},
			[
				{
					disposeTemplate: ({ store }) => store.dispose(),
					renderElement: ({ depth, element }, _index, { container, store }) => {
						const render = () => {
							container.textContent = `${depth}:${serializer(element)}`;
							Object.assign(container.dataset, element);
						};
						render();

						if (element instanceof TestItemTreeElement) {
							store.add(element.onChange(render));
						}
					},
					disposeElement: (_el, _index, { store }) => store.clear(),
					renderTemplate: container => ({ container, store: new DisposableStore() }),
					templateId: 'default'
				} as ITreeRenderer<T, any, { store: DisposableStore; container: HTMLElement }>
			],
			{
				sorter: sorter ?? {
					compare: (a, b) => serializer(a).localeCompare(serializer(b))
				}
			}
		);
		this.layout(1000, 200);
	}

	public getModel() {
		return this.model;
	}

	public getRendered(getProperty?: string) {
		const elements = element.querySelectorAll<HTMLElement>('.monaco-tl-contents');
		const sorted = [...elements].sort((a, b) => pos(a) - pos(b));
		const chain: SerializedTree[] = [{ e: '', children: [] }];
		for (const element of sorted) {
			const [depthStr, label] = element.textContent!.split(':');
			const depth = Number(depthStr);
			const parent = chain[depth - 1];
			const child: SerializedTree = { e: label };
			if (getProperty) {
				child.data = element.dataset[getProperty];
			}
			parent.children = parent.children?.concat(child) ?? [child];
			chain[depth] = child;
		}

		return chain[0].children;
	}
}

const pos = (element: Element) => Number(element.parentElement!.parentElement!.getAttribute('aria-posinset'));


class ByLabelTreeSorter implements ITreeSorter<TestExplorerTreeElement> {
	public compare(a: TestExplorerTreeElement, b: TestExplorerTreeElement): number {
		if (a instanceof TestTreeErrorMessage || b instanceof TestTreeErrorMessage) {
			return (a instanceof TestTreeErrorMessage ? -1 : 0) + (b instanceof TestTreeErrorMessage ? 1 : 0);
		}

		if (a instanceof TestItemTreeElement && b instanceof TestItemTreeElement && a.test.item.uri && b.test.item.uri && a.test.item.uri.toString() === b.test.item.uri.toString() && a.test.item.range && b.test.item.range) {
			const delta = a.test.item.range.startLineNumber - b.test.item.range.startLineNumber;
			if (delta !== 0) {
				return delta;
			}
		}

		return (a.test.item.sortText || a.test.item.label).localeCompare(b.test.item.sortText || b.test.item.label);
	}
}

// names are hard
export class TestTreeTestHarness<T extends ITestTreeProjection = ITestTreeProjection> extends Disposable {
	private readonly onDiff = this._register(new Emitter<TestsDiff>());
	public readonly onFolderChange = this._register(new Emitter<IWorkspaceFoldersChangeEvent>());
	private isProcessingDiff = false;
	public readonly projection: T;
	public readonly tree: TestObjectTree<TestExplorerTreeElement>;

	constructor(makeTree: (listener: ITestService) => T, public readonly c = testStubs.nested()) {
		super();
		this._register(c);
		this._register(this.c.onDidGenerateDiff(d => this.c.setDiff(d /* don't clear during testing */)));

		const collection = new MainThreadTestCollection({ asCanonicalUri: u => u }, (testId, levels) => {
			this.c.expand(testId, levels);
			if (!this.isProcessingDiff) {
				this.onDiff.fire(this.c.collectDiff());
			}
			return Promise.resolve();
		});
		this._register(this.onDiff.event(diff => collection.apply(diff)));

		this.projection = this._register(makeTree({
			collection,
			onDidProcessDiff: this.onDiff.event,
		} as any));
		const sorter = new ByLabelTreeSorter();
		this.tree = this._register(new TestObjectTree(t => 'test' in t ? t.test.item.label : t.message.toString(), sorter));
		this._register(this.tree.onDidChangeCollapseState(evt => {
			if (evt.node.element instanceof TestItemTreeElement) {
				this.projection.expandElement(evt.node.element, evt.deep ? Infinity : 0);
			}
		}));
	}

	public pushDiff(...diff: TestsDiffOp[]) {
		this.onDiff.fire(diff);
	}

	public flush() {
		this.isProcessingDiff = true;
		while (this.c.currentDiff.length) {
			this.onDiff.fire(this.c.collectDiff());
		}
		this.isProcessingDiff = false;

		this.projection.applyTo(this.tree);
		return this.tree.getRendered();
	}
}
