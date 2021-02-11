/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { Disposable } from 'vs/base/common/lifecycle';
import { isMacintosh } from 'vs/base/common/platform';
import { KeyMod, KeyChord, KeyCode } from 'vs/base/common/keyCodes';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchContributionsExtensions } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { ILabelService } from 'vs/platform/label/common/label';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { Schemas } from 'vs/base/common/network';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { ILoggerService, ILogService } from 'vs/platform/log/common/log';
import { DownloadServiceChannel } from 'vs/platform/download/common/downloadIpc';
import { LogLevelChannel } from 'vs/platform/log/common/logIpc';
import { ipcRenderer } from 'vs/base/parts/sandbox/electron-sandbox/globals';
import { IDiagnosticInfoOptions, IRemoteDiagnosticInfo } from 'vs/platform/diagnostics/common/diagnostics';
import { INativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/environmentService';
import { PersistentConnectionEventType } from 'vs/platform/remote/common/remoteAgentConnection';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import { IRemoteAuthorityResolverService } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { IDownloadService } from 'vs/platform/download/common/download';
import { OpenLocalFileFolderCommand, OpenLocalFileCommand, OpenLocalFolderCommand, SaveLocalFileCommand, RemoteFileDialogContext } from 'vs/workbench/services/dialogs/browser/simpleFileDialog';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';

class RemoteChannelsContribution implements IWorkbenchContribution {

	constructor(
		@ILogService logService: ILogService,
		@ILogService loggerService: ILoggerService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@IDownloadService downloadService: IDownloadService
	) {
		const connection = remoteAgentService.getConnection();
		if (connection) {
			connection.registerChannel('download', new DownloadServiceChannel(downloadService));
			connection.registerChannel('logger', new LogLevelChannel(logService));
		}
	}
}

class RemoteAgentDiagnosticListener implements IWorkbenchContribution {
	constructor(
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@ILabelService labelService: ILabelService
	) {
		ipcRenderer.on('vscode:getDiagnosticInfo', (event: unknown, request: { replyChannel: string, args: IDiagnosticInfoOptions }): void => {
			const connection = remoteAgentService.getConnection();
			if (connection) {
				const hostName = labelService.getHostLabel(Schemas.vscodeRemote, connection.remoteAuthority);
				remoteAgentService.getDiagnosticInfo(request.args)
					.then(info => {
						if (info) {
							(info as IRemoteDiagnosticInfo).hostName = hostName;
						}

						ipcRenderer.send(request.replyChannel, info);
					})
					.catch(e => {
						const errorMessage = e && e.message ? `Fetching remote diagnostics for '${hostName}' failed: ${e.message}` : `Fetching remote diagnostics for '${hostName}' failed.`;
						ipcRenderer.send(request.replyChannel, { hostName, errorMessage });
					});
			} else {
				ipcRenderer.send(request.replyChannel);
			}
		});
	}
}

class RemoteExtensionHostEnvironmentUpdater implements IWorkbenchContribution {
	constructor(
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@IRemoteAuthorityResolverService remoteResolverService: IRemoteAuthorityResolverService,
		@IExtensionService extensionService: IExtensionService
	) {
		const connection = remoteAgentService.getConnection();
		if (connection) {
			connection.onDidStateChange(async e => {
				if (e.type === PersistentConnectionEventType.ConnectionGain) {
					const resolveResult = await remoteResolverService.resolveAuthority(connection.remoteAuthority);
					if (resolveResult.options && resolveResult.options.extensionHostEnv) {
						await extensionService.setRemoteEnvironment(resolveResult.options.extensionHostEnv);
					}
				}
			});
		}
	}
}

class RemoteTelemetryEnablementUpdater extends Disposable implements IWorkbenchContribution {
	constructor(
		@IRemoteAgentService private readonly remoteAgentService: IRemoteAgentService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();

		this.updateRemoteTelemetryEnablement();

		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('telemetry.enableTelemetry')) {
				this.updateRemoteTelemetryEnablement();
			}
		}));
	}

	private updateRemoteTelemetryEnablement(): Promise<void> {
		if (!this.configurationService.getValue('telemetry.enableTelemetry')) {
			return this.remoteAgentService.disableTelemetry();
		}

		return Promise.resolve();
	}
}


class RemoteEmptyWorkbenchPresentation extends Disposable implements IWorkbenchContribution {
	constructor(
		@INativeWorkbenchEnvironmentService environmentService: INativeWorkbenchEnvironmentService,
		@IRemoteAuthorityResolverService remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@IConfigurationService configurationService: IConfigurationService,
		@ICommandService commandService: ICommandService,
		@IWorkspaceContextService contextService: IWorkspaceContextService
	) {
		super();

		function shouldShowExplorer(): boolean {
			const startupEditor = configurationService.getValue<string>('workbench.startupEditor');
			return startupEditor !== 'welcomePage' && startupEditor !== 'welcomePageInEmptyWorkbench';
		}

		function shouldShowTerminal(): boolean {
			return shouldShowExplorer();
		}

		const { remoteAuthority, filesToDiff, filesToOpenOrCreate, filesToWait } = environmentService.configuration;
		if (remoteAuthority && contextService.getWorkbenchState() === WorkbenchState.EMPTY && !filesToDiff?.length && !filesToOpenOrCreate?.length && !filesToWait) {
			remoteAuthorityResolverService.resolveAuthority(remoteAuthority).then(() => {
				if (shouldShowExplorer()) {
					commandService.executeCommand('workbench.view.explorer');
				}
				if (shouldShowTerminal()) {
					commandService.executeCommand('workbench.action.terminal.toggleTerminal');
				}
			});
		}
	}
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchContributionsExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(RemoteChannelsContribution, LifecyclePhase.Starting);
workbenchContributionsRegistry.registerWorkbenchContribution(RemoteAgentDiagnosticListener, LifecyclePhase.Eventually);
workbenchContributionsRegistry.registerWorkbenchContribution(RemoteExtensionHostEnvironmentUpdater, LifecyclePhase.Eventually);
workbenchContributionsRegistry.registerWorkbenchContribution(RemoteTelemetryEnablementUpdater, LifecyclePhase.Ready);
workbenchContributionsRegistry.registerWorkbenchContribution(RemoteEmptyWorkbenchPresentation, LifecyclePhase.Starting);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration)
	.registerConfiguration({
		id: 'remote',
		title: nls.localize('remote', "Remote"),
		type: 'object',
		properties: {
			'remote.downloadExtensionsLocally': {
				type: 'boolean',
				markdownDescription: nls.localize('remote.downloadExtensionsLocally', "When enabled extensions are downloaded locally and installed on remote."),
				default: false
			},
		}
	});

if (isMacintosh) {
	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: OpenLocalFileFolderCommand.ID,
		weight: KeybindingWeight.WorkbenchContrib,
		primary: KeyMod.CtrlCmd | KeyCode.KEY_O,
		when: RemoteFileDialogContext,
		description: { description: OpenLocalFileFolderCommand.LABEL, args: [] },
		handler: OpenLocalFileFolderCommand.handler()
	});
} else {
	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: OpenLocalFileCommand.ID,
		weight: KeybindingWeight.WorkbenchContrib,
		primary: KeyMod.CtrlCmd | KeyCode.KEY_O,
		when: RemoteFileDialogContext,
		description: { description: OpenLocalFileCommand.LABEL, args: [] },
		handler: OpenLocalFileCommand.handler()
	});
	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: OpenLocalFolderCommand.ID,
		weight: KeybindingWeight.WorkbenchContrib,
		primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_O),
		when: RemoteFileDialogContext,
		description: { description: OpenLocalFolderCommand.LABEL, args: [] },
		handler: OpenLocalFolderCommand.handler()
	});
}

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: SaveLocalFileCommand.ID,
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_S,
	when: RemoteFileDialogContext,
	description: { description: SaveLocalFileCommand.LABEL, args: [] },
	handler: SaveLocalFileCommand.handler()
});
