/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore, IDisposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { isWeb } from 'vs/base/common/platform';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { EditorPart } from 'vs/workbench/browser/parts/editor/editorPart';
import { EditorInput, EditorOptions } from 'vs/workbench/common/editor';
import { KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_VISIBLE, Webview, WebviewEditorOverlay } from 'vs/workbench/contrib/webview/browser/webview';
import { WebviewInput } from 'vs/workbench/contrib/webview/browser/webviewEditorInput';
import { IEditorGroup, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IHostService } from 'vs/workbench/services/host/browser/host';

export class WebviewEditor extends BaseEditor {

	public static readonly ID = 'WebviewEditor';

	private readonly _scopedContextKeyService = this._register(new MutableDisposable<IContextKeyService>());
	private _findWidgetVisible: IContextKey<boolean>;
	private _editorFrame?: HTMLElement;
	private _content?: HTMLElement;
	private _dimension?: DOM.Dimension;

	private readonly _webviewVisibleDisposables = this._register(new DisposableStore());
	private readonly _onFocusWindowHandler = this._register(new MutableDisposable());

	private readonly _onDidFocusWebview = this._register(new Emitter<void>());
	public get onDidFocus(): Event<any> { return this._onDidFocusWebview.event; }

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IEditorService private readonly _editorService: IEditorService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IHostService private readonly _hostService: IHostService,
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

	public find(previous: boolean) {
		this.withWebview(webview => {
			webview.runFindAction(previous);
		});
	}

	public reload() {
		this.withWebview(webview => webview.reload());
	}

	public layout(dimension: DOM.Dimension): void {
		this._dimension = dimension;
		if (this.input && this.input instanceof WebviewInput) {
			this.synchronizeWebviewContainerDimensions(this.input.webview, dimension);
		}
	}

	public focus(): void {
		super.focus();
		if (!this._onFocusWindowHandler.value && !isWeb) {
			// Make sure we restore focus when switching back to a VS Code window
			this._onFocusWindowHandler.value = this._hostService.onDidChangeFocus(focused => {
				if (focused && this._editorService.activeControl === this) {
					this.focus();
				}
			});
		}
		this.withWebview(webview => webview.focus());
	}

	public withWebview(f: (element: Webview) => void): void {
		if (this.input && this.input instanceof WebviewInput) {
			f(this.input.webview);
		}
	}

	protected setEditorVisible(visible: boolean, group: IEditorGroup | undefined): void {
		if (this.input instanceof WebviewInput) {
			const webview = this.input.webview;
			if (visible) {
				webview.claim(this);
			} else {
				webview.release(this);
			}
			this.claimWebview(this.input);
		}
		super.setEditorVisible(visible, group);
	}

	public clearInput() {
		if (this.input && this.input instanceof WebviewInput) {
			this.input.webview.release(this);
			this._webviewVisibleDisposables.clear();
		}

		super.clearInput();
	}

	public async setInput(input: EditorInput, options: EditorOptions, token: CancellationToken): Promise<void> {
		if (input.matches(this.input)) {
			return;
		}

		if (this.input && this.input instanceof WebviewInput) {
			this.input.webview.release(this);
		}

		await super.setInput(input, options, token);
		await input.resolve();
		if (token.isCancellationRequested) {
			return;
		}

		if (input instanceof WebviewInput) {
			if (this.group) {
				input.updateGroup(this.group.id);
			}

			this.claimWebview(input);
			if (this._dimension) {
				this.layout(this._dimension);
			}
		}
	}

	private claimWebview(input: WebviewInput): void {
		input.webview.claim(this);

		if (input.webview.options.enableFindWidget) {
			this._scopedContextKeyService.value = this._contextKeyService.createScoped(input.webview.container);
			this._findWidgetVisible = KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_VISIBLE.bindTo(this._scopedContextKeyService.value);
		}

		if (this._content) {
			this._content.setAttribute('aria-flowto', input.webview.container.id);
		}

		this._webviewVisibleDisposables.clear();

		// Webviews are not part of the normal editor dom, so we have to register our own drag and drop handler on them.
		if (this._editorGroupsService instanceof EditorPart) {
			this._webviewVisibleDisposables.add(this._editorGroupsService.createEditorDropTarget(input.webview.container, {
				groupContainsPredicate: (group) => this.group?.id === group.group.id
			}));
		}

		this._webviewVisibleDisposables.add(DOM.addDisposableListener(window, DOM.EventType.DRAG_START, () => {
			if (this.input instanceof WebviewInput) {
				this.input.webview.windowDidDragStart();
			}
		}));

		const onDragEnd = () => {
			if (this.input instanceof WebviewInput) {
				this.input.webview.windowDidDragEnd();
			}
		};
		this._webviewVisibleDisposables.add(DOM.addDisposableListener(window, DOM.EventType.DRAG_END, onDragEnd));
		this._webviewVisibleDisposables.add(DOM.addDisposableListener(window, DOM.EventType.MOUSE_MOVE, currentEvent => {
			if (currentEvent.buttons === 0) {
				onDragEnd();
			}
		}));

		this.synchronizeWebviewContainerDimensions(input.webview);
		this._webviewVisibleDisposables.add(this.trackFocus(input.webview));
	}

	private synchronizeWebviewContainerDimensions(webview: WebviewEditorOverlay, dimension?: DOM.Dimension) {
		if (this._editorFrame) {
			webview.layoutWebviewOverElement(this._editorFrame, dimension);
		}
	}

	private trackFocus(webview: WebviewEditorOverlay): IDisposable {
		const store = new DisposableStore();

		// Track focus in webview content
		const webviewContentFocusTracker = DOM.trackFocus(webview.container);
		store.add(webviewContentFocusTracker);
		store.add(webviewContentFocusTracker.onDidFocus(() => this._onDidFocusWebview.fire()));

		// Track focus in webview element
		store.add(webview.onDidFocus(() => this._onDidFocusWebview.fire()));

		return store;
	}
}
