/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IThemeMainService } from '../../../theme/electron-main/themeMainService.js';
import { ILogService } from '../../../log/common/log.js';

/**
 * Plugin that handles theming for a WebContentsView by syncing VS Code's theme
 * to the web content via CSS injection and background color.
 */
export class ThemePlugin extends Disposable {
	private readonly webContents: Electron.WebContents;
	private injectedCSSKey?: string;

	constructor(
		private readonly view: Electron.WebContentsView,
		private readonly themeMainService: IThemeMainService,
		private readonly logService: ILogService
	) {
		super();
		this.webContents = view.webContents;

		// Set view background to match editor background
		this.applyBackgroundColor();

		// Apply theme when page loads
		this.webContents.on('did-finish-load', () => this.applyTheme());

		// Update theme when VS Code theme changes
		this._register(this.themeMainService.onDidChangeColorScheme(() => {
			this.applyBackgroundColor();
			this.applyTheme();
		}));
	}

	private applyBackgroundColor(): void {
		const backgroundColor = this.themeMainService.getBackgroundColor();
		this.view.setBackgroundColor(backgroundColor);
	}

	private async applyTheme(): Promise<void> {
		if (this.webContents.isDestroyed()) {
			return;
		}

		const colorScheme = this.themeMainService.getColorScheme().dark ? 'dark' : 'light';

		try {
			// Remove previous theme CSS if it exists
			if (this.injectedCSSKey) {
				await this.webContents.removeInsertedCSS(this.injectedCSSKey);
			}

			// Insert new theme CSS
			this.injectedCSSKey = await this.webContents.insertCSS(`
				/* VS Code theme override */
				:root {
					color-scheme: ${colorScheme};
				}
			`);
		} catch (error) {
			this.logService.error('ThemePlugin: Failed to inject CSS', error);
		}
	}
}
