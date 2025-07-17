/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/titlebarpart.css';
import { localize, localize2 } from '../../../../nls.js';
import { MultiWindowParts, Part } from '../../part.js';
import { ITitleService } from '../../../services/title/browser/titleService.js';
import { getWCOTitlebarAreaRect, getZoomFactor, isWCOEnabled } from '../../../../base/browser/browser.js';
import { MenuBarVisibility, getTitleBarStyle, getMenuBarVisibility, hasCustomTitlebar, hasNativeTitlebar, DEFAULT_CUSTOM_TITLEBAR_HEIGHT, getWindowControlsStyle, WindowControlsStyle, TitlebarStyle, MenuSettings, hasNativeMenu } from '../../../../platform/window/common/window.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { IConfigurationService, IConfigurationChangeEvent } from '../../../../platform/configuration/common/configuration.js';
import { DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { IBrowserWorkbenchEnvironmentService } from '../../../services/environment/browser/environmentService.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { TITLE_BAR_ACTIVE_BACKGROUND, TITLE_BAR_ACTIVE_FOREGROUND, TITLE_BAR_INACTIVE_FOREGROUND, TITLE_BAR_INACTIVE_BACKGROUND, TITLE_BAR_BORDER, WORKBENCH_BACKGROUND } from '../../../common/theme.js';
import { isMacintosh, isWindows, isLinux, isWeb, isNative, platformLocale } from '../../../../base/common/platform.js';
import { Color } from '../../../../base/common/color.js';
import { EventType, EventHelper, Dimension, append, $, addDisposableListener, prepend, reset, getWindow, getWindowId, isAncestor, getActiveDocument, isHTMLElement } from '../../../../base/browser/dom.js';
import { CustomMenubarControl } from './menubarControl.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { Parts, IWorkbenchLayoutService, ActivityBarPosition, LayoutSettings, EditorActionsLocation, EditorTabsMode } from '../../../services/layout/browser/layoutService.js';
import { createActionViewItem, fillInActionBarActions as fillInActionBarActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { Action2, IMenu, IMenuService, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { WindowTitle } from './windowTitle.js';
import { CommandCenterControl } from './commandCenterControl.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { WorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { ACCOUNTS_ACTIVITY_ID, GLOBAL_ACTIVITY_ID } from '../../../common/activity.js';
import { AccountsActivityActionViewItem, isAccountsActionVisible, SimpleAccountActivityActionViewItem, SimpleGlobalActivityActionViewItem } from '../globalCompositeBar.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { IEditorGroupsContainer, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { ActionRunner, IAction } from '../../../../base/common/actions.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ActionsOrientation, IActionViewItem, prepareActions } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { EDITOR_CORE_NAVIGATION_COMMANDS } from '../editor/editorCommands.js';
import { AnchorAlignment } from '../../../../base/browser/ui/contextview/contextview.js';
import { EditorPane } from '../editor/editorPane.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ResolvedKeybinding } from '../../../../base/common/keybindings.js';
import { EditorCommandsContextActionRunner } from '../editor/editorTabsControl.js';
import { IEditorCommandsContext, IEditorPartOptionsChangeEvent, IToolbarActions } from '../../../common/editor.js';
import { CodeWindow, mainWindow } from '../../../../base/browser/window.js';
import { ACCOUNTS_ACTIVITY_TILE_ACTION, GLOBAL_ACTIVITY_TITLE_ACTION } from './titlebarActions.js';
import { IView } from '../../../../base/browser/ui/grid/grid.js';
import { createInstantHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IBaseActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegate.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { safeIntl } from '../../../../base/common/date.js';
import { IsCompactTitleBarContext, TitleBarVisibleContext } from '../../../common/contextkeys.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import '../../../../workbench/contrib/salesforce/browser/authorizeCommands.js';
import { onOrgAuthorizationChanged } from '../../../../workbench/contrib/salesforce/browser/authorizeCommands.js';


export interface ITitleVariable {
	readonly name: string;
	readonly contextKey: string;
}

export interface ITitleProperties {
	isPure?: boolean;
	isAdmin?: boolean;
	prefix?: string;
}

export interface ITitlebarPart extends IDisposable {

	/**
	 * An event when the menubar visibility changes.
	 */
	readonly onMenubarVisibilityChange: Event<boolean>;

	/**
	 * Update some environmental title properties.
	 */
	updateProperties(properties: ITitleProperties): void;

	/**
	 * Adds variables to be supported in the window title.
	 */
	registerVariables(variables: ITitleVariable[]): void;
}

export class BrowserTitleService extends MultiWindowParts<BrowserTitlebarPart> implements ITitleService {

	declare _serviceBrand: undefined;

	readonly mainPart: BrowserTitlebarPart;

	constructor(
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@IThemeService themeService: IThemeService
	) {
		super('workbench.titleService', themeService, storageService);

		this.mainPart = this._register(this.createMainTitlebarPart());
		this.onMenubarVisibilityChange = this.mainPart.onMenubarVisibilityChange;
		this._register(this.registerPart(this.mainPart));

		this.registerActions();
		this.registerAPICommands();
	}

	protected createMainTitlebarPart(): BrowserTitlebarPart {
		return this.instantiationService.createInstance(MainBrowserTitlebarPart);
	}

	private registerActions(): void {

		// Focus action
		const that = this;
		this._register(registerAction2(class FocusTitleBar extends Action2 {

			constructor() {
				super({
					id: `workbench.action.focusTitleBar`,
					title: localize2('focusTitleBar', 'Focus Title Bar'),
					category: Categories.View,
					f1: true,
					precondition: TitleBarVisibleContext
				});
			}

			run(): void {
				that.getPartByDocument(getActiveDocument())?.focus();
			}
		}));
	}

	private registerAPICommands(): void {
		this._register(CommandsRegistry.registerCommand({
			id: 'registerWindowTitleVariable',
			handler: (accessor: ServicesAccessor, name: string, contextKey: string) => {
				this.registerVariables([{ name, contextKey }]);
			},
			metadata: {
				description: 'Registers a new title variable',
				args: [
					{ name: 'name', schema: { type: 'string' }, description: 'The name of the variable to register' },
					{ name: 'contextKey', schema: { type: 'string' }, description: 'The context key to use for the value of the variable' }
				]
			}
		}));
	}

	//#region Auxiliary Titlebar Parts

	createAuxiliaryTitlebarPart(container: HTMLElement, editorGroupsContainer: IEditorGroupsContainer, instantiationService: IInstantiationService): IAuxiliaryTitlebarPart {
		const titlebarPartContainer = $('.part.titlebar', { role: 'none' });
		titlebarPartContainer.style.position = 'relative';
		container.insertBefore(titlebarPartContainer, container.firstChild); // ensure we are first element

		const disposables = new DisposableStore();

		const titlebarPart = this.doCreateAuxiliaryTitlebarPart(titlebarPartContainer, editorGroupsContainer, instantiationService);
		disposables.add(this.registerPart(titlebarPart));

		disposables.add(Event.runAndSubscribe(titlebarPart.onDidChange, () => titlebarPartContainer.style.height = `${titlebarPart.height}px`));
		titlebarPart.create(titlebarPartContainer);

		if (this.properties) {
			titlebarPart.updateProperties(this.properties);
		}

		if (this.variables.size) {
			titlebarPart.registerVariables(Array.from(this.variables.values()));
		}

		Event.once(titlebarPart.onWillDispose)(() => disposables.dispose());

		return titlebarPart;
	}

	protected doCreateAuxiliaryTitlebarPart(container: HTMLElement, editorGroupsContainer: IEditorGroupsContainer, instantiationService: IInstantiationService): BrowserTitlebarPart & IAuxiliaryTitlebarPart {
		return instantiationService.createInstance(AuxiliaryBrowserTitlebarPart, container, editorGroupsContainer, this.mainPart);
	}

	//#endregion


	//#region Service Implementation

	readonly onMenubarVisibilityChange: Event<boolean>;

	private properties: ITitleProperties | undefined = undefined;

	updateProperties(properties: ITitleProperties): void {
		this.properties = properties;

		for (const part of this.parts) {
			part.updateProperties(properties);
		}
	}

	private readonly variables = new Map<string, ITitleVariable>();

	registerVariables(variables: ITitleVariable[]): void {
		const newVariables: ITitleVariable[] = [];

		for (const variable of variables) {
			if (!this.variables.has(variable.name)) {
				this.variables.set(variable.name, variable);
				newVariables.push(variable);
			}
		}

		for (const part of this.parts) {
			part.registerVariables(newVariables);
		}
	}

	//#endregion
}

export class BrowserTitlebarPart extends Part implements ITitlebarPart {
	//#region IView
	readonly minimumWidth: number = 0;
	readonly maximumWidth: number = Number.POSITIVE_INFINITY;

	get minimumHeight(): number {
		const wcoEnabled = isWeb && isWCOEnabled();
		let value = this.isCommandCenterVisible || wcoEnabled ? DEFAULT_CUSTOM_TITLEBAR_HEIGHT : 30;
		if (wcoEnabled) {
			value = Math.max(value, getWCOTitlebarAreaRect(getWindow(this.element))?.height ?? 0);
		}

		return value / (this.preventZoom ? getZoomFactor(getWindow(this.element)) : 1);
	}

	get maximumHeight(): number { return this.minimumHeight; }

	//#endregion

	//#region Events

	private _onMenubarVisibilityChange = this._register(new Emitter<boolean>());
	readonly onMenubarVisibilityChange = this._onMenubarVisibilityChange.event;

	private readonly _onWillDispose = this._register(new Emitter<void>());
	readonly onWillDispose = this._onWillDispose.event;

	//#endregion

	protected rootContainer!: HTMLElement;
	protected windowControlsContainer: HTMLElement | undefined;

	protected dragRegion: HTMLElement | undefined;
	private title!: HTMLElement;

	private leftContent!: HTMLElement;
	private centerContent!: HTMLElement;
	private rightContent!: HTMLElement;

	protected readonly customMenubar = this._register(new MutableDisposable<CustomMenubarControl>());
	protected appIcon: HTMLElement | undefined;
	private appIconBadge: HTMLElement | undefined;
	protected menubar?: HTMLElement;
	private lastLayoutDimensions: Dimension | undefined;

	private actionToolBar!: WorkbenchToolBar;
	private readonly actionToolBarDisposable = this._register(new DisposableStore());
	private readonly editorActionsChangeDisposable = this._register(new DisposableStore());
	private actionToolBarElement!: HTMLElement;

	private globalToolbarMenu: IMenu | undefined;
	private layoutToolbarMenu: IMenu | undefined;

	private readonly globalToolbarMenuDisposables = this._register(new DisposableStore());
	private readonly editorToolbarMenuDisposables = this._register(new DisposableStore());
	private readonly layoutToolbarMenuDisposables = this._register(new DisposableStore());
	private readonly activityToolbarDisposables = this._register(new DisposableStore());

	private readonly hoverDelegate: IHoverDelegate;

	private readonly titleDisposables = this._register(new DisposableStore());
	private titleBarStyle: TitlebarStyle;

	private isInactive: boolean = false;

	private readonly isAuxiliary: boolean;
	private isCompact = false;

	private readonly isCompactContextKey: IContextKey<boolean>;

	private readonly windowTitle: WindowTitle;

	constructor(
		id: string,
		targetWindow: CodeWindow,
		private readonly editorGroupsContainer: IEditorGroupsContainer,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IConfigurationService protected readonly configurationService: IConfigurationService,
		@IBrowserWorkbenchEnvironmentService protected readonly environmentService: IBrowserWorkbenchEnvironmentService,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IStorageService private readonly storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IContextKeyService protected readonly contextKeyService: IContextKeyService,
		@IHostService private readonly hostService: IHostService,
		@IEditorService private readonly editorService: IEditorService,
		@IMenuService private readonly menuService: IMenuService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,

	) {
		super(id, { hasTitle: false }, themeService, storageService, layoutService);

		this.isAuxiliary = targetWindow.vscodeWindowId !== mainWindow.vscodeWindowId;

		this.isCompactContextKey = IsCompactTitleBarContext.bindTo(this.contextKeyService);

		this.titleBarStyle = getTitleBarStyle(this.configurationService);

		this.windowTitle = this._register(instantiationService.createInstance(WindowTitle, targetWindow));

		this.hoverDelegate = this._register(createInstantHoverDelegate());

		this.registerListeners(getWindowId(targetWindow));
	}

	private registerListeners(targetWindowId: number): void {
		this._register(this.hostService.onDidChangeFocus(focused => focused ? this.onFocus() : this.onBlur()));
		this._register(this.hostService.onDidChangeActiveWindow(windowId => windowId === targetWindowId ? this.onFocus() : this.onBlur()));
		this._register(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationChanged(e)));
		this._register(this.editorGroupsContainer.onDidChangeEditorPartOptions(e => this.onEditorPartConfigurationChange(e)));
	}

	private onBlur(): void {
		this.isInactive = true;

		this.updateStyles();
	}

	private onFocus(): void {
		this.isInactive = false;

		this.updateStyles();
	}

	private onEditorPartConfigurationChange({ oldPartOptions, newPartOptions }: IEditorPartOptionsChangeEvent): void {
		if (
			oldPartOptions.editorActionsLocation !== newPartOptions.editorActionsLocation ||
			oldPartOptions.showTabs !== newPartOptions.showTabs
		) {
			if (hasCustomTitlebar(this.configurationService, this.titleBarStyle) && this.actionToolBar) {
				this.createActionToolBar();
				this.createActionToolBarMenus({ editorActions: true });
				this._onDidChange.fire(undefined);
			}
		}
	}

	protected onConfigurationChanged(event: IConfigurationChangeEvent): void {

		// Custom menu bar (disabled if auxiliary)
		if (!this.isAuxiliary && !hasNativeMenu(this.configurationService, this.titleBarStyle) && (!isMacintosh || isWeb)) {
			if (event.affectsConfiguration(MenuSettings.MenuBarVisibility)) {
				if (this.currentMenubarVisibility === 'compact') {
					this.uninstallMenubar();
				} else {
					this.installMenubar();
				}
			}
		}

		// Actions
		if (hasCustomTitlebar(this.configurationService, this.titleBarStyle) && this.actionToolBar) {
			const affectsLayoutControl = event.affectsConfiguration(LayoutSettings.LAYOUT_ACTIONS);
			const affectsActivityControl = event.affectsConfiguration(LayoutSettings.ACTIVITY_BAR_LOCATION);

			if (affectsLayoutControl || affectsActivityControl) {
				this.createActionToolBarMenus({ layoutActions: affectsLayoutControl, activityActions: affectsActivityControl });

				this._onDidChange.fire(undefined);
			}
		}

		// Command Center
		if (event.affectsConfiguration(LayoutSettings.COMMAND_CENTER)) {
			this.recreateTitle();
		}
	}

	private recreateTitle(): void {
		this.createTitle();

		this._onDidChange.fire(undefined);
	}

	updateOptions(options: { compact: boolean }): void {
		const oldIsCompact = this.isCompact;
		this.isCompact = options.compact;

		this.isCompactContextKey.set(this.isCompact);

		if (oldIsCompact !== this.isCompact) {
			this.recreateTitle();
			this.createActionToolBarMenus(true);
		}
	}

	protected installMenubar(): void {
		if (this.menubar) {
			return; // If the menubar is already installed, skip
		}

		this.customMenubar.value = this.instantiationService.createInstance(CustomMenubarControl);

		this.menubar = append(this.leftContent, $('div.menubar'));
		this.menubar.setAttribute('role', 'menubar');

		this._register(this.customMenubar.value.onVisibilityChange(e => this.onMenubarVisibilityChanged(e)));

		this.customMenubar.value.create(this.menubar);
	}

	private uninstallMenubar(): void {
		this.customMenubar.value = undefined;

		this.menubar?.remove();
		this.menubar = undefined;

		this.onMenubarVisibilityChanged(false);
	}

	protected onMenubarVisibilityChanged(visible: boolean): void {
		if (isWeb || isWindows || isLinux) {
			if (this.lastLayoutDimensions) {
				this.layout(this.lastLayoutDimensions.width, this.lastLayoutDimensions.height);
			}

			this._onMenubarVisibilityChange.fire(visible);
		}
	}

	updateProperties(properties: ITitleProperties): void {
		this.windowTitle.updateProperties(properties);
	}

	registerVariables(variables: ITitleVariable[]): void {
		this.windowTitle.registerVariables(variables);
	}

	protected override createContentArea(parent: HTMLElement): HTMLElement {
		this.element = parent;
		this.rootContainer = append(parent, $('.titlebar-container'));

		this.leftContent = append(this.rootContainer, $('.titlebar-left'));
		this.centerContent = append(this.rootContainer, $('.titlebar-center'));
		this.rightContent = append(this.rootContainer, $('.titlebar-right'));

		// App Icon (Windows, Linux)
		if ((isWindows || isLinux) && !hasNativeTitlebar(this.configurationService, this.titleBarStyle)) {
			this.appIcon = prepend(this.leftContent, $('a.window-appicon'));
		}

		// Draggable region that we can manipulate for #52522
		this.dragRegion = prepend(this.rootContainer, $('div.titlebar-drag-region'));

		// Menubar: install a custom menu bar depending on configuration
		if (
			!this.isAuxiliary &&
			!hasNativeMenu(this.configurationService, this.titleBarStyle) &&
			(!isMacintosh || isWeb) &&
			this.currentMenubarVisibility !== 'compact'
		) {
			this.installMenubar();
		}

		// Title

		this.title = append(this.centerContent, $('div.window-title'));
		this.createTitle();


		// Create Toolbar Actions
		if (hasCustomTitlebar(this.configurationService, this.titleBarStyle)) {
			this.actionToolBarElement = append(this.rightContent, $('div.action-toolbar-container'));
			// Add the AuthorizedOrg interface at the top
			interface AuthorizedOrg {
				username: string;
				alias: string;
				authorised: boolean;
			}
			try {
				const chatButton = append(this.rightContent, $('div.action-toolbar-container'));
				chatButton.innerText = '💬 Chat';
				chatButton.title = 'Chat';
				chatButton.style.marginLeft = '40px';
				chatButton.style.marginTop = '11px';
				chatButton.style.padding = '4px 8px';
				chatButton.style.cursor = 'pointer';
				chatButton.style.backgroundColor = '#3c3c3c';
				chatButton.style.color = '#cccccc';
				chatButton.style.border = '1px  #565656';
				chatButton.style.borderRadius = '3px';
				chatButton.style.fontSize = '12px';
				chatButton.style.zIndex = '10';

				this._register(addDisposableListener(chatButton, EventType.CLICK, () => {
					console.log('Chat button clicked');

					if (!this.layoutService) {
						console.error('layoutService is undefined!');
						return;
					}

					// Simply show the auxiliary bar (secondary side bar)
					this.layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
				}));
			} catch (error) {
				console.error('Error adding chat button:', error);
			}


			// Import the event emitter (add this import at the top of your file)

			// Add your custom button with dropdown
			const buttonContainer = append(this.actionToolBarElement, $('div.custom-button-container'));
			buttonContainer.style.display = 'flex';
			buttonContainer.style.alignItems = 'center';

			// Current org display - now clickable and at the top
			const currentOrgDisplay = append(buttonContainer, $('button.current-org-display'));
			currentOrgDisplay.style.marginRight = '4px';
			currentOrgDisplay.style.padding = '2px 6px';
			currentOrgDisplay.style.backgroundColor = '#3c3c3c';
			currentOrgDisplay.style.border = '1px solid #565656';
			currentOrgDisplay.style.borderRadius = '3px';
			currentOrgDisplay.style.fontSize = '11px';
			currentOrgDisplay.style.color = '#cccccc';
			currentOrgDisplay.style.cursor = 'pointer';
			currentOrgDisplay.style.order = '1'; // Display first

			// Function to update current org display
			const updateCurrentOrgDisplay = async () => {
				try {
					const authorizedOrgs = await this.instantiationService.invokeFunction(async accessor => {
						const commandService = accessor.get(ICommandService);
						return await commandService.executeCommand('salesforce.getAuthorizedOrgs');
					});

					const currentOrg = authorizedOrgs.find((org: AuthorizedOrg) => org.authorised === true);

					if (currentOrg) {
						currentOrgDisplay.innerText = `☁ ${currentOrg.alias}`;
						currentOrgDisplay.style.display = 'inline-block';
						currentOrgDisplay.title = `Current Org: ${currentOrg.alias} (${currentOrg.username}) - Click to switch`;
					} else {
						currentOrgDisplay.innerText = '☁ No Org';
						currentOrgDisplay.style.display = 'inline-block';
						currentOrgDisplay.title = 'No authorized org selected - Click to select one';
					}
				} catch (error) {
					console.error('Failed to get current org:', error);
					currentOrgDisplay.innerText = '☁ Error';
					currentOrgDisplay.style.display = 'inline-block';
					currentOrgDisplay.title = 'Error loading org info - Click to try again';
				}
			};

			// Initial load of current org
			updateCurrentOrgDisplay();

			// Register event listener for org authorization changes
			// This will automatically update the display when org changes
			this._register(onOrgAuthorizationChanged.event(() => {
				updateCurrentOrgDisplay();
			}));

			// Click handler for current org display - opens command palette
			this._register(addDisposableListener(currentOrgDisplay, EventType.CLICK, async () => {
				try {
					await this.instantiationService.invokeFunction(async accessor => {
						const commandService = accessor.get(ICommandService);
						await commandService.executeCommand('salesforce.showAuthorizedOrgs');
					});

					// The updateCurrentOrgDisplay will be called automatically via the event listener
					// No need for setTimeout here anymore
				} catch (error) {
					console.error('Failed to show authorized orgs:', error);
				}
			}));

			// Main "Authorize Org" button
			const authorizeButton = append(buttonContainer, $('button.custom-titlebar-button'));
			authorizeButton.innerText = ' 🚀Authorize Org';
			authorizeButton.style.marginLeft = '4px';
			authorizeButton.style.padding = '2px 6px';
			authorizeButton.style.cursor = 'pointer';
			authorizeButton.style.backgroundColor = '#3c3c3c';
			authorizeButton.style.color = '#cccccc';
			authorizeButton.style.border = '1px solid #565656';
			authorizeButton.style.borderRadius = '3px';
			authorizeButton.style.fontSize = '11px';
			authorizeButton.style.order = '2'; // Display second

			// Click handler for "Authorize Org"
			this._register(addDisposableListener(authorizeButton, EventType.CLICK, async () => {
				const originalText = authorizeButton.innerText;
				authorizeButton.innerText = 'Authorizing...';
				try {
					await this.instantiationService.invokeFunction(async accessor => {
						const commandService = accessor.get(ICommandService);
						await commandService.executeCommand('salesforce.authorizeOrg');
					});

					// Reset button text immediately as the update will happen via event listener
					authorizeButton.innerText = originalText;
					// The updateCurrentOrgDisplay will be called automatically via the event listener
					// when the authorization completes
				} catch (error) {
					console.error('Failed to authorize org:', error);
					authorizeButton.innerText = 'Error!';
					authorizeButton.style.backgroundColor = '#ea001e';
					authorizeButton.style.color = 'white';
					setTimeout(() => {
						authorizeButton.innerText = originalText;
						authorizeButton.style.backgroundColor = '#3c3c3c';
						authorizeButton.style.color = '#cccccc';
					}, 2000);
				}
			}));
			this.createActionToolBar();
			this.createActionToolBarMenus();
		}

		// Window Controls Container
		if (!hasNativeTitlebar(this.configurationService, this.titleBarStyle)) {
			let primaryWindowControlsLocation = isMacintosh ? 'left' : 'right';
			if (isMacintosh && isNative) {

				// Check if the locale is RTL, macOS will move traffic lights in RTL locales
				// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Locale/textInfo

				const localeInfo = safeIntl.Locale(platformLocale).value as any;
				if (localeInfo?.textInfo?.direction === 'rtl') {
					primaryWindowControlsLocation = 'right';
				}
			}

			if (isMacintosh && isNative && primaryWindowControlsLocation === 'left') {
				// macOS native: controls are on the left and the container is not needed to make room
				// for something, except for web where a custom menu being supported). not putting the
				// container helps with allowing to move the window when clicking very close to the
				// window control buttons.
			} else if (getWindowControlsStyle(this.configurationService) === WindowControlsStyle.HIDDEN) {
				// Linux/Windows: controls are explicitly disabled
			} else {
				this.windowControlsContainer = append(primaryWindowControlsLocation === 'left' ? this.leftContent : this.rightContent, $('div.window-controls-container'));
				if (isWeb) {
					// Web: its possible to have control overlays on both sides, for example on macOS
					// with window controls on the left and PWA controls on the right.
					append(primaryWindowControlsLocation === 'left' ? this.rightContent : this.leftContent, $('div.window-controls-container'));
				}

				if (isWCOEnabled()) {
					this.windowControlsContainer.classList.add('wco-enabled');
				}
			}
		}

		// Context menu over title bar: depending on the OS and the location of the click this will either be
		// the overall context menu for the entire title bar or a specific title context menu.
		// Windows / Linux: we only support the overall context menu on the title bar
		// macOS: we support both the overall context menu and the title context menu.
		//        in addition, we allow Cmd+click to bring up the title context menu.
		{
			this._register(addDisposableListener(this.rootContainer, EventType.CONTEXT_MENU, e => {
				EventHelper.stop(e);

				let targetMenu: MenuId;
				if (isMacintosh && isHTMLElement(e.target) && isAncestor(e.target, this.title)) {
					targetMenu = MenuId.TitleBarTitleContext;
				} else {
					targetMenu = MenuId.TitleBarContext;
				}

				this.onContextMenu(e, targetMenu);
			}));

			if (isMacintosh) {
				this._register(addDisposableListener(this.title, EventType.MOUSE_DOWN, e => {
					if (e.metaKey) {
						EventHelper.stop(e, true /* stop bubbling to prevent command center from opening */);

						this.onContextMenu(e, MenuId.TitleBarTitleContext);
					}
				}, true /* capture phase to prevent command center from opening */));
			}
		}

		this.updateStyles();

		return this.element;
	}

	private createTitle(): void {
		this.titleDisposables.clear();

		const isShowingTitleInNativeTitlebar = hasNativeTitlebar(this.configurationService, this.titleBarStyle);

		// Text Title
		if (!this.isCommandCenterVisible) {
			if (!isShowingTitleInNativeTitlebar) {
				this.title.innerText = this.windowTitle.value;
				this.titleDisposables.add(this.windowTitle.onDidChange(() => {
					this.title.innerText = this.windowTitle.value;
					if (this.lastLayoutDimensions) {
						this.updateLayout(this.lastLayoutDimensions);
					}
				}));

				// // ✅ Create a button
				const customButton = document.createElement("button");
				customButton.innerText = "Click Me";
				customButton.style.marginLeft = "10px"; // optional spacing
				customButton.style.padding = "4px 8px";
				customButton.style.cursor = "pointer";

				// Optional: Add a click handler
				customButton.addEventListener("click", () => {
					alert("Button in title clicked!");
				});

				this.title.appendChild(customButton);
			} else {
				reset(this.title);
			}
		}

		// Menu Title
		else {
			const commandCenter = this.instantiationService.createInstance(CommandCenterControl, this.windowTitle, this.hoverDelegate);
			reset(this.title, commandCenter.element);
			this.titleDisposables.add(commandCenter);
		}
	}

	private actionViewItemProvider(action: IAction, options: IBaseActionViewItemOptions): IActionViewItem | undefined {

		// --- Activity Actions
		if (!this.isAuxiliary) {
			if (action.id === GLOBAL_ACTIVITY_ID) {
				return this.instantiationService.createInstance(SimpleGlobalActivityActionViewItem, { position: () => HoverPosition.BELOW }, options);
			}
			if (action.id === ACCOUNTS_ACTIVITY_ID) {
				return this.instantiationService.createInstance(SimpleAccountActivityActionViewItem, { position: () => HoverPosition.BELOW }, options);
			}
		}

		// --- Editor Actions
		const activeEditorPane = this.editorGroupsContainer.activeGroup?.activeEditorPane;
		if (activeEditorPane && activeEditorPane instanceof EditorPane) {
			const result = activeEditorPane.getActionViewItem(action, options);

			if (result) {
				return result;
			}
		}

		// Check extensions
		return createActionViewItem(this.instantiationService, action, { ...options, menuAsChild: false });
	}

	private getKeybinding(action: IAction): ResolvedKeybinding | undefined {
		const editorPaneAwareContextKeyService = this.editorGroupsContainer.activeGroup?.activeEditorPane?.scopedContextKeyService ?? this.contextKeyService;

		return this.keybindingService.lookupKeybinding(action.id, editorPaneAwareContextKeyService);
	}

	private createActionToolBar(): void {

		// Creates the action tool bar. Depends on the configuration of the title bar menus
		// Requires to be recreated whenever editor actions enablement changes

		this.actionToolBarDisposable.clear();

		this.actionToolBar = this.actionToolBarDisposable.add(this.instantiationService.createInstance(WorkbenchToolBar, this.actionToolBarElement, {
			contextMenu: MenuId.TitleBarContext,
			orientation: ActionsOrientation.HORIZONTAL,
			ariaLabel: localize('ariaLabelTitleActions', "Title actions"),
			getKeyBinding: action => this.getKeybinding(action),
			overflowBehavior: { maxItems: 9, exempted: [ACCOUNTS_ACTIVITY_ID, GLOBAL_ACTIVITY_ID, ...EDITOR_CORE_NAVIGATION_COMMANDS] },
			anchorAlignmentProvider: () => AnchorAlignment.RIGHT,
			telemetrySource: 'titlePart',
			highlightToggledItems: this.editorActionsEnabled || this.isAuxiliary, // Only show toggled state for editor actions or auxiliary title bars
			actionViewItemProvider: (action, options) => this.actionViewItemProvider(action, options),
			hoverDelegate: this.hoverDelegate
		}));

		if (this.editorActionsEnabled) {
			this.actionToolBarDisposable.add(this.editorGroupsContainer.onDidChangeActiveGroup(() => this.createActionToolBarMenus({ editorActions: true })));
		}
	}

	private createActionToolBarMenus(update: true | { editorActions?: boolean; layoutActions?: boolean; globalActions?: boolean; activityActions?: boolean } = true): void {
		if (update === true) {
			update = { editorActions: true, layoutActions: true, globalActions: true, activityActions: true };
		}

		const updateToolBarActions = () => {
			const actions: IToolbarActions = { primary: [], secondary: [] };

			if (this.editorActionsEnabled) {
				this.editorActionsChangeDisposable.clear();

				const activeGroup = this.editorGroupsContainer.activeGroup;
				if (activeGroup) {
					const editorActions = activeGroup.createEditorActions(this.editorActionsChangeDisposable, this.isAuxiliary && this.isCompact ? MenuId.CompactWindowEditorTitle : MenuId.EditorTitle);

					actions.primary.push(...editorActions.actions.primary);
					actions.secondary.push(...editorActions.actions.secondary);

					this.editorActionsChangeDisposable.add(editorActions.onDidChange(() => updateToolBarActions()));
				}
			}

			// --- Global Actions
			if (this.globalToolbarMenu) {
				fillInActionBarActions(
					this.globalToolbarMenu.getActions(),
					actions
				);
			}

			// --- Layout Actions
			if (this.layoutToolbarMenu) {
				fillInActionBarActions(
					this.layoutToolbarMenu.getActions(),
					actions,
					() => !this.editorActionsEnabled || this.isCompact // layout actions move to "..." if editor actions are enabled unless compact
				);
			}

			// --- Activity Actions (always at the end)
			if (this.activityActionsEnabled) {
				if (isAccountsActionVisible(this.storageService)) {
					actions.primary.push(ACCOUNTS_ACTIVITY_TILE_ACTION);
				}

				actions.primary.push(GLOBAL_ACTIVITY_TITLE_ACTION);
			}

			this.actionToolBar.setActions(prepareActions(actions.primary), prepareActions(actions.secondary));
		};

		// Create/Update the menus which should be in the title tool bar

		if (update.editorActions) {
			this.editorToolbarMenuDisposables.clear();

			// The editor toolbar menu is handled by the editor group so we do not need to manage it here.
			// However, depending on the active editor, we need to update the context and action runner of the toolbar menu.
			if (this.editorActionsEnabled && this.editorService.activeEditor !== undefined) {
				const context: IEditorCommandsContext = { groupId: this.editorGroupsContainer.activeGroup.id };

				this.actionToolBar.actionRunner = this.editorToolbarMenuDisposables.add(new EditorCommandsContextActionRunner(context));
				this.actionToolBar.context = context;
			} else {
				this.actionToolBar.actionRunner = this.editorToolbarMenuDisposables.add(new ActionRunner());
				this.actionToolBar.context = undefined;
			}
		}

		// if (update.layoutActions) {
		// 	this.layoutToolbarMenuDisposables.clear();

		// 	if (this.layoutControlEnabled) {
		// 		this.layoutToolbarMenu = this.menuService.createMenu(MenuId.LayoutControlMenu, this.contextKeyService);

		// 		this.layoutToolbarMenuDisposables.add(this.layoutToolbarMenu);
		// 		this.layoutToolbarMenuDisposables.add(this.layoutToolbarMenu.onDidChange(() => updateToolBarActions()));
		// 	} else {
		// 		this.layoutToolbarMenu = undefined;
		// 	}
		// }

		if (update.globalActions) {
			this.globalToolbarMenuDisposables.clear();

			if (this.globalActionsEnabled) {
				this.globalToolbarMenu = this.menuService.createMenu(MenuId.TitleBar, this.contextKeyService);

				this.globalToolbarMenuDisposables.add(this.globalToolbarMenu);
				this.globalToolbarMenuDisposables.add(this.globalToolbarMenu.onDidChange(() => updateToolBarActions()));
			} else {
				this.globalToolbarMenu = undefined;
			}
		}

		if (update.activityActions) {
			this.activityToolbarDisposables.clear();
			if (this.activityActionsEnabled) {
				this.activityToolbarDisposables.add(this.storageService.onDidChangeValue(StorageScope.PROFILE, AccountsActivityActionViewItem.ACCOUNTS_VISIBILITY_PREFERENCE_KEY, this._store)(() => updateToolBarActions()));
			}
		}

		updateToolBarActions();
	}

	override updateStyles(): void {
		super.updateStyles();

		// Part container
		if (this.element) {
			if (this.isInactive) {
				this.element.classList.add('inactive');
			} else {
				this.element.classList.remove('inactive');
			}

			const titleBackground = this.getColor(this.isInactive ? TITLE_BAR_INACTIVE_BACKGROUND : TITLE_BAR_ACTIVE_BACKGROUND, (color, theme) => {
				// LCD Rendering Support: the title bar part is a defining its own GPU layer.
				// To benefit from LCD font rendering, we must ensure that we always set an
				// opaque background color. As such, we compute an opaque color given we know
				// the background color is the workbench background.
				return color.isOpaque() ? color : color.makeOpaque(WORKBENCH_BACKGROUND(theme));
			}) || '';
			this.element.style.backgroundColor = titleBackground;

			if (this.appIconBadge) {
				this.appIconBadge.style.backgroundColor = titleBackground;
			}

			if (titleBackground && Color.fromHex(titleBackground).isLighter()) {
				this.element.classList.add('light');
			} else {
				this.element.classList.remove('light');
			}

			const titleForeground = this.getColor(this.isInactive ? TITLE_BAR_INACTIVE_FOREGROUND : TITLE_BAR_ACTIVE_FOREGROUND);
			this.element.style.color = titleForeground || '';

			const titleBorder = this.getColor(TITLE_BAR_BORDER);
			this.element.style.borderBottom = titleBorder ? `1px solid ${titleBorder}` : '';
		}
	}

	protected onContextMenu(e: MouseEvent, menuId: MenuId): void {
		const event = new StandardMouseEvent(getWindow(this.element), e);

		// Show it
		this.contextMenuService.showContextMenu({
			getAnchor: () => event,
			menuId,
			contextKeyService: this.contextKeyService,
			domForShadowRoot: isMacintosh && isNative ? event.target : undefined
		});
	}

	protected get currentMenubarVisibility(): MenuBarVisibility {
		if (this.isAuxiliary) {
			return 'hidden';
		}

		return getMenuBarVisibility(this.configurationService);
	}

	private get layoutControlEnabled(): boolean {
		return this.configurationService.getValue<boolean>(LayoutSettings.LAYOUT_ACTIONS) !== false;
	}

	protected get isCommandCenterVisible() {
		return !this.isCompact && this.configurationService.getValue<boolean>(LayoutSettings.COMMAND_CENTER) !== false;
	}

	private get editorActionsEnabled(): boolean {
		return (this.editorGroupsContainer.partOptions.editorActionsLocation === EditorActionsLocation.TITLEBAR ||
			(
				this.editorGroupsContainer.partOptions.editorActionsLocation === EditorActionsLocation.DEFAULT &&
				this.editorGroupsContainer.partOptions.showTabs === EditorTabsMode.NONE
			));
	}

	private get activityActionsEnabled(): boolean {
		const activityBarPosition = this.configurationService.getValue<ActivityBarPosition>(LayoutSettings.ACTIVITY_BAR_LOCATION);
		return !this.isCompact && !this.isAuxiliary && (activityBarPosition === ActivityBarPosition.TOP || activityBarPosition === ActivityBarPosition.BOTTOM);
	}

	private get globalActionsEnabled(): boolean {
		return !this.isCompact;
	}

	get hasZoomableElements(): boolean {
		const hasMenubar = !(this.currentMenubarVisibility === 'hidden' || this.currentMenubarVisibility === 'compact' || (!isWeb && isMacintosh));
		const hasCommandCenter = this.isCommandCenterVisible;
		const hasToolBarActions = this.globalActionsEnabled || this.layoutControlEnabled || this.editorActionsEnabled || this.activityActionsEnabled;
		return hasMenubar || hasCommandCenter || hasToolBarActions;
	}

	get preventZoom(): boolean {
		// Prevent zooming behavior if any of the following conditions are met:
		// 1. Shrinking below the window control size (zoom < 1)
		// 2. No custom items are present in the title bar

		return getZoomFactor(getWindow(this.element)) < 1 || !this.hasZoomableElements;
	}

	override layout(width: number, height: number): void {
		this.updateLayout(new Dimension(width, height));

		super.layoutContents(width, height);
	}

	private updateLayout(dimension: Dimension): void {
		this.lastLayoutDimensions = dimension;

		if (!hasCustomTitlebar(this.configurationService, this.titleBarStyle)) {
			return;
		}

		const zoomFactor = getZoomFactor(getWindow(this.element));

		this.element.style.setProperty('--zoom-factor', zoomFactor.toString());
		this.rootContainer.classList.toggle('counter-zoom', this.preventZoom);

		if (this.customMenubar.value) {
			const menubarDimension = new Dimension(0, dimension.height);
			this.customMenubar.value.layout(menubarDimension);
		}

		const hasCenter = this.isCommandCenterVisible || this.title.innerText !== '';
		this.rootContainer.classList.toggle('has-center', hasCenter);
	}

	focus(): void {
		if (this.customMenubar.value) {
			this.customMenubar.value.toggleFocus();
		} else {
			(this.element.querySelector('[tabindex]:not([tabindex="-1"])') as HTMLElement | null)?.focus();
		}
	}

	toJSON(): object {
		return {
			type: Parts.TITLEBAR_PART
		};
	}

	override dispose(): void {
		this._onWillDispose.fire();

		super.dispose();
	}
}

export class MainBrowserTitlebarPart extends BrowserTitlebarPart {

	constructor(
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IBrowserWorkbenchEnvironmentService environmentService: IBrowserWorkbenchEnvironmentService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IHostService hostService: IHostService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IEditorService editorService: IEditorService,
		@IMenuService menuService: IMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
		// @ICommandService commandService: ICommandService, // Add this line

	) {
		super(Parts.TITLEBAR_PART, mainWindow, editorGroupService.mainPart, contextMenuService, configurationService, environmentService, instantiationService, themeService, storageService, layoutService, contextKeyService, hostService, editorService, menuService, keybindingService);
	}
}

export interface IAuxiliaryTitlebarPart extends ITitlebarPart, IView {
	readonly container: HTMLElement;
	readonly height: number;

	updateOptions(options: { compact: boolean }): void;
}

export class AuxiliaryBrowserTitlebarPart extends BrowserTitlebarPart implements IAuxiliaryTitlebarPart {

	private static COUNTER = 1;

	get height() { return this.minimumHeight; }

	constructor(
		readonly container: HTMLElement,
		editorGroupsContainer: IEditorGroupsContainer,
		private readonly mainTitlebar: BrowserTitlebarPart,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IBrowserWorkbenchEnvironmentService environmentService: IBrowserWorkbenchEnvironmentService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IHostService hostService: IHostService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IEditorService editorService: IEditorService,
		@IMenuService menuService: IMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
		// @ICommandService commandService: ICommandService, // Add this line

	) {
		const id = AuxiliaryBrowserTitlebarPart.COUNTER++;
		super(`workbench.parts.auxiliaryTitle.${id}`, getWindow(container), editorGroupsContainer, contextMenuService, configurationService, environmentService, instantiationService, themeService, storageService, layoutService, contextKeyService, hostService, editorService, menuService, keybindingService);
	}

	override get preventZoom(): boolean {

		// Prevent zooming behavior if any of the following conditions are met:
		// 1. Shrinking below the window control size (zoom < 1)
		// 2. No custom items are present in the main title bar
		// The auxiliary title bar never contains any zoomable items itself,
		// but we want to match the behavior of the main title bar.

		return getZoomFactor(getWindow(this.element)) < 1 || !this.mainTitlebar.hasZoomableElements;
	}
}
