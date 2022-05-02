/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getZoomFactor } from 'vs/base/browser/browser';
import { $, addDisposableListener, append, EventType, hide, prepend, show } from 'vs/base/browser/dom';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IConfigurationService, IConfigurationChangeEvent } from 'vs/platform/configuration/common/configuration';
import { ILabelService } from 'vs/platform/label/common/label';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { INativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/environmentService';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { isMacintosh, isWindows, isLinux } from 'vs/base/common/platform';
import { IMenuService } from 'vs/platform/actions/common/actions';
import { TitlebarPart as BrowserTitleBarPart } from 'vs/workbench/browser/parts/titlebar/titlebarPart';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { IProductService } from 'vs/platform/product/common/productService';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';
import { getTitleBarStyle } from 'vs/platform/window/common/window';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Codicon } from 'vs/base/common/codicons';
import { NativeMenubarControl } from 'vs/workbench/electron-sandbox/parts/titlebar/menubarControl';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';

export class TitlebarPart extends BrowserTitleBarPart {
	private maxRestoreControl: HTMLElement | undefined;
	private dragRegion: HTMLElement | undefined;
	private resizer: HTMLElement | undefined;
	private cachedWindowControlStyles: { bgColor: string; fgColor: string } | undefined;

	private getMacTitlebarSize() {
		const osVersion = this.environmentService.os.release;
		if (parseFloat(osVersion) >= 20) { // Big Sur increases title bar height
			return 28;
		}

		return 22;
	}

	override get minimumHeight(): number { return isMacintosh ? this.getMacTitlebarSize() / getZoomFactor() : super.minimumHeight; }
	override get maximumHeight(): number { return this.minimumHeight; }

	protected override readonly environmentService: INativeWorkbenchEnvironmentService;

	constructor(
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IEditorService editorService: IEditorService,
		@INativeWorkbenchEnvironmentService environmentService: INativeWorkbenchEnvironmentService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@ILabelService labelService: ILabelService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IMenuService menuService: IMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IHostService hostService: IHostService,
		@IProductService productService: IProductService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@IKeybindingService keybindingService: IKeybindingService,
	) {
		super(contextMenuService, configurationService, editorService, environmentService, contextService, instantiationService, themeService, labelService, storageService, layoutService, menuService, contextKeyService, hostService, productService, keybindingService);

		this.environmentService = environmentService;
	}

	private onUpdateAppIconDragBehavior(): void {
		const setting = this.configurationService.getValue('window.doubleClickIconToClose');
		if (setting && this.appIcon) {
			(this.appIcon.style as any)['-webkit-app-region'] = 'no-drag';
		} else if (this.appIcon) {
			(this.appIcon.style as any)['-webkit-app-region'] = 'drag';
		}
	}

	private onDidChangeWindowMaximized(maximized: boolean): void {
		if (this.maxRestoreControl) {
			if (maximized) {
				this.maxRestoreControl.classList.remove(...Codicon.chromeMaximize.classNamesArray);
				this.maxRestoreControl.classList.add(...Codicon.chromeRestore.classNamesArray);
			} else {
				this.maxRestoreControl.classList.remove(...Codicon.chromeRestore.classNamesArray);
				this.maxRestoreControl.classList.add(...Codicon.chromeMaximize.classNamesArray);
			}
		}

		if (this.resizer) {
			if (maximized) {
				hide(this.resizer);
			} else {
				show(this.resizer);
			}
		}

		this.adjustTitleMarginToCenter();
	}

	private onMenubarFocusChanged(focused: boolean): void {
		if ((isWindows || isLinux) && this.currentMenubarVisibility !== 'compact' && this.dragRegion) {
			if (focused) {
				hide(this.dragRegion);
			} else {
				show(this.dragRegion);
			}
		}
	}

	protected override onMenubarVisibilityChanged(visible: boolean): void {
		// Hide title when toggling menu bar
		if ((isWindows || isLinux) && this.currentMenubarVisibility === 'toggle' && visible) {
			// Hack to fix issue #52522 with layered webkit-app-region elements appearing under cursor
			if (this.dragRegion) {
				hide(this.dragRegion);
				setTimeout(() => show(this.dragRegion!), 50);
			}
		}

		super.onMenubarVisibilityChanged(visible);
	}

	protected override onConfigurationChanged(event: IConfigurationChangeEvent): void {
		super.onConfigurationChanged(event);

		if (event.affectsConfiguration('window.doubleClickIconToClose')) {
			if (this.appIcon) {
				this.onUpdateAppIconDragBehavior();
			}
		}
	}

	protected override installMenubar(): void {
		super.installMenubar();

		if (this.menubar) {
			return;
		}

		if (this.customMenubar) {
			this._register(this.customMenubar.onFocusStateChange(e => this.onMenubarFocusChanged(e)));
		}
	}

	override createContentArea(parent: HTMLElement): HTMLElement {
		const ret = super.createContentArea(parent);

		// Native menu controller
		if (isMacintosh || getTitleBarStyle(this.configurationService) === 'native') {
			this._register(this.instantiationService.createInstance(NativeMenubarControl));
		}

		// App Icon (Native Windows/Linux)
		if (this.appIcon) {
			this.onUpdateAppIconDragBehavior();

			this._register(addDisposableListener(this.appIcon, EventType.DBLCLICK, (e => {
				this.nativeHostService.closeWindow();
			})));
		}

		// Draggable region that we can manipulate for #52522
		this.dragRegion = prepend(this.rootContainer, $('div.titlebar-drag-region'));

		// Window Controls (Native Windows/Linux)
		const hasWindowControlsOverlay = typeof (navigator as any).windowControlsOverlay !== 'undefined';
		if (!isMacintosh && getTitleBarStyle(this.configurationService) !== 'native' && !hasWindowControlsOverlay && this.windowControls) {
			// Minimize
			const minimizeIcon = append(this.windowControls, $('div.window-icon.window-minimize' + Codicon.chromeMinimize.cssSelector));
			this._register(addDisposableListener(minimizeIcon, EventType.CLICK, e => {
				this.nativeHostService.minimizeWindow();
			}));

			// Restore
			this.maxRestoreControl = append(this.windowControls, $('div.window-icon.window-max-restore'));
			this._register(addDisposableListener(this.maxRestoreControl, EventType.CLICK, async e => {
				const maximized = await this.nativeHostService.isMaximized();
				if (maximized) {
					return this.nativeHostService.unmaximizeWindow();
				}

				return this.nativeHostService.maximizeWindow();
			}));

			// Close
			const closeIcon = append(this.windowControls, $('div.window-icon.window-close' + Codicon.chromeClose.cssSelector));
			this._register(addDisposableListener(closeIcon, EventType.CLICK, e => {
				this.nativeHostService.closeWindow();
			}));

			// Resizer
			this.resizer = append(this.rootContainer, $('div.resizer'));

			this._register(this.layoutService.onDidChangeWindowMaximized(maximized => this.onDidChangeWindowMaximized(maximized)));
			this.onDidChangeWindowMaximized(this.layoutService.isWindowMaximized());
		}

		return ret;
	}

	override updateStyles(): void {
		super.updateStyles();

		// WCO styles only supported on Windows currently
		if (isWindows) {
			if (!this.cachedWindowControlStyles ||
				this.cachedWindowControlStyles.bgColor !== this.element.style.backgroundColor ||
				this.cachedWindowControlStyles.fgColor !== this.element.style.color) {
				this.nativeHostService.updateTitleBarOverlay(this.element.style.backgroundColor, this.element.style.color);
			}
		}
	}
}
