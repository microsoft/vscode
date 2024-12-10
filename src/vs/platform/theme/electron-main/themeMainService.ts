/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import electron from 'electron';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { isLinux, isMacintosh, isWindows } from '../../../base/common/platform.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IStateService } from '../../state/node/state.js';
import { IPartsSplash } from '../common/themeService.js';
import { IColorScheme } from '../../window/common/window.js';

// These default colors match our default themes
// editor background color ("Dark Modern", etc...)
const DEFAULT_BG_LIGHT = '#FFFFFF';
const DEFAULT_BG_DARK = '#1F1F1F';
const DEFAULT_BG_HC_BLACK = '#000000';
const DEFAULT_BG_HC_LIGHT = '#FFFFFF';

const THEME_STORAGE_KEY = 'theme';
const THEME_BG_STORAGE_KEY = 'themeBackground';
const THEME_WINDOW_SPLASH = 'windowSplash';

namespace ThemeSettings {
	export const DETECT_COLOR_SCHEME = 'window.autoDetectColorScheme';
	export const SYSTEM_COLOR_THEME = 'window.systemColorTheme';
}

export const IThemeMainService = createDecorator<IThemeMainService>('themeMainService');

export interface IThemeMainService {

	readonly _serviceBrand: undefined;

	readonly onDidChangeColorScheme: Event<IColorScheme>;

	getBackgroundColor(): string;

	saveWindowSplash(windowId: number | undefined, splash: IPartsSplash): void;
	getWindowSplash(): IPartsSplash | undefined;

	getColorScheme(): IColorScheme;
}

export class ThemeMainService extends Disposable implements IThemeMainService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeColorScheme = this._register(new Emitter<IColorScheme>());
	readonly onDidChangeColorScheme = this._onDidChangeColorScheme.event;

	constructor(@IStateService private stateService: IStateService, @IConfigurationService private configurationService: IConfigurationService) {
		super();

		// System Theme
		if (!isLinux) {
			this._register(this.configurationService.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration(ThemeSettings.SYSTEM_COLOR_THEME) || e.affectsConfiguration(ThemeSettings.DETECT_COLOR_SCHEME)) {
					this.updateSystemColorTheme();
				}
			}));
		}
		this.updateSystemColorTheme();

		// Color Scheme changes
		this._register(Event.fromNodeEventEmitter(electron.nativeTheme, 'updated')(() => this._onDidChangeColorScheme.fire(this.getColorScheme())));
	}

	private updateSystemColorTheme(): void {
		if (isLinux || this.configurationService.getValue(ThemeSettings.DETECT_COLOR_SCHEME)) {
			// only with `system` we can detect the system color scheme
			electron.nativeTheme.themeSource = 'system';
		} else {
			switch (this.configurationService.getValue<'default' | 'auto' | 'light' | 'dark'>(ThemeSettings.SYSTEM_COLOR_THEME)) {
				case 'dark':
					electron.nativeTheme.themeSource = 'dark';
					break;
				case 'light':
					electron.nativeTheme.themeSource = 'light';
					break;
				case 'auto':
					switch (this.getBaseTheme()) {
						case 'vs': electron.nativeTheme.themeSource = 'light'; break;
						case 'vs-dark': electron.nativeTheme.themeSource = 'dark'; break;
						default: electron.nativeTheme.themeSource = 'system';
					}
					break;
				default:
					electron.nativeTheme.themeSource = 'system';
					break;
			}

		}
	}

	getColorScheme(): IColorScheme {
		if (isWindows) {
			// high contrast is refelected by the shouldUseInvertedColorScheme property
			if (electron.nativeTheme.shouldUseHighContrastColors) {
				// shouldUseInvertedColorScheme is dark, !shouldUseInvertedColorScheme is light
				return { dark: electron.nativeTheme.shouldUseInvertedColorScheme, highContrast: true };
			}
		} else if (isMacintosh) {
			// high contrast is set if one of shouldUseInvertedColorScheme or shouldUseHighContrastColors is set, reflecting the 'Invert colours' and `Increase contrast` settings in MacOS
			if (electron.nativeTheme.shouldUseInvertedColorScheme || electron.nativeTheme.shouldUseHighContrastColors) {
				return { dark: electron.nativeTheme.shouldUseDarkColors, highContrast: true };
			}
		} else if (isLinux) {
			// ubuntu gnome seems to have 3 states, light dark and high contrast
			if (electron.nativeTheme.shouldUseHighContrastColors) {
				return { dark: true, highContrast: true };
			}
		}
		return {
			dark: electron.nativeTheme.shouldUseDarkColors,
			highContrast: false
		};
	}

	getBackgroundColor(): string {
		const colorScheme = this.getColorScheme();
		if (colorScheme.highContrast && this.configurationService.getValue('window.autoDetectHighContrast')) {
			return colorScheme.dark ? DEFAULT_BG_HC_BLACK : DEFAULT_BG_HC_LIGHT;
		}

		let background = this.stateService.getItem<string | null>(THEME_BG_STORAGE_KEY, null);
		if (!background) {
			switch (this.getBaseTheme()) {
				case 'vs': background = DEFAULT_BG_LIGHT; break;
				case 'hc-black': background = DEFAULT_BG_HC_BLACK; break;
				case 'hc-light': background = DEFAULT_BG_HC_LIGHT; break;
				default: background = DEFAULT_BG_DARK;
			}
		}

		return background;
	}

	private getBaseTheme(): 'vs' | 'vs-dark' | 'hc-black' | 'hc-light' {
		const baseTheme = this.stateService.getItem<string>(THEME_STORAGE_KEY, 'vs-dark').split(' ')[0];
		switch (baseTheme) {
			case 'vs': return 'vs';
			case 'hc-black': return 'hc-black';
			case 'hc-light': return 'hc-light';
			default: return 'vs-dark';
		}
	}

	saveWindowSplash(windowId: number | undefined, splash: IPartsSplash): void {

		// Update in storage
		this.stateService.setItems([
			{ key: THEME_STORAGE_KEY, data: splash.baseTheme },
			{ key: THEME_BG_STORAGE_KEY, data: splash.colorInfo.background },
			{ key: THEME_WINDOW_SPLASH, data: splash }
		]);

		// Update in opened windows
		if (typeof windowId === 'number') {
			this.updateBackgroundColor(windowId, splash);
		}

		// Update system theme
		this.updateSystemColorTheme();
	}

	private updateBackgroundColor(windowId: number, splash: IPartsSplash): void {
		for (const window of electron.BrowserWindow.getAllWindows()) {
			if (window.id === windowId) {
				window.setBackgroundColor(splash.colorInfo.background);
				break;
			}
		}
	}

	getWindowSplash(): IPartsSplash | undefined {
		return this.stateService.getItem<IPartsSplash>(THEME_WINDOW_SPLASH);
	}
}
