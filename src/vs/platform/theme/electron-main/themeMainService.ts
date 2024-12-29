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
import { ThemeTypeSelector } from '../common/theme.js';

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
	export const DETECT_HC = 'window.autoDetectHighContrast';
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
					switch (this.getPreferredBaseTheme() ?? this.getStoredBaseTheme()) {
						case ThemeTypeSelector.VS: electron.nativeTheme.themeSource = 'light'; break;
						case ThemeTypeSelector.VS_DARK: electron.nativeTheme.themeSource = 'dark'; break;
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
			// high contrast is reflected by the shouldUseInvertedColorScheme property
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

	getPreferredBaseTheme(): ThemeTypeSelector | undefined {
		const colorScheme = this.getColorScheme();
		if (this.configurationService.getValue(ThemeSettings.DETECT_HC) && colorScheme.highContrast) {
			return colorScheme.dark ? ThemeTypeSelector.HC_BLACK : ThemeTypeSelector.HC_LIGHT;
		}
		if (this.configurationService.getValue(ThemeSettings.DETECT_COLOR_SCHEME)) {
			return colorScheme.dark ? ThemeTypeSelector.VS_DARK : ThemeTypeSelector.VS;
		}
		return undefined;
	}

	getBackgroundColor(): string {
		const preferred = this.getPreferredBaseTheme();
		const stored = this.getStoredBaseTheme();

		// If the stored theme has the same base as the preferred, we can return the stored background
		if (preferred === undefined || preferred === stored) {
			const storedBackground = this.stateService.getItem<string | null>(THEME_BG_STORAGE_KEY, null);
			if (storedBackground) {
				return storedBackground;
			}
		}
		// Otherwise we return the default background for the preferred base theme. If there's no preferred, use the stored one.
		switch (preferred ?? stored) {
			case ThemeTypeSelector.VS: return DEFAULT_BG_LIGHT;
			case ThemeTypeSelector.HC_BLACK: return DEFAULT_BG_HC_BLACK;
			case ThemeTypeSelector.HC_LIGHT: return DEFAULT_BG_HC_LIGHT;
			default: return DEFAULT_BG_DARK;
		}
	}

	private getStoredBaseTheme(): ThemeTypeSelector {
		const baseTheme = this.stateService.getItem<ThemeTypeSelector>(THEME_STORAGE_KEY, ThemeTypeSelector.VS_DARK).split(' ')[0];
		switch (baseTheme) {
			case ThemeTypeSelector.VS: return ThemeTypeSelector.VS;
			case ThemeTypeSelector.HC_BLACK: return ThemeTypeSelector.HC_BLACK;
			case ThemeTypeSelector.HC_LIGHT: return ThemeTypeSelector.HC_LIGHT;
			default: return ThemeTypeSelector.VS_DARK;
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
