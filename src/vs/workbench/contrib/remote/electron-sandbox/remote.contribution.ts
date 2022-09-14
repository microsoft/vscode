/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { Disposable } from 'vs/base/common/lifecycle';
import { isMacintosh, isWindows } from 'vs/base/common/platform';
import { KeyMod, KeyChord, KeyCode } from 'vs/base/common/keyCodes';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchContributionsExtensions } from 'vs/workbench/common/contributions';
import { ILifecycleService, LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { ILabelService } from 'vs/platform/label/common/label';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { Schemas } from 'vs/base/common/network';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { ipcRenderer } from 'vs/base/parts/sandbox/electron-sandbox/globals';
import { IDiagnosticInfoOptions, IRemoteDiagnosticInfo } from 'vs/platform/diagnostics/common/diagnostics';
import { INativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/environmentService';
import { PersistentConnectionEventType } from 'vs/platform/remote/common/remoteAgentConnection';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import { IRemoteAuthorityResolverService } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { OpenLocalFileFolderCommand, OpenLocalFileCommand, OpenLocalFolderCommand, SaveLocalFileCommand, RemoteFileDialogContext } from 'vs/workbench/services/dialogs/browser/simpleFileDialog';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { TELEMETRY_SETTING_ID } from 'vs/platform/telemetry/common/telemetry';
import { getTelemetryLevel } from 'vs/platform/telemetry/common/telemetryUtils';
import { IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';

class RemoteAgentDiagnosticListener implements IWorkbenchContribution {
	constructor(
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@ILabelService labelService: ILabelService
	) {
		ipcRenderer.on('vscode:getDiagnosticInfo', (event: unknown, request: { replyChannel: string; args: IDiagnosticInfoOptions }): void => {
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
						const errorMessage = e && e.message ? `Connection to '${hostName}' could not be established  ${e.message}` : `Connection to '${hostName}' could not be established `;
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
			if (e.affectsConfiguration(TELEMETRY_SETTING_ID)) {
				this.updateRemoteTelemetryEnablement();
			}
		}));
	}

	private updateRemoteTelemetryEnablement(): Promise<void> {
		return this.remoteAgentService.updateTelemetryLevel(getTelemetryLevel(this.configurationService));
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

		const { remoteAuthority, filesToDiff, filesToMerge, filesToOpenOrCreate, filesToWait } = environmentService;
		if (remoteAuthority && contextService.getWorkbenchState() === WorkbenchState.EMPTY && !filesToDiff?.length && !filesToMerge?.length && !filesToOpenOrCreate?.length && !filesToWait) {
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

/**
 * Sets the 'wslFeatureInstalled' context key if the WSL feature is or was installed on this machine.
 */
class WSLContextKeyInitializer extends Disposable implements IWorkbenchContribution {

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@INativeHostService nativeHostService: INativeHostService,
		@IStorageService storageService: IStorageService,
		@ILifecycleService lifecycleService: ILifecycleService
	) {
		super();

		const contextKeyId = 'wslFeatureInstalled';
		const storageKey = 'remote.wslFeatureInstalled';

		const defaultValue = storageService.getBoolean(storageKey, StorageScope.APPLICATION, undefined);

		const hasWSLFeatureContext = new RawContextKey<boolean>(contextKeyId, !!defaultValue, nls.localize('wslFeatureInstalled', "Whether the platform has the WSL feature installed"));
		const contextKey = hasWSLFeatureContext.bindTo(contextKeyService);

		if (defaultValue === undefined) {
			lifecycleService.when(LifecyclePhase.Eventually).then(async () => {
				nativeHostService.hasWSLFeatureInstalled().then(res => {
					if (res) {
						contextKey.set(true);
						// once detected, set to true
						storageService.store(storageKey, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
					}
				});
			});
		}
	}
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchContributionsExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(RemoteAgentDiagnosticListener, 'RemoteAgentDiagnosticListener', LifecyclePhase.Eventually);
workbenchContributionsRegistry.registerWorkbenchContribution(RemoteExtensionHostEnvironmentUpdater, 'RemoteExtensionHostEnvironmentUpdater', LifecyclePhase.Eventually);
workbenchContributionsRegistry.registerWorkbenchContribution(RemoteTelemetryEnablementUpdater, 'RemoteTelemetryEnablementUpdater', LifecyclePhase.Ready);
workbenchContributionsRegistry.registerWorkbenchContribution(RemoteEmptyWorkbenchPresentation, 'RemoteEmptyWorkbenchPresentation', LifecyclePhase.Ready);
if (isWindows) {
	workbenchContributionsRegistry.registerWorkbenchContribution(WSLContextKeyInitializer, 'WSLContextKeyInitializer', LifecyclePhase.Ready);
}

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
		primary: KeyMod.CtrlCmd | KeyCode.KeyO,
		when: RemoteFileDialogContext,
		description: { description: OpenLocalFileFolderCommand.LABEL, args: [] },
		handler: OpenLocalFileFolderCommand.handler()
	});
} else {
	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: OpenLocalFileCommand.ID,
		weight: KeybindingWeight.WorkbenchContrib,
		primary: KeyMod.CtrlCmd | KeyCode.KeyO,
		when: RemoteFileDialogContext,
		description: { description: OpenLocalFileCommand.LABEL, args: [] },
		handler: OpenLocalFileCommand.handler()
	});
	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: OpenLocalFolderCommand.ID,
		weight: KeybindingWeight.WorkbenchContrib,
		primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyO),
		when: RemoteFileDialogContext,
		description: { description: OpenLocalFolderCommand.LABEL, args: [] },
		handler: OpenLocalFolderCommand.handler()
	});
}

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: SaveLocalFileCommand.ID,
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyS,
	when: RemoteFileDialogContext,
	description: { description: SaveLocalFileCommand.LABEL, args: [] },
	handler: SaveLocalFileCommand.handler()
});
