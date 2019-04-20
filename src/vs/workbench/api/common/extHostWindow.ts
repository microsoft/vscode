/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { ExtHostWindowShape, MainContext, MainThreadWindowShape, IMainContext, IOpenUriOptions } from './extHost.protocol';
import { WindowState } from 'vscode';
import { URI } from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';
import { isFalsyOrWhitespace } from 'vs/base/common/strings';

export class ExtHostWindow implements ExtHostWindowShape {

	private static InitialState: WindowState = {
		focused: true
	};

	private _proxy: MainThreadWindowShape;

	private _onDidChangeWindowState = new Emitter<WindowState>();
	readonly onDidChangeWindowState: Event<WindowState> = this._onDidChangeWindowState.event;

	private _state = ExtHostWindow.InitialState;
	get state(): WindowState { return this._state; }

	constructor(mainContext: IMainContext) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadWindow);
		this._proxy.$getWindowVisibility().then(isFocused => this.$onDidChangeWindowFocus(isFocused));
	}

	$onDidChangeWindowFocus(focused: boolean): void {
		if (focused === this._state.focused) {
			return;
		}

		this._state = { ...this._state, focused };
		this._onDidChangeWindowState.fire(this._state);
	}

	openUri(stringOrUri: string | URI, options: IOpenUriOptions): Promise<boolean> {
		if (typeof stringOrUri === 'string') {
			try {
				stringOrUri = URI.parse(stringOrUri);
			} catch (e) {
				return Promise.reject(`Invalid uri - '${stringOrUri}'`);
			}
		}
		if (isFalsyOrWhitespace(stringOrUri.scheme)) {
			return Promise.reject('Invalid scheme - cannot be empty');
		} else if (stringOrUri.scheme === Schemas.command) {
			return Promise.reject(`Invalid scheme '${stringOrUri.scheme}'`);
		}
		return this._proxy.$openUri(stringOrUri, options);
	}
}
