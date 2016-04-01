/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import Constants = require('vs/workbench/common/constants');
import {IMessageService} from 'vs/platform/message/common/message';
import {IStorageService} from 'vs/platform/storage/common/storage';
import Themes = require('vs/platform/theme/common/themes');
import {IQuickOpenService, IPickOpenEntry} from 'vs/workbench/services/quickopen/common/quickOpenService';
import {IThemeService, IThemeData} from 'vs/workbench/services/themes/common/themeService';
import {AbstractSelectThemeAction, ISelectThemeAction} from 'vs/workbench/parts/themes/common/abstractSelectThemeAction';

export class SelectColorThemeAction extends AbstractSelectThemeAction implements ISelectThemeAction {
	public static ID = 'workbench.action.selectColorTheme';
	public static LABEL = nls.localize('selectColorTheme.label', 'Color Theme');

	public themeComponent = Themes.ComponentType.COLOR;
	public preferenceId = Constants.Preferences.THEME;

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
		return nls.localize('themes.selectColorTheme', "Select Color Theme");
	}
}
