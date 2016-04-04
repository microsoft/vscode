/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import winjs = require('vs/base/common/winjs.base');
import actions = require('vs/base/common/actions');
import Constants = require('vs/workbench/common/constants');
import {SyncActionDescriptor} from 'vs/platform/actions/common/actions';
import {IMessageService, Severity} from 'vs/platform/message/common/message';
import {IStorageService, StorageScope} from 'vs/platform/storage/common/storage';
import platform = require('vs/platform/platform');
import workbenchActionRegistry = require('vs/workbench/common/actionRegistry');
import {IQuickOpenService, IPickOpenEntry} from 'vs/workbench/services/quickopen/common/quickOpenService';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IThemeService, IThemeData, DEFAULT_THEME_ID} from 'vs/workbench/services/themes/common/themeService';
import {RunOnceScheduler} from 'vs/base/common/async';

import {ipcRenderer as ipc} from 'electron';

class SelectThemeAction extends actions.Action {

	public static ID = 'workbench.action.selectTheme';
	public static LABEL = nls.localize('selectTheme.label', 'Color Theme');

	constructor(
		id: string,
		label: string,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IStorageService private storageService: IStorageService,
		@IMessageService private messageService: IMessageService,
		@IThemeService private themeService: IThemeService
	) {
		super(id, label);
	}

	public run(): winjs.TPromise<void> {

		return this.themeService.getThemes().then(contributedThemes => {
			let currentTheme = this.storageService.get(Constants.Preferences.THEME, StorageScope.GLOBAL, DEFAULT_THEME_ID);

			let picks: IPickOpenEntry[] = [];

			let contributedThemesById: { [id: string]: IThemeData } = {};
			contributedThemes.forEach(theme => {
				picks.push({ id: theme.id, label: theme.label, description: theme.description });
				contributedThemes[theme.id] = theme;
			});

			picks = picks.sort((t1, t2) => t1.label.localeCompare(t2.label));

			let selectedPickIndex: number;
			picks.forEach((p, index) => {
				if (p.id === currentTheme) {
					selectedPickIndex = index;
				}
			});

			let selectTheme = pick => {
				if (pick) {
					let themeId = pick.id;
					if (!contributedThemesById[themeId]) {
						// built-in theme
						ipc.send('vscode:changeTheme', themeId);
					} else {
						// before applying, check that it can be loaded
						return this.themeService.applyThemeCSS(themeId).then(_ => {
							ipc.send('vscode:changeTheme', themeId);
						}, error => {
							this.messageService.show(Severity.Info, nls.localize('problemChangingTheme', "Problem loading theme: {0}", error.message));
						});
					}
				} else {
					// undo changes
					if (this.storageService.get(Constants.Preferences.THEME, StorageScope.GLOBAL) !== currentTheme) {
						ipc.send('vscode:changeTheme', currentTheme);
					}
				}
			};

			let themeToPreview : IPickOpenEntry = null;
			let previewThemeScheduler = new RunOnceScheduler(() => {
				selectTheme(themeToPreview);
			}, 200);
			let previewTheme = pick => {
				themeToPreview = pick;
				previewThemeScheduler.schedule();
			};
			let pickTheme = pick => {
				previewThemeScheduler.dispose();
				selectTheme(pick);
			};
			return this.quickOpenService.pick(picks, { placeHolder: nls.localize('themes.selectTheme', "Select Color Theme"), autoFocus: { autoFocusIndex: selectedPickIndex } }).then(pickTheme, null, previewTheme);
		});
	}
}

const category = nls.localize('preferences', "Preferences");
let workbenchActionsRegistry = <workbenchActionRegistry.IWorkbenchActionRegistry>platform.Registry.as(workbenchActionRegistry.Extensions.WorkbenchActions);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(SelectThemeAction, SelectThemeAction.ID, SelectThemeAction.LABEL), category);
