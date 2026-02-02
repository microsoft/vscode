/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { ExtHostWindowShape, MainContext, MainThreadWindowShape, IOpenUriOptions } from './extHost.protocol';
import { WindowState } from 'vscode';
import { URI } from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';
import { isFalsyOrWhitespace } from 'vs/base/common/strings';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import { IRelaxedExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { checkProposedApiEnabled } from 'vs/workbench/services/extensions/common/extensions';

export class ExtHostWindow implements ExtHostWindowShape {

	private static InitialState: WindowState = {
		focused: true,
		active: true,
	};

	private _proxy: MainThreadWindowShape;

	private readonly _onDidChangeWindowState = new Emitter<WindowState>();
	readonly onDidChangeWindowState: Event<WindowState> = this._onDidChangeWindowState.event;

	private _state = ExtHostWindow.InitialState;

	getState(extension: Readonly<IRelaxedExtensionDescription>): WindowState {
		// todo@connor4312: this can be changed to just return this._state after proposed api is finalized
		const state = this._state;

		return {
			get focused() {
				return state.focused;
			},
			get active() {
				checkProposedApiEnabled(extension, 'windowActivity');
				return state.active;
			},
		};
	}

	constructor(@IExtHostRpcService extHostRpc: IExtHostRpcService) {
		this._proxy = extHostRpc.getProxy(MainContext.MainThreadWindow);
		this._proxy.$getInitialState().then(({ isFocused, isActive }) => {
			this.onDidChangeWindowProperty('focused', isFocused);
			this.onDidChangeWindowProperty('active', isActive);
		});
	}

	$onDidChangeWindowFocus(value: boolean) {
		this.onDidChangeWindowProperty('focused', value);
	}

	$onDidChangeWindowActive(value: boolean) {
		this.onDidChangeWindowProperty('active', value);
	}

	onDidChangeWindowProperty(property: keyof WindowState, value: boolean): void {
		if (value === this._state[property]) {
			return;
		}

		this._state = { ...this._state, [property]: value };
		this._onDidChangeWindowState.fire(this._state);
	}

	openUri(stringOrUri: string | URI, options: IOpenUriOptions): Promise<boolean> {
		let uriAsString: string | undefined;
		if (typeof stringOrUri === 'string') {
			uriAsString = stringOrUri;
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
		return this._proxy.$openUri(stringOrUri, uriAsString, options);
	}

	async asExternalUri(uri: URI, options: IOpenUriOptions): Promise<URI> {
		if (isFalsyOrWhitespace(uri.scheme)) {
			return Promise.reject('Invalid scheme - cannot be empty');
		}

		const result = await this._proxy.$asExternalUri(uri, options);
		return URI.from(result);
	}
}

export const IExtHostWindow = createDecorator<IExtHostWindow>('IExtHostWindow');
export interface IExtHostWindow extends ExtHostWindow, ExtHostWindowShape { }
