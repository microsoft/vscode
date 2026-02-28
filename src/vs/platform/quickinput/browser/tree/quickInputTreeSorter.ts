/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITreeSorter } from '../../../../base/browser/ui/tree/tree.js';
import { IQuickTreeItem } from '../../common/quickInput.js';
import { Disposable } from '../../../../base/common/lifecycle.js';

export class QuickInputTreeSorter extends Disposable implements ITreeSorter<IQuickTreeItem> {
	private _sortByLabel: boolean = true;

	get sortByLabel(): boolean {
		return this._sortByLabel;
	}

	set sortByLabel(value: boolean) {
		this._sortByLabel = value;
	}

	compare(a: IQuickTreeItem, b: IQuickTreeItem): number {
		// No-op
		if (!this._sortByLabel) {
			return 0;
		}

		if (a.label < b.label) {
			return -1;
		} else if (a.label > b.label) {
			return 1;
		}
		// use description to break ties
		if (a.description && b.description) {
			if (a.description < b.description) {
				return -1;
			} else if (a.description > b.description) {
				return 1;
			}
		} else if (a.description) {
			return -1;
		} else if (b.description) {
			return 1;
		}
		return 0;
	}
}
