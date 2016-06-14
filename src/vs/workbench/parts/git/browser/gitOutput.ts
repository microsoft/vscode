/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IGitService, ServiceEvents } from 'vs/workbench/parts/git/common/git';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IOutputService } from 'vs/workbench/parts/output/common/output';

export class GitOutput implements IWorkbenchContribution {

	static ID = 'vs.git.output';

	private outputListener: IDisposable;
	private gitService: IGitService;
	private outputService: IOutputService;

	constructor(@IGitService gitService: IGitService, @IOutputService outputService: IOutputService) {
		this.gitService = gitService;
		this.outputService = outputService;

		const listener = gitService.addListener2(ServiceEvents.OPERATION_START, () => {
			this.outputListener = this.gitService.onOutput(output => this.onOutput(output));
			listener.dispose();
		});
	}

	getId(): string {
		return GitOutput.ID;
	}

	private onOutput(output: string): void {
		this.outputService.getChannel('Git').append(output);
	}

	dispose(): void {
		this.outputListener = dispose(this.outputListener);
	}
}