/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore, MutableDisposable } from 'vs/base/common/lifecycle';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { EditorOptions } from 'vs/workbench/common/editor';
import { WebviewEditorInput } from 'vs/workbench/contrib/webview/browser/webviewEditorInput';
import { KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_VISIBLE, Webview, WebviewEditorOverlay } from 'vs/workbench/contrib/webview/common/webview';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

export class WebviewEditor extends BaseEditor {

	public static readonly ID = 'WebviewEditor';

	private readonly _scopedContextKeyService = this._register(new MutableDisposable<IContextKeyService>());
	private _findWidgetVisible: IContextKey<boolean>;

	private _editorFrame?: HTMLElement;
	private _content?: HTMLElement;

	private readonly _webviewFocusTrackerDisposables = this._register(new DisposableStore());
	private readonly _onFocusWindowHandler = this._register(new MutableDisposable());

	private readonly _onDidFocusWebview = this._register(new Emitter<void>());
	public get onDidFocus(): Event<any> { return this._onDidFocusWebview.event; }

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IEditorService private readonly _editorService: IEditorService,
		@IWindowService private readonly _windowService: IWindowService,
		@IStorageService storageService: IStorageService
	) {
		super(WebviewEditor.ID, telemetryService, themeService, storageService);

		this._findWidgetVisible = KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_VISIBLE.bindTo(_contextKeyService);
	}

	public get isWebviewEditor() {
		return true;
	}

	protected createEditor(parent: HTMLElement): void {
		this._editorFrame = parent;
		this._content = document.createElement('div');
		parent.appendChild(this._content);
	}

	public dispose(): void {
		if (this._content) {
			this._content.remove();
			this._content = undefined;
		}

		super.dispose();
	}

	public showFind() {
		this.withWebview(webview => {
			webview.showFind();
			this._findWidgetVisible.set(true);
		});
	}

	public hideFind() {
		this._findWidgetVisible.reset();
		this.withWebview(webview => webview.hideFind());
	}

	public reload() {
		this.withWebview(webview => webview.reload());
	}

	public layout(_dimension: DOM.Dimension): void {
		if (this.input && this.input instanceof WebviewEditorInput) {
			this.synchronizeWebviewContainerDimensions(this.input.webview);
			this.input.webview.layout();
		}
	}

	public focus(): void {
		super.focus();
		if (!this._onFocusWindowHandler.value) {
			// Make sure we restore focus when switching back to a VS Code window
			this._onFocusWindowHandler.value = this._windowService.onDidChangeFocus(focused => {
				if (focused && this._editorService.activeControl === this) {
					this.focus();
				}
			});
		}
		this.withWebview(webview => webview.focus());
	}

	public withWebview(f: (element: Webview) => void): void {
		if (this.input && this.input instanceof WebviewEditorInput) {
			f(this.input.webview);
		}
	}

	protected setEditorVisible(visible: boolean, group: IEditorGroup): void {
		const webview = this.input && (this.input as WebviewEditorInput).webview;
		if (webview) {
			if (visible) {
				webview.claim(this);
			} else {
				webview.release(this);
			}
			this.claimWebview(this.input as WebviewEditorInput);
		}

		super.setEditorVisible(visible, group);
	}

	public clearInput() {
		if (this.input && this.input instanceof WebviewEditorInput) {
			this.input.webview.release(this);
		}

		super.clearInput();
	}

	public async setInput(input: WebviewEditorInput, options: EditorOptions, token: CancellationToken): Promise<void> {
		if (this.input && this.input instanceof WebviewEditorInput) {
			this.input.webview.release(this);
		}

		await super.setInput(input, options, token);
		await input.resolve();
		if (token.isCancellationRequested) {
			return;
		}

		if (this.group) {
			input.updateGroup(this.group.id);
		}

		this.claimWebview(input);
	}

	private claimWebview(input: WebviewEditorInput): void {
		input.webview.claim(this);

		if (input.webview.options.enableFindWidget) {
			this._scopedContextKeyService.value = this._contextKeyService.createScoped(input.webview.container);
			this._findWidgetVisible = KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_VISIBLE.bindTo(this._scopedContextKeyService.value);
		}

		if (this._content) {
			this._content.setAttribute('aria-flowto', input.webview.container.id);
		}

		this.synchronizeWebviewContainerDimensions(input.webview);
		this.trackFocus(input.webview);
	}

	private synchronizeWebviewContainerDimensions(webview: WebviewEditorOverlay) {
		const webviewContainer = webview.container;
		if (webviewContainer && webviewContainer.parentElement && this._editorFrame) {
			const frameRect = this._editorFrame.getBoundingClientRect();
			const containerRect = webviewContainer.parentElement.getBoundingClientRect();

			webviewContainer.style.position = 'absolute';
			webviewContainer.style.top = `${frameRect.top - containerRect.top}px`;
			webviewContainer.style.left = `${frameRect.left - containerRect.left}px`;
			webviewContainer.style.width = `${frameRect.width}px`;
			webviewContainer.style.height = `${frameRect.height}px`;
		}
	}

	private trackFocus(webview: WebviewEditorOverlay): void {
		this._webviewFocusTrackerDisposables.clear();

		// Track focus in webview content
		const webviewContentFocusTracker = DOM.trackFocus(webview.container);
		this._webviewFocusTrackerDisposables.add(webviewContentFocusTracker);
		this._webviewFocusTrackerDisposables.add(webviewContentFocusTracker.onDidFocus(() => this._onDidFocusWebview.fire()));

		// Track focus in webview element
		this._webviewFocusTrackerDisposables.add(webview.onDidFocus(() => this._onDidFocusWebview.fire()));
	}
}
