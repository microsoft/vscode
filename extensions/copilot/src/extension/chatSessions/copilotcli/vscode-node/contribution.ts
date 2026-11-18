/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ILogger, ILogService } from '../../../../platform/log/common/logService';
import { Disposable } from '../../../../util/vs/base/common/lifecycle';
import { ServiceCollection } from '../../../../util/vs/platform/instantiation/common/serviceCollection';
import { registerAddFileReferenceCommand, registerAddSelectionCommand, registerDiffCommands } from './commands';
import { registerCommandContext } from './commands/context';
import { CopilotCLISessionTracker, ICopilotCLISessionTracker } from './copilotCLISessionTracker';
import { DiffStateManager } from './diffState';
import { InProcHttpServer } from './inProcHttpServer';
import { cleanupStaleLockFiles, createLockFile } from './lockFile';
import { ReadonlyContentProvider } from './readonlyContentProvider';
import { registerTools, SelectionState } from './tools';
import { registerDiagnosticsChangedNotification, registerSelectionChangedNotification } from './tools/push';

export function getServices(): ConstructorParameters<typeof ServiceCollection> {
	return [
		[ICopilotCLISessionTracker, new CopilotCLISessionTracker()]
	];
}
export class CopilotCLIContrib extends Disposable {

	constructor(
		@ICopilotCLISessionTracker private readonly sessionTracker: ICopilotCLISessionTracker,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		const logger = this.logService.createSubLogger('CopilotCLI');

		// Create shared instances
		const diffState = new DiffStateManager(logger);
		const httpServer = this._register(new InProcHttpServer(logger, this.sessionTracker));
		const selectionState = new SelectionState();
		const contentProvider = new ReadonlyContentProvider();

		this._register(registerCommandContext(httpServer));

		// Register commands
		this._register(registerAddFileReferenceCommand(logger, httpServer, this.sessionTracker));
		this._register(registerAddSelectionCommand(logger, httpServer, this.sessionTracker));
		for (const d of registerDiffCommands(logger, diffState)) {
			this._register(d);
		}
		for (const d of diffState.setupContextTracking()) {
			this._register(d);
		}
		this._register(contentProvider.register());
		this._register(httpServer.onDidClientDisconnect(sessionId => {
			diffState.closeAllForSession(sessionId);
		}));

		// Clean up any stale lockfiles from previous sessions
		cleanupStaleLockFiles(logger).then(cleanedCount => {
			if (cleanedCount > 0) {
				logger.info(`Cleaned up ${cleanedCount} stale lock file(s).`);
			}
		}).catch(err => {
			logger.error(err, 'Failed to clean up stale lock files');
		});

		// Start the MCP server
		this._startMcpServer(logger, httpServer, diffState, selectionState, contentProvider);
	}
	private async _startMcpServer(logger: ILogger, httpServer: InProcHttpServer, diffState: DiffStateManager, selectionState: SelectionState, contentProvider: ReadonlyContentProvider): Promise<void> {
		try {
			const { serverUri, headers } = await httpServer.start({
				id: 'vscode-copilot-cli',
				serverLabel: 'VS Code Copilot CLI',
				serverVersion: '0.0.1',
				registerTools: (server, sessionId) => {
					registerTools(server, logger, diffState, selectionState, contentProvider, this.sessionTracker, sessionId);
				},
				registerPushNotifications: () => {
					for (const d of registerSelectionChangedNotification(logger, httpServer, selectionState)) {
						this._register(d);
					}
					for (const d of registerDiagnosticsChangedNotification(logger, httpServer)) {
						this._register(d);
					}
				},
			});

			const lockFile = await createLockFile(serverUri, headers, logger);
			logger.info(`MCP server started. Lock file: ${lockFile.path}`);
			logger.info(`Server URI: ${serverUri.toString()}`);

			// Update lock file when workspace folders change
			this._register(vscode.workspace.onDidChangeWorkspaceFolders(() => {
				void lockFile.update();
				logger.info('Workspace folders changed, lock file updated.');
			}));

			// Update lock file when workspace trust is granted
			this._register(vscode.workspace.onDidGrantWorkspaceTrust(() => {
				void lockFile.update();
			}));

			this._register({ dispose: () => { void lockFile.remove(); } });
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			logger.error(`Failed to start MCP server: ${errMsg}`);
		}
	}
}
