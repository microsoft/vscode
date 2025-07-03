/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { listProcesses } from '../../../base/node/ps.js';
import { localize } from '../../../nls.js';
import { IDiagnosticsService, IRemoteDiagnosticError, isRemoteDiagnosticError, PerformanceInfo, SystemInfo } from '../../diagnostics/common/diagnostics.js';
import { IDiagnosticsMainService } from '../../diagnostics/electron-main/diagnosticsMainService.js';
import { IProcessService, IResolvedProcessInformation } from '../common/process.js';
import { ILogService } from '../../log/common/log.js';
import { UtilityProcess } from '../../utilityProcess/electron-main/utilityProcess.js';
import { ProcessItem } from '../../../base/common/processes.js';

export class ProcessMainService implements IProcessService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IDiagnosticsService private readonly diagnosticsService: IDiagnosticsService,
		@IDiagnosticsMainService private readonly diagnosticsMainService: IDiagnosticsMainService
	) {
	}

	async resolveProcesses(): Promise<IResolvedProcessInformation> {
		const mainProcessInfo = await this.diagnosticsMainService.getMainDiagnostics();

		const pidToNames: [number, string][] = [];
		for (const window of mainProcessInfo.windows) {
			pidToNames.push([window.pid, `window [${window.id}] (${window.title})`]);
		}

		for (const { pid, name } of UtilityProcess.getAll()) {
			pidToNames.push([pid, name]);
		}

		const processes: { name: string; rootProcess: ProcessItem | IRemoteDiagnosticError }[] = [];
		try {
			processes.push({ name: localize('local', "Local"), rootProcess: await listProcesses(process.pid) });

			const remoteDiagnostics = await this.diagnosticsMainService.getRemoteDiagnostics({ includeProcesses: true });
			remoteDiagnostics.forEach(data => {
				if (isRemoteDiagnosticError(data)) {
					processes.push({
						name: data.hostName,
						rootProcess: data
					});
				} else {
					if (data.processes) {
						processes.push({
							name: data.hostName,
							rootProcess: data.processes
						});
					}
				}
			});
		} catch (e) {
			this.logService.error(`Listing processes failed: ${e}`);
		}

		return { pidToNames, processes };
	}

	async getSystemStatus(): Promise<string> {
		const [info, remoteData] = await Promise.all([this.diagnosticsMainService.getMainDiagnostics(), this.diagnosticsMainService.getRemoteDiagnostics({ includeProcesses: false, includeWorkspaceMetadata: false })]);

		return this.diagnosticsService.getDiagnostics(info, remoteData);
	}

	async getSystemInfo(): Promise<SystemInfo> {
		const [info, remoteData] = await Promise.all([this.diagnosticsMainService.getMainDiagnostics(), this.diagnosticsMainService.getRemoteDiagnostics({ includeProcesses: false, includeWorkspaceMetadata: false })]);
		const msg = await this.diagnosticsService.getSystemInfo(info, remoteData);

		return msg;
	}

	async getPerformanceInfo(): Promise<PerformanceInfo> {
		try {
			const [info, remoteData] = await Promise.all([this.diagnosticsMainService.getMainDiagnostics(), this.diagnosticsMainService.getRemoteDiagnostics({ includeProcesses: true, includeWorkspaceMetadata: true })]);
			return await this.diagnosticsService.getPerformanceInfo(info, remoteData);
		} catch (error) {
			this.logService.warn('issueService#getPerformanceInfo ', error.message);

			throw error;
		}
	}
}
