/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { STATUS_BAR_HOST_NAME_BACKGROUND } from 'vs/workbench/common/theme';

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
import { RemoteAgentExtensionsAutoInstaller } from 'vs/workbench/contrib/remote/electron-browser/remoteAgentExtensionsInstaller';
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
			this.renderWindowIndicator(`$(file-symlink-directory) ${hostLabel}`, nls.localize('host.tooltip', "Editing on {0}", hostLabel), windowActionCommand);
		} else {
			if (windowActionCommand) {
				this.renderWindowIndicator(`$(file-symlink-directory)`, nls.localize('noHost.tooltip', "Open a remote window"), windowActionCommand);
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
			backgroundColor: themeColorFromId(STATUS_BAR_HOST_NAME_BACKGROUND), text, tooltip, command
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
				items.push({ type: 'separator', label: actionGroup[0] });
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
						ipc.send(request.replyChannel, { hostName, errorMessage: `Fetching remote diagnostics for '${hostName}' failed: ${e.message}` });
					});
			} else {
				ipc.send(request.replyChannel);
			}
		});
	}
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchContributionsExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(RemoteChannelsContribution, LifecyclePhase.Starting);
workbenchContributionsRegistry.registerWorkbenchContribution(LogOutputChannels, LifecyclePhase.Eventually);
workbenchContributionsRegistry.registerWorkbenchContribution(RemoteAgentExtensionsAutoInstaller, LifecyclePhase.Eventually);
workbenchContributionsRegistry.registerWorkbenchContribution(RemoteAgentDiagnosticListener, LifecyclePhase.Eventually);
workbenchContributionsRegistry.registerWorkbenchContribution(RemoteWindowActiveIndicator, LifecyclePhase.Starting);
