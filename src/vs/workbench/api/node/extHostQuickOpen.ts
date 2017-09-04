/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { wireCancellationToken } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { QuickPickOptions, QuickPickItem, InputBoxOptions } from 'vscode';
import { MainContext, MainThreadQuickOpenShape, ExtHostQuickOpenShape, MyQuickPickItems, IMainContext } from './extHost.protocol';

export type Item = string | QuickPickItem;

export class ExtHostQuickOpen implements ExtHostQuickOpenShape {

	private _proxy: MainThreadQuickOpenShape;
	private _onDidSelectItem: (handle: number) => void;
	private _validateInput: (input: string) => string;

	constructor(mainContext: IMainContext) {
		this._proxy = mainContext.get(MainContext.MainThreadQuickOpen);
	}

	showQuickPick(itemsOrItemsPromise: string[] | Thenable<string[]>, options?: QuickPickOptions, token?: CancellationToken): Thenable<string | undefined>;
	showQuickPick(itemsOrItemsPromise: QuickPickItem[] | Thenable<QuickPickItem[]>, options?: QuickPickOptions, token?: CancellationToken): Thenable<QuickPickItem | undefined>;
	showQuickPick(itemsOrItemsPromise: Item[] | Thenable<Item[]>, options?: QuickPickOptions, token: CancellationToken = CancellationToken.None): Thenable<Item | undefined> {

		// clear state from last invocation
		this._onDidSelectItem = undefined;

		const itemsPromise = <TPromise<Item[]>>TPromise.wrap(itemsOrItemsPromise);

		const quickPickWidget = this._proxy.$show({
			autoFocus: { autoFocusFirstEntry: true },
			placeHolder: options && options.placeHolder,
			matchOnDescription: options && options.matchOnDescription,
			matchOnDetail: options && options.matchOnDetail,
			ignoreFocusLost: options && options.ignoreFocusOut
		});

		const promise = TPromise.any(<TPromise<number | Item[]>[]>[quickPickWidget, itemsPromise]).then(values => {
			if (values.key === '0') {
				return undefined;
			}

			return itemsPromise.then(items => {

				let pickItems: MyQuickPickItems[] = [];
				for (let handle = 0; handle < items.length; handle++) {

					let item = items[handle];
					let label: string;
					let description: string;
					let detail: string;

					if (typeof item === 'string') {
						label = item;
					} else {
						label = item.label;
						description = item.description;
						detail = item.detail;
					}
					pickItems.push({
						label,
						description,
						handle,
						detail
					});
				}

				// handle selection changes
				if (options && typeof options.onDidSelectItem === 'function') {
					this._onDidSelectItem = (handle) => {
						options.onDidSelectItem(items[handle]);
					};
				}

				// show items
				this._proxy.$setItems(pickItems);

				return quickPickWidget.then(handle => {
					if (typeof handle === 'number') {
						return items[handle];
					}
					return undefined;
				});
			}, (err) => {
				this._proxy.$setError(err);

				return TPromise.wrapError(err);
			});
		});
		return wireCancellationToken<Item>(token, promise, true);
	}

	$onItemSelected(handle: number): void {
		if (this._onDidSelectItem) {
			this._onDidSelectItem(handle);
		}
	}

	// ---- input

	showInput(options?: InputBoxOptions, token: CancellationToken = CancellationToken.None): Thenable<string> {

		// global validate fn used in callback below
		this._validateInput = options && options.validateInput;

		const promise = this._proxy.$input(options, typeof this._validateInput === 'function');
		return wireCancellationToken(token, promise, true);
	}

	$validateInput(input: string): TPromise<string> {
		if (this._validateInput) {
			return TPromise.as(this._validateInput(input));
		}
		return undefined;
	}
}
