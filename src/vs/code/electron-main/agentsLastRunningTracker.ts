/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../base/common/network.js';
import { joinPath } from '../../base/common/resources.js';
import { URI } from '../../base/common/uri.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../platform/files/common/files.js';
import { ILogService } from '../../platform/log/common/log.js';

/**
 * Marker file written by the Agents sub-application into the host VS Code's
 * user-data directory while it was running. After the update which removes
 * the sub-application, the host VS Code detects this marker on first launch,
 * restores the appropriate windows and removes the marker.
 */

export const AGENTS_LAST_RUNNING_MARKER_FILE_NAME = 'agentsLastRunning.json';

export interface IAgentsLastRunningMarker {
	readonly agentsRunning: boolean;
	readonly vscodeRunning: boolean;
	readonly writtenAt: number;
}

export async function tryConsumeAgentsLastRunningMarker(userRoamingDataHome: URI, fileService: IFileService, logService: ILogService): Promise<IAgentsLastRunningMarker | undefined> {
	const markerResource = joinPath(userRoamingDataHome.with({ scheme: Schemas.file }), AGENTS_LAST_RUNNING_MARKER_FILE_NAME);

	let parsed: IAgentsLastRunningMarker | undefined;
	try {
		const contents = await fileService.readFile(markerResource);
		const json = JSON.parse(contents.value.toString()) as Partial<IAgentsLastRunningMarker>;
		if (typeof json.agentsRunning === 'boolean' && typeof json.vscodeRunning === 'boolean') {
			parsed = {
				agentsRunning: json.agentsRunning,
				vscodeRunning: json.vscodeRunning,
				writtenAt: typeof json.writtenAt === 'number' ? json.writtenAt : 0
			};
		}
	} catch (error) {
		if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
			logService.warn(`[agents] failed to read last-running marker at ${markerResource.fsPath}: ${error}`);
		}
		return undefined;
	}

	try {
		await fileService.del(markerResource);
	} catch (error) {
		logService.warn(`[agents] failed to delete last-running marker at ${markerResource.fsPath}: ${error}`);
	}

	logService.info(`[agents] consumed last-running marker at ${markerResource.fsPath} (agentsRunning=${parsed?.agentsRunning}, vscodeRunning=${parsed?.vscodeRunning})`);

	return parsed;
}

