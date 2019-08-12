/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ipcRenderer as ipc } from 'electron';
import { join } from 'vs/base/common/path';
import { onDidChangeFullscreen, isFullscreen } from 'vs/base/browser/browser';
import { getTotalHeight, getTotalWidth } from 'vs/base/browser/dom';
import { Color } from 'vs/base/common/color';
import { Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ILifecycleService, LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { ColorIdentifier, editorBackground, foreground } from 'vs/platform/theme/common/colorRegistry';
import { getThemeTypeSelector, IThemeService } from 'vs/platform/theme/common/themeService';
import { DEFAULT_EDITOR_MIN_DIMENSIONS } from 'vs/workbench/browser/parts/editor/editor';
import { Extensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import * as themes from 'vs/workbench/common/theme';
import { IWorkbenchLayoutService, Parts, Position } from 'vs/workbench/services/layout/browser/layoutService';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { URI } from 'vs/base/common/uri';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWindowService } from 'vs/platform/windows/common/windows';
import * as perf from 'vs/base/common/performance';

class PartsSplash {

	private static readonly _splashElementId = 'monaco-parts-splash';

	private readonly _disposables = new DisposableStore();

	private _didChangeTitleBarStyle?: boolean;
	private _lastBaseTheme?: string;
	private _lastBackground?: string;

	constructor(
		@IThemeService private readonly _themeService: IThemeService,
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
		@ITextFileService private readonly _textFileService: ITextFileService,
		@IEnvironmentService private readonly _envService: IEnvironmentService,
		@IWindowService private readonly windowService: IWindowService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IEditorGroupsService editorGroupsService: IEditorGroupsService,
		@IConfigurationService configService: IConfigurationService,
	) {
		lifecycleService.when(LifecyclePhase.Restored).then(_ => {
			this._removePartsSplash();
			perf.mark('didRemovePartsSplash');
		});
		Event.debounce(Event.any<any>(
			onDidChangeFullscreen,
			editorGroupsService.onDidLayout
		), () => { }, 800)(this._savePartsSplash, this, this._disposables);

		configService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('window.titleBarStyle')) {
				this._didChangeTitleBarStyle = true;
				this._savePartsSplash();
			}
		}, this, this._disposables);
	}

	dispose(): void {
		this._disposables.dispose();
	}

	private _savePartsSplash() {
		const baseTheme = getThemeTypeSelector(this._themeService.getTheme().type);
		const colorInfo = {
			foreground: this._getThemeColor(foreground),
			editorBackground: this._getThemeColor(editorBackground),
			titleBarBackground: this._getThemeColor(themes.TITLE_BAR_ACTIVE_BACKGROUND),
			activityBarBackground: this._getThemeColor(themes.ACTIVITY_BAR_BACKGROUND),
			sideBarBackground: this._getThemeColor(themes.SIDE_BAR_BACKGROUND),
			statusBarBackground: this._getThemeColor(themes.STATUS_BAR_BACKGROUND),
			statusBarNoFolderBackground: this._getThemeColor(themes.STATUS_BAR_NO_FOLDER_BACKGROUND),
		};
		const layoutInfo = !this._shouldSaveLayoutInfo() ? undefined : {
			sideBarSide: this._layoutService.getSideBarPosition() === Position.RIGHT ? 'right' : 'left',
			editorPartMinWidth: DEFAULT_EDITOR_MIN_DIMENSIONS.width,
			titleBarHeight: this._layoutService.isVisible(Parts.TITLEBAR_PART) ? getTotalHeight(this._layoutService.getContainer(Parts.TITLEBAR_PART)) : 0,
			activityBarWidth: this._layoutService.isVisible(Parts.ACTIVITYBAR_PART) ? getTotalWidth(this._layoutService.getContainer(Parts.ACTIVITYBAR_PART)) : 0,
			sideBarWidth: this._layoutService.isVisible(Parts.SIDEBAR_PART) ? getTotalWidth(this._layoutService.getContainer(Parts.SIDEBAR_PART)) : 0,
			statusBarHeight: this._layoutService.isVisible(Parts.STATUSBAR_PART) ? getTotalHeight(this._layoutService.getContainer(Parts.STATUSBAR_PART)) : 0,
		};
		this._textFileService.write(
			URI.file(join(this._envService.userDataPath, 'rapid_render.json')),
			JSON.stringify({
				id: PartsSplash._splashElementId,
				colorInfo,
				layoutInfo,
				baseTheme
			}),
			{ encoding: 'utf8', overwriteEncoding: true }
		);

		if (baseTheme !== this._lastBaseTheme || colorInfo.editorBackground !== this._lastBackground) {
			// notify the main window on background color changes: the main window sets the background color to new windows
			this._lastBaseTheme = baseTheme;
			this._lastBackground = colorInfo.editorBackground;

			// the color needs to be in hex
			const backgroundColor = this._themeService.getTheme().getColor(editorBackground) || themes.WORKBENCH_BACKGROUND(this._themeService.getTheme());
			const payload = JSON.stringify({ baseTheme, background: Color.Format.CSS.formatHex(backgroundColor) });
			ipc.send('vscode:changeColorTheme', this.windowService.windowId, payload);
		}
	}

	private _getThemeColor(id: ColorIdentifier): string | undefined {
		const theme = this._themeService.getTheme();
		const color = theme.getColor(id);
		return color ? color.toString() : undefined;
	}

	private _shouldSaveLayoutInfo(): boolean {
		return !isFullscreen() && !this._envService.isExtensionDevelopment && !this._didChangeTitleBarStyle;
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

Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench).registerWorkbenchContribution(PartsSplash, LifecyclePhase.Starting);
