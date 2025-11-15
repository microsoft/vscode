/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import electron from 'electron';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { isLinux, isMacintosh, isWindows } from '../../../base/common/platform.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IStateService } from '../../state/node/state.js';
import { IPartsSplash } from '../common/themeService.js';
import { IColorScheme } from '../../window/common/window.js';
import { ThemeTypeSelector } from '../common/theme.js';
import { ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier } from '../../workspace/common/workspace.js';
import { coalesce } from '../../../base/common/arrays.js';
import { getAllWindowsExcludingOffscreen } from '../../windows/electron-main/windows.js';
import { ILogService } from '../../log/common/log.js';
import { IThemeMainService } from './themeMainService.js';

// These default colors match our default themes
// editor background color ("Dark Modern", etc...)
const DEFAULT_BG_LIGHT = '#FFFFFF';
const DEFAULT_BG_DARK = '#1F1F1F';
const DEFAULT_BG_HC_BLACK = '#000000';
const DEFAULT_BG_HC_LIGHT = '#FFFFFF';

const THEME_STORAGE_KEY = 'theme';
const THEME_BG_STORAGE_KEY = 'themeBackground';

const THEME_WINDOW_SPLASH_KEY = 'windowSplash';
const THEME_WINDOW_SPLASH_OVERRIDE_KEY = 'windowSplashWorkspaceOverride';

const AUXILIARYBAR_DEFAULT_VISIBILITY = 'workbench.secondarySideBar.defaultVisibility';

namespace ThemeSettings {
	export const DETECT_COLOR_SCHEME = 'window.autoDetectColorScheme';
	export const DETECT_HC = 'window.autoDetectHighContrast';
	export const SYSTEM_COLOR_THEME = 'window.systemColorTheme';
}

interface IPartSplashOverrideWorkspaces {
	[workspaceId: string]: {
		sideBarVisible: boolean;
		auxiliaryBarVisible: boolean;
	};
}

interface IPartsSplashOverride {
	layoutInfo: {
		sideBarWidth: number;
		auxiliaryBarWidth: number;

		workspaces: IPartSplashOverrideWorkspaces;
	};
}

export class ThemeMainService extends Disposable implements IThemeMainService {

	declare readonly _serviceBrand: undefined;

	private static readonly DEFAULT_BAR_WIDTH = 300;

	private static readonly WORKSPACE_OVERRIDE_LIMIT = 50;

	private readonly _onDidChangeColorScheme = this._register(new Emitter<IColorScheme>());
	readonly onDidChangeColorScheme = this._onDidChangeColorScheme.event;

	constructor(
		@IStateService private stateService: IStateService,
		@IConfigurationService private configurationService: IConfigurationService,
		@ILogService private logService: ILogService
	) {
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
			electron.nativeTheme.themeSource = 'system'; // only with `system` we can detect the system color scheme
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

		// high contrast is reflected by the shouldUseInvertedColorScheme property
		if (isWindows) {
			if (electron.nativeTheme.shouldUseHighContrastColors) {
				// shouldUseInvertedColorScheme is dark, !shouldUseInvertedColorScheme is light
				return { dark: electron.nativeTheme.shouldUseInvertedColorScheme, highContrast: true };
			}
		}

		// high contrast is set if one of shouldUseInvertedColorScheme or shouldUseHighContrastColors is set,
		// reflecting the 'Invert colours' and `Increase contrast` settings in MacOS
		else if (isMacintosh) {
			if (electron.nativeTheme.shouldUseInvertedColorScheme || electron.nativeTheme.shouldUseHighContrastColors) {
				return { dark: electron.nativeTheme.shouldUseDarkColors, highContrast: true };
			}
		}

		// ubuntu gnome seems to have 3 states, light dark and high contrast
		else if (isLinux) {
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

	saveWindowSplash(windowId: number | undefined, workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | undefined, splash: IPartsSplash): void {

		// Update override as needed
		const splashOverride = this.updateWindowSplashOverride(workspace, splash);

		// Update in storage
		this.stateService.setItems(coalesce([
			{ key: THEME_STORAGE_KEY, data: splash.baseTheme },
			{ key: THEME_BG_STORAGE_KEY, data: splash.colorInfo.background },
			{ key: THEME_WINDOW_SPLASH_KEY, data: splash },
			splashOverride ? { key: THEME_WINDOW_SPLASH_OVERRIDE_KEY, data: splashOverride } : undefined
		]));

		// Update in opened windows
		if (typeof windowId === 'number') {
			this.updateBackgroundColor(windowId, splash);
		}

		// Update system theme
		this.updateSystemColorTheme();
	}

	private updateWindowSplashOverride(workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | undefined, splash: IPartsSplash): IPartsSplashOverride | undefined {
		let splashOverride: IPartsSplashOverride | undefined = undefined;
		let changed = false;
		if (workspace) {
			splashOverride = { ...this.getWindowSplashOverride() }; // make a copy for modifications

			changed = this.doUpdateWindowSplashOverride(workspace, splash, splashOverride, 'sideBar');
			changed = this.doUpdateWindowSplashOverride(workspace, splash, splashOverride, 'auxiliaryBar') || changed;
		}

		return changed ? splashOverride : undefined;
	}

	private doUpdateWindowSplashOverride(workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier, splash: IPartsSplash, splashOverride: IPartsSplashOverride, part: 'sideBar' | 'auxiliaryBar'): boolean {
		const currentWidth = part === 'sideBar' ? splash.layoutInfo?.sideBarWidth : splash.layoutInfo?.auxiliaryBarWidth;
		const overrideWidth = part === 'sideBar' ? splashOverride.layoutInfo.sideBarWidth : splashOverride.layoutInfo.auxiliaryBarWidth;

		// No layout info: remove override
		let changed = false;
		if (typeof currentWidth !== 'number') {
			if (splashOverride.layoutInfo.workspaces[workspace.id]) {
				delete splashOverride.layoutInfo.workspaces[workspace.id];
				changed = true;
			}

			return changed;
		}

		let workspaceOverride = splashOverride.layoutInfo.workspaces[workspace.id];
		if (!workspaceOverride) {
			const workspaceEntries = Object.keys(splashOverride.layoutInfo.workspaces);
			if (workspaceEntries.length >= ThemeMainService.WORKSPACE_OVERRIDE_LIMIT) {
				delete splashOverride.layoutInfo.workspaces[workspaceEntries[0]];
				changed = true;
			}

			workspaceOverride = { sideBarVisible: false, auxiliaryBarVisible: false };
			splashOverride.layoutInfo.workspaces[workspace.id] = workspaceOverride;
			changed = true;
		}

		// Part has width: update width & visibility override
		if (currentWidth > 0) {
			if (overrideWidth !== currentWidth) {
				splashOverride.layoutInfo[part === 'sideBar' ? 'sideBarWidth' : 'auxiliaryBarWidth'] = currentWidth;
				changed = true;
			}

			switch (part) {
				case 'sideBar':
					if (!workspaceOverride.sideBarVisible) {
						workspaceOverride.sideBarVisible = true;
						changed = true;
					}
					break;
				case 'auxiliaryBar':
					if (!workspaceOverride.auxiliaryBarVisible) {
						workspaceOverride.auxiliaryBarVisible = true;
						changed = true;
					}
					break;
			}
		}

		// Part is hidden: update visibility override
		else {
			switch (part) {
				case 'sideBar':
					if (workspaceOverride.sideBarVisible) {
						workspaceOverride.sideBarVisible = false;
						changed = true;
					}
					break;
				case 'auxiliaryBar':
					if (workspaceOverride.auxiliaryBarVisible) {
						workspaceOverride.auxiliaryBarVisible = false;
						changed = true;
					}
					break;
			}
		}

		return changed;
	}

	private updateBackgroundColor(windowId: number, splash: IPartsSplash): void {
		for (const window of getAllWindowsExcludingOffscreen()) {
			if (window.id === windowId) {
				window.setBackgroundColor(splash.colorInfo.background);
				break;
			}
		}
	}

	getWindowSplash(workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | undefined): IPartsSplash | undefined {
		try {
			return this.doGetWindowSplash(workspace);
		} catch (error) {
			this.logService.error('[theme main service] Failed to get window splash', error);

			return undefined;
		}
	}

	private doGetWindowSplash(workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | undefined): IPartsSplash | undefined {
		const partSplash = this.stateService.getItem<IPartsSplash>(THEME_WINDOW_SPLASH_KEY);
		if (!partSplash?.layoutInfo) {
			return partSplash; // return early: overrides currently only apply to layout info
		}

		const override = this.getWindowSplashOverride();

		// Figure out side bar width based on workspace and overrides
		let sideBarWidth: number;
		if (workspace) {
			if (override.layoutInfo.workspaces[workspace.id]?.sideBarVisible === false) {
				sideBarWidth = 0;
			} else {
				sideBarWidth = override.layoutInfo.sideBarWidth || partSplash.layoutInfo.sideBarWidth || ThemeMainService.DEFAULT_BAR_WIDTH;
			}
		} else {
			sideBarWidth = 0;
		}

		// Figure out auxiliary bar width based on workspace, configuration and overrides
		const auxiliaryBarDefaultVisibility = this.configurationService.getValue(AUXILIARYBAR_DEFAULT_VISIBILITY) ?? 'visibleInWorkspace';
		let auxiliaryBarWidth: number;
		if (workspace) {
			const auxiliaryBarVisible = override.layoutInfo.workspaces[workspace.id]?.auxiliaryBarVisible;
			if (auxiliaryBarVisible === true) {
				auxiliaryBarWidth = override.layoutInfo.auxiliaryBarWidth || partSplash.layoutInfo.auxiliaryBarWidth || ThemeMainService.DEFAULT_BAR_WIDTH;
			} else if (auxiliaryBarVisible === false) {
				auxiliaryBarWidth = 0;
			} else {
				if (auxiliaryBarDefaultVisibility === 'visible' || auxiliaryBarDefaultVisibility === 'visibleInWorkspace') {
					auxiliaryBarWidth = override.layoutInfo.auxiliaryBarWidth || partSplash.layoutInfo.auxiliaryBarWidth || ThemeMainService.DEFAULT_BAR_WIDTH;
				} else if (auxiliaryBarDefaultVisibility === 'maximized' || auxiliaryBarDefaultVisibility === 'maximizedInWorkspace') {
					auxiliaryBarWidth = Number.MAX_SAFE_INTEGER; // marker for a maximised auxiliary bar
				} else {
					auxiliaryBarWidth = 0;
				}
			}
		} else {
			auxiliaryBarWidth = 0; // technically not true if configured 'visible', but we never store splash per empty window, so we decide on a default here
		}

		return {
			...partSplash,
			layoutInfo: {
				...partSplash.layoutInfo,
				sideBarWidth,
				auxiliaryBarWidth
			}
		};
	}

	private getWindowSplashOverride(): IPartsSplashOverride {
		let override = this.stateService.getItem<IPartsSplashOverride>(THEME_WINDOW_SPLASH_OVERRIDE_KEY);

		if (!override?.layoutInfo) {
			override = {
				layoutInfo: {
					sideBarWidth: ThemeMainService.DEFAULT_BAR_WIDTH,
					auxiliaryBarWidth: ThemeMainService.DEFAULT_BAR_WIDTH,
					workspaces: {}
				}
			};
		}

		if (!override.layoutInfo.sideBarWidth) {
			override.layoutInfo.sideBarWidth = ThemeMainService.DEFAULT_BAR_WIDTH;
		}

		if (!override.layoutInfo.auxiliaryBarWidth) {
			override.layoutInfo.auxiliaryBarWidth = ThemeMainService.DEFAULT_BAR_WIDTH;
		}

		if (!override.layoutInfo.workspaces) {
			override.layoutInfo.workspaces = {};
		}

		return override;
	}
}
