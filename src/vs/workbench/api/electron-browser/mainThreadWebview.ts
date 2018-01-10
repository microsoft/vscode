/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { MainThreadWebviewShape, MainContext, IExtHostContext, ExtHostContext, ExtHostWebviewsShape } from 'vs/workbench/api/node/extHost.protocol';
import { IDisposable, dispose, toDisposable } from 'vs/base/common/lifecycle';
import { extHostNamedCustomer } from './extHostCustomers';
import { EditorInput, EditorModel, EditorOptions } from 'vs/workbench/common/editor';
import { IEditorModel, Position } from 'vs/platform/editor/common/editor';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { WebviewEditor as BaseWebviewEditor } from 'vs/workbench/parts/html/browser/webviewEditor';
import { Builder, Dimension } from 'vs/base/browser/builder';
import { append, $ } from 'vs/base/browser/dom';
import WebView from 'vs/workbench/parts/html/browser/webview';
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


class WebviewInput extends EditorInput {
	private _name: string;
	private _options: vscode.WebviewOptions;
	private _html: string;

	constructor(
		name: string,
		options: vscode.WebviewOptions,
		html: string,
		public readonly onMessage: (message: any) => void
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
	static ID = 'WebviewEditor';

	private contentDisposables: IDisposable[] = [];

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IStorageService storageService: IStorageService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@IPartService private partService: IPartService,
		@IContextViewService private _contextViewService: IContextViewService,
		@IEnvironmentService private _environmentService: IEnvironmentService,
		@IOpenerService private _openerService: IOpenerService

	) {
		super(WebviewEditor.ID, telemetryService, themeService, storageService, contextKeyService);
	}

	protected createEditor(parent: Builder): void {
		const container = parent.getHTMLElement();
		this.content = append(container, $('.release-notes', { 'style': 'height: 100%; position: relative; overflow: hidden;' }));
	}

	public layout(dimension: Dimension): void {
		if (this._webview) {
			this._webview.layout();
		}
	}

	public sendMessage(data: any): void {
		if (this._webview) {
			this._webview.sendMessage(data);
		}
	}

	async setInput(input: WebviewInput, options: EditorOptions): TPromise<void> {
		if (this.input && this.input.matches(input)) {
			return undefined;
		}

		this.contentDisposables = dispose(this.contentDisposables);
		this.content.innerHTML = '';

		await super.setInput(input, options);

		this._webview = new WebView(
			this.content,
			this.partService.getContainer(Parts.EDITOR_PART),
			this._environmentService,
			this._contextViewService,
			this.contextKey,
			this.findInputFocusContextKey,
			{ allowScripts: true },
			false);

		this._webview.options = {
			allowScripts: input.options.enableScripts,
			enableWrappedPostMessage: true
		};

		this._webview.style(this.themeService.getTheme());
		this._webview.contents = [input.html];

		this._webview.onDidClickLink(link => {
			// Whitelist supported schemes for links
			if (link && ['http', 'https', 'mailto'].indexOf(link.scheme) >= 0) {
				this._openerService.open(link);
			}
		}, null, this.contentDisposables);
		this._webview.onMessage(message => {
			input.onMessage(message);
		});
		this.themeService.onThemeChange(theme => this._webview.style(theme), null, this.contentDisposables);

		this.contentDisposables.push(this._webview);
		this.contentDisposables.push(toDisposable(() => this._webview = null));
	}
}


@extHostNamedCustomer(MainContext.MainThreadWebview)
export class MainThreadWebview implements MainThreadWebviewShape {
	private readonly _proxy: ExtHostWebviewsShape;
	private readonly _webviews = new Map<number, WebviewInput>();

	constructor(
		context: IExtHostContext,
		@IWorkbenchEditorService private readonly _editorService: IWorkbenchEditorService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		this._proxy = context.getProxy(ExtHostContext.ExtHostWebviews);
	}

	dispose(): void {
		throw new Error('Method not implemented.');
	}

	$createWebview(handle: number): void {
		const webview = new WebviewInput('', {}, '', message => this._proxy.$onMessage(handle, message));
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
		const existingInput = this._webviews.get(handle);
		const newInput = this._instantiationService.createInstance(WebviewInput, existingInput.getName(), existingInput.options, value, existingInput.onMessage);
		this._webviews.set(handle, newInput);
		this._editorService.replaceEditors([{ toReplace: existingInput, replaceWith: newInput }]);
	}

	$setOptions(handle: number, newOptions: vscode.WebviewOptions): void {
		const existingInput = this._webviews.get(handle);
		const newInput = this._instantiationService.createInstance(WebviewInput, existingInput.getName(), newOptions, existingInput.html, existingInput.onMessage);
		this._webviews.set(handle, newInput);
		this._editorService.replaceEditors([{ toReplace: existingInput, replaceWith: newInput }]);
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
}

(<IEditorRegistry>Registry.as(EditorExtensions.Editors)).registerEditor(new EditorDescriptor(
	WebviewEditor,
	WebviewEditor.ID,
	localize('webview.editor.label', "webview editor")),
	[new SyncDescriptor(WebviewInput)]);