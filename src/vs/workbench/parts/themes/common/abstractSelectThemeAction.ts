/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import winjs = require('vs/base/common/winjs.base');
import actions = require('vs/base/common/actions');
import {IMessageService, Severity} from 'vs/platform/message/common/message';
import {IStorageService, StorageScope} from 'vs/platform/storage/common/storage';
import {IQuickOpenService, IPickOpenEntry} from 'vs/workbench/services/quickopen/common/quickOpenService';
import {IThemeService, IThemeData, DEFAULT_THEME_ID} from 'vs/workbench/services/themes/common/themeService';
import {RunOnceScheduler} from 'vs/base/common/async';

import {ipcRenderer as ipc} from 'electron';

export interface ISelectThemeAction {
	preferenceId: string;
	themeComponent: string;
	doPickContributedThemes(
		contributedThemes: IThemeData[],
		picks: IPickOpenEntry[],
		contributedThemesById: { [id: string]: boolean }
	);
	doLocalizePlaceHolder(): string;
}

export abstract class AbstractSelectThemeAction extends actions.Action {
	protected preferenceId: string;
	protected themeComponent: string;

	constructor(
		id: string,
		label: string,
		private quickOpenService: IQuickOpenService,
		private storageService: IStorageService,
		private messageService: IMessageService,
		private themeService: IThemeService
	) {
		super(id, label);
	}

	public run(): winjs.TPromise<void> {
		return this.themeService.getThemes().then(contributedThemes => {
			let currentTheme = this.storageService.get(
				this.preferenceId,
				StorageScope.GLOBAL,
				DEFAULT_THEME_ID
			);
			let picks: IPickOpenEntry[] = [];
			let contributedThemesById: { [id: string]: boolean } = {};

			this.doPickContributedThemes(contributedThemes, picks, contributedThemesById);

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
					let message = {
						themeId: themeId,
						themeComponent: this.themeComponent
					};
					if (!contributedThemesById[themeId]) {
						// built-in theme
						ipc.send('vscode:changeTheme', message);
					} else {
						// before applying, check that it can be loaded
						return this.themeService.loadTheme(themeId).then(_ => {
							ipc.send('vscode:changeTheme', message);
						}, error => {
							this.messageService.show(Severity.Info, nls.localize('problemChangingTheme', "Problem loading theme: {0}", error.message));
						});
					}
				} else {
					// undo changes
					if (this.storageService.get(this.preferenceId, StorageScope.GLOBAL) !== currentTheme) {
						const message = {
							themeId: currentTheme,
							themeComponent: this.themeComponent
						};
						ipc.send('vscode:changeTheme', message);
					}
				}
				return winjs.TPromise.as(null);
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

			return this.quickOpenService.pick(picks, {
				placeHolder: this.doLocalizePlaceHolder(),
				autoFocus: { autoFocusIndex: selectedPickIndex }
			}).then(pickTheme, null, previewTheme);
		});
	}

	protected doPickContributedThemes(
		contributedThemes: IThemeData[],
		picks: IPickOpenEntry[],
		contributedThemesById: { [id: string]: boolean }) {
		throw new Error('AbstractSelectThemeAction: Not implemented');
	}

	protected doLocalizePlaceHolder(): string {
		throw new Error('AbstractSelectThemeAction: Not implemented');
	}

}