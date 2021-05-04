/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onDidChangeFullscreen, isFullscreen } from 'vs/base/browser/browser';
import { getTotalHeight, getTotalWidth } from 'vs/base/browser/dom';
import { Color } from 'vs/base/common/color';
import { Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ILifecycleService, LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { ColorIdentifier, editorBackground, foreground } from 'vs/platform/theme/common/colorRegistry';
import { getThemeTypeSelector, IColorTheme, IThemeService } from 'vs/platform/theme/common/themeService';
import { DEFAULT_EDITOR_MIN_DIMENSIONS } from 'vs/workbench/browser/parts/editor/editor';
import * as themes from 'vs/workbench/common/theme';
import { IWorkbenchLayoutService, Parts, Position } from 'vs/workbench/services/layout/browser/layoutService';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import * as perf from 'vs/base/common/performance';
import { assertIsDefined } from 'vs/base/common/types';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';

export class PartsSplash {

	private static readonly _splashElementId = 'monaco-parts-splash';

	private readonly _disposables = new DisposableStore();

	private _didChangeTitleBarStyle?: boolean;

	constructor(
		@IThemeService private readonly _themeService: IThemeService,
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IEditorGroupsService editorGroupsService: IEditorGroupsService,
		@IConfigurationService configService: IConfigurationService,
		@INativeHostService private readonly _nativeHostService: INativeHostService
	) {
		lifecycleService.when(LifecyclePhase.Restored).then(_ => {
			this._removePartsSplash();
			perf.mark('code/didRemovePartsSplash');
		});

		Event.debounce(Event.any(
			onDidChangeFullscreen,
			editorGroupsService.onDidLayout
		), () => { }, 800)(this._savePartsSplash, this, this._disposables);

		configService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('window.titleBarStyle')) {
				this._didChangeTitleBarStyle = true;
				this._savePartsSplash();
			}
		}, this, this._disposables);

		_themeService.onDidColorThemeChange(_ => {
			this._savePartsSplash();
		}, this, this._disposables);
	}

	dispose(): void {
		this._disposables.dispose();
	}

	private _savePartsSplash() {
		const theme = this._themeService.getColorTheme();
		const baseTheme = getThemeTypeSelector(theme.type);
		const colorInfo = {
			foreground: this._getThemeColor(theme, foreground),
			background: Color.Format.CSS.formatHex(theme.getColor(editorBackground) || themes.WORKBENCH_BACKGROUND(theme)),
			editorBackground: this._getThemeColor(theme, editorBackground),
			titleBarBackground: this._getThemeColor(theme, themes.TITLE_BAR_ACTIVE_BACKGROUND),
			activityBarBackground: this._getThemeColor(theme, themes.ACTIVITY_BAR_BACKGROUND),
			sideBarBackground: this._getThemeColor(theme, themes.SIDE_BAR_BACKGROUND),
			statusBarBackground: this._getThemeColor(theme, themes.STATUS_BAR_BACKGROUND),
			statusBarNoFolderBackground: this._getThemeColor(theme, themes.STATUS_BAR_NO_FOLDER_BACKGROUND),
			windowBorder: this._getThemeColor(theme, themes.WINDOW_ACTIVE_BORDER) ?? this._getThemeColor(theme, themes.WINDOW_INACTIVE_BORDER)
		};
		const layoutInfo = !this._shouldSaveLayoutInfo() ? undefined : {
			sideBarSide: this._layoutService.getSideBarPosition() === Position.RIGHT ? 'right' : 'left',
			editorPartMinWidth: DEFAULT_EDITOR_MIN_DIMENSIONS.width,
			titleBarHeight: this._layoutService.isVisible(Parts.TITLEBAR_PART) ? getTotalHeight(assertIsDefined(this._layoutService.getContainer(Parts.TITLEBAR_PART))) : 0,
			activityBarWidth: this._layoutService.isVisible(Parts.ACTIVITYBAR_PART) ? getTotalWidth(assertIsDefined(this._layoutService.getContainer(Parts.ACTIVITYBAR_PART))) : 0,
			sideBarWidth: this._layoutService.isVisible(Parts.SIDEBAR_PART) ? getTotalWidth(assertIsDefined(this._layoutService.getContainer(Parts.SIDEBAR_PART))) : 0,
			statusBarHeight: this._layoutService.isVisible(Parts.STATUSBAR_PART) ? getTotalHeight(assertIsDefined(this._layoutService.getContainer(Parts.STATUSBAR_PART))) : 0,
			windowBorder: this._layoutService.hasWindowBorder(),
			windowBorderRadius: this._layoutService.getWindowBorderRadius()
		};
		this._nativeHostService.saveWindowSplash({
			baseTheme,
			colorInfo,
			layoutInfo
		});
	}

	private _getThemeColor(theme: IColorTheme, id: ColorIdentifier): string | undefined {
		const color = theme.getColor(id);
		return color ? color.toString() : undefined;
	}

	private _shouldSaveLayoutInfo(): boolean {
		return !isFullscreen() && !this._environmentService.isExtensionDevelopment && !this._didChangeTitleBarStyle;
	}

	private _removePartsSplash(): void {
		let element = document.getElementById(PartsSplash._splashElementId);
		if (element) {
			element.style.display = 'none';
		}
		// remove initial colors
		let defaultStyles = document.head.getElementsByClassName('initialShellColors');
		if (defaultStyles.length) {
			document.head.removeChild(defaultStyles[0]);
		}
	}
}
