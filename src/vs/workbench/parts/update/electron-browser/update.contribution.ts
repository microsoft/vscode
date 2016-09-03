/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import { Registry } from 'vs/platform/platform';
import product from 'vs/platform/product';
import pkg from 'vs/platform/package';
import { TPromise } from 'vs/base/common/winjs.base';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IMessageService } from 'vs/platform/message/common/message';
import Severity from 'vs/base/common/severity';
import { ShowReleaseNotesAction } from 'vs/workbench/electron-browser/update';
import { Action } from 'vs/base/common/actions';
import { shell } from 'electron';
import * as semver from 'semver';

const CloseAction = new Action('close', nls.localize('close', "Close"), '', true, () => null);

const LinkAction = (id: string, message: string, licenseUrl: string) => new Action(
	id, message, null, true,
	() => { shell.openExternal(licenseUrl); return TPromise.as(null); }
);

export class UpdateContribution implements IWorkbenchContribution {

	private static KEY = 'releaseNotes/lastVersion';
	private static INSIDER_KEY = 'releaseNotes/shouldShowInsiderDisclaimer';
	getId() { return 'vs.update'; }

	constructor(
		@IStorageService storageService: IStorageService,
		@IMessageService messageService: IMessageService
	) {
		const lastVersion = storageService.get(UpdateContribution.KEY, StorageScope.GLOBAL, '');

		// was there an update?
		if (product.releaseNotesUrl && lastVersion && pkg.version !== lastVersion) {
			setTimeout(() => {
				messageService.show(Severity.Info, {
					message: nls.localize('releaseNotes', "Welcome to {0} v{1}! Would you like to read the Release Notes?", product.nameLong, pkg.version),
					actions: [
						ShowReleaseNotesAction(product.releaseNotesUrl, true),
						CloseAction
					]
				});
			}, 0);
		}

		// should we show the new license?
		if (product.licenseUrl && lastVersion && semver.satisfies(lastVersion, '<1.0.0') && semver.satisfies(pkg.version, '>=1.0.0')) {
			setTimeout(() => {
				messageService.show(Severity.Info, {
					message: nls.localize('licenseChanged', "Our license terms have changed, please go through them.", product.nameLong, pkg.version),
					actions: [
						LinkAction('update.showLicense', nls.localize('license', "Read License"), product.licenseUrl),
						CloseAction
					]
				});
			}, 0);
		}

		const shouldShowInsiderDisclaimer = storageService.getBoolean(UpdateContribution.INSIDER_KEY, StorageScope.GLOBAL, true);

		// is this a build which releases often?
		if (shouldShowInsiderDisclaimer && /-alpha$|-insider$/.test(pkg.version)) {
			setTimeout(() => {
				messageService.show(Severity.Info, {
					message: nls.localize('insiderBuilds', "Insider builds are becoming daily builds!", product.nameLong, pkg.version),
					actions: [
						new Action('update.insiderBuilds', nls.localize('readmore', "Read More"), '', true, () => {
							shell.openExternal('http://go.microsoft.com/fwlink/?LinkID=798816');
							storageService.store(UpdateContribution.INSIDER_KEY, false, StorageScope.GLOBAL);
							return TPromise.as(null);
						}),
						new Action('update.neverAgain', nls.localize('neverShowAgain', "Never Show Again"), '', true, () => {
							storageService.store(UpdateContribution.INSIDER_KEY, false, StorageScope.GLOBAL);
							return TPromise.as(null);
						}),
						CloseAction,
					]
				});
			}, 0);
		}

		storageService.store(UpdateContribution.KEY, pkg.version, StorageScope.GLOBAL);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(UpdateContribution);