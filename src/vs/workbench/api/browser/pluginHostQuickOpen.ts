/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {Remotable, IThreadService} from 'vs/platform/thread/common/thread';
import {IQuickOpenService, IPickOpenEntryItem, IPickOptions} from 'vs/workbench/services/quickopen/browser/quickOpenService';
import {QuickPickOptions, QuickPickItem, InputBoxOptions} from 'vscode';

export interface MyQuickPickItems extends IPickOpenEntryItem {
	handle: number;
}

export type Item = string | QuickPickItem;

export class PluginHostQuickOpen {

	private _proxy: MainThreadQuickOpen;

	constructor(@IThreadService threadService: IThreadService) {
		this._proxy = threadService.getRemotable(MainThreadQuickOpen);
	}

	show(items: Item[] | Thenable<Item[]>, options?: QuickPickOptions): Thenable<Item> {

		let itemsPromise: Thenable<Item[]>;
		if (!Array.isArray(items)) {
			itemsPromise = items;
		} else {
			itemsPromise = TPromise.as(items);
		}

		let quickPickWidget = this._proxy._show({
			autoFocus: { autoFocusFirstEntry: true },
			placeHolder: options && options.placeHolder,
			matchOnDescription: options && options.matchOnDescription
		});

		return itemsPromise.then(items => {

			let pickItems: MyQuickPickItems[] = [];
			for (let handle = 0; handle < items.length; handle++) {

				let item = items[handle];
				let label: string;
				let description: string;

				if (typeof item === 'string') {
					label = item;
				} else {
					label = item.label;
					description = item.description;
				}
				pickItems.push({
					label,
					description,
					handle
				});
			}

			this._proxy._setItems(pickItems);

			return quickPickWidget.then(handle => {
				if (typeof handle === 'number') {
					return items[handle];
				}
			});
		}, (err) => {
			this._proxy._setError(err);

			return TPromise.wrapError(err);
		});
	}

	input(options?: InputBoxOptions): Thenable<string> {
		return this._proxy._input(options);
	}
}

@Remotable.MainContext('MainThreadQuickOpen')
export class MainThreadQuickOpen {

	private _quickOpenService: IQuickOpenService;
	private _doSetItems: (items: MyQuickPickItems[]) => any;
	private _doSetError: (error: Error) => any;
	private _contents: TPromise<MyQuickPickItems[]>;
	private _token = 0;

	constructor(@IQuickOpenService quickOpenService: IQuickOpenService) {
		this._quickOpenService = quickOpenService;
	}

	_show(options: IPickOptions): Thenable<number> {

		const myToken = ++this._token;

		this._contents = new TPromise((c, e) => {
			this._doSetItems = (items) => {
				if (myToken === this._token) {
					c(items);
				}
			};

			this._doSetError = (error) => {
				if (myToken === this._token) {
					e(error);
				}
			};
		});

		return this._quickOpenService.pick(this._contents, options).then(item => {
			if (item) {
				return item.handle;
			}
		});
	}

	_setItems(items: MyQuickPickItems[]): Thenable<any> {
		if (this._doSetItems) {
			this._doSetItems(items);
			return;
		}
	}

	_setError(error: Error): Thenable<any> {
		if (this._doSetError) {
			this._doSetError(error);
			return;
		}
	}

	_input(options?: InputBoxOptions): Thenable<string> {
		return this._quickOpenService.input(options);
	}
}