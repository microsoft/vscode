/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { STATUS_BAR_HOST_NAME_BACKGROUND, STATUS_BAR_HOST_NAME_FOREGROUND } from 'vs/workbench/common/theme';

import { themeColorFromId } from 'vs/platform/theme/common/themeService';
import { RemoteExtensionLogFileName, IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { Disposable } from 'vs/base/common/lifecycle';

import { MenuId, IMenuService, MenuItemAction, IMenu } from 'vs/platform/actions/common/actions';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchContributionsExtensions } from 'vs/workbench/common/contributions';
import { IOutputChannelRegistry, Extensions as OutputExt } from 'vs/workbench/contrib/output/common/output';
import * as resources from 'vs/base/common/resources';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { StatusbarAlignment, IStatusbarService, IStatusbarEntryAccessor, IStatusbarEntry } from 'vs/platform/statusbar/common/statusbar';
import { ILabelService } from 'vs/platform/label/common/label';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { CommandsRegistry, ICommandService } from 'vs/platform/commands/common/commands';
import { REMOTE_HOST_SCHEME } from 'vs/platform/remote/common/remoteHosts';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { ILogService } from 'vs/platform/log/common/log';
import { IFileService } from 'vs/platform/files/common/files';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { DialogChannel } from 'vs/platform/dialogs/node/dialogIpc';
import { DownloadServiceChannel } from 'vs/platform/download/node/downloadIpc';
import { LogLevelSetterChannel } from 'vs/platform/log/node/logIpc';
import { ipcRenderer as ipc } from 'electron';
import { IDiagnosticInfoOptions, IRemoteDiagnosticInfo } from 'vs/platform/diagnostics/common/diagnosticsService';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IProgressService2, IProgress, IProgressStep, ProgressLocation } from 'vs/platform/progress/common/progress';
import { PersistenConnectionEventType } from 'vs/platform/remote/common/remoteAgentConnection';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';

const WINDOW_ACTIONS_COMMAND_ID = '_remote.showWindowActions';

export class RemoteWindowActiveIndicator extends Disposable implements IWorkbenchContribution {

	private windowIndicatorEntry: IStatusbarEntryAccessor | undefined;
	private windowCommandMenu: IMenu;
	private hasWindowActions: boolean = false;
	private remoteAuthority: string | undefined;

	constructor(
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@ILabelService private readonly labelService: ILabelService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IMenuService private menuService: IMenuService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@ICommandService private readonly commandService: ICommandService,
		@IExtensionService extensionService: IExtensionService
	) {
		super();

		this.windowCommandMenu = this.menuService.createMenu(MenuId.StatusBarWindowIndicatorMenu, this.contextKeyService);
		this._register(this.windowCommandMenu);

		this._register(CommandsRegistry.registerCommand(WINDOW_ACTIONS_COMMAND_ID, _ => this.showIndicatorActions(this.windowCommandMenu)));

		this.remoteAuthority = environmentService.configuration.remoteAuthority;
		if (this.remoteAuthority) {
			// Pending entry until extensions are ready
			this.renderWindowIndicator(nls.localize('host.open', "$(sync~spin) Opening Remote..."));
		}

		extensionService.whenInstalledExtensionsRegistered().then(_ => {
			if (this.remoteAuthority) {
				this._register(this.labelService.onDidChangeFormatters(e => this.updateWindowIndicator()));
			}
			this._register(this.windowCommandMenu.onDidChange(e => this.updateWindowActions()));
			this.updateWindowIndicator();
		});
	}

	private updateWindowIndicator(): void {
		const windowActionCommand = this.windowCommandMenu.getActions().length ? WINDOW_ACTIONS_COMMAND_ID : undefined;
		if (this.remoteAuthority) {
			const hostLabel = this.labelService.getHostLabel(REMOTE_HOST_SCHEME, this.remoteAuthority) || this.remoteAuthority;
			this.renderWindowIndicator(`$(remote) ${hostLabel}`, nls.localize('host.tooltip', "Editing on {0}", hostLabel), windowActionCommand);
		} else {
			if (windowActionCommand) {
				this.renderWindowIndicator(`$(remote)`, nls.localize('noHost.tooltip', "Open a remote window"), windowActionCommand);
			} else if (this.windowIndicatorEntry) {
				this.windowIndicatorEntry.dispose();
				this.windowIndicatorEntry = undefined;
			}
		}
	}

	private updateWindowActions() {
		const newHasWindowActions = this.windowCommandMenu.getActions().length > 0;
		if (newHasWindowActions !== this.hasWindowActions) {
			this.hasWindowActions = newHasWindowActions;
			this.updateWindowIndicator();
		}
	}

	private renderWindowIndicator(text: string, tooltip?: string, command?: string): void {
		const properties: IStatusbarEntry = {
			backgroundColor: themeColorFromId(STATUS_BAR_HOST_NAME_BACKGROUND), color: themeColorFromId(STATUS_BAR_HOST_NAME_FOREGROUND), text, tooltip, command
		};
		if (this.windowIndicatorEntry) {
			this.windowIndicatorEntry.update(properties);
		} else {
			this.windowIndicatorEntry = this.statusbarService.addEntry(properties, StatusbarAlignment.LEFT, Number.MAX_VALUE /* first entry */);
		}
	}

	private showIndicatorActions(menu: IMenu) {

		const actions = menu.getActions();

		const items: (IQuickPickItem | IQuickPickSeparator)[] = [];
		for (let actionGroup of actions) {
			if (items.length) {
				items.push({ type: 'separator' });
			}
			for (let action of actionGroup[1]) {
				if (action instanceof MenuItemAction) {
					let label = typeof action.item.title === 'string' ? action.item.title : action.item.title.value;
					if (action.item.category) {
						const category = typeof action.item.category === 'string' ? action.item.category : action.item.category.value;
						label = nls.localize('cat.title', "{0}: {1}", category, label);
					}
					items.push({
						type: 'item',
						id: action.item.id,
						label
					});
				}
			}
		}

		const quickPick = this.quickInputService.createQuickPick();
		quickPick.items = items;
		quickPick.canSelectMany = false;
		quickPick.onDidAccept(_ => {
			const selectedItems = quickPick.selectedItems;
			if (selectedItems.length === 1) {
				this.commandService.executeCommand(selectedItems[0].id!);
			}
			quickPick.hide();
		});
		quickPick.show();
	}
}

class LogOutputChannels extends Disposable implements IWorkbenchContribution {

	constructor(
		@IRemoteAgentService remoteAgentService: IRemoteAgentService
	) {
		super();
		remoteAgentService.getEnvironment().then(remoteEnv => {
			if (remoteEnv) {
				const outputChannelRegistry = Registry.as<IOutputChannelRegistry>(OutputExt.OutputChannels);
				outputChannelRegistry.registerChannel({ id: 'remoteExtensionLog', label: nls.localize('remoteExtensionLog', "Remote Server"), file: resources.joinPath(remoteEnv.logsPath, `${RemoteExtensionLogFileName}.log`), log: true });
			}
		});
	}
}

class RemoteChannelsContribution implements IWorkbenchContribution {

	constructor(
		@ILogService logService: ILogService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@IFileService fileService: IFileService,
		@IDialogService dialogService: IDialogService
	) {
		const connection = remoteAgentService.getConnection();
		if (connection) {
			connection.registerChannel('dialog', new DialogChannel(dialogService));
			connection.registerChannel('download', new DownloadServiceChannel());
			connection.registerChannel('loglevel', new LogLevelSetterChannel(logService));
		}
	}
}

class RemoteAgentDiagnosticListener implements IWorkbenchContribution {
	constructor(
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@ILabelService labelService: ILabelService
	) {
		ipc.on('vscode:getDiagnosticInfo', (event: Event, request: { replyChannel: string, args: IDiagnosticInfoOptions }): void => {
			const connection = remoteAgentService.getConnection();
			if (connection) {
				const hostName = labelService.getHostLabel(REMOTE_HOST_SCHEME, connection.remoteAuthority);
				remoteAgentService.getDiagnosticInfo(request.args)
					.then(info => {
						if (info) {
							(info as IRemoteDiagnosticInfo).hostName = hostName;
						}

						ipc.send(request.replyChannel, info);
					})
					.catch(e => {
						const errorMessage = e && e.message ? `Fetching remote diagnostics for '${hostName}' failed: ${e.message}` : `Fetching remote diagnostics for '${hostName}' failed.`;
						ipc.send(request.replyChannel, { hostName, errorMessage });
					});
			} else {
				ipc.send(request.replyChannel);
			}
		});
	}
}

class RemoteAgentConnectionStatusListener implements IWorkbenchContribution {
	constructor(
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@IProgressService2 progressService: IProgressService2
	) {
		const connection = remoteAgentService.getConnection();
		if (connection) {
			let currentProgressPromiseResolve: (() => void) | null = null;
			let currentProgress: IProgress<IProgressStep> | null = null;

			connection.onDidStateChange((e) => {
				console.log(`received event... `, e);
				switch (e.type) {
					case PersistenConnectionEventType.ConnectionLost:
						if (!currentProgressPromiseResolve) {
							const promise = new Promise<void>((resolve) => currentProgressPromiseResolve = resolve);
							progressService!.withProgress({ location: ProgressLocation.Dialog }, (progress) => { currentProgress = progress; return promise; });
						}
						currentProgress!.report({ message: nls.localize('connectionLost', "Connection Lost") });
						break;
					case PersistenConnectionEventType.ReconnectionWait:
						currentProgress!.report({ message: nls.localize('reconnectionWait', "Attempting to reconnect in {0} seconds...", e.durationSeconds) });
						break;
					case PersistenConnectionEventType.ReconnectionRunning:
						currentProgress!.report({ message: nls.localize('reconnectionRunning', "Reconnecting...") });
						break;
					case PersistenConnectionEventType.ReconnectionPermanentFailure:
						currentProgress!.report({ message: nls.localize('reconnectionPermanentFailure', "Cannot reconnect. Please reload the workbench.") });
						break;
					case PersistenConnectionEventType.ConnectionGain:
						currentProgressPromiseResolve!();
						currentProgressPromiseResolve = null;
						currentProgress = null;
						break;
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

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchContributionsExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(RemoteChannelsContribution, LifecyclePhase.Starting);
workbenchContributionsRegistry.registerWorkbenchContribution(LogOutputChannels, LifecyclePhase.Eventually);
workbenchContributionsRegistry.registerWorkbenchContribution(RemoteAgentDiagnosticListener, LifecyclePhase.Eventually);
workbenchContributionsRegistry.registerWorkbenchContribution(RemoteAgentConnectionStatusListener, LifecyclePhase.Eventually);
workbenchContributionsRegistry.registerWorkbenchContribution(RemoteWindowActiveIndicator, LifecyclePhase.Starting);
workbenchContributionsRegistry.registerWorkbenchContribution(RemoteTelemetryEnablementUpdater, LifecyclePhase.Ready);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration)
	.registerConfiguration({
		id: 'remote',
		title: nls.localize('remote title', "Remote"),
		type: 'object',
		properties: {
			'remote.extensionKind': {
				type: 'object',
				markdownDescription: nls.localize('remote.extensionKind', "Override the kind of an extension. `ui` extensions are installed and run on the local machine while `workspace` extensions are run on the remote. By overriding an extension's default kind using this setting, you specify if that extension should be installed and enabled locally or remotely."),
				patternProperties: {
					'([a-z0-9A-Z][a-z0-9\-A-Z]*)\\.([a-z0-9A-Z][a-z0-9\-A-Z]*)$': {
						type: 'string',
						enum: [
							'ui',
							'workspace'
						],
						enumDescriptions: [
							nls.localize('ui', "UI extension kind. Such extensions are enabled only when available locally in a remote window."),
							nls.localize('workspace', "Workspace extension kind. Such extensions are enabled only when available on remote server in a remote window.")
						],
						default: 'ui'
					},
				},
				default: {
					'pub.name': 'ui'
				}
			}
		}
	});
