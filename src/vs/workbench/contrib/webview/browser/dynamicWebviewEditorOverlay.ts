/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IWebviewService, Webview, WebviewContentOptions, WebviewEditorOverlay, WebviewElement, WebviewOptions } from 'vs/workbench/contrib/webview/common/webview';
import { IWorkbenchLayoutService, Parts } from 'vs/workbench/services/layout/browser/layoutService';
import { memoize } from 'vs/base/common/decorators';

/**
 * Webview editor overlay that creates and destroys the underlying webview as needed.
 */
export class DynamicWebviewEditorOverlay extends Disposable implements WebviewEditorOverlay {

	private readonly _pendingMessages = new Set<any>();
	private readonly _webview = this._register(new MutableDisposable<WebviewElement>());
	private readonly _webviewEvents = this._register(new DisposableStore());

	private _html: string = '';
	private _initialScrollProgress: number = 0;
	private _state: string | undefined = undefined;
	private _owner: any = undefined;

	public constructor(
		private readonly id: string,
		public readonly options: WebviewOptions,
		private _contentOptions: WebviewContentOptions,
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
		@IWebviewService private readonly _webviewService: IWebviewService
	) {
		super();

		this._register(toDisposable(() => this.container.remove()));
	}

	@memoize
	public get container() {
		const container = document.createElement('div');
		container.id = `webview-${this.id}`;
		this._layoutService.getContainer(Parts.EDITOR_PART).appendChild(container);
		return container;
	}

	public claim(owner: any) {
		this._owner = owner;
		this.show();
	}

	public release(owner: any) {
		if (this._owner !== owner) {
			return;
		}
		this._owner = undefined;
		this.container.style.visibility = 'hidden';
		if (!this.options.retainContextWhenHidden) {
			this._webview.clear();
			this._webviewEvents.clear();
		}
	}

	private show() {
		if (!this._webview.value) {
			const webview = this._webviewService.createWebview(this.id, this.options, this._contentOptions);
			this._webview.value = webview;
			webview.state = this._state;
			webview.html = this._html;
			if (this.options.tryRestoreScrollPosition) {
				webview.initialScrollProgress = this._initialScrollProgress;
			}
			this._webview.value.mountTo(this.container);
			this._webviewEvents.clear();

			webview.onDidFocus(() => { this._onDidFocus.fire(); }, undefined, this._webviewEvents);
			webview.onDidClickLink(x => { this._onDidClickLink.fire(x); }, undefined, this._webviewEvents);
			webview.onMessage(x => { this._onMessage.fire(x); }, undefined, this._webviewEvents);

			webview.onDidScroll(x => {
				this._initialScrollProgress = x.scrollYPercentage;
				this._onDidScroll.fire(x);
			}, undefined, this._webviewEvents);

			webview.onDidUpdateState(state => {
				this._state = state;
				this._onDidUpdateState.fire(state);
			}, undefined, this._webviewEvents);

			this._pendingMessages.forEach(msg => webview.sendMessage(msg));
			this._pendingMessages.clear();
		}
		this.container.style.visibility = 'visible';
	}

	public get html(): string { return this._html; }
	public set html(value: string) {
		this._html = value;
		this.withWebview(webview => webview.html = value);
	}

	public get initialScrollProgress(): number { return this._initialScrollProgress; }
	public set initialScrollProgress(value: number) {
		this._initialScrollProgress = value;
		this.withWebview(webview => webview.initialScrollProgress = value);
	}

	public get state(): string | undefined { return this._state; }
	public set state(value: string | undefined) {
		this._state = value;
		this.withWebview(webview => webview.state = value);
	}

	public get contentOptions(): WebviewContentOptions { return this._contentOptions; }
	public set contentOptions(value: WebviewContentOptions) {
		this._contentOptions = value;
		this.withWebview(webview => webview.contentOptions = value);
	}

	private readonly _onDidFocus = this._register(new Emitter<void>());
	public readonly onDidFocus: Event<void> = this._onDidFocus.event;

	private readonly _onDidClickLink = this._register(new Emitter<URI>());
	public readonly onDidClickLink: Event<URI> = this._onDidClickLink.event;

	private readonly _onDidScroll = this._register(new Emitter<{ scrollYPercentage: number; }>());
	public readonly onDidScroll: Event<{ scrollYPercentage: number; }> = this._onDidScroll.event;

	private readonly _onDidUpdateState = this._register(new Emitter<string | undefined>());
	public readonly onDidUpdateState: Event<string | undefined> = this._onDidUpdateState.event;

	private readonly _onMessage = this._register(new Emitter<any>());
	public readonly onMessage: Event<any> = this._onMessage.event;

	sendMessage(data: any): void {
		if (this._webview.value) {
			this._webview.value.sendMessage(data);
		} else {
			this._pendingMessages.add(data);
		}
	}

	update(html: string, options: WebviewContentOptions, retainContextWhenHidden: boolean): void {
		this._contentOptions = options;
		this._html = html;
		this.withWebview(webview => {
			webview.update(html, options, retainContextWhenHidden);
		});
	}

	layout(): void { this.withWebview(webview => webview.layout()); }
	focus(): void { this.withWebview(webview => webview.focus()); }
	reload(): void { this.withWebview(webview => webview.reload()); }
	showFind(): void { this.withWebview(webview => webview.showFind()); }
	hideFind(): void { this.withWebview(webview => webview.hideFind()); }

	public getInnerWebview() {
		return this._webview.value;
	}

	private withWebview(f: (webview: Webview) => void): void {
		if (this._webview.value) {
			f(this._webview.value);
		}
	}
}
