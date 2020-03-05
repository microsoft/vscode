/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { IViewsRegistry, Extensions, ITreeViewDescriptor, ITreeViewDataProvider, ITreeItem, TreeItemCollapsibleState, IViewsService, TreeViewItemHandleArg } from 'vs/workbench/common/views';
import { localize } from 'vs/nls';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { CustomTreeViewPane, CustomTreeView } from 'vs/workbench/browser/parts/views/customView';
import { VIEW_CONTAINER } from 'vs/workbench/contrib/files/browser/explorerViewlet';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ALL_RESOURCE_KEYS, CONTEXT_SYNC_ENABLEMENT, IUserDataSyncStoreService, USER_DATA_SYNC_SCHEME, ResourceKey } from 'vs/platform/userDataSync/common/userDataSync';
import { registerAction2, Action2, MenuId } from 'vs/platform/actions/common/actions';
import { IContextKeyService, RawContextKey, ContextKeyExpr, ContextKeyEqualsExpr } from 'vs/platform/contextkey/common/contextkey';
import { URI } from 'vs/base/common/uri';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { FolderThemeIcon, FileThemeIcon } from 'vs/platform/theme/common/themeService';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';

const CONTEXT_SHOW_USER_DATA_SYNC_HISTORY_VIEW = new RawContextKey<boolean>('showUserDataSyncHistoryView', false);

export class UserDataSyncHistoryViewContribution implements IWorkbenchContribution {

	private readonly viewId = 'workbench.views.syncHistory';

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		this.registerView();
		this.registerActions();
	}

	private registerView(): void {
		const that = this;
		const name = localize('title', "Sync History");
		const viewEnablementContext = CONTEXT_SHOW_USER_DATA_SYNC_HISTORY_VIEW.bindTo(this.contextKeyService);
		const treeView = this.instantiationService.createInstance(CustomTreeView, this.viewId, name);
		const disposable = treeView.onDidChangeVisibility(visible => {
			if (visible && !treeView.dataProvider) {
				disposable.dispose();
				treeView.dataProvider = this.instantiationService.createInstance(UserDataSyncHistoryViewDataProvider);
			}
		});
		const viewsRegistry = Registry.as<IViewsRegistry>(Extensions.ViewsRegistry);
		viewsRegistry.registerViews([<ITreeViewDescriptor>{
			id: this.viewId,
			name,
			ctorDescriptor: new SyncDescriptor(CustomTreeViewPane),
			when: ContextKeyExpr.and(CONTEXT_SYNC_ENABLEMENT, CONTEXT_SHOW_USER_DATA_SYNC_HISTORY_VIEW),
			canToggleVisibility: false,
			canMoveView: true,
			treeView,
			collapsed: false,
			order: 100,
		}], VIEW_CONTAINER);

		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'workbench.actions.showSyncHistory',
					title: { value: localize('workbench.action.showRemoteUserDatraView', "Show Sync History"), original: `Show Sync History` },
					category: { value: localize('sync', "Sync"), original: `Sync` },
					menu: {
						id: MenuId.CommandPalette,
						when: CONTEXT_SYNC_ENABLEMENT
					},
				});
			}
			async run(accessor: ServicesAccessor): Promise<void> {
				viewEnablementContext.set(true);
				accessor.get(IViewsService).openView(that.viewId, true);
			}
		});
	}

	private registerActions() {
		const that = this;
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'workbench.actions.openRef',
					title: localize('workbench.action.openRef', "Open Ref"),
				});
			}
			async run(accessor: ServicesAccessor, resource: URI): Promise<void> {
				const editorService = accessor.get(IEditorService);
				await editorService.openEditor({ resource });
			}
		});
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'workbench.actions.deleteRef',
					title: localize('workbench.action.deleteRef', "Delete"),
					menu: {
						id: MenuId.ViewItemContext,
						when: ContextKeyExpr.and(ContextKeyEqualsExpr.create('view', that.viewId), ContextKeyExpr.regex('viewItem', /sync-.*/i))
					},
				});
			}
			async run(accessor: ServicesAccessor, handle: TreeViewItemHandleArg): Promise<void> {
				const dialogService = accessor.get(IDialogService);
				const userDataSyncStoreService = accessor.get(IUserDataSyncStoreService);
				const result = await dialogService.confirm({
					message: 'Would you like to delete'
				});
				if (result) {
					return userDataSyncStoreService.delete(handle.$treeItemHandle as ResourceKey);
				}
			}
		});
	}

}

class UserDataSyncHistoryViewDataProvider implements ITreeViewDataProvider {

	constructor(
		@IUserDataSyncStoreService private readonly userDataSyncStoreService: IUserDataSyncStoreService,
	) {
	}

	async getChildren(element?: ITreeItem): Promise<ITreeItem[]> {
		if (element) {
			return this.getResources(element.handle);
		}
		return ALL_RESOURCE_KEYS.map(resourceKey => ({
			handle: resourceKey,
			collapsibleState: TreeItemCollapsibleState.Collapsed,
			label: { label: resourceKey },
			themeIcon: FolderThemeIcon,
			contextValue: `sync-${resourceKey}`
		}));
	}

	private async getResources(handle: string): Promise<ITreeItem[]> {
		const resourceKey = ALL_RESOURCE_KEYS.filter(key => key === handle)[0];
		if (resourceKey) {
			const refs = await this.userDataSyncStoreService.getAllRefs(resourceKey);
			return refs.map(ref => {
				const resourceUri = URI.from({ scheme: USER_DATA_SYNC_SCHEME, path: `${resourceKey}/${ref}` });
				return {
					handle: `${resourceKey}/${ref}`,
					collapsibleState: TreeItemCollapsibleState.None,
					label: { label: ref },
					resourceUri,
					command: { id: 'workbench.actions.openRef', title: '', arguments: [resourceUri] },
					themeIcon: FileThemeIcon,
					contextValue: `syncref-${resourceKey}`
				};
			});
		}
		return [];
	}

}

