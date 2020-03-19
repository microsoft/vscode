/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { IViewsRegistry, Extensions, ITreeViewDescriptor, ITreeViewDataProvider, ITreeItem, TreeItemCollapsibleState, IViewsService, TreeViewItemHandleArg, IViewContainersRegistry, ViewContainerLocation, ViewContainer } from 'vs/workbench/common/views';
import { localize } from 'vs/nls';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { TreeViewPane, TreeView } from 'vs/workbench/browser/parts/views/treeView';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ALL_SYNC_RESOURCES, CONTEXT_SYNC_ENABLEMENT, IUserDataSyncStoreService, toRemoteBackupSyncResource, resolveBackupSyncResource, IUserDataSyncBackupStoreService, IResourceRefHandle, toLocalBackupSyncResource, SyncResource } from 'vs/platform/userDataSync/common/userDataSync';
import { registerAction2, Action2, MenuId } from 'vs/platform/actions/common/actions';
import { IContextKeyService, RawContextKey, ContextKeyExpr, ContextKeyEqualsExpr } from 'vs/platform/contextkey/common/contextkey';
import { URI } from 'vs/base/common/uri';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { FolderThemeIcon, FileThemeIcon } from 'vs/platform/theme/common/themeService';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { fromNow } from 'vs/base/common/date';
import { pad } from 'vs/base/common/strings';
import { ViewPaneContainer } from 'vs/workbench/browser/parts/views/viewPaneContainer';

export class UserDataSyncViewContribution implements IWorkbenchContribution {

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IUserDataSyncStoreService private readonly userDataSyncStoreService: IUserDataSyncStoreService,
		@IUserDataSyncBackupStoreService private readonly userDataSyncBackupStoreService: IUserDataSyncBackupStoreService,
	) {
		const container = this.registerSyncViewContainer();
		this.registerBackupView(container, true);
		this.registerBackupView(container, false);
	}

	private registerSyncViewContainer(): ViewContainer {
		return Registry.as<IViewContainersRegistry>(Extensions.ViewContainersRegistry).registerViewContainer(
			{
				id: 'workbench.view.sync',
				name: localize('sync', "Sync"),
				ctorDescriptor: new SyncDescriptor(
					ViewPaneContainer,
					['workbench.view.sync', `workbench.view.sync.state`, { mergeViewWithContainerWhenSingleView: true }]
				),
				icon: 'codicon-sync',
				hideIfEmpty: true,
			}, ViewContainerLocation.Sidebar);
	}

	private registerBackupView(container: ViewContainer, remote: boolean): void {
		const id = `workbench.views.sync.${remote ? 'remote' : 'local'}BackupView`;
		const name = remote ? localize('remote title', "Remote Backup") : localize('local title', "Local Backup");
		const contextKey = new RawContextKey<boolean>(`showUserDataSync${remote ? 'Remote' : 'Local'}BackupView`, false);
		const viewEnablementContext = contextKey.bindTo(this.contextKeyService);
		const treeView = this.instantiationService.createInstance(TreeView, id, name);
		treeView.showCollapseAllAction = true;
		treeView.showRefreshAction = true;
		const disposable = treeView.onDidChangeVisibility(visible => {
			if (visible && !treeView.dataProvider) {
				disposable.dispose();
				treeView.dataProvider = this.instantiationService.createInstance(UserDataSyncHistoryViewDataProvider, id,
					(resource: SyncResource) => remote ? this.userDataSyncStoreService.getAllRefs(resource) : this.userDataSyncBackupStoreService.getAllRefs(resource),
					(resource: SyncResource, ref: string) => remote ? toRemoteBackupSyncResource(resource, ref) : toLocalBackupSyncResource(resource, ref));
			}
		});
		const viewsRegistry = Registry.as<IViewsRegistry>(Extensions.ViewsRegistry);
		viewsRegistry.registerViews([<ITreeViewDescriptor>{
			id,
			name,
			ctorDescriptor: new SyncDescriptor(TreeViewPane),
			when: ContextKeyExpr.and(CONTEXT_SYNC_ENABLEMENT, contextKey),
			canToggleVisibility: true,
			canMoveView: true,
			treeView,
			collapsed: false,
			order: 100,
		}], container);

		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `workbench.actions.showSync${remote ? 'Remote' : 'Local'}BackupView`,
					title: remote ?
						{ value: localize('workbench.action.showSyncRemoteBackup', "Show Remote Backup"), original: `Show Remote Backup` }
						: { value: localize('workbench.action.showSyncLocalBackup', "Show Local Backup"), original: `Show Local Backup` },
					category: { value: localize('sync', "Sync"), original: `Sync` },
					menu: {
						id: MenuId.CommandPalette,
						when: CONTEXT_SYNC_ENABLEMENT
					},
				});
			}
			async run(accessor: ServicesAccessor): Promise<void> {
				viewEnablementContext.set(true);
				accessor.get(IViewsService).openView(id, true);
			}
		});

		this.registerActions(id);
	}

	private registerActions(viewId: string) {
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `workbench.actions.sync.${viewId}.resolveResourceRef`,
					title: localize('workbench.actions.sync.resolveResourceRef', "Resolve Resource Ref"),
				});
			}
			async run(accessor: ServicesAccessor, handle: TreeViewItemHandleArg): Promise<void> {
				const editorService = accessor.get(IEditorService);
				let resource = URI.parse(handle.$treeItemHandle);
				const result = resolveBackupSyncResource(resource);
				if (result) {
					resource = resource.with({ fragment: result.resource });
					await editorService.openEditor({ resource });
				}
			}
		});
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `workbench.actions.sync.${viewId}.resolveResourceRefCompletely`,
					title: localize('workbench.actions.sync.resolveResourceRefCompletely', "Show full content"),
					menu: {
						id: MenuId.ViewItemContext,
						when: ContextKeyExpr.and(ContextKeyEqualsExpr.create('view', viewId), ContextKeyExpr.regex('viewItem', /syncref-.*/i))
					},
				});
			}
			async run(accessor: ServicesAccessor, handle: TreeViewItemHandleArg): Promise<void> {
				const editorService = accessor.get(IEditorService);
				await editorService.openEditor({ resource: URI.parse(handle.$treeItemHandle) });
			}
		});
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `workbench.actions.${viewId}.commpareWithLocal`,
					title: localize('workbench.action.deleteRef', "Open Changes"),
					menu: {
						id: MenuId.ViewItemContext,
						when: ContextKeyExpr.and(ContextKeyEqualsExpr.create('view', viewId), ContextKeyExpr.regex('viewItem', /syncref-(settings|keybindings).*/i))
					},
				});
			}
			async run(accessor: ServicesAccessor, handle: TreeViewItemHandleArg): Promise<void> {
				const editorService = accessor.get(IEditorService);
				const environmentService = accessor.get(IEnvironmentService);
				const resource = URI.parse(handle.$treeItemHandle);
				const result = resolveBackupSyncResource(resource);
				if (result) {
					const leftResource: URI = resource.with({ fragment: result.resource });
					const rightResource: URI = result.resource === 'settings' ? environmentService.settingsResource : environmentService.keybindingsResource;
					await editorService.openEditor({
						leftResource,
						rightResource,
						options: {
							preserveFocus: false,
							pinned: true,
							revealIfVisible: true,
						},
					});
				}
			}
		});
	}

}

class UserDataSyncHistoryViewDataProvider implements ITreeViewDataProvider {

	constructor(
		private readonly viewId: string,
		private getAllRefs: (resource: SyncResource) => Promise<IResourceRefHandle[]>,
		private toResource: (resource: SyncResource, ref: string) => URI
	) {
	}

	async getChildren(element?: ITreeItem): Promise<ITreeItem[]> {
		if (element) {
			return this.getResources(element.handle);
		}
		return ALL_SYNC_RESOURCES.map(resourceKey => ({
			handle: resourceKey,
			collapsibleState: TreeItemCollapsibleState.Collapsed,
			label: { label: resourceKey },
			themeIcon: FolderThemeIcon,
			contextValue: `sync-${resourceKey}`
		}));
	}

	private async getResources(handle: string): Promise<ITreeItem[]> {
		const resourceKey = ALL_SYNC_RESOURCES.filter(key => key === handle)[0];
		if (resourceKey) {
			const refHandles = await this.getAllRefs(resourceKey);
			return refHandles.map(({ ref, created }) => {
				const handle = this.toResource(resourceKey, ref).toString();
				return {
					handle,
					collapsibleState: TreeItemCollapsibleState.None,
					label: { label: label(new Date(created)) },
					description: fromNow(created, true),
					command: { id: `workbench.actions.sync.${this.viewId}.resolveResourceRef`, title: '', arguments: [<TreeViewItemHandleArg>{ $treeItemHandle: handle, $treeViewId: '' }] },
					themeIcon: FileThemeIcon,
					contextValue: `syncref-${resourceKey}`
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

