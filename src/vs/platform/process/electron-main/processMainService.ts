/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserWindow, contentTracing } from 'electron';
import { randomPath } from '../../../base/common/extpath.js';
import { listProcesses } from '../../../base/node/ps.js';
import { localize } from '../../../nls.js';
import { IDiagnosticsService, IRemoteDiagnosticError, isRemoteDiagnosticError, PerformanceInfo, SystemInfo } from '../../diagnostics/common/diagnostics.js';
import { IDiagnosticsMainService } from '../../diagnostics/electron-main/diagnosticsMainService.js';
import { IDialogMainService } from '../../dialogs/electron-main/dialogMainService.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { IProcessMainService, IResolvedProcessInformation } from '../common/process.js';
import { ILogService } from '../../log/common/log.js';
import { INativeHostMainService } from '../../native/electron-main/nativeHostMainService.js';
import { IProductService } from '../../product/common/productService.js';
import { UtilityProcess } from '../../utilityProcess/electron-main/utilityProcess.js';
import { ProcessItem } from '../../../base/common/processes.js';

export class ProcessMainService implements IProcessMainService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IEnvironmentMainService private readonly environmentMainService: IEnvironmentMainService,
		@ILogService private readonly logService: ILogService,
		@IDiagnosticsService private readonly diagnosticsService: IDiagnosticsService,
		@IDiagnosticsMainService private readonly diagnosticsMainService: IDiagnosticsMainService,
		@IDialogMainService private readonly dialogMainService: IDialogMainService,
		@INativeHostMainService private readonly nativeHostMainService: INativeHostMainService,
		@IProductService private readonly productService: IProductService
	) {
	}

	async resolve(): Promise<IResolvedProcessInformation> {
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

	async stopTracing(): Promise<void> {
		if (!this.environmentMainService.args.trace) {
			return; // requires tracing to be on
		}

		const path = await contentTracing.stopRecording(`${randomPath(this.environmentMainService.userHome.fsPath, this.productService.applicationName)}.trace.txt`);

		// Inform user to report an issue
		await this.dialogMainService.showMessageBox({
			type: 'info',
			message: localize('trace.message', "Successfully created the trace file"),
			detail: localize('trace.detail', "Please create an issue and manually attach the following file:\n{0}", path),
			buttons: [localize({ key: 'trace.ok', comment: ['&& denotes a mnemonic'] }, "&&OK")],
		}, BrowserWindow.getFocusedWindow() ?? undefined);

		// Show item in explorer
		this.nativeHostMainService.showItemInFolder(undefined, path);
	}

	async getSystemStatus(): Promise<string> {
		const [info, remoteData] = await Promise.all([this.diagnosticsMainService.getMainDiagnostics(), this.diagnosticsMainService.getRemoteDiagnostics({ includeProcesses: false, includeWorkspaceMetadata: false })]);
		return this.diagnosticsService.getDiagnostics(info, remoteData);
	}

	async $getSystemInfo(): Promise<SystemInfo> {
		const [info, remoteData] = await Promise.all([this.diagnosticsMainService.getMainDiagnostics(), this.diagnosticsMainService.getRemoteDiagnostics({ includeProcesses: false, includeWorkspaceMetadata: false })]);
		const msg = await this.diagnosticsService.getSystemInfo(info, remoteData);
		return msg;
	}

	async $getPerformanceInfo(): Promise<PerformanceInfo> {
		try {
			const [info, remoteData] = await Promise.all([this.diagnosticsMainService.getMainDiagnostics(), this.diagnosticsMainService.getRemoteDiagnostics({ includeProcesses: true, includeWorkspaceMetadata: true })]);
			return await this.diagnosticsService.getPerformanceInfo(info, remoteData);
		} catch (error) {
			this.logService.warn('issueService#getPerformanceInfo ', error.message);

			throw error;
		}
	}
}
