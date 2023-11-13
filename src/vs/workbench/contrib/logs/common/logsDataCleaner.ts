/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IFileService } from 'vs/platform/files/common/files';
import { basename, dirname } from 'vs/base/common/resources';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Promises } from 'vs/base/common/async';

export class LogsDataCleaner extends Disposable {

	constructor(
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IFileService private readonly fileService: IFileService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
	) {
		super();
		this.cleanUpOldLogsSoon();
	}

	private cleanUpOldLogsSoon(): void {
		let handle: any = setTimeout(async () => {
			handle = undefined;
			const stat = await this.fileService.resolve(dirname(this.environmentService.logsHome));
			if (stat.children) {
				const currentLog = basename(this.environmentService.logsHome);
				const allSessions = stat.children.filter(stat => stat.isDirectory && /^\d{8}T\d{6}$/.test(stat.name));
				const oldSessions = allSessions.sort().filter((d, i) => d.name !== currentLog);
				const toDelete = oldSessions.slice(0, Math.max(0, oldSessions.length - 49));
				Promises.settled(toDelete.map(stat => this.fileService.del(stat.resource, { recursive: true })));
			}
		}, 10 * 1000);
		this.lifecycleService.onWillShutdown(() => {
			if (handle) {
				clearTimeout(handle);
				handle = undefined;
			}
		});
	}
}
