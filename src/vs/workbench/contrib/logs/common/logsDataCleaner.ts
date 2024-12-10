/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { basename, dirname } from '../../../../base/common/resources.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { Promises } from '../../../../base/common/async.js';

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
