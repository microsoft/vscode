/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { app, BrowserWindow, Event as IpcEvent } from 'electron';
import { validatedIpcMain } from 'vs/base/parts/ipc/electron-main/ipcMain';
import { CancellationToken } from 'vs/base/common/cancellation';
import { URI } from 'vs/base/common/uri';
import { IDiagnosticInfo, IDiagnosticInfoOptions, IMainProcessDiagnostics, IRemoteDiagnosticError, IRemoteDiagnosticInfo, IWindowDiagnostics } from 'vs/platform/diagnostics/common/diagnostics';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ICodeWindow } from 'vs/platform/window/electron-main/window';
import { IWindowsMainService } from 'vs/platform/windows/electron-main/windows';
import { isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier } from 'vs/platform/workspace/common/workspace';
import { IWorkspacesManagementMainService } from 'vs/platform/workspaces/electron-main/workspacesManagementMainService';
import { assertIsDefined } from 'vs/base/common/types';
import { ILogService } from 'vs/platform/log/common/log';

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
		const diagnostics: Array<IDiagnosticInfo | IRemoteDiagnosticError | undefined> = await Promise.all(windows.map(window => {
			return new Promise<IDiagnosticInfo | IRemoteDiagnosticError | undefined>((resolve) => {
				const remoteAuthority = window.remoteAuthority;
				if (remoteAuthority) {
					const replyChannel = `vscode:getDiagnosticInfoResponse${window.id}`;
					const args: IDiagnosticInfoOptions = {
						includeProcesses: options.includeProcesses,
						folders: options.includeWorkspaceMetadata ? this.getFolderURIs(window) : undefined
					};

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
				} else {
					resolve(undefined);
				}
			});
		}));

		return diagnostics.filter((x): x is IRemoteDiagnosticInfo | IRemoteDiagnosticError => !!x);
	}

	async getMainDiagnostics(): Promise<IMainProcessDiagnostics> {
		this.logService.trace('Received request for main process info from other instance.');

		const windows: IWindowDiagnostics[] = [];
		for (const window of BrowserWindow.getAllWindows()) {
			const codeWindow = this.windowsMainService.getWindowById(window.id);
			if (codeWindow) {
				windows.push(this.codeWindowToInfo(codeWindow));
			} else {
				windows.push(this.browserWindowToInfo(window));
			}
		}

		return {
			mainPID: process.pid,
			mainArguments: process.argv.slice(1),
			windows,
			screenReader: !!app.accessibilitySupportEnabled,
			gpuFeatureStatus: app.getGPUFeatureStatus()
		};
	}

	private codeWindowToInfo(window: ICodeWindow): IWindowDiagnostics {
		const folderURIs = this.getFolderURIs(window);
		const win = assertIsDefined(window.win);

		return this.browserWindowToInfo(win, folderURIs, window.remoteAuthority);
	}

	private browserWindowToInfo(window: BrowserWindow, folderURIs: URI[] = [], remoteAuthority?: string): IWindowDiagnostics {
		return {
			pid: window.webContents.getOSProcessId(),
			title: window.getTitle(),
			folderURIs,
			remoteAuthority
		};
	}

	private getFolderURIs(window: ICodeWindow): URI[] {
		const folderURIs: URI[] = [];

		const workspace = window.openedWorkspace;
		if (isSingleFolderWorkspaceIdentifier(workspace)) {
			folderURIs.push(workspace.uri);
		} else if (isWorkspaceIdentifier(workspace)) {
			const resolvedWorkspace = this.workspacesManagementMainService.resolveLocalWorkspaceSync(workspace.configPath); // workspace folders can only be shown for local (resolved) workspaces
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
