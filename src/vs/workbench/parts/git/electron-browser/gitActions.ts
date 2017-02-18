/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { always } from 'vs/base/common/async';
import { Action } from 'vs/base/common/actions';
import { IMessageService } from 'vs/platform/message/common/message';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import Severity from 'vs/base/common/severity';
import { IGitService } from 'vs/workbench/parts/git/common/git';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import * as url from 'url';
import { remote } from 'electron';
import { ITelemetryService, ITelemetryData } from 'vs/platform/telemetry/common/telemetry';
import { isPromiseCanceledError } from 'vs/base/common/errors';

const dialog = remote.dialog;

export class CloneAction extends Action {

	static ID = 'workbench.action.git.clone';
	static LABEL = 'Clone';

	constructor(id: string, label: string,
		@IGitService private gitService: IGitService,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IMessageService private messageService: IMessageService,
		@IWindowsService private windowsService: IWindowsService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IWorkspaceContextService private workspaceService: IWorkspaceContextService
	) {
		super(id, label);
	}

	run(event?: any, data?: ITelemetryData): TPromise<void> {
		return this.quickOpenService.input({
			prompt: localize('valid', "Provide a valid git repository URL"),
			placeHolder: localize('url', "Repository URL"),
			validateInput: input => {
				const parsedUrl = url.parse(input);

				if (!parsedUrl.protocol || !parsedUrl.host) {
					return TPromise.as(localize('valid', "Provide a valid git repository URL"));
				}

				return TPromise.as('');
			}
		})
			.then(url => {
				if (!url) {
					this.telemetryService.publicLog('gitClone', { ...data, outcome: 'no_URL' });
					return TPromise.as(null);
				}

				const result = dialog.showOpenDialog(remote.getCurrentWindow(), {
					title: localize('directory', "Destination clone directory"),
					properties: ['openDirectory', 'createDirectory']
				});

				if (!result || result.length === 0) {
					this.telemetryService.publicLog('gitClone', { ...data, outcome: 'no_directory' });
					return TPromise.as(null);
				}

				const promise = TPromise.timeout(200)
					.then(() => this.messageService.show(Severity.Info, localize('cloning', "Cloning repository '{0}'...", url)))
					.then(close => new TPromise(() => null, close));

				const clone = always(this.gitService.clone(url, result[0]), () => promise.cancel());

				return clone.then(path => {
					this.telemetryService.publicLog('gitClone', { ...data, outcome: 'success' });
					const forceNewWindow = this.workspaceService.hasWorkspace();
					return this.windowsService.openWindow([path], { forceNewWindow, forceReuseWindow: !forceNewWindow });

				}).then<void>(null, e => {
					if (/already exists and is not an empty directory/.test(e.stderr || '')) {
						this.telemetryService.publicLog('gitClone', { ...data, outcome: 'directory_not_empty' });
						return TPromise.wrapError(localize('already exists', "Destination repository already exists, please pick another directory to clone to."));
					}

					this.telemetryService.publicLog('gitClone', { ...data, outcome: isPromiseCanceledError(e) ? 'canceled' : 'error' });
					return TPromise.wrapError(e);
				});
			});
	}
}
