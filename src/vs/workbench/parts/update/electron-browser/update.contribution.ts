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
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IMessageService, CloseAction } from 'vs/platform/message/common/message';
import Severity from 'vs/base/common/severity';
import { loadReleaseNotes, OpenLatestReleaseNotesInBrowserAction, ShowCurrentReleaseNotesAction } from 'vs/workbench/electron-browser/update';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Action } from 'vs/base/common/actions';
import { shell } from 'electron';
import { ReleaseNotesEditor } from './releaseNotesEditor';
import { ReleaseNotesInput } from './releaseNotesInput';
import * as semver from 'semver';
import { EditorDescriptor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { IEditorRegistry, Extensions as EditorExtensions } from 'vs/workbench/common/editor';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actionRegistry';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';

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
		@IInstantiationService private instantiationService: IInstantiationService,
		@IMessageService messageService: IMessageService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		const lastVersion = storageService.get(UpdateContribution.KEY, StorageScope.GLOBAL, '');

		// was there an update?
		if (product.releaseNotesUrl && lastVersion && pkg.version !== lastVersion) {
			setTimeout(() => {
				this.instantiationService.invokeFunction(loadReleaseNotes, pkg.version)
					.then(
					text => this.editorService.openEditor(this.instantiationService.createInstance(ReleaseNotesInput, pkg.version, text)),
					() => {
						messageService.show(Severity.Info, {
							message: nls.localize('read the release notes', "Welcome to {0} v{1}! Would you like to read the Release Notes?", product.nameLong, pkg.version),
							actions: [
								this.instantiationService.createInstance(OpenLatestReleaseNotesInBrowserAction),
								CloseAction
							]
						});
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
					message: nls.localize('insiderBuilds', "Insider builds and releases everyday!", product.nameLong, pkg.version),
					actions: [
						new Action('update.insiderBuilds', nls.localize('readmore', "Read More"), '', true, () => {
							shell.openExternal('http://go.microsoft.com/fwlink/?LinkID=798816');
							storageService.store(UpdateContribution.INSIDER_KEY, false, StorageScope.GLOBAL);
							return TPromise.as(null);
						}),
						new Action('update.neverAgain', nls.localize('neverShowAgain', "Don't Show Again"), '', true, () => {
							storageService.store(UpdateContribution.INSIDER_KEY, false, StorageScope.GLOBAL);
							return TPromise.as(null);
						}),
						CloseAction
					]
				});
			}, 0);
		}

		storageService.store(UpdateContribution.KEY, pkg.version, StorageScope.GLOBAL);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(UpdateContribution);

// Editor
const editorDescriptor = new EditorDescriptor(
	ReleaseNotesEditor.ID,
	nls.localize('release notes', "Release notes"),
	'vs/workbench/parts/update/electron-browser/releaseNotesEditor',
	'ReleaseNotesEditor'
);

Registry.as<IEditorRegistry>(EditorExtensions.Editors)
	.registerEditor(editorDescriptor, [new SyncDescriptor(ReleaseNotesInput)]);

Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions)
	.registerWorkbenchAction(new SyncActionDescriptor(ShowCurrentReleaseNotesAction, ShowCurrentReleaseNotesAction.ID, ShowCurrentReleaseNotesAction.LABEL), 'Open Release Notes');
