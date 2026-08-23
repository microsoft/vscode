/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Schemas } from '../../../base/common/network.js';
import { isFalsyOrWhitespace } from '../../../base/common/strings.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { WindowState } from 'vscode';
import { ExtHostWindowShape, IOpenUriOptions, MainContext, MainThreadWindowShape } from './extHost.protocol.js';
import { IExtHostInitDataService } from './extHostInitDataService.js';
import { decodeBase64 } from '../../../base/common/buffer.js';

export class ExtHostWindow implements ExtHostWindowShape {

	declare _serviceBrand: undefined;

	private static InitialState: WindowState = {
		focused: true,
		active: true,
	};

	private _proxy: MainThreadWindowShape;

	private readonly _onDidChangeWindowState = new Emitter<WindowState>();
	readonly onDidChangeWindowState: Event<WindowState> = this._onDidChangeWindowState.event;

	private _nativeHandle: Uint8Array | undefined;
	private _state = ExtHostWindow.InitialState;

	getState(): WindowState {
		// todo@connor4312: this can be changed to just return this._state after proposed api is finalized
		const state = this._state;

		return {
			get focused() {
				return state.focused;
			},
			get active() {
				return state.active;
			},
		};
	}

	constructor(
		@IExtHostInitDataService initData: IExtHostInitDataService,
		@IExtHostRpcService extHostRpc: IExtHostRpcService
	) {
		if (initData.handle) {
			this._nativeHandle = decodeBase64(initData.handle).buffer;
		}
		this._proxy = extHostRpc.getProxy(MainContext.MainThreadWindow);
		this._proxy.$getInitialState().then(({ isFocused, isActive }) => {
			this.onDidChangeWindowProperty('focused', isFocused);
			this.onDidChangeWindowProperty('active', isActive);
		});
	}

	get nativeHandle(): Uint8Array | undefined {
		return this._nativeHandle;
	}

	$onDidChangeActiveNativeWindowHandle(handle: string | undefined): void {
		this._nativeHandle = handle ? decodeBase64(handle).buffer : undefined;
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
