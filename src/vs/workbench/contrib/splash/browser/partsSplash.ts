/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onDidChangeFullscreen, isFullscreen } from '../../../../base/browser/browser.js';
import * as dom from '../../../../base/browser/dom.js';
import { Color } from '../../../../base/common/color.js';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { editorBackground, foreground } from '../../../../platform/theme/common/colorRegistry.js';
import { getThemeTypeSelector, IThemeService } from '../../../../platform/theme/common/themeService.js';
import { DEFAULT_EDITOR_MIN_DIMENSIONS } from '../../../browser/parts/editor/editor.js';
import * as themes from '../../../common/theme.js';
import { IWorkbenchLayoutService, Parts, Position } from '../../../services/layout/browser/layoutService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import * as perf from '../../../../base/common/performance.js';
import { assertReturnsDefined } from '../../../../base/common/types.js';
import { ISplashStorageService } from './splash.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { ILifecycleService, LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { TitleBarSetting } from '../../../../platform/window/common/window.js';

export class PartsSplash {

	static readonly ID = 'workbench.contrib.partsSplash';

	private static readonly _splashElementId = 'monaco-parts-splash';

	private readonly _disposables = new DisposableStore();

	private _didChangeTitleBarStyle?: boolean;

	constructor(
		@IThemeService private readonly _themeService: IThemeService,
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@IConfigurationService private readonly _configService: IConfigurationService,
		@ISplashStorageService private readonly _partSplashService: ISplashStorageService,
		@IEditorGroupsService editorGroupsService: IEditorGroupsService,
		@ILifecycleService lifecycleService: ILifecycleService,
	) {
		Event.once(_layoutService.onDidLayoutMainContainer)(() => {
			this._removePartsSplash();
			perf.mark('code/didRemovePartsSplash');
		}, undefined, this._disposables);

		const lastIdleSchedule = this._disposables.add(new MutableDisposable());
		const savePartsSplashSoon = () => {
			lastIdleSchedule.value = dom.runWhenWindowIdle(mainWindow, () => this._savePartsSplash(), 2500);
		};
		lifecycleService.when(LifecyclePhase.Restored).then(() => {
			Event.any(Event.filter(onDidChangeFullscreen, windowId => windowId === mainWindow.vscodeWindowId), editorGroupsService.mainPart.onDidLayout, _themeService.onDidColorThemeChange)(savePartsSplashSoon, undefined, this._disposables);
			savePartsSplashSoon();
		});

		_configService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(TitleBarSetting.TITLE_BAR_STYLE)) {
				this._didChangeTitleBarStyle = true;
				this._savePartsSplash();
			}
		}, this, this._disposables);
	}

	dispose(): void {
		this._disposables.dispose();
	}

	private _savePartsSplash() {
		const theme = this._themeService.getColorTheme();

		this._partSplashService.saveWindowSplash({
			zoomLevel: this._configService.getValue<undefined>('window.zoomLevel'),
			baseTheme: getThemeTypeSelector(theme.type),
			colorInfo: {
				foreground: theme.getColor(foreground)?.toString(),
				background: Color.Format.CSS.formatHex(theme.getColor(editorBackground) || themes.WORKBENCH_BACKGROUND(theme)),
				editorBackground: theme.getColor(editorBackground)?.toString(),
				titleBarBackground: theme.getColor(themes.TITLE_BAR_ACTIVE_BACKGROUND)?.toString(),
				titleBarBorder: theme.getColor(themes.TITLE_BAR_BORDER)?.toString(),
				activityBarBackground: theme.getColor(themes.ACTIVITY_BAR_BACKGROUND)?.toString(),
				activityBarBorder: theme.getColor(themes.ACTIVITY_BAR_BORDER)?.toString(),
				sideBarBackground: theme.getColor(themes.SIDE_BAR_BACKGROUND)?.toString(),
				sideBarBorder: theme.getColor(themes.SIDE_BAR_BORDER)?.toString(),
				statusBarBackground: theme.getColor(themes.STATUS_BAR_BACKGROUND)?.toString(),
				statusBarBorder: theme.getColor(themes.STATUS_BAR_BORDER)?.toString(),
				statusBarNoFolderBackground: theme.getColor(themes.STATUS_BAR_NO_FOLDER_BACKGROUND)?.toString(),
				windowBorder: theme.getColor(themes.WINDOW_ACTIVE_BORDER)?.toString() ?? theme.getColor(themes.WINDOW_INACTIVE_BORDER)?.toString()
			},
			layoutInfo: !this._shouldSaveLayoutInfo() ? undefined : {
				sideBarSide: this._layoutService.getSideBarPosition() === Position.RIGHT ? 'right' : 'left',
				editorPartMinWidth: DEFAULT_EDITOR_MIN_DIMENSIONS.width,
				titleBarHeight: this._layoutService.isVisible(Parts.TITLEBAR_PART, mainWindow) ? dom.getTotalHeight(assertReturnsDefined(this._layoutService.getContainer(mainWindow, Parts.TITLEBAR_PART))) : 0,
				activityBarWidth: this._layoutService.isVisible(Parts.ACTIVITYBAR_PART) ? dom.getTotalWidth(assertReturnsDefined(this._layoutService.getContainer(mainWindow, Parts.ACTIVITYBAR_PART))) : 0,
				sideBarWidth: this._layoutService.isVisible(Parts.SIDEBAR_PART) ? dom.getTotalWidth(assertReturnsDefined(this._layoutService.getContainer(mainWindow, Parts.SIDEBAR_PART))) : 0,
				auxiliaryBarWidth: this._layoutService.isAuxiliaryBarMaximized() ? Number.MAX_SAFE_INTEGER /* marker for maximized state */ : this._layoutService.isVisible(Parts.AUXILIARYBAR_PART) ? dom.getTotalWidth(assertReturnsDefined(this._layoutService.getContainer(mainWindow, Parts.AUXILIARYBAR_PART))) : 0,
				statusBarHeight: this._layoutService.isVisible(Parts.STATUSBAR_PART, mainWindow) ? dom.getTotalHeight(assertReturnsDefined(this._layoutService.getContainer(mainWindow, Parts.STATUSBAR_PART))) : 0,
				windowBorder: this._layoutService.hasMainWindowBorder(),
				windowBorderRadius: this._layoutService.getMainWindowBorderRadius()
			}
		});
	}

	private _shouldSaveLayoutInfo(): boolean {
		return !isFullscreen(mainWindow) && !this._environmentService.isExtensionDevelopment && !this._didChangeTitleBarStyle;
	}

	private _removePartsSplash(): void {
		// eslint-disable-next-line no-restricted-syntax
		const element = mainWindow.document.getElementById(PartsSplash._splashElementId);
		if (element) {
			element.style.display = 'none';
		}

		// remove initial colors
		// eslint-disable-next-line no-restricted-syntax
		const defaultStyles = mainWindow.document.head.getElementsByClassName('initialShellColors');
		defaultStyles[0]?.remove();
	}
}
