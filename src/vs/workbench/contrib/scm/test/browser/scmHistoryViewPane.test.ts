/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { AsyncDataTree } from '../../../../../base/browser/ui/tree/asyncDataTree.js';
import { ITreeNode } from '../../../../../base/browser/ui/tree/tree.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { basename } from '../../../../../base/common/path.js';
import { IResourceNode, ResourceTree } from '../../../../../base/common/resourceTree.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { SymbolKind } from '../../../../../editor/common/languages.js';
import { SCMHistoryTreeDataSource, SCMHistoryTreeIdentityProvider, SCMHistoryTreeSorter } from '../../browser/scmHistoryViewPane.js';
import { isSCMHistoryItemChangeViewModelTreeElement } from '../../browser/util.js';
import { ISCMHistoryItemChange, ISCMHistoryItemViewModel, ISCMHistoryProvider, SCMHistoryItemChangeViewModelTreeElement, SCMHistoryItemLoadMoreTreeElement, SCMHistoryItemViewModelTreeElement } from '../../common/history.js';
import { ISCMProvider, ISCMRepository, ViewMode } from '../../common/scm.js';
import { isSCMStructuralDiffElement, SCMStructuralDiffElement, SCMStructuralDiffNode, StructuralDiffModel } from '../../common/scmStructuralDiff.js';

type TreeElement = SCMHistoryItemViewModelTreeElement | SCMHistoryItemLoadMoreTreeElement | SCMHistoryItemChangeViewModelTreeElement | IResourceNode<SCMHistoryItemChangeViewModelTreeElement, SCMHistoryItemViewModelTreeElement>;

suite('SCMHistoryTreeSorter', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const rootUri = URI.file('/repo');
	const repository = {} as ISCMRepository;
	const historyItemViewModel = {
		historyItem: { id: 'a', parentIds: [], subject: '', message: '' },
		inputSwimlanes: [],
		outputSwimlanes: [],
		kind: 'HEAD'
	} satisfies ISCMHistoryItemViewModel;
	const historyItemElement: SCMHistoryItemViewModelTreeElement = { repository, historyItemViewModel, type: 'historyItemViewModel' };

	const paths = [
		'Hausgeist.UnitTests/Tests.cs',
		'Hausgeist/Program.cs',
		'Zeta.md',
		'alpha.md',
		'docs/readme.md'
	];

	function toChange(path: string): SCMHistoryItemChangeViewModelTreeElement {
		return { repository, historyItemViewModel, historyItemChange: { uri: URI.joinPath(rootUri, path) }, graphColumns: [], type: 'historyItemChangeViewModel' };
	}

	function toLabel(element: TreeElement): string {
		if (ResourceTree.isResourceNode(element)) {
			return `${element.name}/`;
		}

		return element.type === 'historyItemChangeViewModel' ? basename(element.historyItemChange.uri.fsPath) : element.type;
	}

	test('sorts history item changes by path in list mode', () => {
		const sorter = new SCMHistoryTreeSorter(() => ViewMode.List);
		const elements: TreeElement[] = paths.map(toChange);

		assert.deepStrictEqual(elements.sort((a, b) => sorter.compare(a, b)).map(e => (e as SCMHistoryItemChangeViewModelTreeElement).historyItemChange.uri.path.substring(rootUri.path.length + 1)), [
			'alpha.md',
			'Zeta.md',
			'docs/readme.md',
			'Hausgeist/Program.cs',
			'Hausgeist.UnitTests/Tests.cs'
		]);
	});

	test('sorts folders first, then by name in tree mode', () => {
		const sorter = new SCMHistoryTreeSorter(() => ViewMode.Tree);
		const tree = new ResourceTree<SCMHistoryItemChangeViewModelTreeElement, SCMHistoryItemViewModelTreeElement>(historyItemElement, rootUri);
		for (const path of paths) {
			tree.add(URI.joinPath(rootUri, path), toChange(path));
		}

		const elements: TreeElement[] = [...tree.root.children].map(node => node.element ?? node);

		assert.deepStrictEqual(elements.sort((a, b) => sorter.compare(a, b)).map(toLabel), [
			'docs/',
			'Hausgeist/',
			'Hausgeist.UnitTests/',
			'alpha.md',
			'Zeta.md'
		]);
	});

	test('keeps the graph order of history items', () => {
		const sorter = new SCMHistoryTreeSorter(() => ViewMode.Tree);
		const loadMore: SCMHistoryItemLoadMoreTreeElement = { repository, graphColumns: [], type: 'historyItemLoadMore' };

		assert.deepStrictEqual([
			sorter.compare(historyItemElement, loadMore),
			sorter.compare(loadMore, historyItemElement)
		], [0, 0]);
	});
});

suite('SCMHistoryTreeDataSource', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const rootUri = URI.file('/repo');
	let historyItemChanges: ISCMHistoryItemChange[];
	let repository: ISCMRepository;

	setup(() => {
		historyItemChanges = [];
		const historyProvider = new class extends mock<ISCMHistoryProvider>() {
			override async provideHistoryItemChanges(): Promise<ISCMHistoryItemChange[]> { return historyItemChanges; }
		};
		const provider = new class extends mock<ISCMProvider>() {
			override readonly id = 'git';
			override readonly rootUri = rootUri;
			override readonly historyProvider = constObservable(historyProvider);
		};
		repository = new class extends mock<ISCMRepository>() {
			override readonly provider = provider;
		};
	});

	function toHistoryItemElement(color: string): SCMHistoryItemViewModelTreeElement {
		const historyItemViewModel: ISCMHistoryItemViewModel = {
			historyItem: { id: 'b', parentIds: ['a'], subject: '', message: '' },
			inputSwimlanes: [{ id: 'b', color }],
			outputSwimlanes: [{ id: 'a', color }],
			kind: 'node'
		};

		return { repository, historyItemViewModel, type: 'historyItemViewModel' };
	}

	function toHistoryItemChange(modifiedRef: string, path = 'file.ts'): ISCMHistoryItemChange {
		const uri = URI.joinPath(rootUri, path);
		return {
			uri: uri.with({ query: `ref=${modifiedRef}` }),
			originalUri: uri.with({ scheme: 'git', query: JSON.stringify({ path: uri.fsPath, ref: 'a' }) }),
			modifiedUri: uri.with({ scheme: 'git', query: JSON.stringify({ path: uri.fsPath, ref: modifiedRef }) })
		};
	}

	/**
	 * Records the files whose structural changes it computes, and keeps them until they are released or the view is
	 * hidden, like the model. Like the model's telemetry, it reports the first computation after a file was expanded.
	 */
	class TestStructuralDiffModel extends mock<StructuralDiffModel<SCMHistoryItemChangeViewModelTreeElement>>() {
		readonly computed: string[] = [];
		readonly reported: string[] = [];
		readonly results = new Map<SCMHistoryItemChangeViewModelTreeElement, readonly SCMStructuralDiffElement<SCMHistoryItemChangeViewModelTreeElement>[]>();
		private readonly expanded = new Set<SCMHistoryItemChangeViewModelTreeElement>();
		override get enabled(): boolean { return true; }
		override hasChildren(): boolean { return true; }
		override async getChildren(change: SCMHistoryItemChangeViewModelTreeElement): Promise<readonly SCMStructuralDiffElement<SCMHistoryItemChangeViewModelTreeElement>[]> {
			let result = this.results.get(change);
			if (!result) {
				const name = basename(change.historyItemChange.uri.path);
				this.computed.push(name);
				if (!this.expanded.has(change)) {
					this.expanded.add(change);
					this.reported.push(name);
				}
				const range = new Range(1, 1, 3, 1);
				result = [{
					type: 'structuralDiff', id: `structuralDiff:${change.historyItemChange.uri.path}`, generation: 1, resource: change, parent: change, order: 0, children: [],
					node: { id: 'method', originalItem: { name: 'run', kind: SymbolKind.Method, range }, modifiedItem: { name: 'run', kind: SymbolKind.Method, range }, originalChanges: [], modifiedChanges: [], children: [] },
				}];
				this.results.set(change, result);
			}
			return result;
		}
		override setVisible(visible: boolean): void {
			if (!visible) {
				this.results.clear();
			}
		}
		override release(change: SCMHistoryItemChangeViewModelTreeElement): void {
			this.expanded.delete(change);
			this.results.delete(change);
		}
		override releaseWhere(predicate: (change: SCMHistoryItemChangeViewModelTreeElement) => boolean, reusedChanges: Iterable<SCMHistoryItemChangeViewModelTreeElement> = []): void {
			for (const change of new Set([...this.results.keys(), ...reusedChanges])) {
				if (predicate(change)) {
					this.expanded.delete(change);
					this.results.delete(change);
				}
			}
		}
	}

	type Element = Parameters<SCMHistoryTreeIdentityProvider['getId']>[0];

	/**
	 * Shows the files of a history item in a tree like the one of the Graph view: refreshing it creates the history item
	 * again, and every update of the tree is followed by releasing the files that it no longer shows.
	 */
	async function createGraph(viewMode: () => ViewMode) {
		const structuralDiff = new TestStructuralDiffModel();
		const dataSource = store.add(new SCMHistoryTreeDataSource(viewMode, structuralDiff));
		const root = { type: 'graph' } as const;
		const isRoot = (element: typeof root | Element): element is typeof root => element === root;
		let historyItemElement = toHistoryItemElement('red');
		const tree = store.add(new AsyncDataTree<typeof root, Element>('SCM Graph', $('.scm-view'), {
			getHeight: () => 22,
			getTemplateId: () => 'element',
		}, [{
			templateId: 'element',
			renderTemplate: container => container,
			renderElement: () => { },
			disposeTemplate: () => { },
		}], {
			hasChildren: element => isRoot(element) || dataSource.hasChildren(element),
			getChildren: element => isRoot(element) ? [historyItemElement] : dataSource.getChildren(element),
		}, {
			identityProvider: new SCMHistoryTreeIdentityProvider(),
			collapseByDefault: element => !ResourceTree.isResourceNode(element) && !isSCMStructuralDiffElement(element),
		}));
		tree.layout(400);

		const update = async () => {
			await tree.updateChildren(root);
			dataSource.releaseHiddenChanges(tree);
		};
		const refresh = async () => {
			historyItemElement = toHistoryItemElement('red');
			await update();
		};
		const find = (isMatch: (element: Element) => boolean) => {
			const visit = (node: ITreeNode<typeof root | Element, unknown>): Element | undefined => {
				for (const child of node.children) {
					const element = child.element as Element;
					const match = isMatch(element) ? element : visit(child);
					if (match) {
						return match;
					}
				}
				return undefined;
			};
			const element = visit(tree.getNode());
			assert.ok(element);
			return element;
		};
		const getFolder = (name: string) => find(element => ResourceTree.isResourceNode(element) && element.name === name);
		const getFile = (name: string) => {
			const element = find(element => isSCMHistoryItemChangeViewModelTreeElement(element) && basename(element.historyItemChange.uri.path) === name);
			assert.ok(isSCMHistoryItemChangeViewModelTreeElement(element));
			return element;
		};

		await tree.setInput(root);
		dataSource.releaseHiddenChanges(tree);
		await tree.expand(historyItemElement);
		return { tree, structuralDiff, update, refresh, getFile, getFolder };
	}

	for (const mode of [ViewMode.List, ViewMode.Tree]) {
		test(`keeps the element of a file while it compares the same documents, so that it keeps its structural changes, in ${mode} mode`, async () => {
			const dataSource = store.add(new SCMHistoryTreeDataSource(() => mode, new class extends mock<StructuralDiffModel<SCMHistoryItemChangeViewModelTreeElement>>() {
				override releaseWhere(): void { }
			}));
			const getChange = async (historyItemElement: SCMHistoryItemViewModelTreeElement) => {
				const [change] = [...await dataSource.getChildren(historyItemElement)];
				return change as SCMHistoryItemChangeViewModelTreeElement;
			};

			historyItemChanges = [toHistoryItemChange('b')];
			const change = await getChange(toHistoryItemElement('red'));

			// Refreshing the graph creates the history item again, with different graph data
			const refreshedHistoryItemElement = toHistoryItemElement('blue');
			const refreshedChange = await getChange(refreshedHistoryItemElement);

			// The file compares other documents, for example because the incoming changes were fetched
			historyItemChanges = [toHistoryItemChange('c')];
			const otherChange = await getChange(refreshedHistoryItemElement);

			// The history item leaves the graph
			dataSource.releaseHiddenChanges({ hasNode: () => false, isCollapsed: () => true });
			const forgottenChange = await getChange(refreshedHistoryItemElement);

			assert.deepStrictEqual({
				refreshed: refreshedChange === change,
				refreshedHistoryItemViewModel: refreshedChange.historyItemViewModel === refreshedHistoryItemElement.historyItemViewModel,
				refreshedGraphColumns: refreshedChange.graphColumns,
				other: otherChange === change,
				forgotten: forgottenChange === otherChange,
			}, {
				refreshed: true,
				refreshedHistoryItemViewModel: true,
				refreshedGraphColumns: [{ id: 'a', color: 'blue' }],
				other: false,
				forgotten: false,
			});
		});
	}

	test('keeps the elements of the files below a folder that was collapsed during a refresh, so that a file expanded later is not analyzed again', async () => {
		historyItemChanges = [toHistoryItemChange('b', 'src/file.ts')];
		const graph = await createGraph(() => ViewMode.Tree);
		await graph.tree.expand(graph.getFile('file.ts'));
		graph.tree.collapse(graph.getFolder('src'));
		await graph.refresh();

		await graph.tree.expand(graph.getFolder('src'));
		const change = graph.getFile('file.ts');
		await graph.tree.expand(change);
		await graph.refresh();

		assert.deepStrictEqual({ computed: graph.structuralDiff.computed, keptElement: graph.getFile('file.ts') === change }, {
			// The refresh dropped the file from the collapsed folder, so expanding it again computes its structural changes again
			computed: ['file.ts', 'file.ts'],
			keptElement: true,
		});
	});

	test('ends the expansion of a file that showing the view drops from a collapsed folder, after hiding the view cleared its structural changes', async () => {
		historyItemChanges = [toHistoryItemChange('b', 'src/file.ts'), toHistoryItemChange('b', 'other.ts')];
		const graph = await createGraph(() => ViewMode.Tree);
		await graph.tree.expand(graph.getFile('file.ts'));
		await graph.tree.expand(graph.getFile('other.ts'));
		graph.tree.collapse(graph.getFolder('src'));
		graph.structuralDiff.setVisible(false);
		graph.structuralDiff.setVisible(true);
		// Showing the view renders its history items again, which drops the files of the collapsed folder
		await graph.refresh();

		await graph.tree.expand(graph.getFolder('src'));
		await graph.tree.expand(graph.getFile('file.ts'));

		assert.deepStrictEqual({ computed: graph.structuralDiff.computed, reported: graph.structuralDiff.reported }, {
			// The file that stayed expanded was analyzed again without being reported, while expanding the other file again was reported
			computed: ['file.ts', 'other.ts', 'other.ts', 'file.ts'],
			reported: ['file.ts', 'other.ts', 'file.ts'],
		});
	});

	for (const [from, to] of [[ViewMode.List, ViewMode.Tree], [ViewMode.Tree, ViewMode.List]]) {
		test(`releases the structural changes of a file that switching from ${from} to ${to} mode shows collapsed, but keeps its element`, async () => {
			historyItemChanges = [toHistoryItemChange('b', 'src/file.ts')];
			let mode = from;
			const graph = await createGraph(() => mode);
			const change = graph.getFile('file.ts');
			await graph.tree.expand(change);

			mode = to;
			await graph.update();

			assert.deepStrictEqual({
				collapsed: graph.tree.isCollapsed(change),
				released: !graph.structuralDiff.results.has(change),
				keptElement: graph.getFile('file.ts') === change,
			}, { collapsed: true, released: true, keptElement: true });
		});
	}

	test('exposes the structural changes of files only while structural diffs are enabled', async () => {
		historyItemChanges = [toHistoryItemChange('b')];
		let enabled = true;
		let children: readonly SCMStructuralDiffElement<SCMHistoryItemChangeViewModelTreeElement>[] = [];
		const structuralDiff = new class extends mock<StructuralDiffModel<SCMHistoryItemChangeViewModelTreeElement>>() {
			override get enabled(): boolean { return enabled; }
			override hasChildren(): boolean { return enabled; }
			override async getChildren(): Promise<readonly SCMStructuralDiffElement<SCMHistoryItemChangeViewModelTreeElement>[]> { return enabled ? children : []; }
		};
		const dataSource = store.add(new SCMHistoryTreeDataSource(() => ViewMode.List, structuralDiff));
		const [change] = [...await dataSource.getChildren(toHistoryItemElement('red'))] as SCMHistoryItemChangeViewModelTreeElement[];

		const range = new Range(1, 1, 3, 1);
		const method: SCMStructuralDiffNode<SCMHistoryItemChangeViewModelTreeElement> = {
			type: 'structuralDiff', id: 'method', generation: 1, resource: change, parent: change, order: 0, children: [],
			node: { id: 'method', originalItem: { name: 'run', kind: SymbolKind.Method, range }, modifiedItem: { name: 'run', kind: SymbolKind.Method, range }, originalChanges: [], modifiedChanges: [], children: [] },
		};
		const cls: SCMStructuralDiffNode<SCMHistoryItemChangeViewModelTreeElement> = { ...method, id: 'class', children: [method] };
		children = [cls];

		const describe = async () => ({
			file: { hasChildren: dataSource.hasChildren(change), children: [...await dataSource.getChildren(change)] },
			class: { hasChildren: dataSource.hasChildren(cls), children: [...await dataSource.getChildren(cls)] },
		});
		const shown = await describe();
		enabled = false;
		const hidden = await describe();

		assert.deepStrictEqual({ shown, hidden }, {
			shown: { file: { hasChildren: true, children: [cls] }, class: { hasChildren: true, children: [method] } },
			hidden: { file: { hasChildren: false, children: [] }, class: { hasChildren: false, children: [] } },
		});
	});
});
