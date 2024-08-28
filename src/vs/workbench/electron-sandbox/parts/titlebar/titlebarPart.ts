/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { getZoomFactor, isWCOEnabled } from 'vs/base/browser/browser';
import { $, addDisposableListener, append, EventType, getWindow, getWindowId, hide, show } from 'vs/base/browser/dom';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IConfigurationService, IConfigurationChangeEvent } from 'vs/platform/configuration/common/configuration';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { INativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/environmentService';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { isMacintosh, isWindows, isLinux, isNative, isBigSurOrNewer } from 'vs/base/common/platform';
import { IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { BrowserTitlebarPart as BrowserTitlebarPart, BrowserTitleService, IAuxiliaryTitlebarPart } from 'vs/workbench/browser/parts/titlebar/titlebarPart';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IWorkbenchLayoutService, Parts } from 'vs/workbench/services/layout/browser/layoutService';
import { INativeHostService } from 'vs/platform/native/common/native';
import { hasNativeTitlebar, useWindowControlsOverlay, DEFAULT_CUSTOM_TITLEBAR_HEIGHT } from 'vs/platform/window/common/window';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Codicon } from 'vs/base/common/codicons';
import { ThemeIcon } from 'vs/base/common/themables';
import { NativeMenubarControl } from 'vs/workbench/electron-sandbox/parts/titlebar/menubarControl';
import { IEditorGroupsContainer, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { CodeWindow, mainWindow } from 'vs/base/browser/window';

export class NativeTitlebarPart extends BrowserTitlebarPart {

	//#region IView

	override get minimumHeight(): number {
		if (!isMacintosh) {
			return super.minimumHeight;
		}

		return (this.isCommandCenterVisible ? DEFAULT_CUSTOM_TITLEBAR_HEIGHT : this.macTitlebarSize) / (this.preventZoom ? getZoomFactor(getWindow(this.element)) : 1);
	}
	override get maximumHeight(): number { return this.minimumHeight; }

	private bigSurOrNewer: boolean;
	private get macTitlebarSize() {
		if (this.bigSurOrNewer) {
			return 28; // macOS Big Sur increases title bar height
		}

		return 22;
	}

	//#endregion

	private maxRestoreControl: HTMLElement | undefined;
	private resizer: HTMLElement | undefined;
	private cachedWindowControlStyles: { bgColor: string; fgColor: string } | undefined;
	private cachedWindowControlHeight: number | undefined;

	constructor(
		id: string,
		targetWindow: CodeWindow,
		editorGroupsContainer: IEditorGroupsContainer | 'main',
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
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IEditorService editorService: IEditorService,
		@IMenuService menuService: IMenuService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super(id, targetWindow, editorGroupsContainer, contextMenuService, configurationService, environmentService, instantiationService, themeService, storageService, layoutService, contextKeyService, hostService, editorGroupService, editorService, menuService, keybindingService);

		this.bigSurOrNewer = isBigSurOrNewer(environmentService.os.release);
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

	private onUpdateAppIconDragBehavior(): void {
		const setting = this.configurationService.getValue('window.doubleClickIconToClose');
		if (setting && this.appIcon) {
			(this.appIcon.style as any)['-webkit-app-region'] = 'no-drag';
		} else if (this.appIcon) {
			(this.appIcon.style as any)['-webkit-app-region'] = 'drag';
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

	private onMenubarFocusChanged(focused: boolean): void {
		if ((isWindows || isLinux) && this.currentMenubarVisibility !== 'compact' && this.dragRegion) {
			if (focused) {
				hide(this.dragRegion);
			} else {
				show(this.dragRegion);
			}
		}
	}

	protected override createContentArea(parent: HTMLElement): HTMLElement {
		const result = super.createContentArea(parent);
		const targetWindow = getWindow(parent);
		const targetWindowId = getWindowId(targetWindow);

		// Native menu controller
		if (isMacintosh || hasNativeTitlebar(this.configurationService)) {
			this._register(this.instantiationService.createInstance(NativeMenubarControl));
		}

		// App Icon (Native Windows/Linux)
		if (this.appIcon) {
			this.onUpdateAppIconDragBehavior();

			this._register(addDisposableListener(this.appIcon, EventType.DBLCLICK, (() => {
				this.nativeHostService.closeWindow({ targetWindowId });
			})));
		}

		// Window Controls (Native Linux when WCO is disabled)
		if (isLinux && !hasNativeTitlebar(this.configurationService) && !isWCOEnabled() && this.windowControlsContainer) {

			// Minimize
			const minimizeIcon = append(this.windowControlsContainer, $('div.window-icon.window-minimize' + ThemeIcon.asCSSSelector(Codicon.chromeMinimize)));
			this._register(addDisposableListener(minimizeIcon, EventType.CLICK, () => {
				this.nativeHostService.minimizeWindow({ targetWindowId });
			}));

			// Restore
			this.maxRestoreControl = append(this.windowControlsContainer, $('div.window-icon.window-max-restore'));
			this._register(addDisposableListener(this.maxRestoreControl, EventType.CLICK, async () => {
				const maximized = await this.nativeHostService.isMaximized({ targetWindowId });
				if (maximized) {
					return this.nativeHostService.unmaximizeWindow({ targetWindowId });
				}

				return this.nativeHostService.maximizeWindow({ targetWindowId });
			}));

			// Close
			const closeIcon = append(this.windowControlsContainer, $('div.window-icon.window-close' + ThemeIcon.asCSSSelector(Codicon.chromeClose)));
			this._register(addDisposableListener(closeIcon, EventType.CLICK, () => {
				this.nativeHostService.closeWindow({ targetWindowId });
			}));

			// Resizer
			this.resizer = append(this.rootContainer, $('div.resizer'));
			this._register(Event.runAndSubscribe(this.layoutService.onDidChangeWindowMaximized, ({ windowId, maximized }) => {
				if (windowId === targetWindowId) {
					this.onDidChangeWindowMaximized(maximized);
				}
			}, { windowId: targetWindowId, maximized: this.layoutService.isWindowMaximized(targetWindow) }));
		}

		// Window System Context Menu
		// See https://github.com/electron/electron/issues/24893
		if (isWindows && !hasNativeTitlebar(this.configurationService)) {
			this._register(this.nativeHostService.onDidTriggerWindowSystemContextMenu(({ windowId, x, y }) => {
				if (targetWindowId !== windowId) {
					return;
				}

				const zoomFactor = getZoomFactor(getWindow(this.element));
				this.onContextMenu(new MouseEvent('mouseup', { clientX: x / zoomFactor, clientY: y / zoomFactor }), MenuId.TitleBarContext);
			}));
		}

		return result;
	}

	private onDidChangeWindowMaximized(maximized: boolean): void {
		if (this.maxRestoreControl) {
			if (maximized) {
				this.maxRestoreControl.classList.remove(...ThemeIcon.asClassNameArray(Codicon.chromeMaximize));
				this.maxRestoreControl.classList.add(...ThemeIcon.asClassNameArray(Codicon.chromeRestore));
			} else {
				this.maxRestoreControl.classList.remove(...ThemeIcon.asClassNameArray(Codicon.chromeRestore));
				this.maxRestoreControl.classList.add(...ThemeIcon.asClassNameArray(Codicon.chromeMaximize));
			}
		}

		if (this.resizer) {
			if (maximized) {
				hide(this.resizer);
			} else {
				show(this.resizer);
			}
		}
	}

	override updateStyles(): void {
		super.updateStyles();

		// WCO styles only supported on Windows currently
		if (useWindowControlsOverlay(this.configurationService)) {
			if (
				!this.cachedWindowControlStyles ||
				this.cachedWindowControlStyles.bgColor !== this.element.style.backgroundColor ||
				this.cachedWindowControlStyles.fgColor !== this.element.style.color
			) {
				this.nativeHostService.updateWindowControls({
					targetWindowId: getWindowId(getWindow(this.element)),
					backgroundColor: this.element.style.backgroundColor,
					foregroundColor: this.element.style.color
				});
			}
		}
	}

	override layout(width: number, height: number): void {
		super.layout(width, height);

		if (
			useWindowControlsOverlay(this.configurationService) ||
			(isMacintosh && isNative && !hasNativeTitlebar(this.configurationService))
		) {

			// When the user goes into full screen mode, the height of the title bar becomes 0.
			// Instead, set it back to the default titlebar height for Catalina users
			// so that they can have the traffic lights rendered at the proper offset.
			// Ref https://github.com/microsoft/vscode/issues/159862

			const newHeight = (height > 0 || this.bigSurOrNewer) ? Math.round(height * getZoomFactor(getWindow(this.element))) : this.macTitlebarSize;
			if (newHeight !== this.cachedWindowControlHeight) {
				this.cachedWindowControlHeight = newHeight;
				this.nativeHostService.updateWindowControls({
					targetWindowId: getWindowId(getWindow(this.element)),
					height: newHeight
				});
			}
		}
	}
}

export class MainNativeTitlebarPart extends NativeTitlebarPart {

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
		@INativeHostService nativeHostService: INativeHostService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IEditorService editorService: IEditorService,
		@IMenuService menuService: IMenuService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super(Parts.TITLEBAR_PART, mainWindow, 'main', contextMenuService, configurationService, environmentService, instantiationService, themeService, storageService, layoutService, contextKeyService, hostService, nativeHostService, editorGroupService, editorService, menuService, keybindingService);
	}
}

export class AuxiliaryNativeTitlebarPart extends NativeTitlebarPart implements IAuxiliaryTitlebarPart {

	private static COUNTER = 1;

	get height() { return this.minimumHeight; }

	constructor(
		readonly container: HTMLElement,
		editorGroupsContainer: IEditorGroupsContainer,
		private readonly mainTitlebar: BrowserTitlebarPart,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@INativeWorkbenchEnvironmentService environmentService: INativeWorkbenchEnvironmentService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IHostService hostService: IHostService,
		@INativeHostService nativeHostService: INativeHostService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IEditorService editorService: IEditorService,
		@IMenuService menuService: IMenuService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		const id = AuxiliaryNativeTitlebarPart.COUNTER++;
		super(`workbench.parts.auxiliaryTitle.${id}`, getWindow(container), editorGroupsContainer, contextMenuService, configurationService, environmentService, instantiationService, themeService, storageService, layoutService, contextKeyService, hostService, nativeHostService, editorGroupService, editorService, menuService, keybindingService);
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

export class NativeTitleService extends BrowserTitleService {

	protected override createMainTitlebarPart(): MainNativeTitlebarPart {
		return this.instantiationService.createInstance(MainNativeTitlebarPart);
	}

	protected override doCreateAuxiliaryTitlebarPart(container: HTMLElement, editorGroupsContainer: IEditorGroupsContainer): AuxiliaryNativeTitlebarPart {
		return this.instantiationService.createInstance(AuxiliaryNativeTitlebarPart, container, editorGroupsContainer, this.mainPart);
	}
}
