/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IInstantiationService, createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IEditorService, ACTIVE_GROUP_TYPE, SIDE_GROUP_TYPE } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupsService, IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import * as vscode from 'vscode';
import { WebviewEditorInput } from './webviewEditorInput';
import { GroupIdentifier } from 'vs/workbench/common/editor';
import { equals } from 'vs/base/common/arrays';

export const IWebviewEditorService = createDecorator<IWebviewEditorService>('webviewEditorService');

export interface ICreateWebViewShowOptions {
	group: IEditorGroup | GroupIdentifier | ACTIVE_GROUP_TYPE | SIDE_GROUP_TYPE;
	preserveFocus: boolean;
}

export interface IWebviewEditorService {
	_serviceBrand: any;

	createWebview(
		viewType: string,
		title: string,
		showOptions: ICreateWebViewShowOptions,
		options: WebviewInputOptions,
		extensionLocation: URI | undefined,
		events: WebviewEvents
	): WebviewEditorInput;

	reviveWebview(
		viewType: string,
		id: number,
		title: string,
		iconPath: { light: URI, dark: URI } | undefined,
		state: any,
		options: WebviewInputOptions,
		extensionLocation: URI | undefined,
	): WebviewEditorInput;

	revealWebview(
		webview: WebviewEditorInput,
		group: IEditorGroup,
		preserveFocus: boolean
	): void;

	registerReviver(
		viewType: string,
		reviver: WebviewReviver
	): IDisposable;

	canRevive(
		input: WebviewEditorInput
	): boolean;
}

export interface WebviewReviver {
	canRevive(
		webview: WebviewEditorInput
	): boolean;

	reviveWebview(
		webview: WebviewEditorInput
	): Promise<void>;
}

export interface WebviewEvents {
	onMessage?(message: any): void;
	onDispose?(): void;
	onDidClickLink?(link: URI, options: vscode.WebviewOptions): void;
}

export interface WebviewInputOptions extends vscode.WebviewOptions, vscode.WebviewPanelOptions {
	tryRestoreScrollPosition?: boolean;
}

export function areWebviewInputOptionsEqual(a: WebviewInputOptions, b: WebviewInputOptions): boolean {
	return a.enableCommandUris === b.enableCommandUris
		&& a.enableFindWidget === b.enableFindWidget
		&& a.enableScripts === b.enableScripts
		&& a.retainContextWhenHidden === b.retainContextWhenHidden
		&& a.tryRestoreScrollPosition === b.tryRestoreScrollPosition
		&& (a.localResourceRoots === b.localResourceRoots || (Array.isArray(a.localResourceRoots) && Array.isArray(b.localResourceRoots) && equals(a.localResourceRoots, b.localResourceRoots, (a, b) => a.toString() === b.toString())));
}

export class WebviewEditorService implements IWebviewEditorService {
	_serviceBrand: any;

	private readonly _revivers = new Map<string, WebviewReviver>();
	private _awaitingRevival: { input: WebviewEditorInput, resolve: (x: any) => void }[] = [];

	constructor(
		@IEditorService private readonly _editorService: IEditorService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IEditorGroupsService private readonly _editorGroupService: IEditorGroupsService,
	) { }

	createWebview(
		viewType: string,
		title: string,
		showOptions: ICreateWebViewShowOptions,
		options: vscode.WebviewOptions,
		extensionLocation: URI | undefined,
		events: WebviewEvents
	): WebviewEditorInput {
		const webviewInput = this._instantiationService.createInstance(WebviewEditorInput, viewType, undefined, title, options, {}, events, extensionLocation, undefined);
		this._editorService.openEditor(webviewInput, { pinned: true, preserveFocus: showOptions.preserveFocus }, showOptions.group);
		return webviewInput;
	}

	revealWebview(
		webview: WebviewEditorInput,
		group: IEditorGroup,
		preserveFocus: boolean
	): void {
		if (webview.group === group.id) {
			this._editorService.openEditor(webview, { preserveFocus }, webview.group);
		} else {
			this._editorGroupService.getGroup(webview.group!).moveEditor(webview, group, { preserveFocus });
		}
	}

	reviveWebview(
		viewType: string,
		id: number,
		title: string,
		iconPath: { light: URI, dark: URI } | undefined,
		state: any,
		options: WebviewInputOptions,
		extensionLocation: URI
	): WebviewEditorInput {
		const webviewInput = this._instantiationService.createInstance(WebviewEditorInput, viewType, id, title, options, state, {}, extensionLocation, {
			canRevive: (_webview) => {
				return true;
			},
			reviveWebview: (webview: WebviewEditorInput): Promise<void> => {
				return this.tryRevive(webview).then(didRevive => {
					if (didRevive) {
						return Promise.resolve(undefined);
					}

					// A reviver may not be registered yet. Put into queue and resolve promise when we can revive
					let resolve: (value: void) => void;
					const promise = new Promise<void>(r => { resolve = r; });
					this._awaitingRevival.push({ input: webview, resolve: resolve! });
					return promise;
				});
			}
		});
		webviewInput.iconPath = iconPath;
		return webviewInput;
	}

	registerReviver(
		viewType: string,
		reviver: WebviewReviver
	): IDisposable {
		if (this._revivers.has(viewType)) {
			throw new Error(`Reviver for ${viewType} already registered`);
		}
		this._revivers.set(viewType, reviver);

		// Resolve any pending views
		const toRevive = this._awaitingRevival.filter(x => reviver.canRevive(x.input));
		this._awaitingRevival = this._awaitingRevival.filter(x => !reviver.canRevive(x.input));

		for (const input of toRevive) {
			reviver.reviveWebview(input.input).then(() => input.resolve(undefined));
		}

		return toDisposable(() => {
			this._revivers.delete(viewType);
		});
	}

	canRevive(
		webview: WebviewEditorInput
	): boolean {
		const viewType = webview.viewType;
		const reviver = this._revivers.get(viewType);
		return !!reviver && reviver.canRevive(webview);
	}

	private async tryRevive(
		webview: WebviewEditorInput
	): Promise<boolean> {
		const reviver = this._revivers.get(webview.viewType);
		if (!reviver || !reviver.canRevive(webview)) {
			return false;
		}

		await reviver.reviveWebview(webview);
		return true;
	}
}
