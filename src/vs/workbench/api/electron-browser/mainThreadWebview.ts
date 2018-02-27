/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as map from 'vs/base/common/map';
import { TPromise } from 'vs/base/common/winjs.base';
import { MainThreadWebviewsShape, MainContext, IExtHostContext, ExtHostContext, ExtHostWebviewsShape, WebviewHandle } from 'vs/workbench/api/node/extHost.protocol';
import { IDisposable, dispose, Disposable } from 'vs/base/common/lifecycle';
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
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import URI from 'vs/base/common/uri';
import DOM = require('vs/base/browser/dom');
import Event, { Emitter } from 'vs/base/common/event';


interface WebviewEvents {
	onMessage(message: any): void;
	onDidChangePosition(newPosition: Position): void;
	onDispose(): void;
	onDidClickLink(link: URI, options: vscode.WebviewOptions): void;
}

class WebviewInput extends EditorInput {
	private static handlePool = 0;

	private readonly _resource: URI;
	private _name: string;
	private _options: vscode.WebviewOptions;
	private _html: string;
	private _events: WebviewEvents | undefined;
	private _container: HTMLElement;
	private _webview: Webview | undefined;
	private _webviewOwner: any;
	private _webviewDisposables: IDisposable[] = [];

	public static create(
		resource: URI,
		name: string,
		options: vscode.WebviewOptions,
		html: string,
		events: WebviewEvents,
		partService: IPartService
	): WebviewInput {
		const id = WebviewInput.handlePool++;
		const webviewContainer = document.createElement('div');
		webviewContainer.id = `webview-${id}`;

		partService.getContainer(Parts.EDITOR_PART).appendChild(webviewContainer);

		return new WebviewInput(resource, name, options, html, events, webviewContainer, undefined);
	}

	constructor(
		resource: URI,
		name: string,
		options: vscode.WebviewOptions,
		html: string,
		events: WebviewEvents,
		container: HTMLElement,
		webview: Webview | undefined
	) {
		super();
		this._resource = resource;
		this._name = name;
		this._options = options;
		this._html = html;
		this._events = events;

		this._container = container;
		this._webview = webview;
	}

	public getTypeId(): string {
		return 'webview';
	}

	public dispose() {
		this.disposeWebview();

		if (this._container) {
			this._container.remove();
			this._container = undefined;
		}

		if (this._events) {
			this._events.onDispose();
			this._events = undefined;
		}

		super.dispose();
	}

	public getResource(): URI {
		return this._resource;
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

	public setHtml(value: string): void {
		this._html = value;

		if (this._webview) {
			this._webview.contents = value;
		}
	}

	public get options(): vscode.WebviewOptions {
		return this._options;
	}

	public set options(value: vscode.WebviewOptions) {
		this._options = value;
	}

	public resolve(refresh?: boolean): TPromise<IEditorModel, any> {
		return TPromise.as(new EditorModel());
	}

	public supportsSplitEditor() {
		return false;
	}

	public get container(): HTMLElement {
		return this._container;
	}

	public get webview(): Webview | undefined {
		return this._webview;
	}

	public set webview(value: Webview) {
		this._webviewDisposables = dispose(this._webviewDisposables);

		this._webview = value;

		this._webview.onDidClickLink(link => {
			if (this._events) {
				this._events.onDidClickLink(link, this._options);
			}
		}, null, this._webviewDisposables);

		this._webview.onMessage(message => {
			if (this._events) {
				this._events.onMessage(message);
			}
		}, null, this._webviewDisposables);
	}

	public claimWebview(owner: any) {
		this._webviewOwner = owner;
	}

	public releaseWebview(owner: any) {
		if (this._webviewOwner === owner) {
			this._webviewOwner = undefined;
			if (this._options.retainContextWhenHidden) {
				this.container.style.visibility = 'hidden';
			} else {
				this.disposeWebview();
			}
		}
	}

	public disposeWebview() {
		// The input owns the webview and its parent
		if (this._webview) {
			this._webview.dispose();
			this._webview = undefined;
		}

		this._webviewDisposables = dispose(this._webviewDisposables);

		this._webviewOwner = undefined;
		this.container.style.visibility = 'hidden';
	}

	public onDidChangePosition(position: Position) {
		if (this._events) {
			this._events.onDidChangePosition(position);
		}
	}
}

class WebviewEditor extends BaseWebviewEditor {

	public static readonly ID = 'WebviewEditor';

	private editorFrame: HTMLElement;
	private webviewContent: HTMLElement;
	private _onDidFocusWebview: Emitter<void>;
	private _webviewFocusTracker?: DOM.IFocusTracker;
	private _webviewFocusListenerDisposable?: IDisposable;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IStorageService storageService: IStorageService,
		@IThemeService themeService: IThemeService,
		@IContextKeyService private _contextKeyService: IContextKeyService,
		@IPartService private readonly _partService: IPartService,
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@IWorkspaceContextService private readonly _contextService: IWorkspaceContextService
	) {
		super(WebviewEditor.ID, telemetryService, themeService, storageService, _contextKeyService);

		this._onDidFocusWebview = new Emitter<void>();
	}

	protected createEditor(parent: Builder): void {
		this.editorFrame = parent.getHTMLElement();
		this.content = document.createElement('div');
		parent.append(this.content);
	}

	private doUpdateContainer() {
		const webviewContainer = this.input && (this.input as WebviewInput).container;
		if (webviewContainer) {
			const frameRect = this.editorFrame.getBoundingClientRect();
			const containerRect = webviewContainer.parentElement.getBoundingClientRect();

			webviewContainer.style.position = 'absolute';
			webviewContainer.style.top = `${frameRect.top - containerRect.top}px`;
			webviewContainer.style.left = `${frameRect.left - containerRect.left}px`;
			webviewContainer.style.width = `${frameRect.width}px`;
			webviewContainer.style.height = `${frameRect.height}px`;
		}
	}

	public layout(dimension: Dimension): void {
		if (this._webview) {
			this.doUpdateContainer();
		}
		super.layout(dimension);
	}

	public dispose(): void {
		// Let the editor input dispose of the webview.
		this._webview = undefined;
		this.webviewContent = undefined;

		this._onDidFocusWebview.dispose();

		if (this._webviewFocusTracker) {
			this._webviewFocusTracker.dispose();
		}

		if (this._webviewFocusListenerDisposable) {
			this._webviewFocusListenerDisposable.dispose();
		}

		super.dispose();
	}

	public sendMessage(data: any): void {
		if (this._webview) {
			this._webview.sendMessage(data);
		}
	}

	public get onDidFocus(): Event<any> {
		return this._onDidFocusWebview.event;
	}

	protected setEditorVisible(visible: boolean, position?: Position): void {
		if (this.input && this.input instanceof WebviewInput) {
			if (visible) {
				this.input.claimWebview(this);
			} else {
				this.input.releaseWebview(this);
			}

			this.updateWebview(this.input as WebviewInput);
		}

		if (this.webviewContent) {
			if (visible) {
				this.webviewContent.style.visibility = 'visible';
				this.doUpdateContainer();
			} else {
				this.webviewContent.style.visibility = 'hidden';
			}
		}
		super.setEditorVisible(visible, position);
	}

	public clearInput() {
		if (this.input && this.input instanceof WebviewInput) {
			this.input.releaseWebview(this);
		}

		this._webview = undefined;
		this.webviewContent = undefined;

		super.clearInput();
	}

	async setInput(input: WebviewInput, options: EditorOptions): TPromise<void> {
		if (this.input && this.input.matches(input)) {
			return undefined;
		}

		if (this.input && this.input.getResource().fsPath !== input.getResource().fsPath) {
			(this.input as WebviewInput).releaseWebview(this);
			this._webview = undefined;
			this.webviewContent = undefined;
		}

		await super.setInput(input, options);

		input.onDidChangePosition(this.position);
		this.updateWebview(input);
	}

	private updateWebview(input: WebviewInput) {
		const webview = this.getWebview(input);
		input.claimWebview(this);
		webview.options = {
			allowScripts: input.options.enableScripts,
			enableWrappedPostMessage: true,
			useSameOriginForRoot: false,
			localResourceRoots: (input && input.options.localResourceRoots) || this._contextService.getWorkspace().folders.map(x => x.uri)
		};
		webview.contents = input.html;
		this.webviewContent.style.visibility = 'visible';
		this.doUpdateContainer();
	}

	private getWebview(input: WebviewInput): Webview {
		if (this._webview) {
			return this._webview;
		}

		this.webviewContent = input.container;
		const existing = input.webview;
		if (existing) {
			this._webview = existing;
			return existing;
		}

		this._webviewFocusTracker = DOM.trackFocus(this.webviewContent);
		this._webviewFocusListenerDisposable = this._webviewFocusTracker.onDidFocus(() => {
			this._onDidFocusWebview.fire();
		});

		this._contextKeyService = this._contextKeyService.createScoped(this.webviewContent);
		this.contextKey = KEYBINDING_CONTEXT_WEBVIEWEDITOR_FOCUS.bindTo(this._contextKeyService);
		this.findInputFocusContextKey = KEYBINDING_CONTEXT_WEBVIEWEDITOR_FIND_WIDGET_INPUT_FOCUSED.bindTo(this._contextKeyService);
		this.findWidgetVisible = KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_VISIBLE.bindTo(this._contextKeyService);

		this._webview = new Webview(
			this.webviewContent,
			this._partService.getContainer(Parts.EDITOR_PART),
			this.themeService,
			this._environmentService,
			this._contextViewService,
			this.contextKey,
			this.findInputFocusContextKey,
			{
				enableWrappedPostMessage: true,
				useSameOriginForRoot: false
			});
		input.webview = this._webview;

		this.content.setAttribute('aria-flowto', this.webviewContent.id);

		this.doUpdateContainer();
		return this._webview;
	}
}


@extHostNamedCustomer(MainContext.MainThreadWebviews)
export class MainThreadWebviews implements MainThreadWebviewsShape {
	private static readonly standardSupportedLinkSchemes = ['http', 'https', 'mailto'];

	private _toDispose: Disposable[] = [];

	private readonly _proxy: ExtHostWebviewsShape;
	private readonly _webviews = new Map<WebviewHandle, WebviewInput>();

	private _activeWebview: WebviewInput | undefined = undefined;

	constructor(
		context: IExtHostContext,
		@IEditorGroupService _editorGroupService: IEditorGroupService,
		@IContextKeyService _contextKeyService: IContextKeyService,
		@IPartService private readonly _partService: IPartService,
		@IWorkbenchEditorService private readonly _editorService: IWorkbenchEditorService,
		@IOpenerService private readonly _openerService: IOpenerService
	) {
		this._proxy = context.getProxy(ExtHostContext.ExtHostWebviews);
		_editorGroupService.onEditorsChanged(this.onEditorsChanged, this, this._toDispose);
	}

	dispose(): void {
		this._toDispose = dispose(this._toDispose);
	}

	$createWebview(handle: WebviewHandle, uri: URI, title: string, column: Position, options: vscode.WebviewOptions): void {
		const webviewInput = WebviewInput.create(URI.revive(uri), title, options, '', {
			onMessage: message => this._proxy.$onMessage(handle, message),
			onDidChangePosition: position => this._proxy.$onDidChangePosition(handle, position),
			onDispose: () => this._proxy.$onDidDisposeWeview(handle),
			onDidClickLink: (link, options) => this.onDidClickLink(link, options)
		}, this._partService);

		this._webviews.set(handle, webviewInput);

		this._editorService.openEditor(webviewInput, { pinned: true }, column);
	}

	$disposeWebview(handle: WebviewHandle): void {
		const webview = this.getWebview(handle);
		this._editorService.closeEditors({ positionOne: [webview], positionTwo: [webview], positionThree: [webview] });
	}

	$setTitle(handle: WebviewHandle, value: string): void {
		const webview = this.getWebview(handle);
		webview.setName(value);
	}

	$setHtml(handle: WebviewHandle, value: string): void {
		const webview = this.getWebview(handle);
		webview.setHtml(value);
	}

	$show(handle: WebviewHandle, column: Position): void {
		const webviewInput = this.getWebview(handle);
		this._editorService.openEditor(webviewInput, { pinned: true }, column);
	}

	async $sendMessage(handle: WebviewHandle, message: any): Promise<boolean> {
		const webviewInput = this.getWebview(handle);
		const editors = this._editorService.getVisibleEditors()
			.filter(e => e instanceof WebviewEditor)
			.map(e => e as WebviewEditor)
			.filter(e => e.input.matches(webviewInput));

		for (const editor of editors) {
			editor.sendMessage(message);
		}

		return (editors.length > 0);
	}

	private getWebview(handle: number): WebviewInput {
		const webviewInput = this._webviews.get(handle);
		if (!webviewInput) {
			throw new Error('Unknown webview handle:' + handle);
		}
		return webviewInput;
	}

	private onEditorsChanged() {
		const activeEditor = this._editorService.getActiveEditor();
		let newActiveWebview: { input: WebviewInput, handle: WebviewHandle } | undefined = undefined;
		if (activeEditor && activeEditor.input instanceof WebviewInput) {
			for (const handle of map.keys(this._webviews)) {
				const input = this._webviews.get(handle);
				if (input.matches(activeEditor.input)) {
					newActiveWebview = { input, handle };
					break;
				}
			}
		}

		if (newActiveWebview) {
			if (!this._activeWebview || !newActiveWebview.input.matches(this._activeWebview)) {
				this._proxy.$onDidChangeActiveWeview(newActiveWebview.handle);
				this._activeWebview = newActiveWebview.input;
			}
		} else {
			if (this._activeWebview) {
				this._proxy.$onDidChangeActiveWeview(undefined);
				this._activeWebview = undefined;
			}
		}
	}

	private onDidClickLink(link: URI, options: vscode.WebviewOptions): void {
		if (!link) {
			return;
		}

		const enableCommandUris = options.enableCommandUris;
		if (MainThreadWebviews.standardSupportedLinkSchemes.indexOf(link.scheme) >= 0 || enableCommandUris && link.scheme === 'command') {
			this._openerService.open(link);
		}
	}
}

(<IEditorRegistry>Registry.as(EditorExtensions.Editors)).registerEditor(new EditorDescriptor(
	WebviewEditor,
	WebviewEditor.ID,
	localize('webview.editor.label', "webview editor")),
	[new SyncDescriptor(WebviewInput)]);
