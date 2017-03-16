/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import { registerColor, editorBackground } from 'vs/platform/theme/common/colorRegistry';
import { IDisposable, Disposable, dispose } from 'vs/base/common/lifecycle';
import { IThemeService, ITheme, ICssStyleCollector } from 'vs/platform/theme/common/themeService';

// < --- Tabs --- >

export const ACTIVE_TAB_BACKGROUND = registerColor('activeTabBackground', {
	dark: editorBackground,
	light: editorBackground,
	hc: editorBackground
}, nls.localize('activeTabBackground', "Active Tab background color. Tabs are the containers for editors in the editor area. Multiple tabs can be opened in one editor group."));

export const INACTIVE_TAB_BACKGROUND = registerColor('inactiveTabBackground', {
	dark: '#2D2D2D',
	light: '#ECECEC',
	hc: '#00000000'
}, nls.localize('inactiveTabBackground', "Inactive Tab background color. Tabs are the containers for editors in the editor area. Multiple tabs can be opened in one editor group."));


// < --- Panels --- >

export const PANEL_BACKGROUND = registerColor('panelBackground', {
	dark: editorBackground,
	light: editorBackground,
	hc: editorBackground
}, nls.localize('panelBackground', "Panel background color. Panels are shown below the editor area and contain views like output and integrated terminal."));

export const PANEL_BORDER_TOP_COLOR = registerColor('panelBorderTopColor', {
	dark: '#80808059', // rgba(128, 128, 128, 0.35)
	light: '#80808059', // rgba(128, 128, 128, 0.35)
	hc: '#6FC3DF'
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
	hc: '#00000000'
}, nls.localize('statusBarBackground', "Standard status bar background color. The status bar is shown in the bottom of the window"));

export const STATUS_BAR_NO_FOLDER_BACKGROUND = registerColor('statusBarNoFolderBackground', {
	dark: '#68217A',
	light: '#68217A',
	hc: '#00000000'
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
		this._toUnbind.push(this.themeService.onThemeChange((theme, collector) => this.onThemeChange(theme, collector)));
	}

	protected get toUnbind() {
		return this._toUnbind;
	}

	protected onThemeChange(theme: ITheme, collector: ICssStyleCollector): void {
		this.theme = theme;

		this.updateStyles(theme, collector);
	}

	protected updateStyles(theme: ITheme, collector: ICssStyleCollector): void {
		// Subclasses to override
	}

	protected getColor(id: string): string {
		return this.theme.getColor(id).toString();
	}

	public dispose(): void {
		this._toUnbind = dispose(this._toUnbind);

		super.dispose();
	}
}