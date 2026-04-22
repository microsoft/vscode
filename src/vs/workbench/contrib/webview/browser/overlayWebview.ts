/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension, getWindowById } from '../../../../base/browser/dom.js';
import { IMouseWheelEvent } from '../../../../base/browser/mouseEvent.js';
import { OverlayLayoutElement } from '../../../../base/browser/overlayLayoutElement.js';
import { CodeWindow } from '../../../../base/browser/window.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IContextKey, IContextKeyService, IScopedContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { IOverlayWebview, IWebview, IWebviewElement, IWebviewService, KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_ENABLED, KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_VISIBLE, WebviewContentOptions, WebviewExtensionDescription, WebviewInitInfo, WebviewMessageReceivedEvent, WebviewOptions } from './webview.js';

/**
 * Webview that is absolutely positioned over another element and that can
 * creates and destroys an underlying webview as needed.
 *
 * Absolutely positioning is needed because webviews (iframes) cannot be re-parented without losing their state.
 * This means that webviews are always placed on a top level and then moved over
 * the element they are anchored to so they visually look like they are part of the original layout.
 */
export class OverlayWebview extends Disposable implements IOverlayWebview {

	private _isFirstLoad = true;
	private readonly _firstLoadPendingMessages = new Set<{ readonly message: unknown; readonly transfer?: readonly ArrayBuffer[]; readonly resolve: (value: boolean) => void }>();
	private readonly _webview = this._register(new MutableDisposable<IWebviewElement>());
	private readonly _webviewEvents = this._register(new DisposableStore());

	private _html = '';
	private _title: string | undefined;
	private _initialScrollProgress: number = 0;
	private _state: string | undefined = undefined;

	private _extension: WebviewExtensionDescription | undefined;
	private _contentOptions: WebviewContentOptions;
	private _options: WebviewOptions;

	private _owner: unknown = undefined;

	private _windowId: number | undefined = undefined;
	private get window() { return getWindowById(this._windowId, true).window; }

	private readonly _scopedContextKeyService = this._register(new MutableDisposable<IScopedContextKeyService>());
	private _findWidgetVisible: IContextKey<boolean> | undefined;
	private _findWidgetEnabled: IContextKey<boolean> | undefined;
	private _shouldShowFindWidgetOnRestore = false;

	public readonly providedViewType?: string;

	public origin: string;

	private _overlayLayout: OverlayLayoutElement | undefined;

	public constructor(
		initInfo: WebviewInitInfo,
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
		@IWebviewService private readonly _webviewService: IWebviewService,
		@IContextKeyService private readonly _baseContextKeyService: IContextKeyService,
	) {
		super();

		this.providedViewType = initInfo.providedViewType;
		this.origin = initInfo.origin ?? generateUuid();

		this._title = initInfo.title;
		this._extension = initInfo.extension;
		this._options = initInfo.options;
		this._contentOptions = initInfo.contentOptions;
	}

	public get isFocused() {
		return !!this._webview.value?.isFocused;
	}

	private _isDisposed = false;

	private readonly _onDidDispose = this._register(new Emitter<void>());
	public readonly onDidDispose = this._onDidDispose.event;

	override dispose() {
		this._isDisposed = true;

		this._overlayLayout?.dispose();
		this._overlayLayout = undefined;

		for (const msg of this._firstLoadPendingMessages) {
			msg.resolve(false);
		}
		this._firstLoadPendingMessages.clear();

		this._onDidDispose.fire();

		super.dispose();
	}

	public get container(): HTMLElement {
		if (this._isDisposed) {
			throw new Error(`OverlayWebview has been disposed`);
		}

		if (!this._overlayLayout) {
			this._overlayLayout = new OverlayLayoutElement();
			this._overlayLayout.content.style.visibility = 'hidden';

			// // Webviews cannot be reparented in the dom as it will destroy their contents.
			// // Mount them to a high level node to avoid this depending on the active container.
			const root = this._layoutService.getContainer(this.window);
			root.appendChild(this._overlayLayout.root);
		}

		return this._overlayLayout.content;
	}

	public claim(owner: unknown, targetWindow: CodeWindow, scopedContextKeyService: IContextKeyService | undefined) {
		if (this._isDisposed) {
			return;
		}

		const oldOwner = this._owner;

		if (this._windowId !== targetWindow.vscodeWindowId) {
			// moving to a new window
			this.release(oldOwner);
			// since we are moving to a new window, we need to dispose the webview and recreate
			this._webview.clear();
			this._webviewEvents.clear();
			this._overlayLayout?.dispose();
			this._overlayLayout = undefined;
		}

		this._owner = owner;
		this._windowId = targetWindow.vscodeWindowId;
		this._show(targetWindow);

		if (oldOwner !== owner) {
			const contextKeyService = (scopedContextKeyService || this._baseContextKeyService);

			// Explicitly clear before creating the new context.
			// Otherwise we create the new context while the old one is still around
			this._scopedContextKeyService.clear();
			this._scopedContextKeyService.value = contextKeyService.createScoped(this.container);

			const wasFindVisible = this._findWidgetVisible?.get();
			this._findWidgetVisible?.reset();
			this._findWidgetVisible = KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_VISIBLE.bindTo(contextKeyService);
			this._findWidgetVisible.set(!!wasFindVisible);

			this._findWidgetEnabled?.reset();
			this._findWidgetEnabled = KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_ENABLED.bindTo(contextKeyService);
			this._findWidgetEnabled.set(!!this.options.enableFindWidget);

			this._webview.value?.setContextKeyService(this._scopedContextKeyService.value);
		}
	}

	public release(owner: unknown) {
		if (this._owner !== owner) {
			return;
		}

		this._scopedContextKeyService.clear();

		this._owner = undefined;
		if (this._overlayLayout) {
			this._overlayLayout.content.style.visibility = 'hidden';
		}

		if (this._options.retainContextWhenHidden) {
			// https://github.com/microsoft/vscode/issues/157424
			// We need to record the current state when retaining context so we can try to showFind() when showing webview again
			this._shouldShowFindWidgetOnRestore = !!this._findWidgetVisible?.get();
			this.hideFind(false);
		} else {
			this._webview.clear();
			this._webviewEvents.clear();
		}
	}

	public layoutWebviewOverElement(anchorElement: HTMLElement, dimension?: Dimension, clippingContainer?: HTMLElement) {
		if (!this._overlayLayout || !this._overlayLayout.content.parentElement) {
			return;
		}

		this._overlayLayout?.layoutOverAnchorElement(anchorElement, { clippingContainer, fallbackDimension: dimension });
	}

	private _show(targetWindow: CodeWindow) {
		if (this._isDisposed) {
			throw new Error('OverlayWebview is disposed');
		}

		if (!this._webview.value) {
			const webview = this._webviewService.createWebviewElement({
				providedViewType: this.providedViewType,
				origin: this.origin,
				title: this._title,
				options: this._options,
				contentOptions: this._contentOptions,
				extension: this.extension,
			});
			this._webview.value = webview;
			webview.state = this._state;

			if (this._scopedContextKeyService.value) {
				this._webview.value.setContextKeyService(this._scopedContextKeyService.value);
			}

			if (this._html) {
				webview.setHtml(this._html);
			}

			if (this._options.tryRestoreScrollPosition) {
				webview.initialScrollProgress = this._initialScrollProgress;
			}

			this._findWidgetEnabled?.set(!!this.options.enableFindWidget);

			webview.mountTo(this.container, targetWindow);

			// Forward events from inner webview to outer listeners
			this._webviewEvents.clear();
			this._webviewEvents.add(webview.onDidFocus(() => { this._onDidFocus.fire(); }));
			this._webviewEvents.add(webview.onDidBlur(() => { this._onDidBlur.fire(); }));
			this._webviewEvents.add(webview.onDidClickLink(x => { this._onDidClickLink.fire(x); }));
			this._webviewEvents.add(webview.onMessage(x => { this._onMessage.fire(x); }));
			this._webviewEvents.add(webview.onMissingCsp(x => { this._onMissingCsp.fire(x); }));
			this._webviewEvents.add(webview.onDidWheel(x => { this._onDidWheel.fire(x); }));
			this._webviewEvents.add(webview.onFatalError(x => { this._onFatalError.fire(x); }));
			this._webviewEvents.add(autorun(reader => {
				this.intrinsicContentSize.set(reader.readObservable(webview.intrinsicContentSize), undefined, undefined);
			}));

			this._webviewEvents.add(webview.onDidScroll(x => {
				this._initialScrollProgress = x.scrollYPercentage;
				this._onDidScroll.fire(x);
			}));

			this._webviewEvents.add(webview.onDidUpdateState(state => {
				this._state = state;
				this._onDidUpdateState.fire(state);
			}));

			if (this._isFirstLoad) {
				this._firstLoadPendingMessages.forEach(async msg => {
					msg.resolve(await webview.postMessage(msg.message, msg.transfer));
				});
			}
			this._isFirstLoad = false;
			this._firstLoadPendingMessages.clear();
		}

		// https://github.com/microsoft/vscode/issues/157424
		if (this.options.retainContextWhenHidden && this._shouldShowFindWidgetOnRestore) {
			this.showFind(false);
			// Reset
			this._shouldShowFindWidgetOnRestore = false;
		}

		if (this._overlayLayout) {
			this._overlayLayout.content.style.visibility = 'visible';
		}
	}

	public setHtml(html: string) {
		this._html = html;
		this._withWebview(webview => webview.setHtml(html));
	}

	public setTitle(title: string) {
		this._title = title;
		this._withWebview(webview => webview.setTitle(title));
	}

	public get initialScrollProgress(): number { return this._initialScrollProgress; }
	public set initialScrollProgress(value: number) {
		this._initialScrollProgress = value;
		this._withWebview(webview => webview.initialScrollProgress = value);
	}

	public get state(): string | undefined { return this._state; }
	public set state(value: string | undefined) {
		this._state = value;
		this._withWebview(webview => webview.state = value);
	}

	public get extension(): WebviewExtensionDescription | undefined { return this._extension; }
	public set extension(value: WebviewExtensionDescription | undefined) {
		this._extension = value;
		this._withWebview(webview => webview.extension = value);
	}

	public get options(): WebviewOptions { return this._options; }
	public set options(value: WebviewOptions) { this._options = { customClasses: this._options.customClasses, ...value }; }

	public get contentOptions(): WebviewContentOptions { return this._contentOptions; }
	public set contentOptions(value: WebviewContentOptions) {
		this._contentOptions = value;
		this._withWebview(webview => webview.contentOptions = value);
	}

	public set localResourcesRoot(resources: URI[]) {
		this._withWebview(webview => webview.localResourcesRoot = resources);
	}

	private readonly _onDidFocus = this._register(new Emitter<void>());
	public readonly onDidFocus = this._onDidFocus.event;

	private readonly _onDidBlur = this._register(new Emitter<void>());
	public readonly onDidBlur = this._onDidBlur.event;

	private readonly _onDidClickLink = this._register(new Emitter<string>());
	public readonly onDidClickLink = this._onDidClickLink.event;

	private readonly _onDidScroll = this._register(new Emitter<{ readonly scrollYPercentage: number }>());
	public readonly onDidScroll = this._onDidScroll.event;

	private readonly _onDidUpdateState = this._register(new Emitter<string | undefined>());
	public readonly onDidUpdateState = this._onDidUpdateState.event;

	private readonly _onMessage = this._register(new Emitter<WebviewMessageReceivedEvent>());
	public readonly onMessage = this._onMessage.event;

	private readonly _onMissingCsp = this._register(new Emitter<ExtensionIdentifier>());
	public readonly onMissingCsp = this._onMissingCsp.event;

	private readonly _onDidWheel = this._register(new Emitter<IMouseWheelEvent>());
	public readonly onDidWheel = this._onDidWheel.event;

	private readonly _onFatalError = this._register(new Emitter<{ readonly message: string }>());
	public onFatalError = this._onFatalError.event;

	public readonly intrinsicContentSize = observableValue<{ readonly width: number; readonly height: number } | undefined>('WebviewIntrinsicContentSize', undefined);

	public async postMessage(message: unknown, transfer?: readonly ArrayBuffer[]): Promise<boolean> {
		if (this._webview.value) {
			return this._webview.value.postMessage(message, transfer);
		}

		if (this._isFirstLoad) {
			let resolve: (x: boolean) => void;
			const p = new Promise<boolean>(r => resolve = r);
			this._firstLoadPendingMessages.add({ message, transfer, resolve: resolve! });
			return p;
		}

		return false;
	}

	focus(): void { this._webview.value?.focus(); }
	reload(): void { this._webview.value?.reload(); }
	selectAll(): void { this._webview.value?.selectAll(); }
	copy(): void { this._webview.value?.copy(); }
	paste(): void { this._webview.value?.paste(); }
	cut(): void { this._webview.value?.cut(); }
	undo(): void { this._webview.value?.undo(); }
	redo(): void { this._webview.value?.redo(); }

	showFind(animated = true) {
		if (this._webview.value) {
			this._webview.value.showFind(animated);
			this._findWidgetVisible?.set(true);
		}
	}

	hideFind(animated = true) {
		this._findWidgetVisible?.reset();
		this._webview.value?.hideFind(animated);
	}

	runFindAction(previous: boolean): void { this._webview.value?.runFindAction(previous); }

	private _withWebview(f: (webview: IWebview) => void): void {
		if (this._webview.value) {
			f(this._webview.value);
		}
	}

	windowDidDragStart() {
		this._webview.value?.windowDidDragStart();
	}

	windowDidDragEnd() {
		this._webview.value?.windowDidDragEnd();
	}

	setContextKeyService(contextKeyService: IContextKeyService) {
		this._webview.value?.setContextKeyService(contextKeyService);
	}
}
