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
import { WebviewEditorInput, RevivedWebviewEditorInput } from './webviewEditorInput';
import { GroupIdentifier } from 'vs/workbench/common/editor';
import { equals } from 'vs/base/common/arrays';
import { values } from 'vs/base/common/map';

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
		group: number | undefined
	): WebviewEditorInput;

	revealWebview(
		webview: WebviewEditorInput,
		group: IEditorGroup,
		preserveFocus: boolean
	): void;

	registerReviver(
		reviver: WebviewReviver
	): IDisposable;

	shouldPersist(
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

class RevivalPool {
	private _awaitingRevival: Array<{ input: WebviewEditorInput, resolve: () => void }> = [];

	public add(input: WebviewEditorInput, resolve: () => void) {
		this._awaitingRevival.push({ input, resolve });
	}

	public reviveFor(reviver: WebviewReviver) {
		const toRevive = this._awaitingRevival.filter(x => reviver.canRevive(x.input));
		this._awaitingRevival = this._awaitingRevival.filter(x => !reviver.canRevive(x.input));

		for (const { input, resolve } of toRevive) {
			reviver.reviveWebview(input).then(resolve);
		}
	}
}

export class WebviewEditorService implements IWebviewEditorService {
	_serviceBrand: any;

	private readonly _revivers = new Set<WebviewReviver>();
	private readonly _revivalPool = new RevivalPool();

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
			const groupView = this._editorGroupService.getGroup(webview.group!);
			if (groupView) {
				groupView.moveEditor(webview, group, { preserveFocus });
			}
		}
	}

	reviveWebview(
		viewType: string,
		id: number,
		title: string,
		iconPath: { light: URI, dark: URI } | undefined,
		state: any,
		options: WebviewInputOptions,
		extensionLocation: URI,
		group: number | undefined,
	): WebviewEditorInput {
		const webviewInput = this._instantiationService.createInstance(RevivedWebviewEditorInput, viewType, id, title, options, state, {}, extensionLocation, async (webview: WebviewEditorInput): Promise<void> => {
			const didRevive = await this.tryRevive(webview);
			if (didRevive) {
				return Promise.resolve(undefined);
			}

			// A reviver may not be registered yet. Put into pool and resolve promise when we can revive
			let resolve: () => void;
			const promise = new Promise<void>(r => { resolve = r; });
			this._revivalPool.add(webview, resolve!);
			return promise;
		});
		webviewInput.iconPath = iconPath;
		if (typeof group === 'number') {
			webviewInput.updateGroup(group);
		}
		return webviewInput;
	}

	registerReviver(
		reviver: WebviewReviver
	): IDisposable {
		this._revivers.add(reviver);
		this._revivalPool.reviveFor(reviver);

		return toDisposable(() => {
			this._revivers.delete(reviver);
		});
	}

	shouldPersist(
		webview: WebviewEditorInput
	): boolean {
		// Has no state, don't persist
		if (!webview.state) {
			return false;
		}

		if (values(this._revivers).some(reviver => reviver.canRevive(webview))) {
			return true;
		}

		return !(webview instanceof RevivedWebviewEditorInput);
	}

	private async tryRevive(
		webview: WebviewEditorInput
	): Promise<boolean> {
		for (const reviver of values(this._revivers)) {
			if (reviver.canRevive(webview)) {
				await reviver.reviveWebview(webview);
				return true;
			}
		}
		return false;
	}
}
