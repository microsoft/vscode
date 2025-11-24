/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import {
	IBrowserViewBounds,
	IBrowserViewNavigationEvent,
	IBrowserViewLoadingEvent,
	IBrowserViewFocusEvent,
	IBrowserViewKeyDownEvent,
	IBrowserViewTitleChangeEvent,
	IBrowserViewFaviconChangeEvent,
	IBrowserViewService
} from '../../../../platform/browserView/common/browserView.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';

export const IBrowserViewWorkbenchService = createDecorator<IBrowserViewWorkbenchService>('browserViewWorkbenchService');

/**
 * Workbench-level service for browser views that provides model-based access to browser views.
 * This service manages browser view models that proxy to the main process browser view service.
 */
export interface IBrowserViewWorkbenchService {
	readonly _serviceBrand: undefined;

	/**
	 * Get or create a browser view model for the given ID
	 * @param id The browser view identifier
	 * @returns A browser view model that proxies to the main process
	 */
	getOrCreateBrowserViewModel(id: string): Promise<IBrowserViewModel>;

	/**
	 * Get an existing browser view model by ID
	 * @param id The browser view identifier
	 * @returns The browser view model if it exists, undefined otherwise
	 */
	getBrowserViewModel(id: string): IBrowserViewModel | undefined;

	/**
	 * Destroy a browser view model and its underlying view
	 * @param id The browser view identifier
	 */
	destroyBrowserViewModel(id: string): Promise<void>;
}


/**
 * A browser view model that represents a single browser view instance in the workbench.
 * This model proxies calls to the main process browser view service using its unique ID.
 */
export interface IBrowserViewModel extends IDisposable {
	readonly id: string;
	readonly url: string;
	readonly title: string;
	readonly favicon: string | undefined;
	readonly loading: boolean;
	readonly canGoBack: boolean;
	readonly canGoForward: boolean;

	readonly onDidNavigate: Event<IBrowserViewNavigationEvent>;
	readonly onDidChangeLoadingState: Event<IBrowserViewLoadingEvent>;
	readonly onDidChangeFocus: Event<IBrowserViewFocusEvent>;
	readonly onDidKeyCommand: Event<IBrowserViewKeyDownEvent>;
	readonly onDidChangeTitle: Event<IBrowserViewTitleChangeEvent>;
	readonly onDidChangeFavicon: Event<IBrowserViewFaviconChangeEvent>;
	readonly onWillDispose: Event<void>;

	initialize(): Promise<void>;
	layout(bounds: IBrowserViewBounds): Promise<void>;
	setVisible(visible: boolean): Promise<void>;
	loadURL(url: string): Promise<void>;
	goBack(): Promise<void>;
	goForward(): Promise<void>;
	reload(): Promise<void>;
	captureScreenshot(quality?: number): Promise<string>;
	dispatchKeyEvent(keyEvent: IBrowserViewKeyDownEvent): Promise<void>;
	focus(): Promise<void>;
}

export class BrowserViewModel extends Disposable implements IBrowserViewModel {
	private _url: string = '';
	private _title: string = '';
	private _favicon: string | undefined = undefined;
	private _loading: boolean = false;
	private _canGoBack: boolean = false;
	private _canGoForward: boolean = false;

	private readonly _onWillDispose = this._register(new Emitter<void>());

	constructor(
		public readonly id: string,
		private readonly browserViewService: IBrowserViewService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService
	) {
		super();
	}

	get url(): string { return this._url; }
	get title(): string { return this._title; }
	get favicon(): string | undefined { return this._favicon; }
	get loading(): boolean { return this._loading; }
	get canGoBack(): boolean { return this._canGoBack; }
	get canGoForward(): boolean { return this._canGoForward; }

	get onDidNavigate(): Event<IBrowserViewNavigationEvent> {
		return this.browserViewService.onDynamicDidNavigate(this.id);
	}

	get onDidChangeLoadingState(): Event<IBrowserViewLoadingEvent> {
		return this.browserViewService.onDynamicDidChangeLoadingState(this.id);
	}

	get onDidChangeFocus(): Event<IBrowserViewFocusEvent> {
		return this.browserViewService.onDynamicDidChangeFocus(this.id);
	}

	get onDidKeyCommand(): Event<IBrowserViewKeyDownEvent> {
		return this.browserViewService.onDynamicDidKeyCommand(this.id);
	}

	get onDidChangeTitle(): Event<IBrowserViewTitleChangeEvent> {
		return this.browserViewService.onDynamicDidChangeTitle(this.id);
	}

	get onDidChangeFavicon(): Event<IBrowserViewFaviconChangeEvent> {
		return this.browserViewService.onDynamicDidChangeFavicon(this.id);
	}

	get onWillDispose(): Event<void> {
		return this._onWillDispose.event;
	}

	/**
	 * Initialize the model with the current state from the main process
	 */
	async initialize(): Promise<void> {
		const workspaceId = this.workspaceContextService.getWorkspace().id;
		const state = await this.browserViewService.getOrCreateBrowserView(this.id, workspaceId);
		this._url = state.url;
		this._title = state.title;
		this._loading = state.loading;
		this._canGoBack = state.canGoBack;
		this._canGoForward = state.canGoForward;

		// Set up state synchronization
		this._register(this.onDidNavigate(e => {
			this._url = e.url;
			this._canGoBack = e.canGoBack;
			this._canGoForward = e.canGoForward;
		}));

		this._register(this.onDidChangeLoadingState(e => {
			this._loading = e.loading;
		}));

		this._register(this.onDidChangeTitle(e => {
			this._title = e.title;
		}));

		this._register(this.onDidChangeFavicon(e => {
			this._favicon = e.favicon;
		}));
	}

	async layout(bounds: IBrowserViewBounds): Promise<void> {
		return this.browserViewService.layout(this.id, bounds);
	}

	async setVisible(visible: boolean): Promise<void> {
		return this.browserViewService.setVisible(this.id, visible);
	}

	async loadURL(url: string): Promise<void> {
		return this.browserViewService.loadURL(this.id, url);
	}

	async goBack(): Promise<void> {
		return this.browserViewService.goBack(this.id);
	}

	async goForward(): Promise<void> {
		return this.browserViewService.goForward(this.id);
	}

	async reload(): Promise<void> {
		return this.browserViewService.reload(this.id);
	}

	async captureScreenshot(quality?: number): Promise<string> {
		return this.browserViewService.captureScreenshot(this.id, quality);
	}

	async dispatchKeyEvent(keyEvent: IBrowserViewKeyDownEvent): Promise<void> {
		return this.browserViewService.dispatchKeyEvent(this.id, keyEvent);
	}

	async focus(): Promise<void> {
		return this.browserViewService.focus(this.id);
	}

	override dispose(): void {
		this._onWillDispose.fire();

		// Clean up the browser view when the model is disposed
		this.browserViewService.destroyBrowserView(this.id);
		super.dispose();
	}
}
