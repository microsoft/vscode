/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onDidChangeFullscreen, isFullscreen } from 'vs/base/browser/browser';
import { getTotalHeight, getTotalWidth } from 'vs/base/browser/dom';
import { Color } from 'vs/base/common/color';
import { Event } from 'vs/base/common/event';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { IBroadcastService } from 'vs/platform/broadcast/electron-browser/broadcastService';
import { ILifecycleService, LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { ColorIdentifier, editorBackground, foreground } from 'vs/platform/theme/common/colorRegistry';
import { getThemeTypeSelector, IThemeService } from 'vs/platform/theme/common/themeService';
import { DEFAULT_EDITOR_MIN_DIMENSIONS } from 'vs/workbench/browser/parts/editor/editor';
import { Extensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import * as themes from 'vs/workbench/common/theme';
import { IPartService, Parts, Position } from 'vs/workbench/services/part/common/partService';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

class PartsSplash {

	private static readonly _splashElementId = 'monaco-parts-splash';

	private readonly _disposables: IDisposable[] = [];

	private _lastBaseTheme: string;
	private _lastBackground?: string;

	constructor(
		@IThemeService private readonly _themeService: IThemeService,
		@IPartService private readonly _partService: IPartService,
		@IStorageService private readonly _storageService: IStorageService,
		@IEnvironmentService private readonly _envService: IEnvironmentService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IBroadcastService private readonly broadcastService: IBroadcastService
	) {
		lifecycleService.when(LifecyclePhase.Restored).then(_ => this._removePartsSplash());
		Event.debounce(Event.any<any>(
			onDidChangeFullscreen,
			_partService.onEditorLayout
		), () => { }, 800)(this._savePartsSplash, this, this._disposables);
	}

	dispose(): void {
		dispose(this._disposables);
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
			sideBarSide: this._partService.getSideBarPosition() === Position.RIGHT ? 'right' : 'left',
			editorPartMinWidth: DEFAULT_EDITOR_MIN_DIMENSIONS.width,
			titleBarHeight: getTotalHeight(this._partService.getContainer(Parts.TITLEBAR_PART)),
			activityBarWidth: getTotalWidth(this._partService.getContainer(Parts.ACTIVITYBAR_PART)),
			sideBarWidth: getTotalWidth(this._partService.getContainer(Parts.SIDEBAR_PART)),
			statusBarHeight: getTotalHeight(this._partService.getContainer(Parts.STATUSBAR_PART)),
		};
		this._storageService.store('parts-splash-data', JSON.stringify({
			id: PartsSplash._splashElementId,
			colorInfo,
			layoutInfo,
			baseTheme
		}), StorageScope.GLOBAL);

		if (baseTheme !== this._lastBaseTheme || colorInfo.editorBackground !== this._lastBackground) {
			// notify the main window on background color changes: the main window sets the background color to new windows
			this._lastBaseTheme = baseTheme;
			this._lastBackground = colorInfo.editorBackground;

			// the color needs to be in hex
			const backgroundColor = this._themeService.getTheme().getColor(editorBackground) || themes.WORKBENCH_BACKGROUND(this._themeService.getTheme());
			this.broadcastService.broadcast({ channel: 'vscode:changeColorTheme', payload: JSON.stringify({ baseTheme, background: Color.Format.CSS.formatHex(backgroundColor) }) });
		}
	}

	private _getThemeColor(id: ColorIdentifier): string | undefined {
		const theme = this._themeService.getTheme();
		const color = theme.getColor(id);
		return color ? color.toString() : undefined;
	}

	private _shouldSaveLayoutInfo(): boolean {
		return !isFullscreen() && !this._envService.isExtensionDevelopment;
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
