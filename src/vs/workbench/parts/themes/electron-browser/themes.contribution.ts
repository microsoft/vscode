/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { Action } from 'vs/base/common/actions';
import { firstIndex } from 'vs/base/common/arrays';
import { KeyMod, KeyChord, KeyCode } from 'vs/base/common/keyCodes';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { Registry } from 'vs/platform/platform';
import { IWorkbenchActionRegistry, Extensions } from 'vs/workbench/common/actionRegistry';
import { IQuickOpenService, IPickOpenEntry } from 'vs/platform/quickOpen/common/quickOpen';
import { IThemeService } from 'vs/workbench/services/themes/common/themeService';
import { VIEWLET_ID, IExtensionsViewlet } from 'vs/workbench/parts/extensions/common/extensions';
import { IExtensionGalleryService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { Delayer } from 'vs/base/common/async';

export class SelectColorThemeAction extends Action {

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
			const currentTheme = this.themeService.getColorTheme();

			const pickInMarketPlace = findInMarketplacePick(this.viewletService, 'category:themes');

			const picks: IPickOpenEntry[] = themes
				.map(theme => ({ id: theme.id, label: theme.label, description: theme.description }))
				.sort((t1, t2) => t1.label.localeCompare(t2.label));

			const selectTheme = (theme, broadcast) => {
				if (theme === pickInMarketPlace) {
					theme = currentTheme;
				}
				this.themeService.setColorTheme(theme.id, broadcast)
					.done(null, err => this.messageService.show(Severity.Info, localize('problemChangingTheme', "Problem loading theme: {0}", err)));
			};

			const placeHolder = localize('themes.selectTheme', "Select Color Theme");
			const autoFocusIndex = firstIndex(picks, p => p.id === currentTheme.id);
			const delayer = new Delayer<void>(100);

			if (this.extensionGalleryService.isEnabled()) {
				picks.push(pickInMarketPlace);
			}

			return this.quickOpenService.pick(picks, { placeHolder, autoFocus: { autoFocusIndex } })
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
			const currentTheme = this.themeService.getFileIconTheme();

			const pickInMarketPlace = findInMarketplacePick(this.viewletService, 'tag:icon-theme');

			const picks: IPickOpenEntry[] = themes
				.map(theme => ({ id: theme.id, label: theme.label, description: theme.description }))
				.sort((t1, t2) => t1.label.localeCompare(t2.label));

			picks.splice(0, 0, { id: '', label: localize('noIconThemeLabel', 'None'), description: localize('noIconThemeDesc', 'Disable file icons') });

			const selectTheme = (theme, broadcast) => {
				if (theme === pickInMarketPlace) {
					theme = currentTheme;
				}
				this.themeService.setFileIconTheme(theme && theme.id, broadcast)
					.done(null, err => this.messageService.show(Severity.Info, localize('problemChangingIconTheme', "Problem loading icon theme: {0}", err.message)));
			};

			const placeHolder = localize('themes.selectIconTheme', "Select File Icon Theme");
			const autoFocusIndex = firstIndex(picks, p => p.id === currentTheme.id);
			const delayer = new Delayer<void>(100);


			if (this.extensionGalleryService.isEnabled()) {
				picks.push(pickInMarketPlace);
			}

			return this.quickOpenService.pick(picks, { placeHolder, autoFocus: { autoFocusIndex } })
				.then(
				theme => delayer.trigger(() => selectTheme(theme || currentTheme, true), 0),
				null,
				theme => delayer.trigger(() => selectTheme(theme, false))
				);
		});
	}
}

function findInMarketplacePick(viewletService: IViewletService, query: string) {
	return {
		id: 'themes.findmore',
		label: localize('findMore', "Find more in the Marketplace..."),
		separator: { border: true },
		alwaysShow: true,
		run: () => viewletService.openViewlet(VIEWLET_ID, true).then(viewlet => {
			(<IExtensionsViewlet>viewlet).search(query);
			viewlet.focus();
		})
	};
}

const category = localize('preferences', "Preferences");

const colorThemeDescriptor = new SyncActionDescriptor(SelectColorThemeAction, SelectColorThemeAction.ID, SelectColorThemeAction.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_T) });
Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions).registerWorkbenchAction(colorThemeDescriptor, 'Preferences: Color Theme', category);

const iconThemeDescriptor = new SyncActionDescriptor(SelectIconThemeAction, SelectIconThemeAction.ID, SelectIconThemeAction.LABEL);
Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions).registerWorkbenchAction(iconThemeDescriptor, 'Preferences: File Icon Theme', category);
