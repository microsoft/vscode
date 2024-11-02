/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IRemoteAgentService, remoteConnectionLatencyMeasurer } from '../../../services/remote/common/remoteAgentService.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isMacintosh, isWindows } from '../../../../base/common/platform.js';
import { KeyMod, KeyChord, KeyCode } from '../../../../base/common/keyCodes.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, WorkbenchPhase, Extensions as WorkbenchContributionsExtensions, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { ILifecycleService, LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { Schemas } from '../../../../base/common/network.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { ipcRenderer } from '../../../../base/parts/sandbox/electron-sandbox/globals.js';
import { IDiagnosticInfoOptions, IRemoteDiagnosticInfo } from '../../../../platform/diagnostics/common/diagnostics.js';
import { INativeWorkbenchEnvironmentService } from '../../../services/environment/electron-sandbox/environmentService.js';
import { PersistentConnectionEventType } from '../../../../platform/remote/common/remoteAgentConnection.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IRemoteAuthorityResolverService } from '../../../../platform/remote/common/remoteAuthorityResolver.js';
import { OpenLocalFileFolderCommand, OpenLocalFileCommand, OpenLocalFolderCommand, SaveLocalFileCommand, RemoteFileDialogContext } from '../../../services/dialogs/browser/simpleFileDialog.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { TELEMETRY_SETTING_ID } from '../../../../platform/telemetry/common/telemetry.js';
import { getTelemetryLevel } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

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
							if (remoteConnectionLatencyMeasurer.latency?.high) {
								(info as IRemoteDiagnosticInfo).latency = {
									average: remoteConnectionLatencyMeasurer.latency.average,
									current: remoteConnectionLatencyMeasurer.latency.current
								};
							}
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

	static readonly ID = 'workbench.contrib.remoteTelemetryEnablementUpdater';

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

	static readonly ID = 'workbench.contrib.remoteEmptyWorkbenchPresentation';

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

	static readonly ID = 'workbench.contrib.wslContextKeyInitializer';

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
workbenchContributionsRegistry.registerWorkbenchContribution(RemoteAgentDiagnosticListener, LifecyclePhase.Eventually);
workbenchContributionsRegistry.registerWorkbenchContribution(RemoteExtensionHostEnvironmentUpdater, LifecyclePhase.Eventually);
registerWorkbenchContribution2(RemoteTelemetryEnablementUpdater.ID, RemoteTelemetryEnablementUpdater, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(RemoteEmptyWorkbenchPresentation.ID, RemoteEmptyWorkbenchPresentation, WorkbenchPhase.BlockRestore);
if (isWindows) {
	registerWorkbenchContribution2(WSLContextKeyInitializer.ID, WSLContextKeyInitializer, WorkbenchPhase.BlockRestore);
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
		metadata: { description: OpenLocalFileFolderCommand.LABEL, args: [] },
		handler: OpenLocalFileFolderCommand.handler()
	});
} else {
	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: OpenLocalFileCommand.ID,
		weight: KeybindingWeight.WorkbenchContrib,
		primary: KeyMod.CtrlCmd | KeyCode.KeyO,
		when: RemoteFileDialogContext,
		metadata: { description: OpenLocalFileCommand.LABEL, args: [] },
		handler: OpenLocalFileCommand.handler()
	});
	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: OpenLocalFolderCommand.ID,
		weight: KeybindingWeight.WorkbenchContrib,
		primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyO),
		when: RemoteFileDialogContext,
		metadata: { description: OpenLocalFolderCommand.LABEL, args: [] },
		handler: OpenLocalFolderCommand.handler()
	});
}

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: SaveLocalFileCommand.ID,
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyS,
	when: RemoteFileDialogContext,
	metadata: { description: SaveLocalFileCommand.LABEL, args: [] },
	handler: SaveLocalFileCommand.handler()
});
