/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { STATUS_BAR_HOST_NAME_BACKGROUND, STATUS_BAR_HOST_NAME_FOREGROUND } from 'vs/workbench/common/theme';
import { themeColorFromId } from 'vs/platform/theme/common/themeService';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { Disposable } from 'vs/base/common/lifecycle';
import { isMacintosh } from 'vs/base/common/platform';
import { KeyMod, KeyChord, KeyCode } from 'vs/base/common/keyCodes';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { MenuId, IMenuService, MenuItemAction, IMenu, MenuRegistry, registerAction } from 'vs/platform/actions/common/actions';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchContributionsExtensions } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { StatusbarAlignment, IStatusbarService, IStatusbarEntryAccessor, IStatusbarEntry } from 'vs/workbench/services/statusbar/common/statusbar';
import { ILabelService } from 'vs/platform/label/common/label';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { REMOTE_HOST_SCHEME } from 'vs/platform/remote/common/remoteHosts';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { ILogService } from 'vs/platform/log/common/log';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { DialogChannel } from 'vs/platform/dialogs/electron-browser/dialogIpc';
import { DownloadServiceChannel } from 'vs/platform/download/common/downloadIpc';
import { LoggerChannel } from 'vs/platform/log/common/logIpc';
import { ipcRenderer as ipc } from 'electron';
import { IDiagnosticInfoOptions, IRemoteDiagnosticInfo } from 'vs/platform/diagnostics/common/diagnostics';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { PersistentConnectionEventType } from 'vs/platform/remote/common/remoteAgentConnection';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import { IRemoteAuthorityResolverService } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { RemoteConnectionState, Deprecated_RemoteAuthorityContext, RemoteFileDialogContext } from 'vs/workbench/browser/contextkeys';
import { IDownloadService } from 'vs/platform/download/common/download';
import { OpenLocalFileFolderCommand, OpenLocalFileCommand, OpenLocalFolderCommand, SaveLocalFileCommand } from 'vs/workbench/services/dialogs/browser/simpleFileDialog';

const WINDOW_ACTIONS_COMMAND_ID = 'workbench.action.remote.showMenu';
const CLOSE_REMOTE_COMMAND_ID = 'workbench.action.remote.close';

export class RemoteWindowActiveIndicator extends Disposable implements IWorkbenchContribution {

	private windowIndicatorEntry: IStatusbarEntryAccessor | undefined;
	private windowCommandMenu: IMenu;
	private hasWindowActions: boolean = false;
	private remoteAuthority: string | undefined;
	private connectionState: 'initializing' | 'connected' | 'disconnected' | undefined = undefined;

	constructor(
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@ILabelService private readonly labelService: ILabelService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IMenuService private menuService: IMenuService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@ICommandService private readonly commandService: ICommandService,
		@IExtensionService extensionService: IExtensionService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@IRemoteAuthorityResolverService remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@IHostService hostService: IHostService
	) {
		super();

		this.windowCommandMenu = this.menuService.createMenu(MenuId.StatusBarWindowIndicatorMenu, this.contextKeyService);
		this._register(this.windowCommandMenu);

		const category = nls.localize('remote.category', "Remote");

		registerAction({
			id: WINDOW_ACTIONS_COMMAND_ID,
			category,
			title: { value: nls.localize('remote.showMenu', "Show Remote Menu"), original: 'Show Remote Menu' },
			menu: {
				menuId: MenuId.CommandPalette
			},
			handler: (_accessor) => this.showIndicatorActions(this.windowCommandMenu)
		});

		this.remoteAuthority = environmentService.configuration.remoteAuthority;
		Deprecated_RemoteAuthorityContext.bindTo(this.contextKeyService).set(this.remoteAuthority || '');

		if (this.remoteAuthority) {
			registerAction({
				id: CLOSE_REMOTE_COMMAND_ID,
				category,
				title: { value: nls.localize('remote.close', "Close Remote Connection"), original: 'Close Remote Connection' },
				menu: {
					menuId: MenuId.CommandPalette
				},
				handler: (_accessor) => this.remoteAuthority && hostService.openWindow({ forceReuseWindow: true })
			});

			// Pending entry until extensions are ready
			this.renderWindowIndicator(nls.localize('host.open', "$(sync~spin) Opening Remote..."), undefined, WINDOW_ACTIONS_COMMAND_ID);
			this.connectionState = 'initializing';
			RemoteConnectionState.bindTo(this.contextKeyService).set(this.connectionState);

			MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
				group: '6_close',
				command: {
					id: CLOSE_REMOTE_COMMAND_ID,
					title: nls.localize({ key: 'miCloseRemote', comment: ['&& denotes a mnemonic'] }, "Close Re&&mote Connection")
				},
				order: 3.5
			});

			const connection = remoteAgentService.getConnection();
			if (connection) {
				this._register(connection.onDidStateChange((e) => {
					switch (e.type) {
						case PersistentConnectionEventType.ConnectionLost:
						case PersistentConnectionEventType.ReconnectionPermanentFailure:
						case PersistentConnectionEventType.ReconnectionRunning:
						case PersistentConnectionEventType.ReconnectionWait:
							this.setDisconnected(true);
							break;
						case PersistentConnectionEventType.ConnectionGain:
							this.setDisconnected(false);
							break;
					}
				}));
			}
		}

		extensionService.whenInstalledExtensionsRegistered().then(_ => {
			if (this.remoteAuthority) {
				this._register(this.labelService.onDidChangeFormatters(e => this.updateWindowIndicator()));
				remoteAuthorityResolverService.resolveAuthority(this.remoteAuthority).then(() => this.setDisconnected(false), () => this.setDisconnected(true));
			}
			this._register(this.windowCommandMenu.onDidChange(e => this.updateWindowActions()));
			this.updateWindowIndicator();
		});
	}

	private setDisconnected(isDisconnected: boolean): void {
		const newState = isDisconnected ? 'disconnected' : 'connected';
		if (this.connectionState !== newState) {
			this.connectionState = newState;
			RemoteConnectionState.bindTo(this.contextKeyService).set(this.connectionState);
			Deprecated_RemoteAuthorityContext.bindTo(this.contextKeyService).set(isDisconnected ? `disconnected/${this.remoteAuthority!}` : this.remoteAuthority!);
			this.updateWindowIndicator();
		}
	}

	private updateWindowIndicator(): void {
		const windowActionCommand = (this.remoteAuthority || this.windowCommandMenu.getActions().length) ? WINDOW_ACTIONS_COMMAND_ID : undefined;
		if (this.remoteAuthority) {
			const hostLabel = this.labelService.getHostLabel(REMOTE_HOST_SCHEME, this.remoteAuthority) || this.remoteAuthority;
			if (this.connectionState !== 'disconnected') {
				this.renderWindowIndicator(`$(remote) ${hostLabel}`, nls.localize('host.tooltip', "Editing on {0}", hostLabel), windowActionCommand);
			} else {
				this.renderWindowIndicator(`$(alert) ${nls.localize('disconnectedFrom', "Disconnected from")} ${hostLabel}`, nls.localize('host.tooltipDisconnected', "Disconnected from {0}", hostLabel), windowActionCommand);
			}
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
			this.windowIndicatorEntry = this.statusbarService.addEntry(properties, 'status.host', nls.localize('status.host', "Remote Host"), StatusbarAlignment.LEFT, Number.MAX_VALUE /* first entry */);
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

		if (this.remoteAuthority) {
			if (items.length) {
				items.push({ type: 'separator' });
			}
			items.push({
				type: 'item',
				id: CLOSE_REMOTE_COMMAND_ID,
				label: nls.localize('closeRemote.title', 'Close Remote Connection')
			});
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

class RemoteChannelsContribution implements IWorkbenchContribution {

	constructor(
		@ILogService logService: ILogService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@IDialogService dialogService: IDialogService,
		@IDownloadService downloadService: IDownloadService
	) {
		const connection = remoteAgentService.getConnection();
		if (connection) {
			connection.registerChannel('dialog', new DialogChannel(dialogService));
			connection.registerChannel('download', new DownloadServiceChannel(downloadService));
			connection.registerChannel('logger', new LoggerChannel(logService));
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
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IRemoteAuthorityResolverService remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@IConfigurationService configurationService: IConfigurationService,
		@ICommandService commandService: ICommandService,
	) {
		super();

		function shouldShowExplorer(): boolean {
			const startupEditor = configurationService.getValue<string>('workbench.startupEditor');
			return startupEditor !== 'welcomePage' && startupEditor !== 'welcomePageInEmptyWorkbench';
		}

		function shouldShowTerminal(): boolean {
			return shouldShowExplorer();
		}

		const { remoteAuthority, folderUri, workspace } = environmentService.configuration;
		if (remoteAuthority && !folderUri && !workspace) {
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
workbenchContributionsRegistry.registerWorkbenchContribution(RemoteWindowActiveIndicator, LifecyclePhase.Starting);
workbenchContributionsRegistry.registerWorkbenchContribution(RemoteTelemetryEnablementUpdater, LifecyclePhase.Ready);
workbenchContributionsRegistry.registerWorkbenchContribution(RemoteEmptyWorkbenchPresentation, LifecyclePhase.Starting);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration)
	.registerConfiguration({
		id: 'remote',
		title: nls.localize('remote', "Remote"),
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
							nls.localize('ui', "UI extension kind. In a remote window, such extensions are enabled only when available on the local machine."),
							nls.localize('workspace', "Workspace extension kind. In a remote window, such extensions are enabled only when available on the remote.")
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
