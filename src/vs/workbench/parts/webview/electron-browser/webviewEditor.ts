/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { Emitter, Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { Position } from 'vs/platform/editor/common/editor';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { EditorOptions } from 'vs/workbench/common/editor';
import { WebviewEditorInput } from 'vs/workbench/parts/webview/electron-browser/webviewEditorInput';
import { IPartService, Parts } from 'vs/workbench/services/part/common/partService';
import { BaseWebviewEditor, KEYBINDING_CONTEXT_WEBVIEWEDITOR_FIND_WIDGET_INPUT_FOCUSED, KEYBINDING_CONTEXT_WEBVIEWEDITOR_FOCUS, KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_VISIBLE } from './baseWebviewEditor';
import { WebviewElement } from './webviewElement';

export class WebviewEditor extends BaseWebviewEditor {

	public static readonly ID = 'WebviewEditor';

	private editorFrame: HTMLElement;
	private content: HTMLElement;
	private webviewContent: HTMLElement | undefined;

	private _webviewFocusTracker?: DOM.IFocusTracker;
	private _webviewFocusListenerDisposable?: IDisposable;

	private readonly _onDidFocusWebview = new Emitter<void>();

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IContextKeyService private _contextKeyService: IContextKeyService,
		@IPartService private readonly _partService: IPartService,
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@IWorkspaceContextService private readonly _contextService: IWorkspaceContextService
	) {
		super(WebviewEditor.ID, telemetryService, themeService, _contextKeyService);
	}

	protected createEditor(parent: HTMLElement): void {
		this.editorFrame = parent;
		this.content = document.createElement('div');
		parent.appendChild(this.content);
	}

	private doUpdateContainer() {
		const webviewContainer = this.input && (this.input as WebviewEditorInput).container;
		if (webviewContainer && webviewContainer.parentElement) {
			const frameRect = this.editorFrame.getBoundingClientRect();
			const containerRect = webviewContainer.parentElement.getBoundingClientRect();

			webviewContainer.style.position = 'absolute';
			webviewContainer.style.top = `${frameRect.top - containerRect.top}px`;
			webviewContainer.style.left = `${frameRect.left - containerRect.left}px`;
			webviewContainer.style.width = `${frameRect.width}px`;
			webviewContainer.style.height = `${frameRect.height}px`;
		}
	}

	public layout(dimension: DOM.Dimension): void {
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
		if (this.input && this.input instanceof WebviewEditorInput) {
			if (visible) {
				this.input.claimWebview(this);
			} else {
				this.input.releaseWebview(this);
			}

			this.updateWebview(this.input as WebviewEditorInput);
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
		if (this.input && this.input instanceof WebviewEditorInput) {
			this.input.releaseWebview(this);
		}

		this._webview = undefined;
		this.webviewContent = undefined;

		super.clearInput();
	}

	async setInput(input: WebviewEditorInput, options: EditorOptions): TPromise<void> {
		if (this.input && this.input.matches(input)) {
			return undefined;
		}

		if (this.input) {
			(this.input as WebviewEditorInput).releaseWebview(this);
			this._webview = undefined;
			this.webviewContent = undefined;
		}
		await super.setInput(input, options);

		await input.resolve();
		await input.onBecameActive(this.position);
		this.updateWebview(input);
	}

	private updateWebview(input: WebviewEditorInput) {
		const webview = this.getWebview(input);
		input.claimWebview(this);
		webview.options = {
			allowScripts: input.options.enableScripts,
			allowSvgs: true,
			enableWrappedPostMessage: true,
			useSameOriginForRoot: false,
			localResourceRoots: input.options.localResourceRoots || this.getDefaultLocalResourceRoots()
		};
		input.html = input.html;

		if (this.webviewContent) {
			this.webviewContent.style.visibility = 'visible';
		}

		this.doUpdateContainer();
	}

	private getDefaultLocalResourceRoots(): URI[] {
		const rootPaths = this._contextService.getWorkspace().folders.map(x => x.uri);
		if ((this.input as WebviewEditorInput).extensionFolderPath) {
			rootPaths.push((this.input as WebviewEditorInput).extensionFolderPath);
		}
		return rootPaths;
	}

	private getWebview(input: WebviewEditorInput): WebviewElement {
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

		if (input.options.enableFindWidget) {
			this._contextKeyService = this._contextKeyService.createScoped(this.webviewContent);
			this.contextKey = KEYBINDING_CONTEXT_WEBVIEWEDITOR_FOCUS.bindTo(this._contextKeyService);
			this.findInputFocusContextKey = KEYBINDING_CONTEXT_WEBVIEWEDITOR_FIND_WIDGET_INPUT_FOCUSED.bindTo(this._contextKeyService);
			this.findWidgetVisible = KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_VISIBLE.bindTo(this._contextKeyService);
		}

		this._webview = new WebviewElement(
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
		this._webview.mountTo(this.webviewContent);
		input.webview = this._webview;

		if (input.options.tryRestoreScrollPosition) {
			this._webview.initialScrollProgress = input.scrollYPercentage;
		}

		this.content.setAttribute('aria-flowto', this.webviewContent.id);

		this.doUpdateContainer();
		return this._webview;
	}
}

