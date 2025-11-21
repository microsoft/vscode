/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/browser.css';
import { localize } from '../../../../nls.js';
import { $, addDisposableListener, disposableWindowInterval, EventType } from '../../../../base/browser/dom.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { Action } from '../../../../base/common/actions.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../common/editor.js';
import { BrowserEditorInput } from './browserEditorInput.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IBrowserViewKeyDownEvent, IBrowserViewService, ipcBrowserViewChannelName } from '../../../../platform/browserView/common/browserView.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { IBrowserOverlayManager } from './overlayManager.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { getZoomFactor, onDidChangeZoomLevel } from '../../../../base/browser/browser.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';

export class BrowserEditor extends EditorPane {
	static readonly ID = 'workbench.editor.browser';

	private urlInput!: HTMLInputElement;
	private browserContainer!: HTMLElement;
	private overlayVisible = false;

	private actionBar!: ActionBar;
	private backAction!: Action;
	private forwardAction!: Action;
	private reloadAction!: Action;

	private browserViewService: IBrowserViewService;

	private currentInput: BrowserEditorInput | undefined;
	private _currentKeyDownEvent: IBrowserViewKeyDownEvent | undefined;
	private readonly inputDisposables = this._register(new DisposableStore());

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IMainProcessService private readonly mainProcessService: IMainProcessService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IBrowserOverlayManager private readonly overlayManager: IBrowserOverlayManager,
		@ILogService private readonly logService: ILogService
	) {
		super(BrowserEditor.ID, group, telemetryService, themeService, storageService);

		const channel = this.mainProcessService.getChannel(ipcBrowserViewChannelName);
		this.browserViewService = ProxyChannel.toService<IBrowserViewService>(channel);

		this._register(this.overlayManager.onDidChangeOverlayState(() => {
			if (!this.currentInput) {
				return;
			}

			// Check if any overlay is overlapping with our browser container
			const hasOverlappingOverlay = this.overlayManager.isOverlappingWithOverlays(this.browserContainer);
			if (hasOverlappingOverlay !== this.overlayVisible) {
				this.overlayVisible = hasOverlappingOverlay;

				this.browserContainer.classList.toggle('overlay-visible', hasOverlappingOverlay);
				this.browserViewService.setVisible(this.currentInput.id, !hasOverlappingOverlay);
			}
		}));

		// Capture screenshot periodically (once per second) to keep background updated
		this._register(disposableWindowInterval(
			this.window,
			() => this.capturePlaceholderSnapshot(),
			1000
		));

		// Listen for zoom level changes and update browser view zoom factor
		this._register(onDidChangeZoomLevel(targetWindowId => {
			if (targetWindowId === this.window.vscodeWindowId) {
				this.layout();
			}
		}));
	}

	protected override createEditor(parent: HTMLElement): void {
		// Create root container
		const root = $('.browser-root');
		parent.appendChild(root);

		// Create toolbar with navigation buttons and URL input
		const toolbar = $('.browser-toolbar');

		// Create navigation actions
		this.backAction = this._register(new Action(
			'browser.back',
			localize('browserBack', "Back"),
			ThemeIcon.asClassName(Codicon.arrowLeft),
			false, // disabled by default
			() => this.goBack()
		));

		this.forwardAction = this._register(new Action(
			'browser.forward',
			localize('browserForward', "Forward"),
			ThemeIcon.asClassName(Codicon.arrowRight),
			false, // disabled by default
			() => this.goForward()
		));

		this.reloadAction = this._register(new Action(
			'browser.reload',
			localize('browserReload', "Reload"),
			ThemeIcon.asClassName(Codicon.refresh),
			true,
			() => this.reload()
		));

		// Create action bar
		const navContainer = $('.browser-nav-buttons');
		this.actionBar = this._register(new ActionBar(navContainer));
		this.actionBar.push([this.backAction, this.forwardAction, this.reloadAction], { icon: true, label: false });

		toolbar.appendChild(navContainer);

		// URL input
		this.urlInput = $<HTMLInputElement>('input.browser-url-input');
		this.urlInput.type = 'text';
		this.urlInput.placeholder = localize('browserUrlPlaceholder', "Enter URL...");
		toolbar.appendChild(this.urlInput);
		root.appendChild(toolbar);

		// Create browser container (stub element for positioning)
		this.browserContainer = $('.browser-container');
		root.appendChild(this.browserContainer);

		// Setup URL input handler
		this._register(addDisposableListener(this.urlInput, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter' && this.urlInput && this.currentInput) {
				const url = this.urlInput.value.trim();
				if (url) {
					this.navigateToUrl(url);
				}
			}
		}));

		this._register(this.lifecycleService.onWillShutdown(() => {
			// Ensure browser view is destroyed on shutdown
			if (this.currentInput) {
				this.currentInput.dispose();
			}
			this.dispose();
		}));
	}

	override async setInput(input: BrowserEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		if (token.isCancellationRequested) {
			return;
		}

		this.currentInput = input;
		this.inputDisposables.clear();
		input.onWillDispose(() => {
			this.currentInput = undefined;
			this.browserViewService.destroyBrowserView(input.id);
		});

		// Create browser view in main process
		const state = await this.browserViewService.getOrCreateBrowserView(input.id, this.group.windowId);
		if (token.isCancellationRequested) {
			return;
		}

		// Initialize action states (disabled by default until we know navigation state)
		this.backAction.enabled = state.canGoBack;
		this.forwardAction.enabled = state.canGoForward;
		this.urlInput.value = state.url;

		if (input.url !== state.url) {
			// Navigate to the input URL if different
			void this.browserViewService.loadURL(input.id, input.url);
		}

		input.setTitle(state.title);
		input.setLoading(state.loading);

		// Register per-view events for this input
		this.inputDisposables.add(this.browserViewService.onDynamicDidKeyCommand(input.id)(event => {
			// Handle like webview does - convert to webview KeyEvent format
			this.handleKeyEventFromBrowserView(event);
		}));

		this.inputDisposables.add(this.browserViewService.onDynamicDidNavigate(input.id)(event => {
			if (event.url !== input.url) {
				this.group.pinEditor(input); // Navigated from within the browser -- pin the editor
			}

			// Update navigation state
			this.backAction.enabled = event.canGoBack;
			this.forwardAction.enabled = event.canGoForward;
			this.urlInput.value = event.url;
			input.setUrl(event.url);
		}));

		this.inputDisposables.add(this.browserViewService.onDynamicDidChangeLoadingState(input.id)(event => {
			input.setLoading(event.loading);
		}));

		this.inputDisposables.add(this.browserViewService.onDynamicDidChangeFavicon(input.id)(event => {
			input.setFavicon(event.favicon);
		}));

		this.inputDisposables.add(this.browserViewService.onDynamicDidChangeTitle(input.id)(event => {
			input.setTitle(event.title);
		}));

		this.layout();
		this.browserViewService.setVisible(this.currentInput.id, true);
	}

	protected override setEditorVisible(visible: boolean): void {
		if (this.currentInput) {
			this.browserViewService.setVisible(this.currentInput.id, visible);
		}

		super.setEditorVisible(visible);
	}

	private async navigateToUrl(url: string): Promise<void> {
		if (this.currentInput) {
			this.group.pinEditor(this.currentInput); // Pin the editor when navigating

			if (!/^https?:\/\//.test(url)) {
				// If no scheme provided, default to http (first -- this will be upgraded to https if supported)
				url = 'http://' + url;
			}
			await this.browserViewService.loadURL(this.currentInput.id, url);
		}
	}

	private async goBack(): Promise<void> {
		if (this.currentInput) {
			await this.browserViewService.goBack(this.currentInput.id);
		}
	}

	private async goForward(): Promise<void> {
		if (this.currentInput) {
			await this.browserViewService.goForward(this.currentInput.id);
		}
	}

	private async reload(): Promise<void> {
		if (this.currentInput) {
			await this.browserViewService.reload(this.currentInput.id);
		}
	}

	/**
	 * Capture a screenshot of the current browser view to use as placeholder background
	 */
	private async capturePlaceholderSnapshot(): Promise<void> {
		if (this.currentInput && !this.overlayVisible) {
			try {
				const dataUrl = await this.browserViewService.captureScreenshot(this.currentInput.id);
				this.browserContainer.style.backgroundImage = `url('${dataUrl}')`;
			} catch (error) {
				this.logService.error('browserEditor.capturePlaceholderSnapshot', error);
			}
		}
	}

	public forwardCurrentEvent(): boolean {
		if (this._currentKeyDownEvent && this.currentInput) {
			void this.browserViewService.dispatchKeyEvent(this.currentInput.id, this._currentKeyDownEvent);
			return true;
		}
		return false;
	}

	private async handleKeyEventFromBrowserView(keyEvent: IBrowserViewKeyDownEvent): Promise<void> {
		this._currentKeyDownEvent = keyEvent;

		try {
			const syntheticEvent = new KeyboardEvent('keydown', keyEvent);
			const standardEvent = new StandardKeyboardEvent(syntheticEvent);

			const handled = this.keybindingService.dispatchEvent(standardEvent, this.browserContainer);
			if (!handled) {
				this.forwardCurrentEvent();
			}
		} catch (error) {
			this.logService.error('Error in handleKeyEventFromBrowserView', error);
		} finally {
			this._currentKeyDownEvent = undefined;
		}
	}

	override layout(): void {
		if (this.currentInput) {
			const containerRect = this.browserContainer.getBoundingClientRect();
			this.browserViewService.layout(this.currentInput.id, {
				x: containerRect.left,
				y: containerRect.top,
				width: containerRect.width,
				height: containerRect.height,
				zoomFactor: getZoomFactor(this.window)
			});

			// After layout, check for overlay overlaps again
			const hasOverlappingOverlay = this.overlayManager.isOverlappingWithOverlays(this.browserContainer);
			if (hasOverlappingOverlay !== this.overlayVisible) {
				this.overlayVisible = hasOverlappingOverlay;

				if (hasOverlappingOverlay) {
					this.capturePlaceholderSnapshot();
				}

				this.browserContainer.classList.toggle('overlay-visible', hasOverlappingOverlay);
				this.browserViewService.setVisible(this.currentInput.id, !hasOverlappingOverlay);
			}
		}
	}

	override clearInput(): void {
		if (this.currentInput) {
			this.browserViewService.setVisible(this.currentInput.id, false);
		}

		this.currentInput = undefined;

		super.clearInput();
	}

	override dispose(): void {
		super.dispose();
	}
}
