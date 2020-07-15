/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from 'vs/platform/registry/common/platform';
import { IViewsRegistry, Extensions, ITreeViewDescriptor, ITreeViewDataProvider, ITreeItem, TreeItemCollapsibleState, TreeViewItemHandleArg, ViewContainer, ITreeView } from 'vs/workbench/common/views';
import { localize } from 'vs/nls';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { TreeViewPane } from 'vs/workbench/browser/parts/views/treeView';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IUserDataSyncService, Change } from 'vs/platform/userDataSync/common/userDataSync';
import { registerAction2, Action2, MenuId } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr, ContextKeyEqualsExpr } from 'vs/platform/contextkey/common/contextkey';
import { URI } from 'vs/base/common/uri';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { FileThemeIcon } from 'vs/platform/theme/common/themeService';
import { Event, Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { Codicon } from 'vs/base/common/codicons';
import { IUserDataSyncWorkbenchService, getSyncAreaLabel, CONTEXT_ENABLE_MANUAL_SYNC_VIEW, IUserDataSyncPreview, IUserDataSyncResourceGroup, MANUAL_SYNC_VIEW_ID } from 'vs/workbench/services/userDataSync/common/userDataSync';
import { TreeView } from 'vs/workbench/contrib/views/browser/treeView';
import { isEqual, basename } from 'vs/base/common/resources';
import { IDecorationsProvider, IDecorationData, IDecorationsService } from 'vs/workbench/services/decorations/browser/decorations';
import { IProgressService } from 'vs/platform/progress/common/progress';

const viewName = localize('manual sync', "Manual Sync");

export class UserDataManualSyncView extends Disposable {

	private readonly treeView: ITreeView;
	private userDataSyncPreview: IUserDataSyncPreview;

	constructor(
		container: ViewContainer,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEditorService private readonly editorService: IEditorService,
		@IProgressService private readonly progressService: IProgressService,
		@IUserDataSyncService private readonly userDataSyncService: IUserDataSyncService,
		@IUserDataSyncWorkbenchService userDataSyncWorkbenchService: IUserDataSyncWorkbenchService,
		@IDecorationsService decorationsService: IDecorationsService,
	) {
		super();

		this.userDataSyncPreview = userDataSyncWorkbenchService.userDataSyncPreview;
		this.treeView = this.createTreeView();
		this.registerManualSyncView(container);
		this.registerActions();

		decorationsService.registerDecorationsProvider(this._register(new UserDataSyncResourcesDecorationProvider(this.userDataSyncPreview)));
	}

	private createTreeView(): ITreeView {
		const treeView = this.instantiationService.createInstance(TreeView, MANUAL_SYNC_VIEW_ID, viewName);

		this._register(Event.any(
			this.userDataSyncPreview.onDidChangeChanges,
			this.userDataSyncPreview.onDidChangeConflicts
		)(() => treeView.refresh()));

		const disposable = treeView.onDidChangeVisibility(visible => {
			if (visible && !treeView.dataProvider) {
				disposable.dispose();
				treeView.dataProvider = new ManualSyncViewDataProvider(this.userDataSyncPreview);
			}
		});

		return treeView;
	}

	private registerManualSyncView(container: ViewContainer): void {
		const viewsRegistry = Registry.as<IViewsRegistry>(Extensions.ViewsRegistry);
		viewsRegistry.registerViews([<ITreeViewDescriptor>{
			id: MANUAL_SYNC_VIEW_ID,
			name: viewName,
			ctorDescriptor: new SyncDescriptor(TreeViewPane),
			when: CONTEXT_ENABLE_MANUAL_SYNC_VIEW,
			canToggleVisibility: false,
			canMoveView: false,
			treeView: this.treeView,
			collapsed: false,
			order: 100,
		}], container);
	}

	private registerActions(): void {
		const localActionOrder = 1;
		const remoteActionOrder = 1;
		const mergeActionOrder = 1;
		const that = this;

		/* accept all local */
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `workbench.actions.sync.acceptLocalAll`,
					title: localize('workbench.actions.sync.acceptLocalAll', "Accept Local"),
					icon: Codicon.cloudUpload,
					menu: {
						id: MenuId.ViewTitle,
						when: ContextKeyExpr.and(ContextKeyEqualsExpr.create('view', MANUAL_SYNC_VIEW_ID)),
						group: 'navigation',
						order: localActionOrder,
					},
				});
			}
			run(accessor: ServicesAccessor): Promise<void> {
				return that.push();
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
						when: ContextKeyExpr.and(ContextKeyEqualsExpr.create('view', MANUAL_SYNC_VIEW_ID)),
						group: 'navigation',
						order: remoteActionOrder,
					},
				});
			}
			async run(accessor: ServicesAccessor): Promise<void> {
				return that.pull();
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
						when: ContextKeyExpr.and(ContextKeyEqualsExpr.create('view', MANUAL_SYNC_VIEW_ID)),
						group: 'navigation',
						order: mergeActionOrder,
					},
				});
			}
			async run(accessor: ServicesAccessor): Promise<void> {
				return that.merge();
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
						when: ContextKeyExpr.and(ContextKeyEqualsExpr.create('view', MANUAL_SYNC_VIEW_ID), ContextKeyExpr.regex('viewItem', /sync-resource-modified-.*/i)),
						group: 'inline',
						order: localActionOrder,
					},
				});
			}
			async run(accessor: ServicesAccessor, handle: TreeViewItemHandleArg): Promise<void> {
				return that.acceptLocal(ManualSyncViewDataProvider.toUserDataSyncResourceGroup(handle.$treeItemHandle));
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
						when: ContextKeyExpr.and(ContextKeyEqualsExpr.create('view', MANUAL_SYNC_VIEW_ID), ContextKeyExpr.regex('viewItem', /sync-resource-modified-.*/i)),
						group: 'inline',
						order: remoteActionOrder,
					},
				});
			}
			async run(accessor: ServicesAccessor, handle: TreeViewItemHandleArg): Promise<void> {
				return that.acceptRemote(ManualSyncViewDataProvider.toUserDataSyncResourceGroup(handle.$treeItemHandle));
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
						when: ContextKeyExpr.and(ContextKeyEqualsExpr.create('view', MANUAL_SYNC_VIEW_ID), ContextKeyExpr.equals('viewItem', 'sync-resource-modified-change')),
						group: 'inline',
						order: mergeActionOrder,
					},
				});
			}
			async run(accessor: ServicesAccessor, handle: TreeViewItemHandleArg): Promise<void> {
				return that.mergeResource(ManualSyncViewDataProvider.toUserDataSyncResourceGroup(handle.$treeItemHandle));
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
						when: ContextKeyExpr.and(ContextKeyEqualsExpr.create('view', MANUAL_SYNC_VIEW_ID), ContextKeyExpr.regex('viewItem', /sync-resource-(add|delete)-.*/i)),
						group: 'inline',
					},
				});
			}
			async run(accessor: ServicesAccessor, handle: TreeViewItemHandleArg): Promise<void> {
				return that.deleteResource(ManualSyncViewDataProvider.toUserDataSyncResourceGroup(handle.$treeItemHandle));
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
						when: ContextKeyExpr.and(ContextKeyEqualsExpr.create('view', MANUAL_SYNC_VIEW_ID), ContextKeyExpr.regex('viewItem', /sync-resource-(add|delete)-.*/i)),
						group: 'inline',
					},
				});
			}
			async run(accessor: ServicesAccessor, handle: TreeViewItemHandleArg): Promise<void> {
				return that.addResource(ManualSyncViewDataProvider.toUserDataSyncResourceGroup(handle.$treeItemHandle));
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
				const previewResource: IUserDataSyncResourceGroup = ManualSyncViewDataProvider.toUserDataSyncResourceGroup(handle.$treeItemHandle);
				return that.showChanges(previewResource);
			}
		});
	}

	private async push(): Promise<void> {
		return this.withProgress(() => this.userDataSyncPreview.push());
	}

	private async pull(): Promise<void> {
		return this.withProgress(() => this.userDataSyncPreview.pull());
	}

	private async merge(): Promise<void> {
		return this.withProgress(() => this.userDataSyncPreview.merge());
	}

	private async acceptLocal(previewResource: IUserDataSyncResourceGroup): Promise<void> {
		const isConflict = this.userDataSyncPreview.conflicts.some(({ local }) => isEqual(local, previewResource.local));
		const localResource = isConflict ? previewResource.preview : previewResource.local;
		return this.withProgress(async () => {
			const content = await this.userDataSyncService.resolveContent(localResource);
			await this.userDataSyncPreview.accept(previewResource.syncResource, localResource, content || '');
		});
	}

	private async acceptRemote(previewResource: IUserDataSyncResourceGroup): Promise<void> {
		return this.withProgress(async () => {
			const content = await this.userDataSyncService.resolveContent(previewResource.remote);
			await this.userDataSyncPreview.accept(previewResource.syncResource, previewResource.remote, content || '');
		});
	}

	private async mergeResource(previewResource: IUserDataSyncResourceGroup): Promise<void> {
		return this.withProgress(() => this.userDataSyncPreview.merge(previewResource.preview));
	}

	private async deleteResource(previewResource: IUserDataSyncResourceGroup): Promise<void> {
		const resource = previewResource.remoteChange === Change.Deleted || previewResource.localChange === Change.Added ? previewResource.local : previewResource.remote;
		return this.withProgress(async () => {
			const content = await this.userDataSyncService.resolveContent(resource);
			await this.userDataSyncPreview.accept(previewResource.syncResource, resource, content || '');
		});
	}

	private async addResource(previewResource: IUserDataSyncResourceGroup): Promise<void> {
		const resource = previewResource.remoteChange === Change.Added || previewResource.localChange === Change.Deleted ? previewResource.local : previewResource.remote;
		return this.withProgress(async () => {
			const content = await this.userDataSyncService.resolveContent(resource);
			await this.userDataSyncPreview.accept(previewResource.syncResource, resource, content || '');
		});
	}

	private async showChanges(previewResource: IUserDataSyncResourceGroup): Promise<void> {
		const isConflict = this.userDataSyncPreview.conflicts.some(({ local }) => isEqual(local, previewResource.local));
		if (previewResource.localChange === Change.Added || previewResource.remoteChange === Change.Deleted) {
			await this.editorService.openEditor({ resource: URI.revive(previewResource.remote), label: localize({ key: 'resourceLabel', comment: ['remote as in file in cloud'] }, "{0} (Remote)", basename(previewResource.remote)) });
		} else {
			const leftResource = URI.revive(previewResource.remote);
			const rightResource = isConflict ? URI.revive(previewResource.preview) : URI.revive(previewResource.local);
			const leftResourceName = localize({ key: 'leftResourceName', comment: ['remote as in file in cloud'] }, "{0} (Remote)", basename(leftResource));
			const rightResourceName = localize({ key: 'rightResourceName', comment: ['local as in file in disk'] }, "{0} (Local)", basename(rightResource));
			await this.editorService.openEditor({
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

	private withProgress(task: () => Promise<void>): Promise<void> {
		return this.progressService.withProgress({ location: MANUAL_SYNC_VIEW_ID, delay: 500 }, task);
	}

}

class ManualSyncViewDataProvider implements ITreeViewDataProvider {

	constructor(
		private readonly userDataSyncPreview: IUserDataSyncPreview
	) {
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
		return this.userDataSyncPreview.changes.map(change => {
			return {
				handle: JSON.stringify(change),
				resourceUri: change.remote,
				themeIcon: FileThemeIcon,
				description: getSyncAreaLabel(change.syncResource),
				contextValue: `sync-resource-${change.localChange === Change.Added ? 'add-local' : change.localChange === Change.Deleted ? 'delete-local' : change.remoteChange === Change.Added ? 'add-remote' : change.remoteChange === Change.Deleted ? 'delete-remote' : 'modified'}-change`,
				collapsibleState: TreeItemCollapsibleState.None,
				command: { id: `workbench.actions.sync.showChanges`, title: '', arguments: [<TreeViewItemHandleArg>{ $treeViewId: '', $treeItemHandle: JSON.stringify(change) }] },
			};
		});
	}

	private getConflicts(): ITreeItem[] {
		return this.userDataSyncPreview.conflicts.map(conflict => {
			return {
				handle: JSON.stringify(conflict),
				resourceUri: conflict.remote,
				themeIcon: FileThemeIcon,
				description: getSyncAreaLabel(conflict.syncResource),
				contextValue: `sync-resource-modified-conflict`,
				collapsibleState: TreeItemCollapsibleState.None,
				command: { id: `workbench.actions.sync.showChanges`, title: '', arguments: [<TreeViewItemHandleArg>{ $treeViewId: '', $treeItemHandle: JSON.stringify(conflict) }] },
			};
		});
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

class UserDataSyncResourcesDecorationProvider extends Disposable implements IDecorationsProvider {

	readonly label: string = localize('label', "UserDataSyncResources");

	private readonly _onDidChange = this._register(new Emitter<URI[]>());
	readonly onDidChange = this._onDidChange.event;

	constructor(private readonly userDataSyncPreview: IUserDataSyncPreview) {
		super();
	}

	provideDecorations(resource: URI): IDecorationData | undefined {
		const changeResource = this.userDataSyncPreview.changes.find(c => isEqual(c.remote, resource)) || this.userDataSyncPreview.conflicts.find(c => isEqual(c.remote, resource));
		if (changeResource) {
			if (changeResource.localChange === Change.Modified || changeResource.remoteChange === Change.Modified) {
				return {
					letter: 'M',
				};
			}
			if (changeResource.localChange === Change.Added
				|| changeResource.localChange === Change.Deleted
				|| changeResource.remoteChange === Change.Added
				|| changeResource.remoteChange === Change.Deleted) {
				return {
					letter: 'A',
				};
			}
		}
		return undefined;
	}
}
