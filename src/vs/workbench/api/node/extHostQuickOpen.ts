/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {IThreadService} from 'vs/workbench/services/thread/common/threadService';
import {QuickPickOptions, QuickPickItem, InputBoxOptions} from 'vscode';
import {MainContext, MainThreadQuickOpenShape, MyQuickPickItems} from './extHostProtocol';

export type Item = string | QuickPickItem;

export class ExtHostQuickOpen {

	private _proxy: MainThreadQuickOpenShape;
	private _onDidSelectItem: (handle: number) => void;
	private _validateInput: (input: string) => string;

	constructor(threadService: IThreadService) {
		this._proxy = threadService.get(MainContext.MainThreadQuickOpen);
	}

	show(itemsOrItemsPromise: Item[] | Thenable<Item[]>, options?: QuickPickOptions): Thenable<Item> {

		// clear state from last invocation
		this._onDidSelectItem = undefined;

		let itemsPromise: Thenable<Item[]>;
		if (!Array.isArray(itemsOrItemsPromise)) {
			itemsPromise = itemsOrItemsPromise;
		} else {
			itemsPromise = TPromise.as(itemsOrItemsPromise);
		}

		let quickPickWidget = this._proxy.$show({
			autoFocus: { autoFocusFirstEntry: true },
			placeHolder: options && options.placeHolder,
			matchOnDescription: options && options.matchOnDescription,
			matchOnDetail: options && options.matchOnDetail
		});

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
			});
		}, (err) => {
			this._proxy.$setError(err);

			return TPromise.wrapError(err);
		});
	}

	$onItemSelected(handle: number): void {
		if (this._onDidSelectItem) {
			this._onDidSelectItem(handle);
		}
	}

	// ---- input

	input(options?: InputBoxOptions): Thenable<string> {
		this._validateInput = options && options.validateInput;
		return this._proxy.$input(options, options && typeof options.validateInput === 'function');
	}

	$validateInput(input: string): TPromise<string> {
		if (this._validateInput) {
			return TPromise.as(this._validateInput(input));
		}
	}
}
