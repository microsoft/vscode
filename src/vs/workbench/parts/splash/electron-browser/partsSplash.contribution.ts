/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { getTotalHeight, getTotalWidth } from 'vs/base/browser/dom';
import { ILifecycleService, LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { Extensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import * as themes from 'vs/workbench/common/theme';
import { IPartService, Parts, Position } from 'vs/workbench/services/part/common/partService';

class PartsSplash {

	private static readonly _splashElementId = 'monaco-parts-splash';

	constructor(
		@IThemeService private readonly _themeService: IThemeService,
		@IPartService private readonly _partService: IPartService,
		@IStorageService private readonly _storageService: IStorageService,
		@ILifecycleService lifecycleService: ILifecycleService,
	) {
		lifecycleService.when(LifecyclePhase.Running).then(_ => this._removePartsSplash());
		lifecycleService.onShutdown(() => this._savePartsSplash());
	}

	private _savePartsSplash() {
		const theme = this._themeService.getTheme();
		const colorInfo = {
			titleBarBackground: theme.getColor(themes.TITLE_BAR_ACTIVE_BACKGROUND).toString(),
			activityBarBackground: theme.getColor(themes.ACTIVITY_BAR_BACKGROUND).toString(),
			sideBarBackground: theme.getColor(themes.SIDE_BAR_BACKGROUND).toString(),
			statusBarBackground: theme.getColor(themes.STATUS_BAR_BACKGROUND).toString(),
			statusBarNoFolderBackground: theme.getColor(themes.STATUS_BAR_NO_FOLDER_BACKGROUND).toString(),
		};
		const layoutInfo = {
			titleBarHeight: getTotalHeight(this._partService.getContainer(Parts.TITLEBAR_PART)),
			sideBarSide: this._partService.getSideBarPosition() === Position.RIGHT ? 'right' : 'left',
			activityBarWidth: getTotalWidth(this._partService.getContainer(Parts.ACTIVITYBAR_PART)),
			sideBarWidth: getTotalWidth(this._partService.getContainer(Parts.SIDEBAR_PART)),
			statusBarHeight: getTotalHeight(this._partService.getContainer(Parts.STATUSBAR_PART)),
		};
		this._storageService.store('parts-splash-data', JSON.stringify({ id: PartsSplash._splashElementId, colorInfo, layoutInfo }), StorageScope.GLOBAL);
	}

	private _removePartsSplash(): void {
		let element = document.getElementById(PartsSplash._splashElementId);
		if (element) {
			element.remove();
		}
	}
}

Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench).registerWorkbenchContribution(PartsSplash, LifecyclePhase.Starting);
