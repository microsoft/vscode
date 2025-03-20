/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { app, BrowserWindow, Event as IpcEvent } from 'electron';
import { validatedIpcMain } from '../../../base/parts/ipc/electron-main/ipcMain.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { URI } from '../../../base/common/uri.js';
import { IDiagnosticInfo, IDiagnosticInfoOptions, IMainProcessDiagnostics, IProcessDiagnostics, IRemoteDiagnosticError, IRemoteDiagnosticInfo, IWindowDiagnostics } from '../common/diagnostics.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ICodeWindow } from '../../window/electron-main/window.js';
import { getAllWindowsExcludingOffscreen, IWindowsMainService } from '../../windows/electron-main/windows.js';
import { isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier } from '../../workspace/common/workspace.js';
import { IWorkspacesManagementMainService } from '../../workspaces/electron-main/workspacesManagementMainService.js';
import { assertIsDefined } from '../../../base/common/types.js';
import { ILogService } from '../../log/common/log.js';
import { UtilityProcess } from '../../utilityProcess/electron-main/utilityProcess.js';

export const ID = 'diagnosticsMainService';
export const IDiagnosticsMainService = createDecorator<IDiagnosticsMainService>(ID);

export interface IRemoteDiagnosticOptions {
	includeProcesses?: boolean;
	includeWorkspaceMetadata?: boolean;
}

export interface IDiagnosticsMainService {
	readonly _serviceBrand: undefined;
	getRemoteDiagnostics(options: IRemoteDiagnosticOptions): Promise<(IRemoteDiagnosticInfo | IRemoteDiagnosticError)[]>;
	getMainDiagnostics(): Promise<IMainProcessDiagnostics>;
}

export class DiagnosticsMainService implements IDiagnosticsMainService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService,
		@IWorkspacesManagementMainService private readonly workspacesManagementMainService: IWorkspacesManagementMainService,
		@ILogService private readonly logService: ILogService
	) { }

	async getRemoteDiagnostics(options: IRemoteDiagnosticOptions): Promise<(IRemoteDiagnosticInfo | IRemoteDiagnosticError)[]> {
		const windows = this.windowsMainService.getWindows();
		const diagnostics: Array<IDiagnosticInfo | IRemoteDiagnosticError | undefined> = await Promise.all(windows.map(async window => {
			const remoteAuthority = window.remoteAuthority;
			if (!remoteAuthority) {
				return undefined;
			}

			const replyChannel = `vscode:getDiagnosticInfoResponse${window.id}`;
			const args: IDiagnosticInfoOptions = {
				includeProcesses: options.includeProcesses,
				folders: options.includeWorkspaceMetadata ? await this.getFolderURIs(window) : undefined
			};

			return new Promise<IDiagnosticInfo | IRemoteDiagnosticError>(resolve => {
				window.sendWhenReady('vscode:getDiagnosticInfo', CancellationToken.None, { replyChannel, args });

				validatedIpcMain.once(replyChannel, (_: IpcEvent, data: IRemoteDiagnosticInfo) => {
					// No data is returned if getting the connection fails.
					if (!data) {
						resolve({ hostName: remoteAuthority, errorMessage: `Unable to resolve connection to '${remoteAuthority}'.` });
					}

					resolve(data);
				});

				setTimeout(() => {
					resolve({ hostName: remoteAuthority, errorMessage: `Connection to '${remoteAuthority}' could not be established` });
				}, 5000);
			});
		}));

		return diagnostics.filter((x): x is IRemoteDiagnosticInfo | IRemoteDiagnosticError => !!x);
	}

	async getMainDiagnostics(): Promise<IMainProcessDiagnostics> {
		this.logService.trace('Received request for main process info from other instance.');

		const windows: IWindowDiagnostics[] = [];
		for (const window of getAllWindowsExcludingOffscreen()) {
			const codeWindow = this.windowsMainService.getWindowById(window.id);
			if (codeWindow) {
				windows.push(await this.codeWindowToInfo(codeWindow));
			} else {
				windows.push(this.browserWindowToInfo(window));
			}
		}

		const pidToNames: IProcessDiagnostics[] = [];
		for (const { pid, name } of UtilityProcess.getAll()) {
			pidToNames.push({ pid, name });
		}

		return {
			mainPID: process.pid,
			mainArguments: process.argv.slice(1),
			windows,
			pidToNames,
			screenReader: !!app.accessibilitySupportEnabled,
			gpuFeatureStatus: app.getGPUFeatureStatus()
		};
	}

	private async codeWindowToInfo(window: ICodeWindow): Promise<IWindowDiagnostics> {
		const folderURIs = await this.getFolderURIs(window);
		const win = assertIsDefined(window.win);

		return this.browserWindowToInfo(win, folderURIs, window.remoteAuthority);
	}

	private browserWindowToInfo(window: BrowserWindow, folderURIs: URI[] = [], remoteAuthority?: string): IWindowDiagnostics {
		return {
			id: window.id,
			pid: window.webContents.getOSProcessId(),
			title: window.getTitle(),
			folderURIs,
			remoteAuthority
		};
	}

	private async getFolderURIs(window: ICodeWindow): Promise<URI[]> {
		const folderURIs: URI[] = [];

		const workspace = window.openedWorkspace;
		if (isSingleFolderWorkspaceIdentifier(workspace)) {
			folderURIs.push(workspace.uri);
		} else if (isWorkspaceIdentifier(workspace)) {
			const resolvedWorkspace = await this.workspacesManagementMainService.resolveLocalWorkspace(workspace.configPath); // workspace folders can only be shown for local (resolved) workspaces
			if (resolvedWorkspace) {
				const rootFolders = resolvedWorkspace.folders;
				rootFolders.forEach(root => {
					folderURIs.push(root.uri);
				});
			}
		}

		return folderURIs;
	}
}
