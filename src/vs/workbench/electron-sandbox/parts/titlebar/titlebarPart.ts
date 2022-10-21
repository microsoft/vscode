/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getZoomFactor } from 'vs/base/browser/browser';
import { $, addDisposableListener, append, EventType, hide, show } from 'vs/base/browser/dom';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IConfigurationService, IConfigurationChangeEvent } from 'vs/platform/configuration/common/configuration';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { INativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/environmentService';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { isMacintosh, isWindows, isLinux, isNative } from 'vs/base/common/platform';
import { MenuId } from 'vs/platform/actions/common/actions';
import { TitlebarPart as BrowserTitleBarPart } from 'vs/workbench/browser/parts/titlebar/titlebarPart';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';
import { getTitleBarStyle, useWindowControlsOverlay } from 'vs/platform/window/common/window';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Codicon } from 'vs/base/common/codicons';
import { NativeMenubarControl } from 'vs/workbench/electron-sandbox/parts/titlebar/menubarControl';
import { IHoverService } from 'vs/workbench/services/hover/browser/hover';

export class TitlebarPart extends BrowserTitleBarPart {
	private maxRestoreControl: HTMLElement | undefined;
	private resizer: HTMLElement | undefined;
	private cachedWindowControlStyles: { bgColor: string; fgColor: string } | undefined;
	private cachedWindowControlHeight: number | undefined;

	private isBigSurOrNewer(): boolean {
		const osVersion = this.environmentService.os.release;
		return parseFloat(osVersion) >= 20;
	}

	private getMacTitlebarSize() {
		if (this.isBigSurOrNewer()) { // Big Sur increases title bar height
			return 28;
		}

		return 22;
	}

	override get minimumHeight(): number {
		if (!isMacintosh) {
			return super.minimumHeight;
		}

		return (this.isCommandCenterVisible ? 35 : this.getMacTitlebarSize()) / (this.useCounterZoom ? getZoomFactor() : 1);
	}
	override get maximumHeight(): number { return this.minimumHeight; }

	protected override readonly environmentService: INativeWorkbenchEnvironmentService;

	constructor(
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@INativeWorkbenchEnvironmentService environmentService: INativeWorkbenchEnvironmentService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IHostService hostService: IHostService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@IHoverService hoverService: IHoverService,
	) {
		super(contextMenuService, configurationService, environmentService, instantiationService, themeService, storageService, layoutService, contextKeyService, hostService, hoverService);

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

		// Window System Context Menu
		// See https://github.com/electron/electron/issues/24893
		if (isWindows && getTitleBarStyle(this.configurationService) === 'custom') {
			this._register(this.nativeHostService.onDidTriggerSystemContextMenu(({ windowId, x, y }) => {
				if (this.nativeHostService.windowId !== windowId) {
					return;
				}

				const zoomFactor = getZoomFactor();
				this.onContextMenu(new MouseEvent('mouseup', { clientX: x / zoomFactor, clientY: y / zoomFactor }), MenuId.TitleBarContext);
			}));
		}

		return ret;
	}

	override updateStyles(): void {
		super.updateStyles();

		// WCO styles only supported on Windows currently
		if (useWindowControlsOverlay(this.configurationService)) {
			if (!this.cachedWindowControlStyles ||
				this.cachedWindowControlStyles.bgColor !== this.element.style.backgroundColor ||
				this.cachedWindowControlStyles.fgColor !== this.element.style.color) {
				this.nativeHostService.updateWindowControls({ backgroundColor: this.element.style.backgroundColor, foregroundColor: this.element.style.color });
			}
		}
	}

	override layout(width: number, height: number): void {
		super.layout(width, height);

		if (useWindowControlsOverlay(this.configurationService) ||
			(isMacintosh && isNative && getTitleBarStyle(this.configurationService) === 'custom')) {
			// When the user goes into full screen mode, the height of the title bar becomes 0.
			// Instead, set it back to the default titlebar height for Catalina users
			// so that they can have the traffic lights rendered at the proper offset.
			// Ref https://github.com/microsoft/vscode/issues/159862
			const newHeight = (height > 0 || this.isBigSurOrNewer()) ?
				Math.round(height * getZoomFactor()) : this.getMacTitlebarSize();
			if (newHeight !== this.cachedWindowControlHeight) {
				this.cachedWindowControlHeight = newHeight;
				this.nativeHostService.updateWindowControls({ height: newHeight });
			}
		}
	}
}
