/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from 'vs/base/common/async';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Disposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { join } from 'vs/base/common/path';
import { basename, dirname } from 'vs/base/common/resources';
import { Promises } from 'vs/base/node/pfs';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ILogService } from 'vs/platform/log/common/log';

export class LogsDataCleaner extends Disposable {

	constructor(
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		const scheduler = this._register(new RunOnceScheduler(() => {
			this.cleanUpOldLogs();
		}, 10 * 1000 /* after 10s */));
		scheduler.schedule();
	}

	private async cleanUpOldLogs(): Promise<void> {
		this.logService.trace('[logs cleanup]: Starting to clean up old logs.');

		try {
			const currentLog = basename(this.environmentService.logsHome);
			const logsRoot = dirname(this.environmentService.logsHome.with({ scheme: Schemas.file })).fsPath;
			const logFiles = await Promises.readdir(logsRoot);

			const allSessions = logFiles.filter(logFile => /^\d{8}T\d{6}$/.test(logFile));
			const oldSessions = allSessions.sort().filter(session => session !== currentLog);
			const sessionsToDelete = oldSessions.slice(0, Math.max(0, oldSessions.length - 9));

			if (sessionsToDelete.length > 0) {
				this.logService.trace(`[logs cleanup]: Removing log folders '${sessionsToDelete.join(', ')}'`);

				await Promise.all(sessionsToDelete.map(sessionToDelete => Promises.rm(join(logsRoot, sessionToDelete))));
			}
		} catch (error) {
			onUnexpectedError(error);
		}
	}
}
