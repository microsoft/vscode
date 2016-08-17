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

class SelectThemeAction extends Action {

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
							viewlet.search('category:themes', true);
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

const category = localize('preferences', "Preferences");
const descriptor = new SyncActionDescriptor(SelectThemeAction, SelectThemeAction.ID, SelectThemeAction.LABEL);
Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions).registerWorkbenchAction(descriptor, 'Preferences: Color Theme', category);
