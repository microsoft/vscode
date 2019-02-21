/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { setFormatterConflictCallback, FormatMode, FormatKind } from 'vs/editor/contrib/format/format';
import { IDisposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { VIEWLET_ID, IExtensionsViewlet } from 'vs/workbench/contrib/extensions/common/extensions';


class FormattingConflictHandler {

	private _registration: IDisposable;

	constructor(
		@INotificationService notificationService: INotificationService,
		@IViewletService private readonly _viewletService: IViewletService,
	) {

		this._registration = setFormatterConflictCallback((ids, model, mode) => {
			if (mode & FormatMode.Auto) {
				return;
			}
			if (ids.length === 0) {
				const langName = model.getLanguageIdentifier().language;
				const message = mode & FormatKind.Document
					? localize('no.documentprovider', "There is no document formatter for '{0}'-files installed.", langName)
					: localize('no.selectionprovider', "There is no selection formatter for '{0}'-files installed.", langName);

				const choice = {
					label: localize('install.formatter', "Install Formatter..."),
					run: () => {
						return this._viewletService.openViewlet(VIEWLET_ID, true).then(viewlet => {
							if (viewlet) {
								(viewlet as IExtensionsViewlet).search(`category:formatters ${langName}`);
							}
						});
					}
				};
				notificationService.prompt(Severity.Info, message, [choice]);
			}
		});
	}

	dispose(): void {
		this._registration.dispose();
	}
}

Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench).registerWorkbenchContribution(
	FormattingConflictHandler,
	LifecyclePhase.Restored
);
