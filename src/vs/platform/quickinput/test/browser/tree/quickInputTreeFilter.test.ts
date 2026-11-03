/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { TreeVisibility } from '../../../../../base/browser/ui/tree/tree.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { QuickInputTreeFilter } from '../../../browser/tree/quickInputTreeFilter.js';

suite('QuickInputTreeFilter', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('matches a qualified reference without highlighting the short label', () => {
		const filter = new QuickInputTreeFilter();
		filter.filterValue = 'vscode/usages';
		assert.deepStrictEqual(filter.filter({ label: 'usages', filterText: 'vscode/usages' }, TreeVisibility.Recurse), {
			visibility: TreeVisibility.Visible,
			data: { labelHighlights: undefined, descriptionHighlights: undefined },
		});
	});

	test('additional search text follows matchOnLabel and preserves other consumers', () => {
		const filter = new QuickInputTreeFilter();
		filter.filterValue = 'vscode/usages';
		const withoutSearchText = filter.filter({ label: 'usages' }, TreeVisibility.Recurse).visibility;
		filter.matchOnLabel = false;
		filter.matchOnDescription = true;
		const labelMatchingDisabled = filter.filter({ label: 'usages', filterText: 'vscode/usages' }, TreeVisibility.Recurse).visibility;
		const descriptionMatching = filter.filter({ label: 'usages', description: 'vscode/usages' }, TreeVisibility.Recurse).visibility;
		assert.deepStrictEqual([withoutSearchText, labelMatchingDisabled, descriptionMatching], [TreeVisibility.Hidden, TreeVisibility.Hidden, TreeVisibility.Visible]);
	});
});
