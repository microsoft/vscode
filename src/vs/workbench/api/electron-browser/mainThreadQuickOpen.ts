/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { asWinJsPromise } from 'vs/base/common/async';
import { IPickOptions, IInputOptions, IQuickInputService, IQuickInput } from 'vs/platform/quickinput/common/quickInput';
import { InputBoxOptions } from 'vscode';
import { ExtHostContext, MainThreadQuickOpenShape, ExtHostQuickOpenShape, MyQuickPickItems, MainContext, IExtHostContext, TransferQuickInput } from '../node/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';

@extHostNamedCustomer(MainContext.MainThreadQuickOpen)
export class MainThreadQuickOpen implements MainThreadQuickOpenShape {

	private _proxy: ExtHostQuickOpenShape;
	private _quickInputService: IQuickInputService;
	private _doSetItems: (items: MyQuickPickItems[]) => any;
	private _doSetError: (error: Error) => any;
	private _contents: TPromise<MyQuickPickItems[]>;
	private _token: number = 0;

	constructor(
		extHostContext: IExtHostContext,
		@IQuickInputService quickInputService: IQuickInputService
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostQuickOpen);
		this._quickInputService = quickInputService;
	}

	public dispose(): void {
	}

	$show(options: IPickOptions): TPromise<number | number[]> {
		const myToken = ++this._token;

		this._contents = new TPromise<MyQuickPickItems[]>((c, e) => {
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

		if (options.canPickMany) {
			return asWinJsPromise(token => this._quickInputService.pick(this._contents, options as { canPickMany: true }, token)).then(items => {
				if (items) {
					return items.map(item => item.handle);
				}
				return undefined;
			}, undefined, progress => {
				if (progress) {
					this._proxy.$onItemSelected((<MyQuickPickItems>progress).handle);
				}
			});
		} else {
			return asWinJsPromise(token => this._quickInputService.pick(this._contents, options, token)).then(item => {
				if (item) {
					return item.handle;
				}
				return undefined;
			}, undefined, progress => {
				if (progress) {
					this._proxy.$onItemSelected((<MyQuickPickItems>progress).handle);
				}
			});
		}
	}

	$setItems(items: MyQuickPickItems[]): TPromise<any> {
		if (this._doSetItems) {
			this._doSetItems(items);
		}
		return undefined;
	}

	$setError(error: Error): TPromise<any> {
		if (this._doSetError) {
			this._doSetError(error);
		}
		return undefined;
	}

	// ---- input

	$input(options: InputBoxOptions, validateInput: boolean): TPromise<string> {
		const inputOptions: IInputOptions = Object.create(null);

		if (options) {
			inputOptions.password = options.password;
			inputOptions.placeHolder = options.placeHolder;
			inputOptions.valueSelection = options.valueSelection;
			inputOptions.prompt = options.prompt;
			inputOptions.value = options.value;
			inputOptions.ignoreFocusLost = options.ignoreFocusOut;
		}

		if (validateInput) {
			inputOptions.validateInput = (value) => {
				return this._proxy.$validateInput(value);
			};
		}

		return asWinJsPromise(token => this._quickInputService.input(inputOptions, token));
	}

	// ---- QuickInput

	private sessions = new Map<number, IQuickInput>();

	$createOrUpdate(params: TransferQuickInput): TPromise<void> {
		const sessionId = params.id;
		let session = this.sessions.get(sessionId);
		if (!session) {
			if (params.type === 'quickPick') {
				const input = this._quickInputService.createQuickPick();
				input.onDidAccept(() => {
					this._proxy.$onDidAccept(sessionId);
				});
				input.onDidChangeActive(items => {
					this._proxy.$onDidChangeActive(sessionId, items.map(item => (item as MyQuickPickItems).handle));
				});
				input.onDidChangeSelection(items => {
					this._proxy.$onDidChangeSelection(sessionId, items.map(item => (item as MyQuickPickItems).handle));
				});
				session = input;
			} else {
				const input = this._quickInputService.createInputBox();
				input.onDidAccept(() => {
					this._proxy.$onDidAccept(sessionId);
				});
				session = input;
			}
			this.sessions.set(sessionId, session);
		}
		for (const param in params) {
			if (param === 'id' || param === 'type') {
				continue;
			}
			if (param === 'visible') {
				if (params.visible) {
					session.show();
				} else {
					session.hide();
				}
			} else {
				session[param] = params[param];
			}
		}
		return TPromise.as(undefined);
	}

	$dispose(sessionId: number): TPromise<void> {
		const session = this.sessions.get(sessionId);
		if (session) {
			session.dispose();
			this.sessions.delete(sessionId);
		}
		return TPromise.as(undefined);
	}
}
