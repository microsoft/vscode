/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getZoomFactor } from '../../../base/browser/browser.js';
import { getWindow, getWindowId } from '../../../base/browser/dom.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { INativeHostService } from '../../../platform/native/common/native.js';
import { IStorageService } from '../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { useWindowControlsOverlay } from '../../../platform/window/common/window.js';
import { IsWindowAlwaysOnTopContext } from '../../../workbench/common/contextkeys.js';
import { IHostService } from '../../../workbench/services/host/browser/host.js';
import { IWorkbenchLayoutService, Parts } from '../../../workbench/services/layout/browser/layoutService.js';
import { IAuxiliaryTitlebarPart } from '../../../workbench/browser/parts/titlebar/titlebarPart.js';
import { IEditorGroupsContainer } from '../../../workbench/services/editor/common/editorGroupsService.js';
import { CodeWindow, mainWindow } from '../../../base/browser/window.js';
import { TitlebarPart, TitleService } from '../../browser/parts/titlebarPart.js';

export class NativeTitlebarPart extends TitlebarPart {

	private cachedWindowControlStyles: { bgColor: string; fgColor: string } | undefined;
	private cachedWindowControlHeight: number | undefined;

	constructor(
		id: string,
		targetWindow: CodeWindow,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IHostService hostService: IHostService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
	) {
		super(id, targetWindow, contextMenuService, configurationService, instantiationService, themeService, storageService, layoutService, contextKeyService, hostService);

		this.handleWindowsAlwaysOnTop(targetWindow.vscodeWindowId, contextKeyService);
	}

	private async handleWindowsAlwaysOnTop(targetWindowId: number, contextKeyService: IContextKeyService): Promise<void> {
		const isWindowAlwaysOnTopContext = IsWindowAlwaysOnTopContext.bindTo(contextKeyService);

		this._register(this.nativeHostService.onDidChangeWindowAlwaysOnTop(({ windowId, alwaysOnTop }) => {
			if (windowId === targetWindowId) {
				isWindowAlwaysOnTopContext.set(alwaysOnTop);
			}
		}));

		isWindowAlwaysOnTopContext.set(await this.nativeHostService.isWindowAlwaysOnTop({ targetWindowId }));
	}

	override updateStyles(): void {
		super.updateStyles();

		if (this.element) {
			if (useWindowControlsOverlay(this.configurationService)) {
				if (
					!this.cachedWindowControlStyles ||
					this.cachedWindowControlStyles.bgColor !== this.element.style.backgroundColor ||
					this.cachedWindowControlStyles.fgColor !== this.element.style.color
				) {
					this.cachedWindowControlStyles = {
						bgColor: this.element.style.backgroundColor,
						fgColor: this.element.style.color
					};
					this.nativeHostService.updateWindowControls({
						targetWindowId: getWindowId(getWindow(this.element)),
						backgroundColor: this.element.style.backgroundColor,
						foregroundColor: this.element.style.color
					});
				}
			}
		}
	}

	override layout(width: number, height: number): void {
		super.layout(width, height);

		if (useWindowControlsOverlay(this.configurationService)) {
			const newHeight = Math.round(height * getZoomFactor(getWindow(this.element)));
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

class MainNativeTitlebarPart extends NativeTitlebarPart {

	constructor(
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IHostService hostService: IHostService,
		@INativeHostService nativeHostService: INativeHostService,
	) {
		super(Parts.TITLEBAR_PART, mainWindow, contextMenuService, configurationService, instantiationService, themeService, storageService, layoutService, contextKeyService, hostService, nativeHostService);
	}
}

class AuxiliaryNativeTitlebarPart extends NativeTitlebarPart implements IAuxiliaryTitlebarPart {

	private static COUNTER = 1;

	get height() { return this.minimumHeight; }

	constructor(
		readonly container: HTMLElement,
		private readonly mainTitlebar: TitlebarPart,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IHostService hostService: IHostService,
		@INativeHostService nativeHostService: INativeHostService,
	) {
		const id = AuxiliaryNativeTitlebarPart.COUNTER++;
		super(`workbench.parts.auxiliaryTitle.${id}`, getWindow(container), contextMenuService, configurationService, instantiationService, themeService, storageService, layoutService, contextKeyService, hostService, nativeHostService);
	}

	override get preventZoom(): boolean {
		return getZoomFactor(getWindow(this.element)) < 1 || !this.mainTitlebar.hasZoomableElements;
	}
}

export class NativeTitleService extends TitleService {

	protected override createMainTitlebarPart(): MainNativeTitlebarPart {
		return this.instantiationService.createInstance(MainNativeTitlebarPart);
	}

	protected override doCreateAuxiliaryTitlebarPart(container: HTMLElement, _editorGroupsContainer: IEditorGroupsContainer, instantiationService: IInstantiationService): AuxiliaryNativeTitlebarPart {
		return instantiationService.createInstance(AuxiliaryNativeTitlebarPart, container, this.mainPart);
	}
}
