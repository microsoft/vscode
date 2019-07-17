/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from 'vs/base/common/arrays';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { values } from 'vs/base/common/map';
import { URI } from 'vs/base/common/uri';
import { IWebviewOptions, IWebviewPanelOptions } from 'vs/editor/common/modes';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { GroupIdentifier } from 'vs/workbench/common/editor';
import { IEditorGroup, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { ACTIVE_GROUP_TYPE, IEditorService, SIDE_GROUP_TYPE } from 'vs/workbench/services/editor/common/editorService';
import { RevivedWebviewEditorInput, WebviewEditorInput } from './webviewEditorInput';

export const IWebviewEditorService = createDecorator<IWebviewEditorService>('webviewEditorService');

export interface ICreateWebViewShowOptions {
	group: IEditorGroup | GroupIdentifier | ACTIVE_GROUP_TYPE | SIDE_GROUP_TYPE;
	preserveFocus: boolean;
}

export interface IWebviewEditorService {
	_serviceBrand: any;

	createWebview(
		id: string,
		viewType: string,
		title: string,
		showOptions: ICreateWebViewShowOptions,
		options: WebviewInputOptions,
		extension: undefined | {
			location: URI,
			id: ExtensionIdentifier
		},
		events: WebviewEvents
	): WebviewEditorInput;

	reviveWebview(
		id: string,
		viewType: string,
		title: string,
		iconPath: { light: URI, dark: URI } | undefined,
		state: any,
		options: WebviewInputOptions,
		extension: undefined | {
			readonly location: URI,
			readonly id?: ExtensionIdentifier
		},
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
	onDidClickLink?(link: URI, options: IWebviewOptions): void;
	onDidUpdateWebviewState?(newState: any): void;
}

export interface WebviewInputOptions extends IWebviewOptions, IWebviewPanelOptions {
	tryRestoreScrollPosition?: boolean;
}

export function areWebviewInputOptionsEqual(a: WebviewInputOptions, b: WebviewInputOptions): boolean {
	return a.enableCommandUris === b.enableCommandUris
		&& a.enableFindWidget === b.enableFindWidget
		&& a.enableScripts === b.enableScripts
		&& a.retainContextWhenHidden === b.retainContextWhenHidden
		&& a.tryRestoreScrollPosition === b.tryRestoreScrollPosition
		&& (a.localResourceRoots === b.localResourceRoots || (Array.isArray(a.localResourceRoots) && Array.isArray(b.localResourceRoots) && equals(a.localResourceRoots, b.localResourceRoots, (a, b) => a.toString() === b.toString())))
		&& (a.portMapping === b.portMapping || (Array.isArray(a.portMapping) && Array.isArray(b.portMapping) && equals(a.portMapping, b.portMapping, (a, b) => a.extensionHostPort === b.extensionHostPort && a.webviewPort === b.webviewPort)));
}

function canRevive(reviver: WebviewReviver, webview: WebviewEditorInput): boolean {
	if (webview.isDisposed()) {
		return false;
	}
	return reviver.canRevive(webview);
}

class RevivalPool {
	private _awaitingRevival: Array<{ input: WebviewEditorInput, resolve: () => void }> = [];

	public add(input: WebviewEditorInput, resolve: () => void) {
		this._awaitingRevival.push({ input, resolve });
	}

	public reviveFor(reviver: WebviewReviver) {
		const toRevive = this._awaitingRevival.filter(({ input }) => canRevive(reviver, input));
		this._awaitingRevival = this._awaitingRevival.filter(({ input }) => !canRevive(reviver, input));

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

	public createWebview(
		id: string,
		viewType: string,
		title: string,
		showOptions: ICreateWebViewShowOptions,
		options: IWebviewOptions,
		extension: undefined | {
			location: URI,
			id: ExtensionIdentifier
		},
		events: WebviewEvents
	): WebviewEditorInput {
		const webviewInput = this._instantiationService.createInstance(WebviewEditorInput, id, viewType, title, options, {}, events, extension);
		this._editorService.openEditor(webviewInput, { pinned: true, preserveFocus: showOptions.preserveFocus }, showOptions.group);
		return webviewInput;
	}

	public revealWebview(
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

	public reviveWebview(
		id: string,
		viewType: string,
		title: string,
		iconPath: { light: URI, dark: URI } | undefined,
		state: any,
		options: WebviewInputOptions,
		extension: undefined | {
			readonly location: URI,
			readonly id?: ExtensionIdentifier
		},
		group: number | undefined,
	): WebviewEditorInput {
		const webviewInput = this._instantiationService.createInstance(RevivedWebviewEditorInput, id, viewType, title, options, state, {}, extension, async (webview: WebviewEditorInput): Promise<void> => {
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

	public registerReviver(
		reviver: WebviewReviver
	): IDisposable {
		this._revivers.add(reviver);
		this._revivalPool.reviveFor(reviver);

		return toDisposable(() => {
			this._revivers.delete(reviver);
		});
	}

	public shouldPersist(
		webview: WebviewEditorInput
	): boolean {
		// Has no state, don't persist
		if (!webview.state) {
			return false;
		}

		if (values(this._revivers).some(reviver => canRevive(reviver, webview))) {
			return true;
		}

		// Revived webviews may not have an actively registered reviver but we still want to presist them
		// since a reviver should exist when it is actually needed.
		return webview instanceof RevivedWebviewEditorInput;
	}

	private async tryRevive(
		webview: WebviewEditorInput
	): Promise<boolean> {
		for (const reviver of values(this._revivers)) {
			if (canRevive(reviver, webview)) {
				await reviver.reviveWebview(webview);
				return true;
			}
		}
		return false;
	}
}
