/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as map from 'vs/base/common/map';
import { TPromise } from 'vs/base/common/winjs.base';
import { MainThreadWebviewShape, MainContext, IExtHostContext, ExtHostContext, ExtHostWebviewsShape } from 'vs/workbench/api/node/extHost.protocol';
import { IDisposable, dispose, toDisposable, Disposable } from 'vs/base/common/lifecycle';
import { extHostNamedCustomer } from './extHostCustomers';
import { EditorInput, EditorModel, EditorOptions } from 'vs/workbench/common/editor';
import { IEditorModel, Position } from 'vs/platform/editor/common/editor';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { WebviewEditor as BaseWebviewEditor, KEYBINDING_CONTEXT_WEBVIEWEDITOR_FOCUS, KEYBINDING_CONTEXT_WEBVIEWEDITOR_FIND_WIDGET_INPUT_FOCUSED, KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_VISIBLE } from 'vs/workbench/parts/html/browser/webviewEditor';
import { Builder, Dimension } from 'vs/base/browser/builder';
import { Webview } from 'vs/workbench/parts/html/browser/webview';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IPartService, Parts } from 'vs/workbench/services/part/common/partService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IEditorRegistry, EditorDescriptor, Extensions as EditorExtensions } from 'vs/workbench/browser/editor';
import { Registry } from 'vs/platform/registry/common/platform';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { localize } from 'vs/nls';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import * as vscode from 'vscode';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import URI from 'vs/base/common/uri';

interface WebviewEvents {
	onMessage(message: any): void;
	onFocus(): void;
	onBlur(): void;
}

class WebviewInput extends EditorInput {
	private _name: string;
	private _options: vscode.WebviewOptions;
	private _html: string;

	constructor(
		name: string,
		options: vscode.WebviewOptions,
		html: string,
		public readonly events: WebviewEvents
	) {
		super();
		this._name = name;
		this._options = options;
		this._html = html;
	}

	public getName(): string {
		return this._name;
	}

	public setName(value: string): void {
		this._name = value;
		this._onDidChangeLabel.fire();
	}

	public get html(): string {
		return this._html;
	}

	public set html(value: string) {
		this._html = value;
	}

	public get options(): vscode.WebviewOptions {
		return this._options;
	}

	public set options(value: vscode.WebviewOptions) {
		this._options = value;
	}

	public getTypeId(): string {
		return 'webview';
	}

	public resolve(refresh?: boolean): TPromise<IEditorModel, any> {
		return TPromise.as(new EditorModel());
	}
}

class WebviewEditor extends BaseWebviewEditor {
	private static webviewIndex = 0;

	public static readonly ID = 'WebviewEditor';

	private static readonly standardSupportedLinkSchemes = ['http', 'https', 'mailto'];

	private frame: HTMLElement;
	private container: HTMLElement;
	private webviewContent: HTMLDivElement;

	private _contentDisposables: IDisposable[] = [];

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IStorageService storageService: IStorageService,
		@IContextKeyService private _contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@IPartService private readonly _partService: IPartService,
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@IWorkspaceContextService private readonly _contextService: IWorkspaceContextService,
		@IOpenerService private readonly _openerService: IOpenerService
	) {
		super(WebviewEditor.ID, telemetryService, themeService, storageService, _contextKeyService);
	}

	protected createEditor(parent: Builder): void {
		this.frame = parent.getHTMLElement();
		this.container = this._partService.getContainer(Parts.EDITOR_PART);

		this.webviewContent = document.createElement('div');
		this.webviewContent.id = `webview-${WebviewEditor.webviewIndex++}`;
		this._contextKeyService = this._contextKeyService.createScoped(this.webviewContent);
		this.contextKey = KEYBINDING_CONTEXT_WEBVIEWEDITOR_FOCUS.bindTo(this._contextKeyService);
		this.findInputFocusContextKey = KEYBINDING_CONTEXT_WEBVIEWEDITOR_FIND_WIDGET_INPUT_FOCUSED.bindTo(this._contextKeyService);
		this.findWidgetVisible = KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_VISIBLE.bindTo(this._contextKeyService);

		this.container.appendChild(this.webviewContent);

		this.content = document.createElement('div');
		this.content.setAttribute('aria-flowto', this.webviewContent.id);

		parent.append(this.content);
		this.doUpdateContainer();
	}

	private doUpdateContainer() {
		const frameRect = this.frame.getBoundingClientRect();
		const containerRect = this.container.getBoundingClientRect();

		this.webviewContent.style.position = 'absolute';
		this.webviewContent.style.top = `${frameRect.top - containerRect.top}px`;
		this.webviewContent.style.left = `${frameRect.left - containerRect.left}px`;
		this.webviewContent.style.width = `${frameRect.width}px`;
		this.webviewContent.style.height = `${frameRect.height}px`;
	}

	public layout(dimension: Dimension): void {
		if (this._webview) {
			this.doUpdateContainer();
		}
		super.layout(dimension);
	}

	public dispose(): void {
		this._contentDisposables = dispose(this._contentDisposables);
		super.dispose();
	}

	public sendMessage(data: any): void {
		if (this._webview) {
			this._webview.sendMessage(data);
		}
	}

	public getFocusContainer(): Builder {
		return new Builder(this.webviewContent, false);
	}

	protected setEditorVisible(visible: boolean, position?: Position): void {
		if (visible) {
			this.webviewContent.style.visibility = 'visible';
			this.doUpdateContainer();
		} else {
			if (this._webview) {
				this.webviewContent.style.visibility = 'hidden';
			}
		}
		super.setEditorVisible(visible, position);
	}

	public clearInput(): void {
		if (this.input && this.input instanceof WebviewInput) {
			if (this.input.options.keepAlive) {
				// Noop
				return;
			}
		}
		super.clearInput();
	}

	async setInput(input: WebviewInput, options: EditorOptions): TPromise<void> {
		if (this.input && this.input.matches(input)) {
			return undefined;
		}

		await super.setInput(input, options);

		this.webview.options = {
			allowScripts: input.options.enableScripts,
			enableWrappedPostMessage: true
		};
		this.webview.contents = input.html;
	}

	private get webview(): Webview {
		if (!this._webview) {
			this._contentDisposables = dispose(this._contentDisposables);

			this._webview = new Webview(
				this.webviewContent,
				this._partService.getContainer(Parts.EDITOR_PART),
				this.themeService,
				this._environmentService,
				this._contextService,
				this._contextViewService,
				this.contextKey,
				this.findInputFocusContextKey,
				{
					enableWrappedPostMessage: true,
					useSameOriginForRoot: false
				});

			this._webview.onDidClickLink(this.onDidClickLink, this, this._contentDisposables);

			this._webview.onMessage(message => {
				if (this.input) {
					(this.input as WebviewInput).events.onMessage(message);
				}
			}, null, this._contentDisposables);

			this._contentDisposables.push(this._webview);
			this._contentDisposables.push(toDisposable(() => this._webview = null));
		}
		return this._webview;
	}

	private onDidClickLink(link: URI): void {
		if (!link) {
			return;
		}

		const enableCommandUris = (this.input as WebviewInput).options.enableCommandUris;
		if (WebviewEditor.standardSupportedLinkSchemes.indexOf(link.scheme) >= 0 || enableCommandUris && link.scheme === 'command') {
			this._openerService.open(link);
		}
	}
}


@extHostNamedCustomer(MainContext.MainThreadWebview)
export class MainThreadWebview implements MainThreadWebviewShape {
	private readonly _toDispose: Disposable[] = [];

	private readonly _proxy: ExtHostWebviewsShape;
	private readonly _webviews = new Map<number, WebviewInput>();
	private _activeWebview: WebviewInput | undefined = undefined;

	constructor(
		context: IExtHostContext,
		@IEditorGroupService _editorGroupService: IEditorGroupService,
		@IWorkbenchEditorService private readonly _editorService: IWorkbenchEditorService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		this._proxy = context.getProxy(ExtHostContext.ExtHostWebviews);

		_editorGroupService.onEditorsChanged(this.onEditorsChanged, this, this._toDispose);
	}

	dispose(): void {
		dispose(this._toDispose);
	}

	$createWebview(handle: number): void {
		const webview = new WebviewInput('', {}, '', {
			onMessage: (message) => this._proxy.$onMessage(handle, message),
			onFocus: () => this._proxy.$onBecameActive(handle),
			onBlur: () => this._proxy.$onBecameInactive(handle)
		});
		this._webviews.set(handle, webview);
	}

	$disposeWebview(handle: number): void {
		const webview = this._webviews.get(handle);
		this._editorService.closeEditor(Position.ONE, webview);
	}

	$setTitle(handle: number, value: string): void {
		const webview = this._webviews.get(handle);
		webview.setName(value);
	}

	$setHtml(handle: number, value: string): void {
		this.updateInput(handle, existingInput =>
			this._instantiationService.createInstance(WebviewInput, existingInput.getName(), existingInput.options, value, existingInput.events));
	}

	$setOptions(handle: number, newOptions: vscode.WebviewOptions): void {
		this.updateInput(handle, existingInput =>
			this._instantiationService.createInstance(WebviewInput, existingInput.getName(), newOptions, existingInput.html, existingInput.events));
	}

	$show(handle: number, column: Position): void {
		const webviewInput = this._webviews.get(handle);
		this._editorService.openEditor(webviewInput, { pinned: true }, column);
	}

	async $sendMessage(handle: number, message: any): Promise<boolean> {
		const webviewInput = this._webviews.get(handle);
		const editors = this._editorService.getVisibleEditors()
			.filter(e => e instanceof WebviewInput)
			.map(e => e as WebviewEditor)
			.filter(e => e.input.matches(webviewInput));

		for (const editor of editors) {
			editor.sendMessage(message);
		}

		return (editors.length > 0);
	}

	private updateInput(handle: number, f: (existingInput: WebviewInput) => WebviewInput) {
		const existingInput = this._webviews.get(handle);
		const newInput = f(existingInput);
		this._webviews.set(handle, newInput);
		this._editorService.replaceEditors([{ toReplace: existingInput, replaceWith: newInput }]);
	}

	private onEditorsChanged() {
		const activeEditor = this._editorService.getActiveEditor();
		let newActiveWebview: WebviewInput | undefined = undefined;
		if (activeEditor && activeEditor.input instanceof WebviewInput) {
			for (const handle of map.keys(this._webviews)) {
				const input = this._webviews.get(handle);
				if (input.matches(activeEditor.input)) {
					newActiveWebview = input;
					break;
				}
			}
		}

		if (newActiveWebview) {
			if (!this._activeWebview || !newActiveWebview.matches(this._activeWebview)) {
				if (this._activeWebview) {
					this._activeWebview.events.onBlur();
				}
				newActiveWebview.events.onFocus();
				this._activeWebview = newActiveWebview;
			}
		} else {
			if (this._activeWebview) {
				this._activeWebview.events.onBlur();
				this._activeWebview = undefined;
			}
		}
	}
}

(<IEditorRegistry>Registry.as(EditorExtensions.Editors)).registerEditor(new EditorDescriptor(
	WebviewEditor,
	WebviewEditor.ID,
	localize('webview.editor.label', "webview editor")),
	[new SyncDescriptor(WebviewInput)]);