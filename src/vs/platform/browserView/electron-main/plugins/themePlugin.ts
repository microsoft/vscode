/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IThemeMainService } from '../../../theme/electron-main/themeMainService.js';

/**
 * Plugin that handles theming for a specific WebContents by detecting
 * VS Code's current theme and injecting appropriate CSS to override
 * the prefers-color-scheme media query in web content.
 */
export class ThemePlugin extends Disposable {
	private _colorScheme: 'dark' | 'light';
	private readonly webContents: Electron.WebContents;
	private injectedCSSKey?: string;

	constructor(webContents: Electron.WebContents, private readonly themeMainService: IThemeMainService) {
		super();
		this.webContents = webContents;

		// Auto-detect initial color scheme from VS Code theme
		this._colorScheme = this.detectVSCodeColorScheme();

		// Set up theming for this web contents
		this.setupTheming();
	}

	/**
	 * Detect the current VS Code color scheme using the main theme service
	 */
	private detectVSCodeColorScheme(): 'dark' | 'light' {
		return this.themeMainService.getColorScheme().dark ? 'dark' : 'light';
	}

	/**
	 * Set up theming for the web contents
	 */
	private setupTheming(): void {
		// Apply initial theme
		const applyThemeStyle = () => {
			if (!this.webContents.isDestroyed()) {
				this.injectThemeStyle(this.webContents, this._colorScheme);
			}
		};

		// Apply theme when page loads
		this.webContents.on('did-finish-load', applyThemeStyle);

		// Listen for VS Code theme changes and update this web contents
		const updateColorScheme = () => {
			const newColorScheme = this.detectVSCodeColorScheme();
			if (newColorScheme !== this._colorScheme && !this.webContents.isDestroyed()) {
				this._colorScheme = newColorScheme;
				this.injectThemeStyle(this.webContents, this._colorScheme);
			}
		};

		this._register(this.themeMainService.onDidChangeColorScheme(updateColorScheme));
	}

	private async injectThemeStyle(webContents: Electron.WebContents, colorScheme: 'dark' | 'light'): Promise<void> {
		if (webContents.isDestroyed()) {
			return;
		}

		try {
			// Remove previous VS Code theme CSS if it exists
			if (this.injectedCSSKey) {
				await webContents.removeInsertedCSS(this.injectedCSSKey);
			}

			// Insert new theme CSS
			this.injectedCSSKey = await webContents.insertCSS(`
				/* VS Code theme override */
				:root {
					color-scheme: ${colorScheme};
				}
			`);
		} catch (error) {
			console.error('Failed to inject theme CSS:', error);
		}
	}
}
