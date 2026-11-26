/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { basename } from '../../../../../base/common/path.js';
import { IResourceNode, ResourceTree } from '../../../../../base/common/resourceTree.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { SCMHistoryTreeSorter } from '../../browser/scmHistoryViewPane.js';
import { ISCMHistoryItemViewModel, SCMHistoryItemChangeViewModelTreeElement, SCMHistoryItemLoadMoreTreeElement, SCMHistoryItemViewModelTreeElement } from '../../common/history.js';
import { ISCMRepository, ViewMode } from '../../common/scm.js';

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
