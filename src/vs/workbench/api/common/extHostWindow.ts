/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { ExtHostWindowShape, MainContext, MainThreadWindowShape, IOpenUriOptions } from './extHost.protocol';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';
import { isFalsyOrWhitespace } from 'vs/base/common/strings';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import { ThemeColor } from 'vs/platform/theme/common/themeService';
import type * as vscode from 'vscode';
import * as extHostTypes from 'vs/workbench/api/common/extHostTypes';

export class ExtHostWindow implements ExtHostWindowShape {

	private static InitialState: vscode.WindowState = {
		focused: true
	};

	private _proxy: MainThreadWindowShape;

	private readonly _onDidChangeWindowState = new Emitter<vscode.WindowState>();
	readonly onDidChangeWindowState: Event<vscode.WindowState> = this._onDidChangeWindowState.event;

	private _state = ExtHostWindow.InitialState;
	get state(): vscode.WindowState { return this._state; }

	private _activityProviders = new Map<string, ExtHostActivityProvider>();

	constructor(@IExtHostRpcService extHostRpc: IExtHostRpcService) {
		this._proxy = extHostRpc.getProxy(MainContext.MainThreadWindow);
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

	registerActivityProvider(viewId: string, activityProvider: any): any {
		// One activity provider per view
		const previousProvider = this._activityProviders.get(viewId);
		if (previousProvider) {
			previousProvider.dispose();
		}

		let extHostActivityProvider = new ExtHostActivityProvider(this._proxy, viewId, activityProvider);
		this._activityProviders.set(viewId, extHostActivityProvider);

		return new extHostTypes.Disposable(() => {
			extHostActivityProvider.dispose();
			this._activityProviders.delete(viewId);
		});
	}
}

class ExtHostActivityProvider extends Disposable {

	constructor(private proxy: MainThreadWindowShape, private viewId: string, activityProvider: vscode.ActivityProvider) {
		super();

		// Clean up activity state when the provider is disposed
		this._register(toDisposable(() => {
			proxy.$setActivity(viewId, null);
		}));

		// Sign up for activity notifications
		if (activityProvider.onDidChangeActivity) {
			this._register(activityProvider.onDidChangeActivity(activity => { this.processActivity(activity); }));
		}
	}

	private processActivity(badge: vscode.Badge | null | undefined) {
		if (badge instanceof extHostTypes.NumberBadge) {
			this.proxy.$setActivity(this.viewId, { type: 'number', number: badge.number, label: badge.label });
		}

		else if (badge instanceof extHostTypes.TextBadge) {
			this.proxy.$setActivity(this.viewId, { type: 'text', text: badge.text, label: badge.label });
		}

		else if (badge instanceof extHostTypes.IconBadge) {
			let color: ThemeColor | undefined;
			if (badge.icon.color && badge.icon.color instanceof extHostTypes.ThemeColor) {
				color = { id: badge.icon.color.id };
			}
			this.proxy.$setActivity(this.viewId, { type: 'icon', icon: { id: badge.icon.id, color: color }, label: badge.label });
		}

		else if (badge instanceof extHostTypes.ProgressBadge) {
			this.proxy.$setActivity(this.viewId, { type: 'progress', label: badge.label });
		}
	}
}

export const IExtHostWindow = createDecorator<IExtHostWindow>('IExtHostWindow');
export interface IExtHostWindow extends ExtHostWindow, ExtHostWindowShape { }
