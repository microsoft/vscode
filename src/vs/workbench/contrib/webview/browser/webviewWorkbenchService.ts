/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from 'vs/base/common/arrays';
import { memoize } from 'vs/base/common/decorators';
import { Lazy } from 'vs/base/common/lazy';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { values } from 'vs/base/common/map';
import { isEqual } from 'vs/base/common/resources';
import { EditorActivation, IEditorModel } from 'vs/platform/editor/common/editor';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { GroupIdentifier } from 'vs/workbench/common/editor';
import { IWebviewService, WebviewContentOptions, WebviewEditorOverlay, WebviewExtensionDescription, WebviewIcons, WebviewOptions } from 'vs/workbench/contrib/webview/browser/webview';
import { IEditorGroup, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { ACTIVE_GROUP_TYPE, IEditorService, SIDE_GROUP_TYPE } from 'vs/workbench/services/editor/common/editorService';
import { WebviewInput } from './webviewEditorInput';

export const IWebviewWorkbenchService = createDecorator<IWebviewWorkbenchService>('webviewEditorService');

export interface ICreateWebViewShowOptions {
	group: IEditorGroup | GroupIdentifier | ACTIVE_GROUP_TYPE | SIDE_GROUP_TYPE;
	preserveFocus: boolean;
}

export interface WebviewInputOptions extends WebviewOptions, WebviewContentOptions {
	readonly tryRestoreScrollPosition?: boolean;
	readonly retainContextWhenHidden?: boolean;
	readonly enableCommandUris?: boolean;
}

export function areWebviewInputOptionsEqual(a: WebviewInputOptions, b: WebviewInputOptions): boolean {
	return a.enableCommandUris === b.enableCommandUris
		&& a.enableFindWidget === b.enableFindWidget
		&& a.allowScripts === b.allowScripts
		&& a.retainContextWhenHidden === b.retainContextWhenHidden
		&& a.tryRestoreScrollPosition === b.tryRestoreScrollPosition
		&& equals(a.localResourceRoots, b.localResourceRoots, isEqual)
		&& equals(a.portMapping, b.portMapping, (a, b) => a.extensionHostPort === b.extensionHostPort && a.webviewPort === b.webviewPort);
}

export interface IWebviewWorkbenchService {
	_serviceBrand: undefined;

	createWebview(
		id: string,
		viewType: string,
		title: string,
		showOptions: ICreateWebViewShowOptions,
		options: WebviewInputOptions,
		extension: WebviewExtensionDescription | undefined,
	): WebviewInput;

	reviveWebview(
		id: string,
		viewType: string,
		title: string,
		iconPath: WebviewIcons | undefined,
		state: any,
		options: WebviewInputOptions,
		extension: WebviewExtensionDescription | undefined,
		group: number | undefined
	): WebviewInput;

	revealWebview(
		webview: WebviewInput,
		group: IEditorGroup,
		preserveFocus: boolean
	): void;

	registerResolver(
		resolver: WebviewResolver
	): IDisposable;

	shouldPersist(
		input: WebviewInput
	): boolean;

	resolveWebview(
		webview: WebviewInput,
	): Promise<void>;
}

export interface WebviewResolver {
	canResolve(
		webview: WebviewInput,
	): boolean;

	resolveWebview(
		webview: WebviewInput,
	): Promise<void>;
}

function canRevive(reviver: WebviewResolver, webview: WebviewInput): boolean {
	if (webview.isDisposed()) {
		return false;
	}
	return reviver.canResolve(webview);
}


export class LazilyResolvedWebviewEditorInput extends WebviewInput {
	constructor(
		id: string,
		viewType: string,
		name: string,
		webview: Lazy<WebviewEditorOverlay>,
		@IWebviewService webviewService: IWebviewService,
		@IWebviewWorkbenchService private readonly _webviewWorkbenchService: IWebviewWorkbenchService,
	) {
		super(id, viewType, name, webview, webviewService);
	}

	@memoize
	public async resolve(): Promise<IEditorModel> {
		await this._webviewWorkbenchService.resolveWebview(this);
		return super.resolve();
	}
}


class RevivalPool {
	private _awaitingRevival: Array<{ input: WebviewInput, resolve: () => void }> = [];

	public add(input: WebviewInput, resolve: () => void) {
		this._awaitingRevival.push({ input, resolve });
	}

	public reviveFor(reviver: WebviewResolver) {
		const toRevive = this._awaitingRevival.filter(({ input }) => canRevive(reviver, input));
		this._awaitingRevival = this._awaitingRevival.filter(({ input }) => !canRevive(reviver, input));

		for (const { input, resolve } of toRevive) {
			reviver.resolveWebview(input).then(resolve);
		}
	}
}


export class WebviewEditorService implements IWebviewWorkbenchService {
	_serviceBrand: undefined;

	private readonly _revivers = new Set<WebviewResolver>();
	private readonly _revivalPool = new RevivalPool();

	constructor(
		@IEditorGroupsService private readonly _editorGroupService: IEditorGroupsService,
		@IEditorService private readonly _editorService: IEditorService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IWebviewService private readonly _webviewService: IWebviewService,
	) { }

	public createWebview(
		id: string,
		viewType: string,
		title: string,
		showOptions: ICreateWebViewShowOptions,
		options: WebviewInputOptions,
		extension: WebviewExtensionDescription | undefined,
	): WebviewInput {
		const webview = new Lazy(() => this.createWebiew(id, extension, options));
		const webviewInput = this._instantiationService.createInstance(WebviewInput, id, viewType, title, webview);
		this._editorService.openEditor(webviewInput, {
			pinned: true,
			preserveFocus: showOptions.preserveFocus,
			// preserve pre 1.38 behaviour to not make group active when preserveFocus: true
			// but make sure to restore the editor to fix https://github.com/microsoft/vscode/issues/79633
			activation: showOptions.preserveFocus ? EditorActivation.RESTORE : undefined
		}, showOptions.group);
		return webviewInput;
	}

	public revealWebview(
		webview: WebviewInput,
		group: IEditorGroup,
		preserveFocus: boolean
	): void {
		if (webview.group === group.id) {
			this._editorService.openEditor(webview, {
				preserveFocus,
				// preserve pre 1.38 behaviour to not make group active when preserveFocus: true
				// but make sure to restore the editor to fix https://github.com/microsoft/vscode/issues/79633
				activation: preserveFocus ? EditorActivation.RESTORE : undefined
			}, webview.group);
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
		iconPath: WebviewIcons | undefined,
		state: any,
		options: WebviewInputOptions,
		extension: WebviewExtensionDescription | undefined,
		group: number | undefined,
	): WebviewInput {
		const webview = new Lazy(() => {
			const webview = this.createWebiew(id, extension, options);
			webview.state = state;
			return webview;
		});

		const webviewInput = this._instantiationService.createInstance(LazilyResolvedWebviewEditorInput, id, viewType, title, webview);
		webviewInput.iconPath = iconPath;

		if (typeof group === 'number') {
			webviewInput.updateGroup(group);
		}
		return webviewInput;
	}

	public registerResolver(
		reviver: WebviewResolver
	): IDisposable {
		this._revivers.add(reviver);
		this._revivalPool.reviveFor(reviver);

		return toDisposable(() => {
			this._revivers.delete(reviver);
		});
	}

	public shouldPersist(
		webview: WebviewInput
	): boolean {
		if (values(this._revivers).some(reviver => canRevive(reviver, webview))) {
			return true;
		}

		// Revived webviews may not have an actively registered reviver but we still want to presist them
		// since a reviver should exist when it is actually needed.
		return webview instanceof LazilyResolvedWebviewEditorInput;
	}

	private async tryRevive(
		webview: WebviewInput
	): Promise<boolean> {
		for (const reviver of values(this._revivers)) {
			if (canRevive(reviver, webview)) {
				await reviver.resolveWebview(webview);
				return true;
			}
		}
		return false;
	}

	public async resolveWebview(
		webview: WebviewInput,
	): Promise<void> {
		const didRevive = await this.tryRevive(webview);
		if (!didRevive) {
			// A reviver may not be registered yet. Put into pool and resolve promise when we can revive
			let resolve: () => void;
			const promise = new Promise<void>(r => { resolve = r; });
			this._revivalPool.add(webview, resolve!);
			return promise;
		}
	}

	private createWebiew(id: string, extension: WebviewExtensionDescription | undefined, options: WebviewInputOptions) {
		const webview = this._webviewService.createWebviewEditorOverlay(id, {
			enableFindWidget: options.enableFindWidget,
			retainContextWhenHidden: options.retainContextWhenHidden
		}, options);
		webview.extension = extension;
		return webview;
	}
}

registerSingleton(IWebviewWorkbenchService, WebviewEditorService, true);
