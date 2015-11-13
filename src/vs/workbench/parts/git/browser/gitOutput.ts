/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import winjs = require('vs/base/common/winjs.base');
import {IGitService, ServiceEvents} from 'vs/workbench/parts/git/common/git';
import ext = require('vs/workbench/common/contributions');
import {IOutputService} from 'vs/workbench/parts/output/common/output';

export class GitOutput implements ext.IWorkbenchContribution {

	static ID = 'Monaco.IDE.UI.Viewlets.GitViewlet.Workbench.GitOutput';

	private promise: winjs.Promise;
	private gitService: IGitService;
	private outputService: IOutputService;

	constructor(@IGitService gitService: IGitService, @IOutputService outputService: IOutputService) {
		this.gitService = gitService;
		this.outputService = outputService;

		// we must make sure onOutput is the first thing the git service is asked,
		// so before any service operation, we call onOutput first
		gitService.addListener2(ServiceEvents.OPERATION_START, () => this.setup());
	}

	public getId(): string {
		return GitOutput.ID;
	}

	private setup(): void {
		if (this.promise) {
			return;
		}

		this.promise = this.gitService.onOutput().then(() => {
			this.promise = null;
		}, (e: any) => {
			if (e && e.name === 'Canceled') {
				this.promise = null;
			} else {
				console.error(e);
			}
		}, (o: string) => this.onOutput(o));
	}

	private onOutput(output: string): void {
		this.outputService.append('Git', output);
	}

	public dispose(): void {
		if (this.promise) {
			this.promise.cancel();
			this.promise = null;
		}
	}
}