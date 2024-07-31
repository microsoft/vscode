/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITreeItem, TreeItemCollapsibleState, TreeViewItemHandleArg, IViewDescriptorService } from 'vs/workbench/common/views';
import { localize } from 'vs/nls';
import { TreeViewPane } from 'vs/workbench/browser/parts/views/treeView';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IUserDataSyncService, Change, MergeState, IUserDataSyncResource, IResourcePreview, IUserDataSyncEnablementService } from 'vs/platform/userDataSync/common/userDataSync';
import { registerAction2, Action2, MenuId } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { URI } from 'vs/base/common/uri';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { getSyncAreaLabel, IUserDataSyncConflictsView, IUserDataSyncWorkbenchService, SYNC_CONFLICTS_VIEW_ID } from 'vs/workbench/services/userDataSync/common/userDataSync';
import { basename, isEqual } from 'vs/base/common/resources';
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
import { IUserDataProfile, IUserDataProfilesService, reviveProfile } from 'vs/platform/userDataProfile/common/userDataProfile';
import { DEFAULT_EDITOR_ASSOCIATION } from 'vs/workbench/common/editor';
import { IHoverService } from 'vs/platform/hover/browser/hover';
import { IAccessibleViewInformationService } from 'vs/workbench/services/accessibility/common/accessibleViewInformationService';

type UserDataSyncConflictResource = IUserDataSyncResource & IResourcePreview;

export class UserDataSyncConflictsViewPane extends TreeViewPane implements IUserDataSyncConflictsView {

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
		@IHoverService hoverService: IHoverService,
		@IUserDataSyncService private readonly userDataSyncService: IUserDataSyncService,
		@IUserDataSyncWorkbenchService private readonly userDataSyncWorkbenchService: IUserDataSyncWorkbenchService,
		@IUserDataSyncEnablementService private readonly userDataSyncEnablementService: IUserDataSyncEnablementService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IAccessibleViewInformationService accessibleViewVisibilityService: IAccessibleViewInformationService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, notificationService, hoverService, accessibleViewVisibilityService);
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
		const roots: ITreeItem[] = [];

		const conflictResources: UserDataSyncConflictResource[] = this.userDataSyncService.conflicts
			.map(conflict => conflict.conflicts.map(resourcePreview => ({ ...resourcePreview, syncResource: conflict.syncResource, profile: conflict.profile })))
			.flat()
			.sort((a, b) => a.profile.id === b.profile.id ? 0 : a.profile.isDefault ? -1 : b.profile.isDefault ? 1 : a.profile.name.localeCompare(b.profile.name));
		const conflictResourcesByProfile: [IUserDataProfile, UserDataSyncConflictResource[]][] = [];
		for (const previewResource of conflictResources) {
			let result = conflictResourcesByProfile[conflictResourcesByProfile.length - 1]?.[0].id === previewResource.profile.id ? conflictResourcesByProfile[conflictResourcesByProfile.length - 1][1] : undefined;
			if (!result) {
				conflictResourcesByProfile.push([previewResource.profile, result = []]);
			}
			result.push(previewResource);
		}

		for (const [profile, resources] of conflictResourcesByProfile) {
			const children: ITreeItem[] = [];
			for (const resource of resources) {
				const handle = JSON.stringify(resource);
				const treeItem = {
					handle,
					resourceUri: resource.remoteResource,
					label: { label: basename(resource.remoteResource), strikethrough: resource.mergeState === MergeState.Accepted && (resource.localChange === Change.Deleted || resource.remoteChange === Change.Deleted) },
					description: getSyncAreaLabel(resource.syncResource),
					collapsibleState: TreeItemCollapsibleState.None,
					command: { id: `workbench.actions.sync.openConflicts`, title: '', arguments: [{ $treeViewId: '', $treeItemHandle: handle } satisfies TreeViewItemHandleArg] },
					contextValue: `sync-conflict-resource`
				};
				children.push(treeItem);
			}
			roots.push({
				handle: profile.id,
				label: { label: profile.name },
				collapsibleState: TreeItemCollapsibleState.Expanded,
				children
			});
		}

		return conflictResourcesByProfile.length === 1 && conflictResourcesByProfile[0][0].isDefault ? roots[0].children ?? [] : roots;
	}

	private parseHandle(handle: string): UserDataSyncConflictResource {
		const parsed: UserDataSyncConflictResource = JSON.parse(handle);
		return {
			syncResource: parsed.syncResource,
			profile: reviveProfile(parsed.profile, this.userDataProfilesService.profilesHome.scheme),
			localResource: URI.revive(parsed.localResource),
			remoteResource: URI.revive(parsed.remoteResource),
			baseResource: URI.revive(parsed.baseResource),
			previewResource: URI.revive(parsed.previewResource),
			acceptedResource: URI.revive(parsed.acceptedResource),
			localChange: parsed.localChange,
			remoteChange: parsed.remoteChange,
			mergeState: parsed.mergeState,
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
				return that.open(conflict);
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
				await that.userDataSyncWorkbenchService.accept({ syncResource: conflict.syncResource, profile: conflict.profile }, conflict.remoteResource, undefined, that.userDataSyncEnablementService.isEnabled());
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
				await that.userDataSyncWorkbenchService.accept({ syncResource: conflict.syncResource, profile: conflict.profile }, conflict.localResource, undefined, that.userDataSyncEnablementService.isEnabled());
			}
		}));
	}

	async open(conflictToOpen: IResourcePreview): Promise<void> {
		if (!this.userDataSyncService.conflicts.some(({ conflicts }) => conflicts.some(({ localResource }) => isEqual(localResource, conflictToOpen.localResource)))) {
			return;
		}

		const remoteResourceName = localize({ key: 'remoteResourceName', comment: ['remote as in file in cloud'] }, "{0} (Remote)", basename(conflictToOpen.remoteResource));
		const localResourceName = localize('localResourceName', "{0} (Local)", basename(conflictToOpen.remoteResource));
		await this.editorService.openEditor({
			input1: { resource: conflictToOpen.remoteResource, label: localize('Theirs', 'Theirs'), description: remoteResourceName },
			input2: { resource: conflictToOpen.localResource, label: localize('Yours', 'Yours'), description: localResourceName },
			base: { resource: conflictToOpen.baseResource },
			result: { resource: conflictToOpen.previewResource },
			options: {
				preserveFocus: true,
				revealIfVisible: true,
				pinned: true,
				override: DEFAULT_EDITOR_ASSOCIATION.id
			}
		});
		return;
	}

}

