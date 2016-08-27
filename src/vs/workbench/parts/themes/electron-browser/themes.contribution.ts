/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {localize} from 'vs/nls';
import {TPromise} from 'vs/base/common/winjs.base';
import {Action} from 'vs/base/common/actions';
import {firstIndex} from 'vs/base/common/arrays';
import {SyncActionDescriptor} from 'vs/platform/actions/common/actions';
import {IMessageService, Severity} from 'vs/platform/message/common/message';
import {Registry} from 'vs/platform/platform';
import {IWorkbenchActionRegistry, Extensions} from 'vs/workbench/common/actionRegistry';
import {IQuickOpenService, IPickOpenEntry} from 'vs/workbench/services/quickopen/common/quickOpenService';
import {IThemeService} from 'vs/workbench/services/themes/common/themeService';
import {VIEWLET_ID, IExtensionsViewlet} from 'vs/workbench/parts/extensions/electron-browser/extensions';
import {IExtensionGalleryService} from 'vs/platform/extensionManagement/common/extensionManagement';
import {IViewletService} from 'vs/workbench/services/viewlet/common/viewletService';
import {Delayer} from 'vs/base/common/async';

class SelectColorThemeAction extends Action {

	static ID = 'workbench.action.selectTheme';
	static LABEL = localize('selectTheme.label', "Color Theme");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IMessageService private messageService: IMessageService,
		@IThemeService private themeService: IThemeService,
		@IExtensionGalleryService private extensionGalleryService: IExtensionGalleryService,
		@IViewletService private viewletService: IViewletService
	) {
		super(id, label);
	}

	run(): TPromise<void> {
		return this.themeService.getColorThemes().then(themes => {
			const currentThemeId = this.themeService.getColorTheme();
			const currentTheme = themes.filter(theme => theme.id === currentThemeId)[0];

			const picks: IPickOpenEntry[] = themes
				.map(theme => ({ id: theme.id, label: theme.label, description: theme.description }))
				.sort((t1, t2) => t1.label.localeCompare(t2.label));

			const selectTheme = (theme, broadcast) => {
				this.themeService.setColorTheme(theme.id, broadcast)
					.done(null, err => this.messageService.show(Severity.Info, localize('problemChangingTheme', "Problem loading theme: {0}", err.message)));
			};

			const placeHolder = localize('themes.selectTheme', "Select Color Theme");
			const autoFocusIndex = firstIndex(picks, p => p.id === currentThemeId);
			const delayer = new Delayer<void>(100);

			if (this.extensionGalleryService.isEnabled()) {
				const run = () => {
					return this.viewletService.openViewlet(VIEWLET_ID, true)
						.then(viewlet => viewlet as IExtensionsViewlet)
						.then(viewlet => {
							viewlet.search('category:themes');
							viewlet.focus();
						});
				};

				picks.push({
					id: 'themes.findmore',
					label: localize('findMore', "Find more in the Marketplace..."),
					separator: { border: true },
					alwaysShow: true,
					run
				});
			}

			return this.quickOpenService.pick(picks, { placeHolder, autoFocus: { autoFocusIndex }})
				.then(
					theme => delayer.trigger(() => selectTheme(theme || currentTheme, true), 0),
					null,
					theme => delayer.trigger(() => selectTheme(theme, false))
				);
		});
	}
}

class SelectIconThemeAction extends Action {

	static ID = 'workbench.action.selectIconTheme';
	static LABEL = localize('selectIconTheme.label', "File Icon Theme");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IMessageService private messageService: IMessageService,
		@IThemeService private themeService: IThemeService,
		@IExtensionGalleryService private extensionGalleryService: IExtensionGalleryService,
		@IViewletService private viewletService: IViewletService
	) {
		super(id, label);
	}

	run(): TPromise<void> {
		return this.themeService.getFileIconThemes().then(themes => {
			const currentThemeId = this.themeService.getFileIconTheme();
			const currentTheme = themes.filter(theme => theme.id === currentThemeId)[0];

			const picks: IPickOpenEntry[] = themes
				.map(theme => ({ id: theme.id, label: theme.label, description: theme.description }))
				.sort((t1, t2) => t1.label.localeCompare(t2.label));

			picks.splice(0, 0, { id: '', label: localize('noIconThemeLabel', 'None'), description: localize('noIconThemeDesc', 'Disable file icons') });

			const selectTheme = (theme, broadcast) => {
				this.themeService.setFileIconTheme(theme && theme.id, broadcast)
					.done(null, err => this.messageService.show(Severity.Info, localize('problemChangingIconTheme', "Problem loading icon theme: {0}", err.message)));
			};

			const placeHolder = localize('themes.selectIconTheme', "Select File Icon Theme");
			const autoFocusIndex = firstIndex(picks, p => p.id === currentThemeId);
			const delayer = new Delayer<void>(100);

		/*	if (this.extensionGalleryService.isEnabled()) {
				const run = () => {
					return this.viewletService.openViewlet(VIEWLET_ID, true)
						.then(viewlet => viewlet as IExtensionsViewlet)
						.then(viewlet => {
							viewlet.search('category:themes', true); // define our own category
							viewlet.focus();
						});
				};

				picks.push({
					id: 'themes.findmoreiconthemes',
					label: localize('findMoreIconThemes', "Find more in the Marketplace..."),
					separator: { border: true },
					alwaysShow: true,
					run
				});
			}*/

			return this.quickOpenService.pick(picks, { placeHolder, autoFocus: { autoFocusIndex }})
				.then(
					theme => delayer.trigger(() => selectTheme(theme || currentTheme, true), 0),
					null,
					theme => delayer.trigger(() => selectTheme(theme, false))
				);
		});
	}
}

const category = localize('preferences', "Preferences");

const colorThemeDescriptor = new SyncActionDescriptor(SelectColorThemeAction, SelectColorThemeAction.ID, SelectColorThemeAction.LABEL);
Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions).registerWorkbenchAction(colorThemeDescriptor, 'Preferences: Color Theme', category);

const iconThemeDescriptor = new SyncActionDescriptor(SelectIconThemeAction, SelectIconThemeAction.ID, SelectIconThemeAction.LABEL);
Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions).registerWorkbenchAction(iconThemeDescriptor, 'Preferences: File Icon Theme', category);
