/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from 'vs/platform/registry/common/platform';
import { IViewsRegistry, Extensions, ITreeViewDescriptor, ITreeViewDataProvider, ITreeItem, TreeItemCollapsibleState, IViewsService, TreeViewItemHandleArg, ViewContainer, IViewDescriptorService } from 'vs/workbench/common/views';
import { localize } from 'vs/nls';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { TreeViewPane, TreeView } from 'vs/workbench/browser/parts/views/treeView';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ALL_SYNC_RESOURCES, SyncResource, IUserDataSyncService, ISyncResourceHandle, CONTEXT_SYNC_STATE, SyncStatus, getSyncAreaLabel, IUserDataSyncEnablementService, TURN_OFF_EVERYWHERE_SYNC_COMMAND_ID, ENABLE_SYNC_VIEWS_COMMAND_ID, AccountStatus, CONTEXT_ENABLE_VIEWS, CONFIGURE_SYNC_COMMAND_ID, SHOW_SYNC_LOG_COMMAND_ID, CONTEXT_ACCOUNT_STATE } from 'vs/platform/userDataSync/common/userDataSync';
import { registerAction2, Action2, MenuId } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr, ContextKeyEqualsExpr, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { URI } from 'vs/base/common/uri';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { FolderThemeIcon, IThemeService } from 'vs/platform/theme/common/themeService';
import { fromNow } from 'vs/base/common/date';
import { pad } from 'vs/base/common/strings';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ViewPaneContainer } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { Codicon } from 'vs/base/common/codicons';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IAction, Action } from 'vs/base/common/actions';

export class UserDataSyncViewPaneContainer extends ViewPaneContainer {

	constructor(
		containerId: string,
		@ICommandService private readonly commandService: ICommandService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService storageService: IStorageService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IExtensionService extensionService: IExtensionService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
	) {
		super(containerId, { mergeViewWithContainerWhenSingleView: false }, instantiationService, configurationService, layoutService, contextMenuService, telemetryService, extensionService, themeService, storageService, contextService, viewDescriptorService);
	}

	getActions(): IAction[] {
		return [
			new Action(SHOW_SYNC_LOG_COMMAND_ID, localize('showLog', "Show Log"), Codicon.output.classNames, true, async () => this.commandService.executeCommand(SHOW_SYNC_LOG_COMMAND_ID)),
			new Action(CONFIGURE_SYNC_COMMAND_ID, localize('configure', "Configure..."), Codicon.settingsGear.classNames, true, async () => this.commandService.executeCommand(CONFIGURE_SYNC_COMMAND_ID)),
		];
	}

}

export class UserDataSyncDataViews extends Disposable {

	constructor(
		container: ViewContainer,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IUserDataSyncService private readonly userDataSyncService: IUserDataSyncService,
		@IUserDataSyncEnablementService private readonly userDataSyncEnablementService: IUserDataSyncEnablementService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super();
		this.registerViews(container);
	}

	private registerViews(container: ViewContainer): void {
		const remoteView = this.registerView(container, true, true);
		this.registerRemoteViewActions(remoteView);

		this.registerView(container, false, false);
	}

	private registerView(container: ViewContainer, remote: boolean, showByDefault: boolean): TreeView {
		const id = `workbench.views.sync.${remote ? 'remote' : 'local'}DataView`;
		const showByDefaultContext = new RawContextKey<boolean>(id, showByDefault);
		const viewEnablementContext = showByDefaultContext.bindTo(this.contextKeyService);
		const name = remote ? localize('remote title', "Synced Data") : localize('local title', "Local Backup");
		const treeView = this.instantiationService.createInstance(TreeView, id, name);
		treeView.showCollapseAllAction = true;
		treeView.showRefreshAction = true;
		const disposable = treeView.onDidChangeVisibility(visible => {
			if (visible && !treeView.dataProvider) {
				disposable.dispose();
				treeView.dataProvider = new UserDataSyncHistoryViewDataProvider(remote, this.userDataSyncService, this.userDataSyncEnablementService);
			}
		});
		this._register(Event.any(this.userDataSyncEnablementService.onDidChangeResourceEnablement, this.userDataSyncEnablementService.onDidChangeEnablement)(() => treeView.refresh()));
		const viewsRegistry = Registry.as<IViewsRegistry>(Extensions.ViewsRegistry);
		viewsRegistry.registerViews([<ITreeViewDescriptor>{
			id,
			name,
			ctorDescriptor: new SyncDescriptor(TreeViewPane),
			when: ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized), CONTEXT_ACCOUNT_STATE.isEqualTo(AccountStatus.Available), CONTEXT_ENABLE_VIEWS, showByDefaultContext),
			canToggleVisibility: true,
			canMoveView: true,
			treeView,
			collapsed: false,
			order: 100,
		}], container);

		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `workbench.actions.showSync${remote ? 'Remote' : 'Local'}DataView`,
					title: remote ?
						{ value: localize('workbench.action.showSyncRemoteBackup', "Show Synced Data"), original: `Show Synced Data` }
						: { value: localize('workbench.action.showSyncLocalBackup', "Show Local Backup"), original: `Show Local Backup` },
					category: { value: localize('sync preferences', "Preferences Sync"), original: `Preferences Sync` },
					menu: {
						id: MenuId.CommandPalette,
						when: ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized), CONTEXT_ACCOUNT_STATE.isEqualTo(AccountStatus.Available)),
					},
				});
			}
			async run(accessor: ServicesAccessor): Promise<void> {
				const viewDescriptorService = accessor.get(IViewDescriptorService);
				const viewsService = accessor.get(IViewsService);
				const commandService = accessor.get(ICommandService);

				await commandService.executeCommand(ENABLE_SYNC_VIEWS_COMMAND_ID);
				viewEnablementContext.set(true);

				const viewContainer = viewDescriptorService.getViewContainerByViewId(id);
				if (viewContainer) {
					const model = viewDescriptorService.getViewContainerModel(viewContainer);
					if (model.activeViewDescriptors.some(viewDescriptor => viewDescriptor.id === id)) {
						viewsService.openView(id, true);
					} else {
						const disposable = model.onDidChangeActiveViewDescriptors(e => {
							if (e.added.some(viewDescriptor => viewDescriptor.id === id)) {
								disposable.dispose();
								viewsService.openView(id, true);
							}
						});
					}
				}
			}
		});

		this.registerActions(id);
		return treeView;
	}

	private registerActions(viewId: string) {
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `workbench.actions.sync.resolveResource`,
					title: localize('workbench.actions.sync.resolveResourceRef', "Show raw JSON sync data"),
					menu: {
						id: MenuId.ViewItemContext,
						when: ContextKeyExpr.and(ContextKeyEqualsExpr.create('view', viewId), ContextKeyExpr.regex('viewItem', /sync-resource-.*/i))
					},
				});
			}
			async run(accessor: ServicesAccessor, handle: TreeViewItemHandleArg): Promise<void> {
				const { resource } = <{ resource: string }>JSON.parse(handle.$treeItemHandle);
				const editorService = accessor.get(IEditorService);
				await editorService.openEditor({ resource: URI.parse(resource) });
			}
		});

		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `workbench.actions.sync.replaceCurrent`,
					title: localize('workbench.actions.sync.replaceCurrent', "Download..."),
					icon: { id: 'codicon/cloud-download' },
					menu: {
						id: MenuId.ViewItemContext,
						when: ContextKeyExpr.and(ContextKeyEqualsExpr.create('view', viewId), ContextKeyExpr.regex('viewItem', /sync-resource-.*/i)),
						group: 'inline',
					},
				});
			}
			async run(accessor: ServicesAccessor, handle: TreeViewItemHandleArg): Promise<void> {
				const dialogService = accessor.get(IDialogService);
				const userDataSyncService = accessor.get(IUserDataSyncService);
				const { resource, syncResource } = <{ resource: string, syncResource: SyncResource }>JSON.parse(handle.$treeItemHandle);
				const result = await dialogService.confirm({
					message: localize('confirm replace', "Would you like to replace your current {0} with selected?", getSyncAreaLabel(syncResource)),
					type: 'info',
					title: localize('preferences sync', "Preferences Sync")
				});
				if (result.confirmed) {
					return userDataSyncService.replace(URI.parse(resource));
				}
			}
		});

		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `workbench.actions.sync.commpareWithLocal`,
					title: localize('workbench.actions.sync.commpareWithLocal', "Open Changes"),
				});
			}
			async run(accessor: ServicesAccessor, handle: TreeViewItemHandleArg): Promise<void> {
				const editorService = accessor.get(IEditorService);
				const { resource, comparableResource } = <{ resource: string, comparableResource?: string }>JSON.parse(handle.$treeItemHandle);
				if (comparableResource) {
					await editorService.openEditor({
						leftResource: URI.parse(resource),
						rightResource: URI.parse(comparableResource),
						options: {
							preserveFocus: true,
							revealIfVisible: true,
						},
					});
				} else {
					await editorService.openEditor({ resource: URI.parse(resource) });
				}
			}
		});
	}

	private registerRemoteViewActions(view: TreeView) {
		this.registerResetAction(view);
	}

	private registerResetAction(view: TreeView) {
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `workbench.actions.syncData.reset`,
					title: localize('workbench.actions.syncData.reset', "Reset Synced Data"),
					menu: {
						id: MenuId.ViewTitle,
						when: ContextKeyExpr.and(ContextKeyEqualsExpr.create('view', view.id)),
					},
				});
			}
			async run(accessor: ServicesAccessor): Promise<void> {
				const commandService = accessor.get(ICommandService);
				const dialogService = accessor.get(IDialogService);
				const result = await dialogService.confirm({
					message: localize('reset', "This will clear your synced data from the cloud and stop sync on all your devices."),
					title: localize('reset title', "Reset Synced Data"),
					type: 'info',
					primaryButton: localize('reset button', "Reset"),
				});
				if (result.confirmed) {
					await commandService.executeCommand(TURN_OFF_EVERYWHERE_SYNC_COMMAND_ID);
					await view.refresh();
				}
			}
		});
	}
}

interface SyncResourceTreeItem extends ITreeItem {
	resource: SyncResource;
	resourceHandle: ISyncResourceHandle;
}

class UserDataSyncHistoryViewDataProvider implements ITreeViewDataProvider {

	constructor(
		private readonly remote: boolean,
		private readonly userDataSyncService: IUserDataSyncService,
		private readonly userDataSyncEnablementService: IUserDataSyncEnablementService,
	) { }

	async getChildren(element?: ITreeItem): Promise<ITreeItem[]> {
		if (!element) {
			return ALL_SYNC_RESOURCES.map(resourceKey => ({
				handle: resourceKey,
				collapsibleState: TreeItemCollapsibleState.Collapsed,
				label: { label: getSyncAreaLabel(resourceKey) },
				description: !this.userDataSyncEnablementService.isEnabled() || this.userDataSyncEnablementService.isResourceEnabled(resourceKey) ? undefined : localize('not syncing', "Not syncing"),
				themeIcon: FolderThemeIcon,
				contextValue: resourceKey
			}));
		}
		const syncResource = ALL_SYNC_RESOURCES.filter(key => key === element.handle)[0] as SyncResource;
		if (syncResource) {
			const refHandles = this.remote ? await this.userDataSyncService.getRemoteSyncResourceHandles(syncResource) : await this.userDataSyncService.getLocalSyncResourceHandles(syncResource);
			return refHandles.map(({ uri, created }) => {
				const handle = JSON.stringify({ resource: uri.toString(), syncResource });
				return <SyncResourceTreeItem>{
					handle,
					collapsibleState: TreeItemCollapsibleState.Collapsed,
					label: { label: label(new Date(created)) },
					description: fromNow(created, true),
					resourceUri: uri,
					resource: syncResource,
					resourceHandle: { uri, created },
					contextValue: `sync-resource-${syncResource}`
				};
			});
		}
		if ((<SyncResourceTreeItem>element).resourceHandle) {
			const associatedResources = await this.userDataSyncService.getAssociatedResources((<SyncResourceTreeItem>element).resource, (<SyncResourceTreeItem>element).resourceHandle);
			return associatedResources.map(({ resource, comparableResource }) => {
				const handle = JSON.stringify({ resource: resource.toString(), comparableResource: comparableResource?.toString() });
				return {
					handle,
					collapsibleState: TreeItemCollapsibleState.None,
					resourceUri: resource,
					command: { id: `workbench.actions.sync.commpareWithLocal`, title: '', arguments: [<TreeViewItemHandleArg>{ $treeViewId: '', $treeItemHandle: handle }] },
					contextValue: `sync-associatedResource-${(<SyncResourceTreeItem>element).resource}`
				};
			});
		}
		return [];
	}
}

function label(date: Date): string {
	return date.toLocaleDateString() +
		' ' + pad(date.getHours(), 2) +
		':' + pad(date.getMinutes(), 2) +
		':' + pad(date.getSeconds(), 2);
}
