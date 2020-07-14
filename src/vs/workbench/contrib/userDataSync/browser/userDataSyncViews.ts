/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from 'vs/platform/registry/common/platform';
import { IViewsRegistry, Extensions, ITreeViewDescriptor, ITreeViewDataProvider, ITreeItem, TreeItemCollapsibleState, TreeViewItemHandleArg, ViewContainer, IViewDescriptorService, ITreeView } from 'vs/workbench/common/views';
import { localize } from 'vs/nls';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { TreeViewPane } from 'vs/workbench/browser/parts/views/treeView';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ALL_SYNC_RESOURCES, SyncResource, IUserDataSyncService, ISyncResourceHandle as IResourceHandle, SyncStatus, IUserDataSyncResourceEnablementService, IUserDataAutoSyncService, Change } from 'vs/platform/userDataSync/common/userDataSync';
import { registerAction2, Action2, MenuId } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr, ContextKeyEqualsExpr } from 'vs/platform/contextkey/common/contextkey';
import { URI } from 'vs/base/common/uri';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { FolderThemeIcon, IThemeService, FileThemeIcon } from 'vs/platform/theme/common/themeService';
import { fromNow } from 'vs/base/common/date';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { Event } from 'vs/base/common/event';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
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
import { IUserDataSyncWorkbenchService, CONTEXT_SYNC_STATE, getSyncAreaLabel, CONTEXT_ACCOUNT_STATE, AccountStatus, CONTEXT_ENABLE_VIEWS, SHOW_SYNC_LOG_COMMAND_ID, CONFIGURE_SYNC_COMMAND_ID, CONTEXT_SHOW_MANUAL_SYNC_VIEW, IUserDataSyncPreview, IUserDataSyncResourceGroup } from 'vs/workbench/services/userDataSync/common/userDataSync';
import { IUserDataSyncMachinesService, IUserDataSyncMachine } from 'vs/platform/userDataSync/common/userDataSyncMachines';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { TreeView } from 'vs/workbench/contrib/views/browser/treeView';
import { flatten } from 'vs/base/common/arrays';
import { isEqual, basename } from 'vs/base/common/resources';

export class UserDataSyncViewPaneContainer extends ViewPaneContainer {

	constructor(
		containerId: string,
		@IDialogService private readonly dialogService: IDialogService,
		@IUserDataSyncWorkbenchService private readonly userDataSyncWorkbenchService: IUserDataSyncWorkbenchService,
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

	getSecondaryActions(): IAction[] {
		return [
			new Action('workbench.actions.syncData.reset', localize('workbench.actions.syncData.reset', "Reset Synced Data"), undefined, true, () => this.reset()),
		];
	}

	private async reset(): Promise<void> {
		const result = await this.dialogService.confirm({
			message: localize('reset', "This will clear your synced data from the cloud and stop sync on all your devices."),
			title: localize('reset title', "Reset Synced Data"),
			type: 'info',
			primaryButton: localize('reset button', "Reset"),
		});
		if (result.confirmed) {
			await this.userDataSyncWorkbenchService.turnoff(true);
		}
	}

}

export class UserDataSyncDataViews extends Disposable {

	constructor(
		container: ViewContainer,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IUserDataAutoSyncService private readonly userDataAutoSyncService: IUserDataAutoSyncService,
		@IUserDataSyncResourceEnablementService private readonly userDataSyncResourceEnablementService: IUserDataSyncResourceEnablementService,
	) {
		super();
		this.registerViews(container);
	}

	private registerViews(container: ViewContainer): void {
		this.registerManualSyncView(container);
		this.registerMachinesView(container);

		this.registerActivityView(container, true);
		this.registerActivityView(container, false);
	}

	private registerManualSyncView(container: ViewContainer): void {
		const id = `workbench.views.manualSyncView`;
		const name = localize('manual sync', "Sync Manually");
		const treeView = this.instantiationService.createInstance(TreeView, id, name);
		const disposable = treeView.onDidChangeVisibility(visible => {
			if (visible && !treeView.dataProvider) {
				disposable.dispose();
				treeView.dataProvider = this.instantiationService.createInstance(ManualSyncViewDataProvider, treeView);
			}
		});
		const viewsRegistry = Registry.as<IViewsRegistry>(Extensions.ViewsRegistry);
		viewsRegistry.registerViews([<ITreeViewDescriptor>{
			id,
			name,
			ctorDescriptor: new SyncDescriptor(TreeViewPane),
			when: ContextKeyExpr.and(CONTEXT_ENABLE_VIEWS, CONTEXT_SHOW_MANUAL_SYNC_VIEW),
			canToggleVisibility: false,
			canMoveView: false,
			treeView,
			collapsed: false,
			order: 100,
		}], container);

		const localActionOrder = 1;
		const remoteActionOrder = 1;
		const mergeActionOrder = 1;

		/* accept all local */
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `workbench.actions.sync.acceptLocalAll`,
					title: localize('workbench.actions.sync.acceptLocalAll', "Accept Local"),
					icon: Codicon.cloudUpload,
					menu: {
						id: MenuId.ViewTitle,
						when: ContextKeyExpr.and(ContextKeyEqualsExpr.create('view', id)),
						group: 'navigation',
						order: localActionOrder,
					},
				});
			}
			async run(accessor: ServicesAccessor): Promise<void> {
				const userDataSyncWorkbenchService = accessor.get(IUserDataSyncWorkbenchService);
				await userDataSyncWorkbenchService.userDataSyncPreview.push();
			}
		});

		/* accept all remote */
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `workbench.actions.sync.acceptRemoteAll`,
					title: localize('workbench.actions.sync.acceptRemoteAll', "Accept Remote"),
					icon: Codicon.cloudDownload,
					menu: {
						id: MenuId.ViewTitle,
						when: ContextKeyExpr.and(ContextKeyEqualsExpr.create('view', id)),
						group: 'navigation',
						order: remoteActionOrder,
					},
				});
			}
			async run(accessor: ServicesAccessor): Promise<void> {
				const userDataSyncWorkbenchService = accessor.get(IUserDataSyncWorkbenchService);
				await userDataSyncWorkbenchService.userDataSyncPreview.pull();
			}
		});

		/* merge all */
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `workbench.actions.sync.mergeAll`,
					title: localize('workbench.actions.sync.mergeAll', "Merge"),
					icon: Codicon.sync,
					menu: {
						id: MenuId.ViewTitle,
						when: ContextKeyExpr.and(ContextKeyEqualsExpr.create('view', id)),
						group: 'navigation',
						order: mergeActionOrder,
					},
				});
			}
			async run(accessor: ServicesAccessor): Promise<void> {
				const userDataSyncWorkbenchService = accessor.get(IUserDataSyncWorkbenchService);
				await userDataSyncWorkbenchService.userDataSyncPreview.merge();
			}
		});

		/* accept local change */
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `workbench.actions.sync.acceptLocal`,
					title: localize('workbench.actions.sync.acceptLocal', "Accept Local"),
					icon: Codicon.cloudUpload,
					menu: {
						id: MenuId.ViewItemContext,
						when: ContextKeyExpr.and(ContextKeyEqualsExpr.create('view', id), ContextKeyExpr.regex('viewItem', /sync-resource-modified-.*/i)),
						group: 'inline',
						order: localActionOrder,
					},
				});
			}
			async run(accessor: ServicesAccessor, handle: TreeViewItemHandleArg): Promise<void> {
				const userDataSyncWorkbenchService = accessor.get(IUserDataSyncWorkbenchService);
				const userDataSyncService = accessor.get(IUserDataSyncService);
				const previewResource: IUserDataSyncResourceGroup = ManualSyncViewDataProvider.toUserDataSyncResourceGroup(handle.$treeItemHandle);
				const isConflict = userDataSyncWorkbenchService.userDataSyncPreview.conflicts.some(({ local }) => isEqual(local, previewResource.local));
				const localResource = isConflict ? previewResource.preview : previewResource.local;
				const content = await userDataSyncService.resolveContent(localResource);
				await userDataSyncWorkbenchService.userDataSyncPreview.accept(previewResource.syncResource, localResource, content || '');
			}
		});

		/* accept remote change */
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `workbench.actions.sync.acceptRemote`,
					title: localize('workbench.actions.sync.acceptRemote', "Accept Remote"),
					icon: Codicon.cloudDownload,
					menu: {
						id: MenuId.ViewItemContext,
						when: ContextKeyExpr.and(ContextKeyEqualsExpr.create('view', id), ContextKeyExpr.regex('viewItem', /sync-resource-modified-.*/i)),
						group: 'inline',
						order: remoteActionOrder,
					},
				});
			}
			async run(accessor: ServicesAccessor, handle: TreeViewItemHandleArg): Promise<void> {
				const userDataSyncWorkbenchService = accessor.get(IUserDataSyncWorkbenchService);
				const userDataSyncService = accessor.get(IUserDataSyncService);
				const previewResource: IUserDataSyncResourceGroup = ManualSyncViewDataProvider.toUserDataSyncResourceGroup(handle.$treeItemHandle);
				const content = await userDataSyncService.resolveContent(previewResource.remote);
				await userDataSyncWorkbenchService.userDataSyncPreview.accept(previewResource.syncResource, previewResource.remote, content || '');
			}
		});

		/* merge */
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `workbench.actions.sync.merge`,
					title: localize('workbench.actions.sync.merge', "Merge"),
					icon: Codicon.sync,
					menu: {
						id: MenuId.ViewItemContext,
						when: ContextKeyExpr.and(ContextKeyEqualsExpr.create('view', id), ContextKeyExpr.equals('viewItem', 'sync-resource-modified-change')),
						group: 'inline',
						order: mergeActionOrder,
					},
				});
			}
			async run(accessor: ServicesAccessor, handle: TreeViewItemHandleArg): Promise<void> {
				const userDataSyncWorkbenchService = accessor.get(IUserDataSyncWorkbenchService);
				const previewResource: IUserDataSyncResourceGroup = ManualSyncViewDataProvider.toUserDataSyncResourceGroup(handle.$treeItemHandle);
				await userDataSyncWorkbenchService.userDataSyncPreview.merge(previewResource.preview);
			}
		});

		/* delete */
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `workbench.actions.sync.deleteLocal`,
					title: localize('workbench.actions.sync.deleteLocal', "Delete"),
					icon: Codicon.trash,
					menu: {
						id: MenuId.ViewItemContext,
						when: ContextKeyExpr.and(ContextKeyEqualsExpr.create('view', id), ContextKeyExpr.regex('viewItem', /sync-resource-(add|delete)-.*/i)),
						group: 'inline',
					},
				});
			}
			async run(accessor: ServicesAccessor, handle: TreeViewItemHandleArg): Promise<void> {
				const userDataSyncWorkbenchService = accessor.get(IUserDataSyncWorkbenchService);
				const userDataSyncService = accessor.get(IUserDataSyncService);
				const previewResource: IUserDataSyncResourceGroup = ManualSyncViewDataProvider.toUserDataSyncResourceGroup(handle.$treeItemHandle);
				const resource = previewResource.remoteChange === Change.Deleted || previewResource.localChange === Change.Added ? previewResource.local : previewResource.remote;
				const content = await userDataSyncService.resolveContent(resource);
				await userDataSyncWorkbenchService.userDataSyncPreview.accept(previewResource.syncResource, resource, content || '');
			}
		});

		/* add */
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `workbench.actions.sync.addLocal`,
					title: localize('workbench.actions.sync.addLocal', "Add"),
					icon: Codicon.add,
					menu: {
						id: MenuId.ViewItemContext,
						when: ContextKeyExpr.and(ContextKeyEqualsExpr.create('view', id), ContextKeyExpr.regex('viewItem', /sync-resource-(add|delete)-.*/i)),
						group: 'inline',
					},
				});
			}
			async run(accessor: ServicesAccessor, handle: TreeViewItemHandleArg): Promise<void> {
				const userDataSyncWorkbenchService = accessor.get(IUserDataSyncWorkbenchService);
				const userDataSyncService = accessor.get(IUserDataSyncService);
				const previewResource: IUserDataSyncResourceGroup = ManualSyncViewDataProvider.toUserDataSyncResourceGroup(handle.$treeItemHandle);
				const resource = previewResource.remoteChange === Change.Added || previewResource.localChange === Change.Deleted ? previewResource.local : previewResource.remote;
				const content = await userDataSyncService.resolveContent(resource);
				await userDataSyncWorkbenchService.userDataSyncPreview.accept(previewResource.syncResource, resource, content || '');
			}
		});

		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `workbench.actions.sync.showChanges`,
					title: localize({ key: 'workbench.actions.sync.showChanges', comment: ['This is an action title to show the changes between local and remote version of resources'] }, "Open Changes"),
				});
			}
			async run(accessor: ServicesAccessor, handle: TreeViewItemHandleArg): Promise<void> {
				const editorService = accessor.get(IEditorService);
				const userDataSyncWorkbenchService = accessor.get(IUserDataSyncWorkbenchService);
				const previewResource: IUserDataSyncResourceGroup = ManualSyncViewDataProvider.toUserDataSyncResourceGroup(handle.$treeItemHandle);
				const isConflict = userDataSyncWorkbenchService.userDataSyncPreview.conflicts.some(({ local }) => isEqual(local, previewResource.local));
				if (previewResource.localChange === Change.Added || previewResource.remoteChange === Change.Deleted) {
					await editorService.openEditor({ resource: URI.revive(previewResource.remote), label: localize({ key: 'resourceLabel', comment: ['remote as in file in cloud'] }, "{0} (Remote)", basename(previewResource.remote)) });
				} else {
					const leftResource = URI.revive(previewResource.remote);
					const rightResource = isConflict ? URI.revive(previewResource.preview) : URI.revive(previewResource.local);
					const leftResourceName = localize({ key: 'leftResourceName', comment: ['remote as in file in cloud'] }, "{0} (Remote)", basename(leftResource));
					const rightResourceName = localize({ key: 'rightResourceName', comment: ['local as in file in disk'] }, "{0} (Local)", basename(rightResource));
					await editorService.openEditor({
						leftResource,
						rightResource,
						label: localize('sideBySideLabels', "{0} ↔ {1}", leftResourceName, rightResourceName),
						options: {
							preserveFocus: true,
							revealIfVisible: true,
						},
					});
				}
			}
		});
	}

	private registerMachinesView(container: ViewContainer): void {
		const id = `workbench.views.sync.machines`;
		const name = localize('synced machines', "Synced Machines");
		const treeView = this.instantiationService.createInstance(TreeView, id, name);
		const dataProvider = this.instantiationService.createInstance(UserDataSyncMachinesViewDataProvider, treeView);
		treeView.showRefreshAction = true;
		const disposable = treeView.onDidChangeVisibility(visible => {
			if (visible && !treeView.dataProvider) {
				disposable.dispose();
				treeView.dataProvider = dataProvider;
			}
		});
		this._register(Event.any(this.userDataSyncResourceEnablementService.onDidChangeResourceEnablement, this.userDataAutoSyncService.onDidChangeEnablement)(() => treeView.refresh()));
		const viewsRegistry = Registry.as<IViewsRegistry>(Extensions.ViewsRegistry);
		viewsRegistry.registerViews([<ITreeViewDescriptor>{
			id,
			name,
			ctorDescriptor: new SyncDescriptor(TreeViewPane),
			when: ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized), CONTEXT_ACCOUNT_STATE.isEqualTo(AccountStatus.Available), CONTEXT_ENABLE_VIEWS),
			canToggleVisibility: true,
			canMoveView: false,
			treeView,
			collapsed: false,
			order: 200,
		}], container);

		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `workbench.actions.sync.editMachineName`,
					title: localize('workbench.actions.sync.editMachineName', "Edit Name"),
					icon: Codicon.edit,
					menu: {
						id: MenuId.ViewItemContext,
						when: ContextKeyExpr.and(ContextKeyEqualsExpr.create('view', id)),
						group: 'inline',
					},
				});
			}
			async run(accessor: ServicesAccessor, handle: TreeViewItemHandleArg): Promise<void> {
				const changed = await dataProvider.rename(handle.$treeItemHandle);
				if (changed) {
					await treeView.refresh();
				}
			}
		});

		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `workbench.actions.sync.turnOffSyncOnMachine`,
					title: localize('workbench.actions.sync.turnOffSyncOnMachine', "Turn off Preferences Sync"),
					menu: {
						id: MenuId.ViewItemContext,
						when: ContextKeyExpr.and(ContextKeyEqualsExpr.create('view', id), ContextKeyEqualsExpr.create('viewItem', 'sync-machine')),
					},
				});
			}
			async run(accessor: ServicesAccessor, handle: TreeViewItemHandleArg): Promise<void> {
				if (await dataProvider.disable(handle.$treeItemHandle)) {
					await treeView.refresh();
				}
			}
		});

	}

	private registerActivityView(container: ViewContainer, remote: boolean): void {
		const id = `workbench.views.sync.${remote ? 'remote' : 'local'}Activity`;
		const name = remote ? localize('remote sync activity title', "Sync Activity (Remote)") : localize('local sync activity title', "Sync Activity (Local)");
		const treeView = this.instantiationService.createInstance(TreeView, id, name);
		treeView.showCollapseAllAction = true;
		treeView.showRefreshAction = true;
		const disposable = treeView.onDidChangeVisibility(visible => {
			if (visible && !treeView.dataProvider) {
				disposable.dispose();
				treeView.dataProvider = remote ? this.instantiationService.createInstance(RemoteUserDataSyncActivityViewDataProvider)
					: this.instantiationService.createInstance(LocalUserDataSyncActivityViewDataProvider);
			}
		});
		this._register(Event.any(this.userDataSyncResourceEnablementService.onDidChangeResourceEnablement, this.userDataAutoSyncService.onDidChangeEnablement)(() => treeView.refresh()));
		const viewsRegistry = Registry.as<IViewsRegistry>(Extensions.ViewsRegistry);
		viewsRegistry.registerViews([<ITreeViewDescriptor>{
			id,
			name,
			ctorDescriptor: new SyncDescriptor(TreeViewPane),
			when: ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized), CONTEXT_ACCOUNT_STATE.isEqualTo(AccountStatus.Available), CONTEXT_ENABLE_VIEWS),
			canToggleVisibility: true,
			canMoveView: false,
			treeView,
			collapsed: true,
			order: 300,
			hideByDefault: !remote,
		}], container);

		this.registerDataViewActions(id);
	}

	private registerDataViewActions(viewId: string) {
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
					title: localize('workbench.actions.sync.replaceCurrent', "Restore"),
					icon: { id: 'codicon/discard' },
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
					message: localize({ key: 'confirm replace', comment: ['A confirmation message to replace current user data (settings, extensions, keybindings, snippets) with selected version'] }, "Would you like to replace your current {0} with selected?", getSyncAreaLabel(syncResource)),
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
					id: `workbench.actions.sync.compareWithLocal`,
					title: localize({ key: 'workbench.actions.sync.compareWithLocal', comment: ['This is an action title to show the changes between local and remote version of resources'] }, "Open Changes"),
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

}

class ManualSyncViewDataProvider extends Disposable implements ITreeViewDataProvider {

	private readonly userDataSyncPreview: IUserDataSyncPreview;

	constructor(
		treeView: ITreeView,
		@IUserDataSyncWorkbenchService userDataSyncWorkbenchService: IUserDataSyncWorkbenchService
	) {
		super();
		this.userDataSyncPreview = userDataSyncWorkbenchService.userDataSyncPreview;

		this._register(Event.any(
			this.userDataSyncPreview.onDidChangeChanges,
			this.userDataSyncPreview.onDidChangeConflicts
		)(() => treeView.refresh()));
	}

	async getChildren(element?: ITreeItem): Promise<ITreeItem[]> {
		if (element) {
			if (element.handle === 'changes') {
				return this.getChanges();
			} else {
				return this.getConflicts();
			}
		}
		return this.getRoots();
	}

	private getRoots(): ITreeItem[] {
		const roots: ITreeItem[] = [];
		if (this.userDataSyncPreview.changes.length) {
			roots.push({
				handle: 'changes',
				collapsibleState: TreeItemCollapsibleState.Expanded,
				label: { label: localize('changes', "Changes") },
				themeIcon: Codicon.folder,
				contextValue: 'changes'
			});
		}
		if (this.userDataSyncPreview.conflicts.length) {
			roots.push({
				handle: 'conflicts',
				collapsibleState: TreeItemCollapsibleState.Expanded,
				label: { label: localize('conflicts', "Conflicts") },
				themeIcon: Codicon.folder,
				contextValue: 'conflicts',
			});
		}
		return roots;
	}

	private getChanges(): ITreeItem[] {
		return this.userDataSyncPreview.changes.map(change => ({
			handle: JSON.stringify(change),
			resourceUri: change.remote,
			themeIcon: FileThemeIcon,
			description: getSyncAreaLabel(change.syncResource),
			contextValue: `sync-resource-${change.localChange === Change.Added ? 'add-local' : change.localChange === Change.Deleted ? 'delete-local' : change.remoteChange === Change.Added ? 'add-remote' : change.remoteChange === Change.Deleted ? 'delete-remote' : 'modified'}-change`,
			collapsibleState: TreeItemCollapsibleState.None,
			command: { id: `workbench.actions.sync.showChanges`, title: '', arguments: [<TreeViewItemHandleArg>{ $treeViewId: '', $treeItemHandle: JSON.stringify(change) }] },
		}));
	}

	private getConflicts(): ITreeItem[] {
		return this.userDataSyncPreview.conflicts.map(conflict => ({
			handle: JSON.stringify(conflict),
			resourceUri: conflict.remote,
			themeIcon: FileThemeIcon,
			description: getSyncAreaLabel(conflict.syncResource),
			contextValue: `sync-resource-modified-conflict`,
			collapsibleState: TreeItemCollapsibleState.None,
			command: { id: `workbench.actions.sync.showChanges`, title: '', arguments: [<TreeViewItemHandleArg>{ $treeViewId: '', $treeItemHandle: JSON.stringify(conflict) }] },
		}));
	}

	static toUserDataSyncResourceGroup(handle: string): IUserDataSyncResourceGroup {
		const parsed: IUserDataSyncResourceGroup = JSON.parse(handle);
		return {
			syncResource: parsed.syncResource,
			local: URI.revive(parsed.local),
			preview: URI.revive(parsed.preview),
			remote: URI.revive(parsed.remote),
			localChange: parsed.localChange,
			remoteChange: parsed.remoteChange
		};
	}

}

interface ISyncResourceHandle extends IResourceHandle {
	syncResource: SyncResource
}

interface SyncResourceHandleTreeItem extends ITreeItem {
	syncResourceHandle: ISyncResourceHandle;
}

abstract class UserDataSyncActivityViewDataProvider implements ITreeViewDataProvider {

	private syncResourceHandlesPromise: Promise<ISyncResourceHandle[]> | undefined;

	constructor(
		@IUserDataSyncService protected readonly userDataSyncService: IUserDataSyncService,
		@IUserDataAutoSyncService protected readonly userDataAutoSyncService: IUserDataAutoSyncService,
		@INotificationService private readonly notificationService: INotificationService,
	) { }

	async getChildren(element?: ITreeItem): Promise<ITreeItem[]> {
		try {
			if (!element) {
				return await this.getRoots();
			}
			if ((<SyncResourceHandleTreeItem>element).syncResourceHandle) {
				return await this.getChildrenForSyncResourceTreeItem(<SyncResourceHandleTreeItem>element);
			}
			return [];
		} catch (error) {
			this.notificationService.error(error);
			throw error;
		}
	}

	private async getRoots(): Promise<SyncResourceHandleTreeItem[]> {
		this.syncResourceHandlesPromise = undefined;

		const syncResourceHandles = await this.getSyncResourceHandles();

		return syncResourceHandles.map(syncResourceHandle => {
			const handle = JSON.stringify({ resource: syncResourceHandle.uri.toString(), syncResource: syncResourceHandle.syncResource });
			return {
				handle,
				collapsibleState: TreeItemCollapsibleState.Collapsed,
				label: { label: getSyncAreaLabel(syncResourceHandle.syncResource) },
				description: fromNow(syncResourceHandle.created, true),
				themeIcon: FolderThemeIcon,
				syncResourceHandle,
				contextValue: `sync-resource-${syncResourceHandle.syncResource}`
			};
		});
	}

	protected async getChildrenForSyncResourceTreeItem(element: SyncResourceHandleTreeItem): Promise<ITreeItem[]> {
		const associatedResources = await this.userDataSyncService.getAssociatedResources((<SyncResourceHandleTreeItem>element).syncResourceHandle.syncResource, (<SyncResourceHandleTreeItem>element).syncResourceHandle);
		return associatedResources.map(({ resource, comparableResource }) => {
			const handle = JSON.stringify({ resource: resource.toString(), comparableResource: comparableResource?.toString() });
			return {
				handle,
				collapsibleState: TreeItemCollapsibleState.None,
				resourceUri: resource,
				command: { id: `workbench.actions.sync.compareWithLocal`, title: '', arguments: [<TreeViewItemHandleArg>{ $treeViewId: '', $treeItemHandle: handle }] },
				contextValue: `sync-associatedResource-${(<SyncResourceHandleTreeItem>element).syncResourceHandle.syncResource}`
			};
		});
	}

	private getSyncResourceHandles(): Promise<ISyncResourceHandle[]> {
		if (this.syncResourceHandlesPromise === undefined) {
			this.syncResourceHandlesPromise = Promise.all(ALL_SYNC_RESOURCES.map(async syncResource => {
				const resourceHandles = await this.getResourceHandles(syncResource);
				return resourceHandles.map(resourceHandle => ({ ...resourceHandle, syncResource }));
			})).then(result => flatten(result).sort((a, b) => b.created - a.created));
		}
		return this.syncResourceHandlesPromise;
	}

	protected abstract getResourceHandles(syncResource: SyncResource): Promise<IResourceHandle[]>;
}

class LocalUserDataSyncActivityViewDataProvider extends UserDataSyncActivityViewDataProvider {

	protected getResourceHandles(syncResource: SyncResource): Promise<IResourceHandle[]> {
		return this.userDataSyncService.getLocalSyncResourceHandles(syncResource);
	}
}

class RemoteUserDataSyncActivityViewDataProvider extends UserDataSyncActivityViewDataProvider {

	private machinesPromise: Promise<IUserDataSyncMachine[]> | undefined;

	constructor(
		@IUserDataSyncService userDataSyncService: IUserDataSyncService,
		@IUserDataAutoSyncService userDataAutoSyncService: IUserDataAutoSyncService,
		@IUserDataSyncMachinesService private readonly userDataSyncMachinesService: IUserDataSyncMachinesService,
		@INotificationService notificationService: INotificationService,
	) {
		super(userDataSyncService, userDataAutoSyncService, notificationService);
	}

	async getChildren(element?: ITreeItem): Promise<ITreeItem[]> {
		if (!element) {
			this.machinesPromise = undefined;
		}
		return super.getChildren(element);
	}

	private getMachines(): Promise<IUserDataSyncMachine[]> {
		if (this.machinesPromise === undefined) {
			this.machinesPromise = this.userDataSyncMachinesService.getMachines();
		}
		return this.machinesPromise;
	}

	protected getResourceHandles(syncResource: SyncResource): Promise<IResourceHandle[]> {
		return this.userDataSyncService.getRemoteSyncResourceHandles(syncResource);
	}

	protected async getChildrenForSyncResourceTreeItem(element: SyncResourceHandleTreeItem): Promise<ITreeItem[]> {
		const children = await super.getChildrenForSyncResourceTreeItem(element);
		const machineId = await this.userDataSyncService.getMachineId(element.syncResourceHandle.syncResource, element.syncResourceHandle);
		if (machineId) {
			const machines = await this.getMachines();
			const machine = machines.find(({ id }) => id === machineId);
			children[0].description = machine?.isCurrent ? localize({ key: 'current', comment: ['Represents current machine'] }, "Current") : machine?.name;
		}
		return children;
	}
}

class UserDataSyncMachinesViewDataProvider implements ITreeViewDataProvider {

	private machinesPromise: Promise<IUserDataSyncMachine[]> | undefined;

	constructor(
		private readonly treeView: TreeView,
		@IUserDataSyncMachinesService private readonly userDataSyncMachinesService: IUserDataSyncMachinesService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@INotificationService private readonly notificationService: INotificationService,
		@IDialogService private readonly dialogService: IDialogService,
		@IUserDataSyncWorkbenchService private readonly userDataSyncWorkbenchService: IUserDataSyncWorkbenchService,
	) {
	}

	async getChildren(element?: ITreeItem): Promise<ITreeItem[]> {
		if (!element) {
			this.machinesPromise = undefined;
		}
		try {
			let machines = await this.getMachines();
			machines = machines.filter(m => !m.disabled).sort((m1, m2) => m1.isCurrent ? -1 : 1);
			this.treeView.message = machines.length ? undefined : localize('no machines', "No Machines");
			return machines.map(({ id, name, isCurrent }) => ({
				handle: id,
				collapsibleState: TreeItemCollapsibleState.None,
				label: { label: name },
				description: isCurrent ? localize({ key: 'current', comment: ['Current machine'] }, "Current") : undefined,
				themeIcon: Codicon.vm,
				contextValue: 'sync-machine'
			}));
		} catch (error) {
			this.notificationService.error(error);
			return [];
		}
	}

	private getMachines(): Promise<IUserDataSyncMachine[]> {
		if (this.machinesPromise === undefined) {
			this.machinesPromise = this.userDataSyncMachinesService.getMachines();
		}
		return this.machinesPromise;
	}

	async disable(machineId: string): Promise<boolean> {
		const machines = await this.getMachines();
		const machine = machines.find(({ id }) => id === machineId);
		if (!machine) {
			throw new Error(localize('not found', "machine not found with id: {0}", machineId));
		}

		const result = await this.dialogService.confirm({
			type: 'info',
			message: localize('turn off sync on machine', "Are you sure you want to turn off sync on {0}?", machine.name),
			primaryButton: localize('turn off', "Turn off"),
		});

		if (!result.confirmed) {
			return false;
		}

		if (machine.isCurrent) {
			await this.userDataSyncWorkbenchService.turnoff(false);
		} else {
			await this.userDataSyncMachinesService.setEnablement(machineId, false);
		}

		return true;
	}

	async rename(machineId: string): Promise<boolean> {
		const disposableStore = new DisposableStore();
		const inputBox = disposableStore.add(this.quickInputService.createInputBox());
		inputBox.placeholder = localize('placeholder', "Enter the name of the machine");
		inputBox.busy = true;
		inputBox.show();
		const machines = await this.getMachines();
		const machine = machines.find(({ id }) => id === machineId);
		if (!machine) {
			inputBox.hide();
			disposableStore.dispose();
			throw new Error(localize('not found', "machine not found with id: {0}", machineId));
		}
		inputBox.busy = false;
		inputBox.value = machine.name;
		const validateMachineName = (machineName: string): string | null => {
			machineName = machineName.trim();
			return machineName && !machines.some(m => m.id !== machineId && m.name === machineName) ? machineName : null;
		};
		disposableStore.add(inputBox.onDidChangeValue(() =>
			inputBox.validationMessage = validateMachineName(inputBox.value) ? '' : localize('valid message', "Machine name should be unique and not empty")));
		return new Promise<boolean>((c, e) => {
			disposableStore.add(inputBox.onDidAccept(async () => {
				const machineName = validateMachineName(inputBox.value);
				disposableStore.dispose();
				if (machineName && machineName !== machine.name) {
					try {
						await this.userDataSyncMachinesService.renameMachine(machineId, machineName);
						c(true);
					} catch (error) {
						e(error);
					}
				} else {
					c(false);
				}
			}));
		});
	}
}
