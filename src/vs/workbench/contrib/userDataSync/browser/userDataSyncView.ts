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
import { ALL_SYNC_RESOURCES, CONTEXT_SYNC_ENABLEMENT, SyncResource, IUserDataSyncService, ISyncResourceHandle } from 'vs/platform/userDataSync/common/userDataSync';
import { registerAction2, Action2, MenuId } from 'vs/platform/actions/common/actions';
import { IContextKeyService, RawContextKey, ContextKeyExpr, ContextKeyEqualsExpr } from 'vs/platform/contextkey/common/contextkey';
import { URI } from 'vs/base/common/uri';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { FolderThemeIcon } from 'vs/platform/theme/common/themeService';
import { fromNow } from 'vs/base/common/date';
import { pad, uppercaseFirstLetter } from 'vs/base/common/strings';
import { ViewPaneContainer } from 'vs/workbench/browser/parts/views/viewPaneContainer';

export class UserDataSyncViewContribution implements IWorkbenchContribution {

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IUserDataSyncService private readonly userDataSyncService: IUserDataSyncService,
	) {
		const container = this.registerSyncViewContainer();
		this.registerBackupView(container, true);
		this.registerBackupView(container, false);
	}

	private registerSyncViewContainer(): ViewContainer {
		return Registry.as<IViewContainersRegistry>(Extensions.ViewContainersRegistry).registerViewContainer(
			{
				id: 'workbench.view.sync',
				name: localize('sync preferences', "Preferences Sync"),
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
				treeView.dataProvider = new UserDataSyncHistoryViewDataProvider(remote, this.userDataSyncService);
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
					category: { value: localize('sync preferences', "Preferences Sync"), original: `Preferences Sync` },
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
					id: `workbench.actions.sync.resolveResource`,
					title: localize('workbench.actions.sync.resolveResourceRef', "Show raw JSON sync data"),
					menu: {
						id: MenuId.ViewItemContext,
						when: ContextKeyExpr.and(ContextKeyEqualsExpr.create('view', viewId), ContextKeyExpr.regex('viewItem', /sync-resource-.*/i))
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

}

interface SyncResourceTreeItem extends ITreeItem {
	resource: SyncResource;
	resourceHandle: ISyncResourceHandle;
}

class UserDataSyncHistoryViewDataProvider implements ITreeViewDataProvider {

	constructor(private readonly remote: boolean, private userDataSyncService: IUserDataSyncService) { }

	async getChildren(element?: ITreeItem): Promise<ITreeItem[]> {
		if (!element) {
			return ALL_SYNC_RESOURCES.map(resourceKey => ({
				handle: resourceKey,
				collapsibleState: TreeItemCollapsibleState.Collapsed,
				label: { label: uppercaseFirstLetter(resourceKey) },
				themeIcon: FolderThemeIcon,
			}));
		}
		const resourceKey = ALL_SYNC_RESOURCES.filter(key => key === element.handle)[0] as SyncResource;
		if (resourceKey) {
			const refHandles = this.remote ? await this.userDataSyncService.getRemoteSyncResourceHandles(resourceKey) : await this.userDataSyncService.getLocalSyncResourceHandles(resourceKey);
			return refHandles.map(({ uri, created }) => {
				return <SyncResourceTreeItem>{
					handle: uri.toString(),
					collapsibleState: TreeItemCollapsibleState.Collapsed,
					label: { label: label(new Date(created)) },
					description: fromNow(created, true),
					resourceUri: uri,
					resource: resourceKey,
					resourceHandle: { uri, created },
					contextValue: `sync-resource-${resourceKey}`
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

