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
import { IBrowserViewModel } from '../../../services/browserView/common/browserView.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IBrowserViewKeyDownEvent, IBrowserViewNavigationEvent } from '../../../../platform/browserView/common/browserView.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { IBrowserOverlayManager } from './overlayManager.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { getZoomFactor, onDidChangeZoomLevel } from '../../../../base/browser/browser.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { WorkbenchHoverDelegate } from '../../../../platform/hover/browser/hover.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';

export class BrowserEditor extends EditorPane {
	static readonly ID = 'workbench.editor.browser';

	private urlInput!: HTMLInputElement;
	private browserContainer!: HTMLElement;
	private overlayVisible = false;

	private actionBar!: ActionBar;
	private backAction!: Action;
	private forwardAction!: Action;
	private reloadAction!: Action;
	private hoverDelegate: WorkbenchHoverDelegate;

	private model: IBrowserViewModel | undefined;
	private _currentKeyDownEvent: IBrowserViewKeyDownEvent | undefined;
	private readonly inputDisposables = this._register(new DisposableStore());

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IBrowserOverlayManager private readonly overlayManager: IBrowserOverlayManager,
		@ILogService private readonly logService: ILogService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super(BrowserEditor.ID, group, telemetryService, themeService, storageService);

		this.hoverDelegate = this._register(
			this.instantiationService.createInstance(
				WorkbenchHoverDelegate,
				'element',
				undefined,
				{ position: { hoverPosition: HoverPosition.ABOVE } }
			)
		);

		this._register(this.overlayManager.onDidChangeOverlayState(() => {
			if (!this.model) {
				return;
			}

			// Check if any overlay is overlapping with our browser container
			const hasOverlappingOverlay = this.overlayManager.isOverlappingWithOverlays(this.browserContainer);
			if (hasOverlappingOverlay !== this.overlayVisible) {
				this.overlayVisible = hasOverlappingOverlay;

				this.browserContainer.classList.toggle('overlay-visible', hasOverlappingOverlay);
				void this.model.setVisible(!hasOverlappingOverlay);
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
		this.actionBar = this._register(new ActionBar(navContainer, {
			// Show tooltips above the buttons so we don't have to blur the view when hovering
			hoverDelegate: this.hoverDelegate
		}));
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
		this.browserContainer.tabIndex = 0; // make focusable
		root.appendChild(this.browserContainer);

		this._register(addDisposableListener(this.browserContainer, EventType.FOCUS, (event) => {
			// When the browser container gets focus, make sure the browser view also gets focused.
			// But only if focus was already in the workbench (and not e.g. clicking back into the workbench from the browser view).
			if (event.relatedTarget && this.model) {
				void this.model.focus();
			}
		}));

		this._register(addDisposableListener(this.browserContainer, EventType.BLUR, () => {
			// When focus goes to another part of the workbench, make sure the workbench view becomes focused.
			const focused = this.window.document.activeElement;
			if (focused && focused !== this.browserContainer) {
				this.window.focus();
			}
		}));

		// Setup URL input handler
		this._register(addDisposableListener(this.urlInput, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter' && this.urlInput) {
				const url = this.urlInput.value.trim();
				if (url) {
					this.navigateToUrl(url);
				}
			}
		}));

		this._register(this.lifecycleService.onWillShutdown(() => {
			// Ensure browser view is destroyed on shutdown
			if (this.model) {
				this.model.dispose();
			}
			this.dispose();
		}));
	}

	override async setInput(input: BrowserEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		if (token.isCancellationRequested) {
			return;
		}

		this.inputDisposables.clear();

		// Resolve the browser view model from the input
		this.model = await input.resolve();
		if (token.isCancellationRequested) {
			return;
		}

		// Clean up on input disposal
		input.onWillDispose(() => {
			this.model = undefined;
		});

		// Initialize UI state from model
		this.backAction.enabled = this.model.canGoBack;
		this.forwardAction.enabled = this.model.canGoForward;
		this.urlInput.value = this.model.url;

		if (context.newInGroup) {
			this.urlInput.select();
			this.urlInput.focus();
		}

		// Listen to model events for UI updates
		this.inputDisposables.add(this.model.onDidKeyCommand(keyEvent => {
			// Handle like webview does - convert to webview KeyEvent format
			this.handleKeyEventFromBrowserView(keyEvent);
		}));

		this.inputDisposables.add(this.model.onDidNavigate((navEvent: IBrowserViewNavigationEvent) => {
			this.group.pinEditor(this.input); // pin editor on navigation

			// Update UI state from model
			this.backAction.enabled = navEvent.canGoBack;
			this.forwardAction.enabled = navEvent.canGoForward;
			this.urlInput.value = navEvent.url;
		}));

		this.inputDisposables.add(this.model.onDidChangeFocus(({ focused }) => {
			// When the view gets focused, make sure the container also has focus.
			if (focused) {
				this.browserContainer.focus();
			}
		}));

		this.layout();
		await this.model.setVisible(true);
	}

	protected override setEditorVisible(visible: boolean): void {
		void this.model?.setVisible(visible);
	}

	private async navigateToUrl(url: string): Promise<void> {
		if (this.model) {
			this.group.pinEditor(this.input); // pin editor on navigation

			if (!/^https?:\/\//.test(url)) {
				// If no scheme provided, default to http (first -- this will be upgraded to https if supported)
				url = 'http://' + url;
			}

			await this.model.loadURL(url);
		}
	}

	private async goBack(): Promise<void> {
		return this.model?.goBack();
	}

	private async goForward(): Promise<void> {
		return this.model?.goForward();
	}

	private async reload(): Promise<void> {
		return this.model?.reload();
	}

	/**
	 * Capture a screenshot of the current browser view to use as placeholder background
	 */
	private async capturePlaceholderSnapshot(): Promise<void> {
		if (this.model && !this.overlayVisible) {
			try {
				const dataUrl = await this.model.captureScreenshot(80);
				this.browserContainer.style.backgroundImage = `url('${dataUrl}')`;
			} catch (error) {
				this.logService.error('browserEditor.capturePlaceholderSnapshot', error);
			}
		}
	}

	public forwardCurrentEvent(): boolean {
		if (this._currentKeyDownEvent && this.model) {
			void this.model.dispatchKeyEvent(this._currentKeyDownEvent);
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
		if (this.model) {
			const containerRect = this.browserContainer.getBoundingClientRect();
			void this.model.layout({
				windowId: this.group.windowId,
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
				void this.model.setVisible(!hasOverlappingOverlay);
			}
		}
	}

	override clearInput(): void {
		void this.model?.setVisible(false);
		this.model = undefined;
		this.browserContainer.style.backgroundImage = '';
		this.inputDisposables.clear();

		super.clearInput();
	}
}
