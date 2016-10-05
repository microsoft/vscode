/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import severity from 'vs/base/common/severity';
import {TPromise} from 'vs/base/common/winjs.base';
import {Action} from 'vs/base/common/actions';
import {ipcRenderer as ipc, shell} from 'electron';
import {IMessageService} from 'vs/platform/message/common/message';
import pkg from 'vs/platform/package';
import product from 'vs/platform/product';
import URI from 'vs/base/common/uri';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ReleaseNotesInput } from 'vs/workbench/parts/update/electron-browser/releaseNotesInput';
import { IRequestService } from 'vs/platform/request/common/request';
import { asText } from 'vs/base/node/request';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { Keybinding } from 'vs/base/common/keybinding';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IOpenerService } from 'vs/platform/opener/common/opener';

interface IUpdate {
	releaseNotes: string;
	version: string;
	date: string;
}

const ApplyUpdateAction = new Action(
	'update.applyUpdate',
	nls.localize('updateNow', "Update Now"),
	null,
	true,
	() => { ipc.send('vscode:update-apply'); return TPromise.as(true); }
);

const NotNowAction = new Action(
	'update.later',
	nls.localize('later', "Later"),
	null,
	true,
	() => TPromise.as(true)
);

export function loadReleaseNotes(accessor: ServicesAccessor, version: string): TPromise<string> {
	const requestService = accessor.get(IRequestService);
	const keybindingService = accessor.get(IKeybindingService);
	const match = /^(\d+\.\d)\./.exec(version);

	if (!match) {
		return TPromise.as(null);
	}

	const versionLabel = match[1].replace(/\./g, '_');
	const baseUrl = 'https://code.visualstudio.com/raw';
	const url = `${ baseUrl }/v${ versionLabel }.md`;

	const patchKeybindings = (text: string): string => {
		const kb = (match: string, kb: string) => {
			const keybinding = keybindingService.lookupKeybindings(kb)[0];

			if (!keybinding) {
				return match;
			}

			return keybindingService.getLabelFor(keybinding);
		};

		const kbstyle = (match: string, kb: string) => {
			const code = Keybinding.fromUserSettingsLabel(kb);

			if (!code) {
				return match;
			}

			const keybinding = new Keybinding(code);

			if (!keybinding) {
				return match;
			}

			return keybindingService.getLabelFor(keybinding);
		};

		return text
			.replace(/kb\(([a-z.\d\-]+)\)/gi, kb)
			.replace(/kbstyle\(([^\)]+)\)/gi, kbstyle);
	};

	return requestService.request({ url })
		.then(asText)
		.then(text => patchKeybindings(text));
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
		id,
		label,
		private returnValue: boolean,
		private version: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IOpenerService private openerService: IOpenerService
	) {
		super(id, label, null, true);
	}

	run(): TPromise<boolean> {
		if (!this.enabled) {
			return TPromise.as(false);
		}

		this.enabled = false;

		return this.instantiationService.invokeFunction(loadReleaseNotes, this.version)
			.then(text =>  this.editorService.openEditor(this.instantiationService.createInstance(ReleaseNotesInput, this.version, text)))
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
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService
	) {
		super('update.showReleaseNotes', nls.localize('releaseNotes', "Release Notes"), returnValue, version, editorService, instantiationService, openerService);
	}
}

export class ShowCurrentReleaseNotesAction extends AbstractShowReleaseNotesAction {

	static ID = 'update.showCurrentReleaseNotes';
	static LABEL = nls.localize('showReleaseNotes', "Show Release Notes");

	constructor(
		id = ShowCurrentReleaseNotesAction.ID,
		label = ShowCurrentReleaseNotesAction.LABEL,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService
	) {
		super(id, label, true, pkg.version, editorService, instantiationService, openerService);
	}
}

export const DownloadAction = (url: string) => new Action(
	'update.download',
	nls.localize('downloadNow', "Download Now"),
	null,
	true,
	() => { shell.openExternal(url); return TPromise.as(true); }
);

export class Update {

	constructor(
		@IMessageService private messageService: IMessageService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		ipc.on('vscode:update-downloaded', (event, update: IUpdate) => {
			const releaseNotesAction = this.instantiationService.createInstance(ShowReleaseNotesAction, false, update.version);

			this.messageService.show(severity.Info, {
				message: nls.localize('updateAvailable', "{0} will be updated after it restarts.", product.nameLong),
				actions: [ApplyUpdateAction, NotNowAction, releaseNotesAction]
			});
		});

		ipc.on('vscode:update-available', (event, url: string, version: string) => {
			const releaseNotesAction = this.instantiationService.createInstance(ShowReleaseNotesAction, false, version);

			this.messageService.show(severity.Info, {
				message: nls.localize('thereIsUpdateAvailable', "There is an available update."),
				actions: [DownloadAction(url), NotNowAction, releaseNotesAction]
			});
		});

		ipc.on('vscode:update-not-available', () => {
			this.messageService.show(severity.Info, nls.localize('noUpdatesAvailable', "There are no updates currently available."));
		});
	}
}