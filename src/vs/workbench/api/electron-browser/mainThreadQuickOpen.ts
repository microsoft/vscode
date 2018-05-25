/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { asWinJsPromise } from 'vs/base/common/async';
import { IPickOptions, IInputOptions, IQuickInputService, IQuickInput } from 'vs/platform/quickinput/common/quickInput';
import { InputBoxOptions, CancellationToken } from 'vscode';
import { ExtHostContext, MainThreadQuickOpenShape, ExtHostQuickOpenShape, MyQuickPickItems, MainContext, IExtHostContext } from '../node/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';

interface MultiStepSession {
	handle: number;
	input: IQuickInput;
	token: CancellationToken;
}

@extHostNamedCustomer(MainContext.MainThreadQuickOpen)
export class MainThreadQuickOpen implements MainThreadQuickOpenShape {

	private _proxy: ExtHostQuickOpenShape;
	private _quickInputService: IQuickInputService;
	private _doSetItems: (items: MyQuickPickItems[]) => any;
	private _doSetError: (error: Error) => any;
	private _contents: TPromise<MyQuickPickItems[]>;
	private _token: number = 0;
	private _multiStep: MultiStepSession;

	constructor(
		extHostContext: IExtHostContext,
		@IQuickInputService quickInputService: IQuickInputService
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostQuickOpen);
		this._quickInputService = quickInputService;
	}

	public dispose(): void {
	}

	$show(multiStepHandle: number | undefined, options: IPickOptions): TPromise<number | number[]> {

		const multiStep = typeof multiStepHandle === 'number';
		if (multiStep && !(this._multiStep && multiStepHandle === this._multiStep.handle && !this._multiStep.token.isCancellationRequested)) {
			return TPromise.as(undefined);
		}
		const input: IQuickInput = multiStep ? this._multiStep.input : this._quickInputService;

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
			return asWinJsPromise(token => input.pick(this._contents, options as { canPickMany: true }, token)).then(items => {
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
			return asWinJsPromise(token => input.pick(this._contents, options, token)).then(item => {
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

	$input(multiStepHandle: number | undefined, options: InputBoxOptions, validateInput: boolean): TPromise<string> {

		const multiStep = typeof multiStepHandle === 'number';
		if (multiStep && !(this._multiStep && multiStepHandle === this._multiStep.handle && !this._multiStep.token.isCancellationRequested)) {
			return TPromise.as(undefined);
		}
		const input: IQuickInput = multiStep ? this._multiStep.input : this._quickInputService;

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

		return asWinJsPromise(token => input.input(inputOptions, token));
	}

	// ---- Multi-step input

	$multiStep(handle: number): TPromise<never> {
		let outerReject: (err: any) => void;
		let innerResolve: (value: void) => void;
		const promise = new TPromise<never>((_, rej) => outerReject = rej, () => innerResolve(undefined));
		this._quickInputService.multiStepInput((input, token) => {
			this._multiStep = { handle, input, token };
			const promise = new TPromise<void>(res => innerResolve = res);
			token.onCancellationRequested(() => innerResolve(undefined));
			return promise;
		})
			.then(() => promise.cancel(), err => outerReject(err))
			.then(() => {
				if (this._multiStep && this._multiStep.handle === handle) {
					this._multiStep = null;
				}
			});
		return promise;
	}
}
