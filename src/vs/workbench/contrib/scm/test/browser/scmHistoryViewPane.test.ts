/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../base/common/observable.js';
import { basename } from '../../../../../base/common/path.js';
import { IResourceNode, ResourceTree } from '../../../../../base/common/resourceTree.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { SymbolKind } from '../../../../../editor/common/languages.js';
import { SCMHistoryTreeDataSource, SCMHistoryTreeSorter } from '../../browser/scmHistoryViewPane.js';
import { ISCMHistoryItemChange, ISCMHistoryItemViewModel, ISCMHistoryProvider, SCMHistoryItemChangeViewModelTreeElement, SCMHistoryItemLoadMoreTreeElement, SCMHistoryItemViewModelTreeElement } from '../../common/history.js';
import { ISCMProvider, ISCMRepository, ViewMode } from '../../common/scm.js';
import { SCMStructuralDiffElement, SCMStructuralDiffNode, StructuralDiffModel } from '../../common/scmStructuralDiff.js';

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
	const fileUri = URI.joinPath(rootUri, 'file.ts');
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

	function toHistoryItemChange(modifiedRef: string): ISCMHistoryItemChange {
		return {
			uri: fileUri.with({ query: `ref=${modifiedRef}` }),
			originalUri: fileUri.with({ scheme: 'git', query: JSON.stringify({ path: fileUri.fsPath, ref: 'a' }) }),
			modifiedUri: fileUri.with({ scheme: 'git', query: JSON.stringify({ path: fileUri.fsPath, ref: modifiedRef }) })
		};
	}

	for (const mode of [ViewMode.List, ViewMode.Tree]) {
		test(`keeps the element of a file while it compares the same documents, so that it keeps its structural changes, in ${mode} mode`, async () => {
			const dataSource = store.add(new SCMHistoryTreeDataSource(() => mode, new class extends mock<StructuralDiffModel<SCMHistoryItemChangeViewModelTreeElement>>() { }));
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

			dataSource.forgetChangeElements(() => true);
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
