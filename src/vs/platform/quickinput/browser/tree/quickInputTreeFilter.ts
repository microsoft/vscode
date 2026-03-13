/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITreeFilter, ITreeFilterDataResult, TreeVisibility } from '../../../../base/browser/ui/tree/tree.js';
import { matchesFuzzyIconAware, parseLabelWithIcons } from '../../../../base/common/iconLabels.js';
import { IQuickTreeItem } from '../../common/quickInput.js';
import { IQuickTreeFilterData } from './quickInputTree.js';

export class QuickInputTreeFilter implements ITreeFilter<IQuickTreeItem, IQuickTreeFilterData> {
	filterValue: string = '';
	matchOnLabel: boolean = true;
	matchOnDescription: boolean = false;

	filter(element: IQuickTreeItem, parentVisibility: TreeVisibility): ITreeFilterDataResult<IQuickTreeFilterData> {
		if (!this.filterValue || !(this.matchOnLabel || this.matchOnDescription)) {
			return element.children
				? { visibility: TreeVisibility.Recurse, data: {} }
				: { visibility: TreeVisibility.Visible, data: {} };
		}

		const labelHighlights = this.matchOnLabel ? matchesFuzzyIconAware(this.filterValue, parseLabelWithIcons(element.label)) ?? undefined : undefined;
		const descriptionHighlights = this.matchOnDescription ? matchesFuzzyIconAware(this.filterValue, parseLabelWithIcons(element.description || '')) ?? undefined : undefined;

		const visibility = parentVisibility === TreeVisibility.Visible
			// Parent is visible because it had matches, so we show all children
			? TreeVisibility.Visible
			// This would only happen on Parent is recurse so...
			: (labelHighlights || descriptionHighlights)
				// If we have any highlights, we are visible
				? TreeVisibility.Visible
				// Otherwise, we defer to the children or if no children, we are hidden
				: element.children
					? TreeVisibility.Recurse
					: TreeVisibility.Hidden;

		return {
			visibility,
			data: {
				labelHighlights,
				descriptionHighlights
			}
		};
	}
}
