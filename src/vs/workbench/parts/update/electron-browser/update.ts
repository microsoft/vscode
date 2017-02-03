/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import severity from 'vs/base/common/severity';
import { TPromise } from 'vs/base/common/winjs.base';
import { Action } from 'vs/base/common/actions';
import { IMessageService, CloseAction, Severity } from 'vs/platform/message/common/message';
import pkg from 'vs/platform/node/package';
import product from 'vs/platform/node/product';
import URI from 'vs/base/common/uri';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ReleaseNotesInput } from 'vs/workbench/parts/update/electron-browser/releaseNotesInput';
import { IRequestService } from 'vs/platform/request/node/request';
import { asText } from 'vs/base/node/request';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { Keybinding } from 'vs/base/common/keyCodes';
import { KeybindingLabels } from 'vs/base/common/keybinding';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IUpdateService } from 'vs/platform/update/common/update';
import * as semver from 'semver';

class ApplyUpdateAction extends Action {
	constructor( @IUpdateService private updateService: IUpdateService) {
		super('update.applyUpdate', nls.localize('updateNow', "Update Now"), null, true);
	}

	run(): TPromise<void> {
		return this.updateService.quitAndInstall();
	}
}

const NotNowAction = new Action(
	'update.later',
	nls.localize('later', "Later"),
	null,
	true,
	() => TPromise.as(true)
);

const releaseNotesCache: { [version: string]: TPromise<string>; } = Object.create(null);

export function loadReleaseNotes(accessor: ServicesAccessor, version: string): TPromise<string> {
	const requestService = accessor.get(IRequestService);
	const keybindingService = accessor.get(IKeybindingService);
	const match = /^(\d+\.\d)\./.exec(version);

	if (!match) {
		return TPromise.as(null);
	}

	const versionLabel = match[1].replace(/\./g, '_');
	const baseUrl = 'https://code.visualstudio.com/raw';
	const url = `${baseUrl}/v${versionLabel}.md`;
	const unassigned = nls.localize('unassigned', "unassigned");

	const patchKeybindings = (text: string): string => {
		const kb = (match: string, kb: string) => {
			const keybinding = keybindingService.lookupKeybindings(kb)[0];

			if (!keybinding) {
				return unassigned;
			}

			return keybindingService.getLabelFor(keybinding);
		};

		const kbstyle = (match: string, kb: string) => {
			const code = KeybindingLabels.fromUserSettingsLabel(kb);

			if (!code) {
				return unassigned;
			}

			const keybinding = new Keybinding(code);

			if (!keybinding) {
				return unassigned;
			}

			return keybindingService.getLabelFor(keybinding);
		};

		return text
			.replace(/kb\(([a-z.\d\-]+)\)/gi, kb)
			.replace(/kbstyle\(([^\)]+)\)/gi, kbstyle);
	};

	if (!releaseNotesCache[version]) {
		releaseNotesCache[version] = requestService.request({ url })
			.then(asText)
			.then(text => patchKeybindings(text));
	}

	return releaseNotesCache[version];
}

export class OpenLatestReleaseNotesInBrowserAction extends Action {

	constructor(
		@IOpenerService private openerService: IOpenerService
	) {
		super('update.openLatestReleaseNotes', nls.localize('releaseNotes', "Release Notes"), null, true);
	}

	run(): TPromise<any> {
		const uri = URI.parse(product.releaseNotesUrl);
		return this.openerService.open(uri);
	}
}

export abstract class AbstractShowReleaseNotesAction extends Action {

	constructor(
		id: string,
		label: string,
		private returnValue: boolean,
		private version: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(id, label, null, true);
	}

	run(): TPromise<boolean> {
		if (!this.enabled) {
			return TPromise.as(false);
		}

		this.enabled = false;

		return this.instantiationService.invokeFunction(loadReleaseNotes, this.version)
			.then(text => this.editorService.openEditor(this.instantiationService.createInstance(ReleaseNotesInput, this.version, text), { pinned: true }))
			.then(() => true)
			.then(null, () => {
				const action = this.instantiationService.createInstance(OpenLatestReleaseNotesInBrowserAction);
				return action.run().then(() => false);
			});
	}
}

export class ShowReleaseNotesAction extends AbstractShowReleaseNotesAction {

	constructor(
		returnValue: boolean,
		version: string,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super('update.showReleaseNotes', nls.localize('releaseNotes', "Release Notes"), returnValue, version, editorService, instantiationService);
	}
}

export class ShowCurrentReleaseNotesAction extends AbstractShowReleaseNotesAction {

	static ID = 'update.showCurrentReleaseNotes';
	static LABEL = nls.localize('showReleaseNotes', "Show Release Notes");

	constructor(
		id = ShowCurrentReleaseNotesAction.ID,
		label = ShowCurrentReleaseNotesAction.LABEL,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(id, label, true, pkg.version, editorService, instantiationService);
	}
}

export class DownloadAction extends Action {

	constructor(private url: string, @IUpdateService private updateService: IUpdateService) {
		super('update.download', nls.localize('downloadNow', "Download Now"), null, true);
	}

	run(): TPromise<void> {
		return this.updateService.quitAndInstall();
	}
}

const LinkAction = (id: string, message: string, licenseUrl: string) => new Action(
	id, message, null, true,
	() => { window.open(licenseUrl); return TPromise.as(null); }
);

export class UpdateContribution implements IWorkbenchContribution {

	private static KEY = 'releaseNotes/lastVersion';
	getId() { return 'vs.update'; }

	constructor(
		@IStorageService storageService: IStorageService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IMessageService messageService: IMessageService,
		@IUpdateService updateService: IUpdateService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService
	) {
		const lastVersion = storageService.get(UpdateContribution.KEY, StorageScope.GLOBAL, '');

		// was there an update?
		if (product.releaseNotesUrl && lastVersion && pkg.version !== lastVersion) {
			instantiationService.invokeFunction(loadReleaseNotes, pkg.version)
				.then(
				text => editorService.openEditor(instantiationService.createInstance(ReleaseNotesInput, pkg.version, text), { pinned: true }),
				() => {
					messageService.show(Severity.Info, {
						message: nls.localize('read the release notes', "Welcome to {0} v{1}! Would you like to read the Release Notes?", product.nameLong, pkg.version),
						actions: [
							instantiationService.createInstance(OpenLatestReleaseNotesInBrowserAction),
							CloseAction
						]
					});
				});
		}

		// should we show the new license?
		if (product.licenseUrl && lastVersion && semver.satisfies(lastVersion, '<1.0.0') && semver.satisfies(pkg.version, '>=1.0.0')) {
			messageService.show(Severity.Info, {
				message: nls.localize('licenseChanged', "Our license terms have changed, please go through them.", product.nameLong, pkg.version),
				actions: [
					LinkAction('update.showLicense', nls.localize('license', "Read License"), product.licenseUrl),
					CloseAction
				]
			});
		}

		storageService.store(UpdateContribution.KEY, pkg.version, StorageScope.GLOBAL);

		updateService.onUpdateReady(update => {
			const applyUpdateAction = instantiationService.createInstance(ApplyUpdateAction);
			const releaseNotesAction = instantiationService.createInstance(ShowReleaseNotesAction, false, update.version);

			messageService.show(severity.Info, {
				message: nls.localize('updateAvailable', "{0} will be updated after it restarts.", product.nameLong),
				actions: [applyUpdateAction, NotNowAction, releaseNotesAction]
			});
		});

		updateService.onUpdateAvailable(update => {
			const downloadAction = instantiationService.createInstance(DownloadAction, update.version);
			const releaseNotesAction = instantiationService.createInstance(ShowReleaseNotesAction, false, update.version);

			messageService.show(severity.Info, {
				message: nls.localize('thereIsUpdateAvailable', "There is an available update."),
				actions: [downloadAction, NotNowAction, releaseNotesAction]
			});
		});

		updateService.onUpdateNotAvailable(explicit => {
			if (!explicit) {
				return;
			}

			messageService.show(severity.Info, nls.localize('noUpdatesAvailable', "There are no updates currently available."));
		});

		updateService.onError(err => messageService.show(severity.Error, err));
	}
}