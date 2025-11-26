/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/browser.css';
import { localize, localize2 } from '../../../../nls.js';
import { $, addDisposableListener, disposableWindowInterval, EventType } from '../../../../base/browser/dom.js';

import { Emitter, Event } from '../../../../base/common/event.js';

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { RawContextKey, IContextKey, IContextKeyService, ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { Action2, registerAction2, MenuId } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';

import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyMod, KeyCode } from '../../../../base/common/keyCodes.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { Codicon } from '../../../../base/common/codicons.js';
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
import { getZoomFactor, onDidChangeZoomLevel } from '../../../../base/browser/browser.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { WorkbenchHoverDelegate } from '../../../../platform/hover/browser/hover.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';

const CONTEXT_BROWSER_CAN_GO_BACK = new RawContextKey<boolean>('browserCanGoBack', false, localize('browserCanGoBack', "Whether the browser can go back"));
const CONTEXT_BROWSER_CAN_GO_FORWARD = new RawContextKey<boolean>('browserCanGoForward', false, localize('browserCanGoForward', "Whether the browser can go forward"));

class BrowserNavigationBar extends Disposable {
	private readonly _onDidNavigate = this._register(new Emitter<string>());
	readonly onDidNavigate: Event<string> = this._onDidNavigate.event;

	private readonly urlInput: HTMLInputElement;

	constructor(
		container: HTMLElement,
		instantiationService: IInstantiationService,
		scopedContextKeyService: IContextKeyService
	) {
		super();

		// Create hover delegate for toolbar buttons
		const hoverDelegate = this._register(
			instantiationService.createInstance(
				WorkbenchHoverDelegate,
				'element',
				undefined,
				{ position: { hoverPosition: HoverPosition.ABOVE } }
			)
		);

		// Create navigation toolbar (left side) with scoped context
		const navContainer = $('.browser-nav-toolbar');
		const scopedInstantiationService = instantiationService.createChild(new ServiceCollection(
			[IContextKeyService, scopedContextKeyService]
		));
		this._register(scopedInstantiationService.createInstance(
			MenuWorkbenchToolBar,
			navContainer,
			MenuId.BrowserNavigationToolbar,
			{
				hoverDelegate
			}
		));

		// URL input
		this.urlInput = $<HTMLInputElement>('input.browser-url-input');
		this.urlInput.type = 'text';
		this.urlInput.placeholder = localize('browserUrlPlaceholder', "Enter URL...");

		// Create actions toolbar (right side) with scoped context
		const actionsContainer = $('.browser-actions-toolbar');
		this._register(scopedInstantiationService.createInstance(
			MenuWorkbenchToolBar,
			actionsContainer,
			MenuId.BrowserActionsToolbar,
			{
				hoverDelegate
			}
		));

		// Assemble layout: nav | url | actions
		container.appendChild(navContainer);
		container.appendChild(this.urlInput);
		container.appendChild(actionsContainer);

		// Setup URL input handler
		this._register(addDisposableListener(this.urlInput, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter') {
				const url = this.urlInput.value.trim();
				if (url) {
					this._onDidNavigate.fire(url);
				}
			}
		}));
	}

	/**
	 * Update the navigation bar state from a navigation event
	 */
	updateFromNavigationEvent(event: IBrowserViewNavigationEvent): void {
		// URL input is updated, action enablement is handled by context keys
		this.urlInput.value = event.url;
	}

	/**
	 * Focus the URL input and select all text
	 */
	focusUrlInput(): void {
		this.urlInput.select();
		this.urlInput.focus();
	}
}

export class BrowserEditor extends EditorPane {
	static readonly ID = 'workbench.editor.browser';

	private overlayVisible = false;
	private editorVisible = false;

	private navigationBar!: BrowserNavigationBar;
	private browserContainer!: HTMLElement;
	private browserScopedContextKeyService!: IContextKeyService;
	private canGoBackContext!: IContextKey<boolean>;
	private canGoForwardContext!: IContextKey<boolean>;

	private model: IBrowserViewModel | undefined;
	private _currentKeyDownEvent: IBrowserViewKeyDownEvent | undefined;
	private readonly inputDisposables = this._register(new DisposableStore());

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IBrowserOverlayManager private readonly overlayManager: IBrowserOverlayManager,
		@ILogService private readonly logService: ILogService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService
	) {
		super(BrowserEditor.ID, group, telemetryService, themeService, storageService);
	}

	protected override createEditor(parent: HTMLElement): void {
		// Create scoped context key service for this editor instance
		this.browserScopedContextKeyService = this._register(this.contextKeyService.createScoped(parent));

		// Bind navigation capability context keys
		this.canGoBackContext = CONTEXT_BROWSER_CAN_GO_BACK.bindTo(this.browserScopedContextKeyService);
		this.canGoForwardContext = CONTEXT_BROWSER_CAN_GO_FORWARD.bindTo(this.browserScopedContextKeyService);

		// Create root container
		const root = $('.browser-root');
		parent.appendChild(root);

		// Create toolbar with navigation buttons and URL input
		const toolbar = $('.browser-toolbar');

		// Create navigation bar widget with scoped context
		this.navigationBar = this._register(new BrowserNavigationBar(toolbar, this.instantiationService, this.browserScopedContextKeyService || this.contextKeyService));

		// Listen for navigation from URL input
		this._register(this.navigationBar.onDidNavigate(url => this.navigateToUrl(url)));

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
		}, null, this.inputDisposables);

		// Initialize UI state and context keys from model
		this.updateNavigationState({
			url: this.model.url,
			canGoBack: this.model.canGoBack,
			canGoForward: this.model.canGoForward
		});
		this.browserContainer.style.backgroundImage = this.model.screenshot ? `url('${this.model.screenshot}')` : '';

		if (context.newInGroup) {
			this.navigationBar.focusUrlInput();
		}

		// Listen to model events for UI updates
		this.model.onDidKeyCommand(keyEvent => {
			// Handle like webview does - convert to webview KeyEvent format
			this.handleKeyEventFromBrowserView(keyEvent);
		}, null, this.inputDisposables);

		this.model.onDidNavigate((navEvent: IBrowserViewNavigationEvent) => {
			this.group.pinEditor(this.input); // pin editor on navigation

			// Update navigation bar and context keys from model
			this.updateNavigationState(navEvent);
		}, null, this.inputDisposables);

		this.model.onDidChangeFocus(({ focused }) => {
			// When the view gets focused, make sure the container also has focus.
			if (focused) {
				this.browserContainer.focus();
			}
		}, null, this.inputDisposables);

		this.overlayManager.onDidChangeOverlayState(() => {
			this.checkOverlays();
		}, null, this.inputDisposables);

		// Listen for zoom level changes and update browser view zoom factor
		onDidChangeZoomLevel(targetWindowId => {
			if (targetWindowId === this.window.vscodeWindowId) {
				this.layout();
			}
		}, null, this.inputDisposables);

		// Capture screenshot periodically (once per second) to keep background updated
		this.inputDisposables.add(disposableWindowInterval(
			this.window,
			() => this.capturePlaceholderSnapshot(),
			1000
		));

		this.layout();
		await this.model.setVisible(this.shouldShowView);
	}

	protected override setEditorVisible(visible: boolean): void {
		this.editorVisible = visible;
		this.updateVisibility();
	}

	private updateVisibility(): void {
		if (this.model) {
			this.browserContainer.classList.toggle('view-hidden', !this.shouldShowView);
			void this.model.setVisible(this.shouldShowView);
		}
	}

	private checkOverlays(): void {
		const hasOverlappingOverlay = this.overlayManager.isOverlappingWithOverlays(this.browserContainer);
		if (hasOverlappingOverlay !== this.overlayVisible) {
			this.overlayVisible = hasOverlappingOverlay;
			this.updateVisibility();
		}
	}

	private get shouldShowView(): boolean {
		return this.editorVisible && !this.overlayVisible;
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

	public async goBack(): Promise<void> {
		return this.model?.goBack();
	}

	public async goForward(): Promise<void> {
		return this.model?.goForward();
	}

	public async reload(): Promise<void> {
		return this.model?.reload();
	}

	/**
	 * Update navigation state and context keys
	 */
	private updateNavigationState(event: IBrowserViewNavigationEvent): void {
		// Update navigation bar UI
		this.navigationBar.updateFromNavigationEvent(event);

		// Update context keys for command enablement
		this.canGoBackContext.set(event.canGoBack);
		this.canGoForwardContext.set(event.canGoForward);
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
			this.checkOverlays();

			const containerRect = this.browserContainer.getBoundingClientRect();
			void this.model.layout({
				windowId: this.group.windowId,
				x: containerRect.left,
				y: containerRect.top,
				width: containerRect.width,
				height: containerRect.height,
				zoomFactor: getZoomFactor(this.window)
			});
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

// Context key expression to check if browser editor is active
const BROWSER_EDITOR_ACTIVE = ContextKeyExpr.equals('activeEditor', BrowserEditor.ID);

// Browser navigation commands

class GoBackAction extends Action2 {
	static readonly ID = 'workbench.action.browser.goBack';

	constructor() {
		super({
			id: GoBackAction.ID,
			title: localize2('browserGoBack', 'Go Back'),
			icon: Codicon.arrowLeft,
			f1: true,
			menu: {
				id: MenuId.BrowserNavigationToolbar,
				group: 'navigation',
				order: 1,
			},
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_CAN_GO_BACK),
			keybinding: {
				when: BROWSER_EDITOR_ACTIVE,
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.Alt | KeyCode.LeftArrow,
				secondary: [KeyCode.BrowserBack],
				mac: { primary: KeyMod.CtrlCmd | KeyCode.LeftArrow, secondary: [KeyCode.BrowserBack] }
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const activeEditorPane = editorService.activeEditorPane;
		if (activeEditorPane instanceof BrowserEditor) {
			await activeEditorPane.goBack();
		}
	}
}

class GoForwardAction extends Action2 {
	static readonly ID = 'workbench.action.browser.goForward';

	constructor() {
		super({
			id: GoForwardAction.ID,
			title: localize2('browserGoForward', 'Go Forward'),
			icon: Codicon.arrowRight,
			f1: true,
			menu: {
				id: MenuId.BrowserNavigationToolbar,
				group: 'navigation',
				order: 2,
				when: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_CAN_GO_FORWARD)
			},
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_CAN_GO_FORWARD),
			keybinding: {
				when: BROWSER_EDITOR_ACTIVE,
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.Alt | KeyCode.RightArrow,
				secondary: [KeyCode.BrowserForward],
				mac: { primary: KeyMod.CtrlCmd | KeyCode.RightArrow, secondary: [KeyCode.BrowserForward] }
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const activeEditorPane = editorService.activeEditorPane;
		if (activeEditorPane instanceof BrowserEditor) {
			await activeEditorPane.goForward();
		}
	}
}

class ReloadAction extends Action2 {
	static readonly ID = 'workbench.action.browser.reload';

	constructor() {
		super({
			id: ReloadAction.ID,
			title: localize2('browserReloadPage', 'Reload'),
			icon: Codicon.refresh,
			f1: true,
			menu: {
				id: MenuId.BrowserNavigationToolbar,
				group: 'navigation',
				order: 3,
			},
			precondition: BROWSER_EDITOR_ACTIVE,
			keybinding: {
				when: BROWSER_EDITOR_ACTIVE,
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyCode.F5,
				secondary: [KeyMod.CtrlCmd | KeyCode.KeyR],
				mac: { primary: KeyCode.F5, secondary: [KeyMod.CtrlCmd | KeyCode.KeyR] }
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const activeEditorPane = editorService.activeEditorPane;
		if (activeEditorPane instanceof BrowserEditor) {
			await activeEditorPane.reload();
		}
	}
}

// Register actions
registerAction2(GoBackAction);
registerAction2(GoForwardAction);
registerAction2(ReloadAction);

// No menu registration needed - actions are created directly in BrowserNavigationBar
