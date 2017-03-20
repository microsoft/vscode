/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import { registerColor, editorBackground, highContrastBorder } from 'vs/platform/theme/common/colorRegistry';
import { IDisposable, Disposable, dispose } from 'vs/base/common/lifecycle';
import { IThemeService, ITheme } from 'vs/platform/theme/common/themeService';
import { Color, RGBA } from 'vs/base/common/color';

// < --- Tabs --- >

export const TABS_CONTAINER_BACKGROUND = registerColor('tabsContainerBackground', {
	dark: '#252526',
	light: '#F3F3F3',
	hc: null
}, nls.localize('tabsContainerBackground', "Background color of the tabs container. Tabs are the containers for editors in the editor area. Multiple tabs can be opened in one editor group. There can be multiple editor groups."));

export const NO_TABS_CONTAINER_BACKGROUND = registerColor('noTabsContainerBackground', {
	dark: editorBackground,
	light: editorBackground,
	hc: editorBackground
}, nls.localize('noTabsContainerBackground', "Background color of the editor title container when no tabs are enabled."));

export const ACTIVE_TAB_BACKGROUND = registerColor('activeTabBackground', {
	dark: editorBackground,
	light: editorBackground,
	hc: editorBackground
}, nls.localize('activeTabBackground', "Active tab background color. Tabs are the containers for editors in the editor area. Multiple tabs can be opened in one editor group. There can be multiple editor groups."));

export const INACTIVE_TAB_BACKGROUND = registerColor('inactiveTabBackground', {
	dark: '#2D2D2D',
	light: '#ECECEC',
	hc: null
}, nls.localize('inactiveTabBackground', "Inactive tab background color. Tabs are the containers for editors in the editor area. Multiple tabs can be opened in one editor group. There can be multiple editor groups."));

export const ACTIVE_TAB_ACTIVE_GROUP_FOREGROUND = registerColor('activeTabActiveGroupForeground', {
	dark: Color.white,
	light: Color.fromRGBA(new RGBA(51, 51, 51)),
	hc: Color.white
}, nls.localize('activeTabActiveGroupForeground', "Active tab foreground color in an active group. Tabs are the containers for editors in the editor area. Multiple tabs can be opened in one editor group. There can be multiple editor groups."));

export const ACTIVE_TAB_INACTIVE_GROUP_FOREGROUND = registerColor('activeTabInactiveGroupForeground', {
	dark: Color.white.transparent(0.5),
	light: Color.fromRGBA(new RGBA(51, 51, 51)).transparent(0.7),
	hc: Color.white
}, nls.localize('activeTabInactiveGroupForeground', "Active tab foreground color in an inactive group. Tabs are the containers for editors in the editor area. Multiple tabs can be opened in one editor group. There can be multiple editor groups."));

export const INACTIVE_TAB_ACTIVE_GROUP_FOREGROUND = registerColor('inactiveTabActiveGroupForeground', {
	dark: Color.white.transparent(0.5),
	light: Color.fromRGBA(new RGBA(51, 51, 51)).transparent(0.5),
	hc: Color.white
}, nls.localize('inactiveTabActiveGroupForeground', "Inactive tab foreground color in an active group. Tabs are the containers for editors in the editor area. Multiple tabs can be opened in one editor group. There can be multiple editor groups."));

export const INACTIVE_TAB_INACTIVE_GROUP_FOREGROUND = registerColor('inactiveTabInactiveGroupForeground', {
	dark: Color.fromRGBA(new RGBA(255, 255, 255)).transparent(0.5).transparent(0.5),
	light: Color.fromRGBA(new RGBA(51, 51, 51)).transparent(0.5).transparent(0.7),
	hc: Color.white
}, nls.localize('inactiveTabInactiveGroupForeground', "Inactive tab foreground color in an inactive group. Tabs are the containers for editors in the editor area. Multiple tabs can be opened in one editor group. There can be multiple editor groups."));

export const TAB_BORDER = registerColor('tabBorder', {
	dark: '#252526',
	light: '#F3F3F3',
	hc: highContrastBorder
}, nls.localize('tabBorder', "Border to separate tabs from each other. Tabs are the containers for editors in the editor area. Multiple tabs can be opened in one editor group. There can be multiple editor groups."));



// < --- Editors --- >

export const EDITOR_GROUP_BORDER_COLOR = registerColor('editorGroupBorder', {
	dark: '#444444',
	light: '#E7E7E7',
	hc: highContrastBorder
}, nls.localize('editorGroupBorder', "Color to separate multiple editor groups from each other. Editor groups are the containers of editors."));

export const EDITOR_GROUP_BACKGROUND = registerColor('editorGroupBackground', {
	dark: '#2D2D2D',
	light: '#ECECEC',
	hc: null
}, nls.localize('editorGroupBackground', "Backgrouund color of an editor group. Editor groups are the containers of editors."));

export const EDITOR_DRAG_AND_DROP_BACKGROUND = registerColor('editorDragAndDropBackground', {
	dark: Color.fromRGBA(new RGBA(83, 89, 93)).transparent(0.5),
	light: Color.fromRGBA(new RGBA(51, 153, 255)).transparent(0.18),
	hc: null
}, nls.localize('editorDragAndDropBackground', "Background color when dragging editors around."));


// < --- Panels --- >

export const PANEL_BACKGROUND = registerColor('panelBackground', {
	dark: editorBackground,
	light: editorBackground,
	hc: editorBackground
}, nls.localize('panelBackground', "Panel background color. Panels are shown below the editor area and contain views like output and integrated terminal."));

export const PANEL_BORDER_TOP_COLOR = registerColor('panelBorderTopColor', {
	dark: Color.fromRGBA(new RGBA(128, 128, 128)).transparent(0.35),
	light: Color.fromRGBA(new RGBA(128, 128, 128)).transparent(0.35),
	hc: highContrastBorder
}, nls.localize('panelBorderTopColor', "Panel border color on the top separating to the editor. Panels are shown below the editor area and contain views like output and integrated terminal."));



// < --- Status --- >

export const STATUS_BAR_FOREGROUND = registerColor('statusBarForeground', {
	dark: '#FFFFFF',
	light: '#FFFFFF',
	hc: '#FFFFFF'
}, nls.localize('statusBarForeground', "Status bar foreground color. The status bar is shown in the bottom of the window"));

export const STATUS_BAR_BACKGROUND = registerColor('statusBarBackground', {
	dark: '#007ACC',
	light: '#007ACC',
	hc: null
}, nls.localize('statusBarBackground', "Standard status bar background color. The status bar is shown in the bottom of the window"));

export const STATUS_BAR_NO_FOLDER_BACKGROUND = registerColor('statusBarNoFolderBackground', {
	dark: '#68217A',
	light: '#68217A',
	hc: null
}, nls.localize('statusBarNoFolderBackground', "Status bar background color when no folder is opened. The status bar is shown in the bottom of the window"));

/**
 * Base class for all themable workbench components.
 */
export class Themable extends Disposable {
	private _toUnbind: IDisposable[];
	private theme: ITheme;

	constructor(
		protected themeService: IThemeService
	) {
		super();

		this._toUnbind = [];
		this.theme = themeService.getTheme();

		// Hook up to theme changes
		this._toUnbind.push(this.themeService.onThemeChange(theme => this.onThemeChange(theme)));
	}

	protected get isHighContrastTheme(): boolean {
		return this.theme.type === 'hc';
	}

	protected get toUnbind() {
		return this._toUnbind;
	}

	protected onThemeChange(theme: ITheme): void {
		this.theme = theme;

		this.updateStyles(theme);
	}

	protected updateStyles(theme: ITheme): void {
		// Subclasses to override
	}

	protected getColor(id: string): string {
		const color = this.theme.getColor(id);

		return color ? color.toString() : null;
	}

	public dispose(): void {
		this._toUnbind = dispose(this._toUnbind);

		super.dispose();
	}
}