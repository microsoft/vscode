/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../base/common/buffer.js';
import { Disposable } from '../../base/common/lifecycle.js';
import { Schemas } from '../../base/common/network.js';
import { joinPath } from '../../base/common/resources.js';
import { URI } from '../../base/common/uri.js';
import { ICrossAppIPCService } from '../../platform/crossAppIpc/electron-main/crossAppIpcService.js';
import { IFileService } from '../../platform/files/common/files.js';
import { ILogService } from '../../platform/log/common/log.js';

/**
 * Marker file written by the Agents sub-application into the host VS Code's
 * user-data directory while the Agents app is running. After a future update
 * removes the sub-application, the host VS Code can detect this marker on
 * first launch and restore the user's last-known windows state.
 */

export const AGENTS_LAST_RUNNING_MARKER_FILE_NAME = 'agentsLastRunning.json';

export interface IAgentsLastRunningMarker {
	readonly agentsRunning: boolean;
	readonly vscodeRunning: boolean;
	readonly writtenAt: number;
}

export class AgentsLastRunningTracker extends Disposable {

	private readonly markerResource: URI;

	constructor(
		hostUserRoamingDataHome: URI,
		@ICrossAppIPCService private readonly crossAppIPCService: ICrossAppIPCService,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this.markerResource = joinPath(hostUserRoamingDataHome.with({ scheme: Schemas.file }), AGENTS_LAST_RUNNING_MARKER_FILE_NAME);

		// Write marker now and refresh whenever the host's liveness changes
		// so the recorded `vscodeRunning` snapshot reflects the latest state.
		this.writeMarker();
		this._register(this.crossAppIPCService.onDidConnect(() => this.writeMarker()));
		this._register(this.crossAppIPCService.onDidDisconnect(() => this.writeMarker()));
	}

	private async writeMarker(): Promise<void> {
		const payload: IAgentsLastRunningMarker = {
			agentsRunning: true,
			vscodeRunning: this.crossAppIPCService.connected,
			writtenAt: Date.now()
		};
		try {
			await this.fileService.writeFile(this.markerResource, VSBuffer.fromString(JSON.stringify(payload)));
			this.logService.trace(`[agents] wrote last-running marker at ${this.markerResource.fsPath} (vscodeRunning=${payload.vscodeRunning})`);
		} catch (error) {
			this.logService.warn(`[agents] failed to write last-running marker at ${this.markerResource.fsPath}: ${error}`);
		}
	}
}
