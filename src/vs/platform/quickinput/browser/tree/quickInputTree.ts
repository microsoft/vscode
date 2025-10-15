/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMatch } from '../../../../base/common/filters.js';
import { IQuickTreeItem } from '../../common/quickInput.js';
import { IObjectTreeElement, ITreeNode } from '../../../../base/browser/ui/tree/tree.js';

export interface IQuickTreeFilterData {
	readonly labelHighlights?: IMatch[];
	readonly descriptionHighlights?: IMatch[];
}

export function getParentNodeState(parentChildren: ITreeNode<IQuickTreeItem | null, IQuickTreeFilterData>[] | IObjectTreeElement<IQuickTreeItem>[]): boolean | 'partial' {
	let containsChecks = false;
	let containsUnchecks = false;
	let containsPartial = false;

	for (const element of parentChildren) {
		switch (element.element?.checked) {
			case 'partial':
				containsPartial = true;
				break;
			case true:
				containsChecks = true;
				break;
			default:
				containsUnchecks = true;
				break;
		}
		if (containsChecks && containsUnchecks && containsPartial) {
			break;
		}
	}
	const newState = containsUnchecks
		? containsPartial
			? 'partial'
			: containsChecks
				? 'partial'
				: false
		: containsPartial
			? 'partial'
			: containsChecks;
	return newState;
}
