/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import Constants = require('vs/workbench/common/constants');
import {IMessageService} from 'vs/platform/message/common/message';
import {IStorageService} from 'vs/platform/storage/common/storage';
import {IQuickOpenService, IPickOpenEntry} from 'vs/workbench/services/quickopen/common/quickOpenService';
import {IThemeService, IThemeData} from 'vs/workbench/services/themes/common/themeService';
import {AbstractSelectThemeAction, ISelectThemeAction} from 'vs/workbench/parts/themes/common/abstractSelectThemeAction';
import Themes = require('vs/platform/theme/common/themes');

export class SelectIconThemeAction extends AbstractSelectThemeAction implements ISelectThemeAction {
	public static ID = 'workbench.action.selectIconTheme';
	public static LABEL = nls.localize('selectIconTheme.label', 'Icon Theme');

	public themeComponent = Themes.ComponentType.ICON;
	public preferenceId = Constants.Preferences.ICONTHEME;

	constructor(
		id: string,
		label: string,
		@IQuickOpenService quickOpenService: IQuickOpenService,
		@IStorageService storageService: IStorageService,
		@IMessageService messageService: IMessageService,
		@IThemeService themeService: IThemeService
	) {
		super(
			id,
			label,
			quickOpenService,
			storageService,
			messageService,
			themeService
		);
	}

	public doPickContributedThemes(
		contributedThemes: IThemeData[],
		picks: IPickOpenEntry[],
		contributedThemesById: { [id: string]: boolean }) {

		// adds a no-icon option to top of menu
		picks.push({
			id: '__theme-no-icons__',
			label: '--- No icons ---'
		});

		// filter themes that contain icons
		contributedThemes.forEach(theme => {
			if (theme.type === this.themeComponent) {
				picks.push({
					id: theme.id,
					label: theme.label,
					description: theme.description
				});
				contributedThemesById[theme.id] = true;
			}
		});
	}

	public doLocalizePlaceHolder() {
		return nls.localize('themes.selectIconTheme', "Select Icon Theme");
	}
}