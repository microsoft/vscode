/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {Remotable, IThreadService} from 'vs/platform/thread/common/thread';
import {IQuickOpenService, IPickOpenEntry, IPickOptions, IInputOptions} from 'vs/workbench/services/quickopen/common/quickOpenService';
import {QuickPickOptions, QuickPickItem, InputBoxOptions} from 'vscode';

export interface MyQuickPickItems extends IPickOpenEntry {
	handle: number;
}

export type Item = string | QuickPickItem;

@Remotable.ExtHostContext('ExtHostQuickOpen')
export class ExtHostQuickOpen {

	private _proxy: MainThreadQuickOpen;
	private _onDidSelectItem: (handle: number) => void;
	private _validateInput: (input: string) => string;

	constructor(@IThreadService threadService: IThreadService) {
		this._proxy = threadService.getRemotable(MainThreadQuickOpen);
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
		this._validateInput = options.validateInput;
		return this._proxy.$input(options, typeof options.validateInput === 'function');
	}

	$validateInput(input: string): TPromise<string> {
		if (this._validateInput) {
			return TPromise.as(this._validateInput(input));
		}
	}
}

@Remotable.MainContext('MainThreadQuickOpen')
export class MainThreadQuickOpen {

	private _proxy: ExtHostQuickOpen;
	private _quickOpenService: IQuickOpenService;
	private _doSetItems: (items: MyQuickPickItems[]) => any;
	private _doSetError: (error: Error) => any;
	private _contents: TPromise<MyQuickPickItems[]>;
	private _token: number = 0;

	constructor( @IThreadService threadService: IThreadService, @IQuickOpenService quickOpenService: IQuickOpenService) {
		this._proxy = threadService.getRemotable(ExtHostQuickOpen);
		this._quickOpenService = quickOpenService;
	}

	$show(options: IPickOptions): Thenable<number> {

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
		}, undefined, progress => {
			if (progress) {
				this._proxy.$onItemSelected((<MyQuickPickItems>progress).handle);
			}
		});
	}

	$setItems(items: MyQuickPickItems[]): Thenable<any> {
		if (this._doSetItems) {
			this._doSetItems(items);
			return;
		}
	}

	$setError(error: Error): Thenable<any> {
		if (this._doSetError) {
			this._doSetError(error);
			return;
		}
	}

	// ---- input

	$input(options: InputBoxOptions, validateInput: boolean): Thenable<string> {

		const inputOptions: IInputOptions = Object.create(null);

		if (options) {
			inputOptions.password = options.password;
			inputOptions.placeHolder = options.placeHolder;
			inputOptions.prompt = options.prompt;
			inputOptions.value = options.value;
		}

		if (validateInput) {
			inputOptions.validateInput = (value) => {
				return this._proxy.$validateInput(value);
			};
		}

		return this._quickOpenService.input(inputOptions);
	}
}
