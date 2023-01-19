/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRange } from 'vs/base/common/range';
import { ListView } from 'vs/base/browser/ui/list/listView';

export class NotebookCellListView<T> extends ListView<T> {
	private _inRenderingTransaction: boolean = false;

	get inRenderingTransaction(): boolean {
		return this._inRenderingTransaction;
	}

	protected override render(previousRenderRange: IRange, renderTop: number, renderHeight: number, renderLeft: number | undefined, scrollWidth: number | undefined, updateItemsInDOM?: boolean): void {
		this._inRenderingTransaction = true;
		super.render(previousRenderRange, renderTop, renderHeight, renderLeft, scrollWidth, updateItemsInDOM);
		this._inRenderingTransaction = false;
	}
}
