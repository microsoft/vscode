/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { STATUS_BAR_HOST_NAME_BACKGROUND, STATUS_BAR_HOST_NAME_FOREGROUND } from 'vs/workbench/common/theme';
import { themeColorFromId } from 'vs/platform/theme/common/themeService';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { Disposable, dispose } from 'vs/base/common/lifecycle';
import { MenuId, IMenuService, MenuItemAction, IMenu, MenuRegistry, registerAction2, Action2 } from 'vs/platform/actions/common/actions';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { StatusbarAlignment, IStatusbarService, IStatusbarEntryAccessor, IStatusbarEntry } from 'vs/workbench/services/statusbar/common/statusbar';
import { ILabelService } from 'vs/platform/label/common/label';
import { IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { Schemas } from 'vs/base/common/network';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { PersistentConnectionEventType } from 'vs/platform/remote/common/remoteAgentConnection';
import { IRemoteAuthorityResolverService } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { isWeb } from 'vs/base/common/platform';
import { once } from 'vs/base/common/functional';
import { truncate } from 'vs/base/common/strings';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { getVirtualWorkspaceLocation } from 'vs/platform/remote/common/remoteHosts';
import { getCodiconAriaLabel } from 'vs/base/common/codicons';

export class RemoteStatusIndicator extends Disposable implements IWorkbenchContribution {

	private static readonly REMOTE_ACTIONS_COMMAND_ID = 'workbench.action.remote.showMenu';
	private static readonly CLOSE_REMOTE_COMMAND_ID = 'workbench.action.remote.close';
	private static readonly SHOW_CLOSE_REMOTE_COMMAND_ID = !isWeb; // web does not have a "Close Remote" command

	private static readonly REMOTE_STATUS_LABEL_MAX_LENGTH = 40;

	private remoteStatusEntry: IStatusbarEntryAccessor | undefined;

	private readonly remoteMenu = this._register(this.menuService.createMenu(MenuId.StatusBarWindowIndicatorMenu, this.contextKeyService));
	private hasRemoteActions = false;

	private readonly remoteAuthority = this.environmentService.remoteAuthority;
	private connectionState: 'initializing' | 'connected' | 'reconnecting' | 'disconnected' | undefined = undefined;
	private readonly connectionStateContextKey = new RawContextKey<'' | 'initializing' | 'disconnected' | 'connected'>('remoteConnectionState', '').bindTo(this.contextKeyService);

	constructor(
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@ILabelService private readonly labelService: ILabelService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IMenuService private menuService: IMenuService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@ICommandService private readonly commandService: ICommandService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IRemoteAgentService private readonly remoteAgentService: IRemoteAgentService,
		@IRemoteAuthorityResolverService private readonly remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@IHostService private readonly hostService: IHostService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService
	) {
		super();

		// Set initial connection state
		if (this.remoteAuthority) {
			this.connectionState = 'initializing';
			this.connectionStateContextKey.set(this.connectionState);
		}

		this.registerActions();
		this.registerListeners();

		this.updateWhenInstalledExtensionsRegistered();
		this.updateRemoteStatusIndicator();
	}

	private registerActions(): void {
		const category = { value: nls.localize('remote.category', "Remote"), original: 'Remote' };

		// Show Remote Menu
		const that = this;
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: RemoteStatusIndicator.REMOTE_ACTIONS_COMMAND_ID,
					category,
					title: { value: nls.localize('remote.showMenu', "Show Remote Menu"), original: 'Show Remote Menu' },
					f1: true,
				});
			}
			run = () => that.showRemoteMenu(that.remoteMenu);
		});

		// Close Remote Connection
		if (RemoteStatusIndicator.SHOW_CLOSE_REMOTE_COMMAND_ID && this.remoteAuthority) {
			registerAction2(class extends Action2 {
				constructor() {
					super({
						id: RemoteStatusIndicator.CLOSE_REMOTE_COMMAND_ID,
						category,
						title: { value: nls.localize('remote.close', "Close Remote Connection"), original: 'Close Remote Connection' },
						f1: true
					});
				}
				run = () => that.remoteAuthority && that.hostService.openWindow({ forceReuseWindow: true, remoteAuthority: null });
			});

			MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
				group: '6_close',
				command: {
					id: RemoteStatusIndicator.CLOSE_REMOTE_COMMAND_ID,
					title: nls.localize({ key: 'miCloseRemote', comment: ['&& denotes a mnemonic'] }, "Close Re&&mote Connection")
				},
				order: 3.5
			});
		}
	}

	private registerListeners(): void {

		// Menu changes
		this._register(this.remoteMenu.onDidChange(() => this.updateRemoteActions()));

		// Update indicator when formatter changes as it may have an impact on the remote label
		this._register(this.labelService.onDidChangeFormatters(() => this.updateRemoteStatusIndicator()));

		// Update based on remote indicator changes if any
		const remoteIndicator = this.environmentService.options?.windowIndicator;
		if (remoteIndicator) {
			this._register(remoteIndicator.onDidChange(() => this.updateRemoteStatusIndicator()));
		}

		// Listen to changes of the connection
		if (this.remoteAuthority) {
			const connection = this.remoteAgentService.getConnection();
			if (connection) {
				this._register(connection.onDidStateChange((e) => {
					switch (e.type) {
						case PersistentConnectionEventType.ConnectionLost:
						case PersistentConnectionEventType.ReconnectionRunning:
						case PersistentConnectionEventType.ReconnectionWait:
							this.setState('reconnecting');
							break;
						case PersistentConnectionEventType.ReconnectionPermanentFailure:
							this.setState('disconnected');
							break;
						case PersistentConnectionEventType.ConnectionGain:
							this.setState('connected');
							break;
					}
				}));
			}
		} else {
			this._register(this.workspaceContextService.onDidChangeWorkbenchState(() => this.updateRemoteStatusIndicator()));
		}
	}

	private async updateWhenInstalledExtensionsRegistered(): Promise<void> {
		await this.extensionService.whenInstalledExtensionsRegistered();

		const remoteAuthority = this.remoteAuthority;
		if (remoteAuthority) {

			// Try to resolve the authority to figure out connection state
			(async () => {
				try {
					await this.remoteAuthorityResolverService.resolveAuthority(remoteAuthority);

					this.setState('connected');
				} catch (error) {
					this.setState('disconnected');
				}
			})();
		}

		this.updateRemoteStatusIndicator();
	}

	private setState(newState: 'disconnected' | 'connected' | 'reconnecting'): void {
		if (this.connectionState !== newState) {
			this.connectionState = newState;

			// simplify context key which doesn't support `connecting`
			if (this.connectionState === 'reconnecting') {
				this.connectionStateContextKey.set('disconnected');
			} else {
				this.connectionStateContextKey.set(this.connectionState);
			}

			this.updateRemoteStatusIndicator();
		}
	}

	private updateRemoteActions() {
		const newHasWindowActions = this.remoteMenu.getActions().length > 0;
		if (newHasWindowActions !== this.hasRemoteActions) {
			this.hasRemoteActions = newHasWindowActions;

			this.updateRemoteStatusIndicator();
		}
	}

	private updateRemoteStatusIndicator(): void {

		// Remote Indicator: show if provided via options
		const remoteIndicator = this.environmentService.options?.windowIndicator;
		if (remoteIndicator) {
			this.renderRemoteStatusIndicator(truncate(remoteIndicator.label, RemoteStatusIndicator.REMOTE_STATUS_LABEL_MAX_LENGTH), remoteIndicator.tooltip, remoteIndicator.command);
			return;
		}

		// Remote Authority: show connection state
		if (this.remoteAuthority) {
			const hostLabel = this.labelService.getHostLabel(Schemas.vscodeRemote, this.remoteAuthority) || this.remoteAuthority;
			switch (this.connectionState) {
				case 'initializing':
					this.renderRemoteStatusIndicator(nls.localize('host.open', "Opening Remote..."), nls.localize('host.open', "Opening Remote..."), undefined, true /* progress */);
					break;
				case 'reconnecting':
					this.renderRemoteStatusIndicator(`${nls.localize('host.reconnecting', "Reconnecting to {0}...", truncate(hostLabel, RemoteStatusIndicator.REMOTE_STATUS_LABEL_MAX_LENGTH))}`, nls.localize('host.tooltipReconnecting', "Reconnecting to {0}...", hostLabel), undefined, true);
					break;
				case 'disconnected':
					this.renderRemoteStatusIndicator(`$(alert) ${nls.localize('disconnectedFrom', "Disconnected from {0}", truncate(hostLabel, RemoteStatusIndicator.REMOTE_STATUS_LABEL_MAX_LENGTH))}`, nls.localize('host.tooltipDisconnected', "Disconnected from {0}", hostLabel));
					break;
				default:
					this.renderRemoteStatusIndicator(`$(remote) ${truncate(hostLabel, RemoteStatusIndicator.REMOTE_STATUS_LABEL_MAX_LENGTH)}`, nls.localize('host.tooltip', "Editing on {0}", hostLabel));
			}
			return;
		}

		// Workspace with label: indicate editing source
		const workspaceLabel = this.getWorkspaceLabel();
		if (workspaceLabel) {
			this.renderRemoteStatusIndicator(`$(remote) ${truncate(workspaceLabel, RemoteStatusIndicator.REMOTE_STATUS_LABEL_MAX_LENGTH)}`, nls.localize('workspace.tooltip', "Editing on {0}", workspaceLabel));
			return;
		}

		// Remote actions: offer menu
		if (this.remoteMenu.getActions().length > 0) {
			this.renderRemoteStatusIndicator(`$(remote)`, nls.localize('noHost.tooltip', "Open a Remote Window"));
			return;
		}

		// No Remote Extensions: hide status indicator
		dispose(this.remoteStatusEntry);
		this.remoteStatusEntry = undefined;
	}

	private getWorkspaceLabel() {
		const workspace = this.workspaceContextService.getWorkspace();
		const workspaceLocation = getVirtualWorkspaceLocation(workspace);
		if (workspaceLocation) {
			return this.labelService.getHostLabel(workspaceLocation.scheme, workspaceLocation.authority);
		}
		return undefined;
	}

	private renderRemoteStatusIndicator(text: string, tooltip?: string, command?: string, showProgress?: boolean): void {
		const name = nls.localize('remoteHost', "Remote Host");
		if (typeof command !== 'string' && this.remoteMenu.getActions().length > 0) {
			command = RemoteStatusIndicator.REMOTE_ACTIONS_COMMAND_ID;
		}

		const ariaLabel = getCodiconAriaLabel(text);
		const properties: IStatusbarEntry = {
			backgroundColor: themeColorFromId(STATUS_BAR_HOST_NAME_BACKGROUND),
			color: themeColorFromId(STATUS_BAR_HOST_NAME_FOREGROUND),
			ariaLabel,
			text,
			showProgress,
			tooltip,
			command
		};

		if (this.remoteStatusEntry) {
			this.remoteStatusEntry.update(properties);
		} else {
			this.remoteStatusEntry = this.statusbarService.addEntry(properties, 'status.host', name, StatusbarAlignment.LEFT, Number.MAX_VALUE /* first entry */);
		}
	}

	private showRemoteMenu(menu: IMenu) {
		const getCategoryLabel = (action: MenuItemAction) => {
			if (action.item.category) {
				return typeof action.item.category === 'string' ? action.item.category : action.item.category.value;
			}
			return undefined;
		};

		const computeItems = () => {
			const actions = menu.getActions();
			const items: (IQuickPickItem | IQuickPickSeparator)[] = [];

			let lastCategoryName: string | undefined = undefined;

			for (let actionGroup of actions) {
				let hasGroupCategory = false;
				for (let action of actionGroup[1]) {
					if (action instanceof MenuItemAction) {
						if (!hasGroupCategory) {
							const category = getCategoryLabel(action);
							if (category !== lastCategoryName) {
								items.push({ type: 'separator', label: category });
								lastCategoryName = category;
							}
							hasGroupCategory = true;
						}
						let label = typeof action.item.title === 'string' ? action.item.title : action.item.title.value;
						items.push({
							type: 'item',
							id: action.item.id,
							label
						});
					}
				}
			}

			if (RemoteStatusIndicator.SHOW_CLOSE_REMOTE_COMMAND_ID && this.remoteAuthority) {
				if (items.length) {
					items.push({ type: 'separator' });
				}

				items.push({
					type: 'item',
					id: RemoteStatusIndicator.CLOSE_REMOTE_COMMAND_ID,
					label: nls.localize('closeRemote.title', 'Close Remote Connection')
				});
			}
			return items;
		};

		const quickPick = this.quickInputService.createQuickPick();
		quickPick.items = computeItems();
		quickPick.sortByLabel = false;
		quickPick.canSelectMany = false;
		once(quickPick.onDidAccept)((_ => {
			const selectedItems = quickPick.selectedItems;
			if (selectedItems.length === 1) {
				this.commandService.executeCommand(selectedItems[0].id!);
			}

			quickPick.hide();
		}));
		// refresh the items when actions change
		const itemUpdater = menu.onDidChange(() => quickPick.items = computeItems());
		quickPick.onDidHide(itemUpdater.dispose);

		quickPick.show();
	}
}
