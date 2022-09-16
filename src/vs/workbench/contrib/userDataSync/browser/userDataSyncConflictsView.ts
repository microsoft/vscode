/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/userDataSyncViews';
import { ITreeItem, TreeItemCollapsibleState, TreeViewItemHandleArg, IViewDescriptorService } from 'vs/workbench/common/views';
import { localize } from 'vs/nls';
import { TreeViewPane } from 'vs/workbench/browser/parts/views/treeView';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IUserDataSyncService, Change, MergeState, IUserDataSyncResource, IResourcePreview, IUserDataSyncResourceConflicts, IUserDataSyncEnablementService } from 'vs/platform/userDataSync/common/userDataSync';
import { registerAction2, Action2, MenuId } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { URI } from 'vs/base/common/uri';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { getSyncAreaLabel, SYNC_CONFLICTS_VIEW_ID } from 'vs/workbench/services/userDataSync/common/userDataSync';
import { basename } from 'vs/base/common/resources';
import * as DOM from 'vs/base/browser/dom';
import { IViewletViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { Codicon } from 'vs/base/common/codicons';

interface IUserDataSyncConflictHandle {
	syncResource: IUserDataSyncResource;
	remoteResource: URI;
	localResource: URI;
	baseResource: URI;
	previewResource: URI;
}

export class UserDataSyncConflictsViewPane extends TreeViewPane {

	private readonly treeItems = new Map<string, ITreeItem>();

	constructor(
		options: IViewletViewOptions,
		@IEditorService private readonly editorService: IEditorService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@ITelemetryService telemetryService: ITelemetryService,
		@INotificationService notificationService: INotificationService,
		@IUserDataSyncService private readonly userDataSyncService: IUserDataSyncService,
		@IUserDataSyncEnablementService private readonly userDataSyncEnablementService: IUserDataSyncEnablementService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, notificationService);
		this._register(this.userDataSyncService.onDidChangeConflicts(() => this.treeView.refresh()));
		this.registerActions();
	}

	protected override renderTreeView(container: HTMLElement): void {
		super.renderTreeView(DOM.append(container, DOM.$('')));

		const that = this;
		this.treeView.message = localize('explanation', "Please go through each entry and merge to resolve conflicts.");
		this.treeView.dataProvider = { getChildren() { return that.getTreeItems(); } };
	}

	private async getTreeItems(): Promise<ITreeItem[]> {
		this.treeItems.clear();

		let hasDefaultProfile = false;
		const conflictsByProfile = new Map<string, IUserDataSyncResourceConflicts[]>();
		for (const conflicts of this.userDataSyncService.conflicts) {
			hasDefaultProfile = hasDefaultProfile || conflicts.profile.isDefault;
			const result = conflictsByProfile.get(conflicts.profile.id);
			if (result) {
				result.push(conflicts);
			} else {
				conflictsByProfile.set(conflicts.profile.id, [conflicts]);
			}
		}

		if (conflictsByProfile.size === 1 && hasDefaultProfile) {
			const roots: ITreeItem[] = [];
			for (const [userDataSyncResourceConflicts] of conflictsByProfile.values()) {
				for (const conflict of userDataSyncResourceConflicts.conflicts) {
					const treeItem = this.createConflictTreeItem(userDataSyncResourceConflicts, conflict);
					roots.push(treeItem);
				}
			}
			return roots;
		}

		const roots: ITreeItem[] = [];
		for (const profileConflicts of conflictsByProfile.values()) {
			const children: ITreeItem[] = [];
			for (const userDataSyncResourceConflicts of profileConflicts) {
				for (const conflict of userDataSyncResourceConflicts.conflicts) {
					const treeItem = this.createConflictTreeItem(userDataSyncResourceConflicts, conflict);
					children.push(treeItem);
				}
			}
			roots.push({
				handle: profileConflicts[0].profile.id,
				label: { label: profileConflicts[0].profile.name },
				collapsibleState: TreeItemCollapsibleState.Expanded,
				children
			});
		}
		return roots;
	}

	private createConflictTreeItem(userDataSyncResource: IUserDataSyncResource, resource: IResourcePreview): ITreeItem {
		const handle = JSON.stringify(this.toHandle(userDataSyncResource, resource));
		return {
			handle,
			resourceUri: resource.remoteResource,
			label: { label: basename(resource.remoteResource), strikethrough: resource.mergeState === MergeState.Accepted && (resource.localChange === Change.Deleted || resource.remoteChange === Change.Deleted) },
			description: getSyncAreaLabel(userDataSyncResource.syncResource),
			collapsibleState: TreeItemCollapsibleState.None,
			command: { id: `workbench.actions.sync.openConflicts`, title: '', arguments: [<TreeViewItemHandleArg>{ $treeViewId: '', $treeItemHandle: handle }] },
			contextValue: `sync-conflict-resource`
		};
	}

	private toHandle(syncResource: IUserDataSyncResource, resource: IResourcePreview): IUserDataSyncConflictHandle {
		return {
			syncResource,
			baseResource: resource.baseResource,
			remoteResource: resource.remoteResource,
			localResource: resource.localResource,
			previewResource: resource.previewResource
		};
	}

	private parseHandle(handle: string): IUserDataSyncConflictHandle {
		const parsed: IUserDataSyncConflictHandle = JSON.parse(handle);
		return {
			syncResource: parsed.syncResource,
			baseResource: URI.revive(parsed.baseResource),
			remoteResource: URI.revive(parsed.remoteResource),
			localResource: URI.revive(parsed.localResource),
			previewResource: URI.revive(parsed.previewResource),
		};
	}

	private registerActions(): void {
		const that = this;

		this._register(registerAction2(class OpenConflictsAction extends Action2 {
			constructor() {
				super({
					id: `workbench.actions.sync.openConflicts`,
					title: localize({ key: 'workbench.actions.sync.openConflicts', comment: ['This is an action title to show the conflicts between local and remote version of resources'] }, "Show Conflicts"),
				});
			}
			async run(accessor: ServicesAccessor, handle: TreeViewItemHandleArg): Promise<void> {
				const conflict = that.parseHandle(handle.$treeItemHandle);
				const remoteResourceName = localize({ key: 'remoteResourceName', comment: ['remote as in file in cloud'] }, "{0} (Remote)", basename(conflict.remoteResource));
				const localResourceName = localize('localResourceName', "{0} (Local)", basename(conflict.remoteResource));
				await that.editorService.openEditor({
					input1: { resource: conflict.remoteResource, label: localize('Theirs', 'Theirs'), description: remoteResourceName },
					input2: { resource: conflict.localResource, label: localize('Yours', 'Yours'), description: localResourceName },
					base: { resource: conflict.baseResource },
					result: { resource: conflict.previewResource }
				});
			}
		}));

		this._register(registerAction2(class AcceptRemoteAction extends Action2 {
			constructor() {
				super({
					id: `workbench.actions.sync.acceptRemote`,
					title: localize('workbench.actions.sync.acceptRemote', "Accept Remote"),
					icon: Codicon.cloudDownload,
					menu: {
						id: MenuId.ViewItemContext,
						when: ContextKeyExpr.and(ContextKeyExpr.equals('view', SYNC_CONFLICTS_VIEW_ID), ContextKeyExpr.equals('viewItem', 'sync-conflict-resource')),
						group: 'inline',
						order: 1,
					},
				});
			}
			async run(accessor: ServicesAccessor, handle: TreeViewItemHandleArg): Promise<void> {
				const conflict = that.parseHandle(handle.$treeItemHandle);
				await that.userDataSyncService.accept(conflict.syncResource, conflict.remoteResource, undefined, that.userDataSyncEnablementService.isEnabled());
			}
		}));

		this._register(registerAction2(class AcceptLocalAction extends Action2 {
			constructor() {
				super({
					id: `workbench.actions.sync.acceptLocal`,
					title: localize('workbench.actions.sync.acceptLocal', "Accept Local"),
					icon: Codicon.cloudUpload,
					menu: {
						id: MenuId.ViewItemContext,
						when: ContextKeyExpr.and(ContextKeyExpr.equals('view', SYNC_CONFLICTS_VIEW_ID), ContextKeyExpr.equals('viewItem', 'sync-conflict-resource')),
						group: 'inline',
						order: 2,
					},
				});
			}
			async run(accessor: ServicesAccessor, handle: TreeViewItemHandleArg): Promise<void> {
				const conflict = that.parseHandle(handle.$treeItemHandle);
				await that.userDataSyncService.accept(conflict.syncResource, conflict.localResource, undefined, that.userDataSyncEnablementService.isEnabled());
			}
		}));
	}
}
