/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IUserDataSyncService, SyncStatus, SyncSource } from 'vs/platform/userDataSync/common/userDataSync';
import { localize } from 'vs/nls';
import { Disposable, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { Registry } from 'vs/platform/registry/common/platform';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { MenuRegistry, MenuId, IMenuItem } from 'vs/platform/actions/common/actions';
import { RawContextKey, IContextKeyService, IContextKey, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IActivityService, IBadge, NumberBadge, ProgressBadge } from 'vs/workbench/services/activity/common/activity';
import { GLOBAL_ACTIVITY_ID } from 'vs/workbench/common/activity';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { URI } from 'vs/base/common/uri';
import { registerAndGetAmdImageURL } from 'vs/base/common/amd';
import { ResourceContextKey } from 'vs/workbench/common/resources';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { Event } from 'vs/base/common/event';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { isEqual } from 'vs/base/common/resources';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { isWeb } from 'vs/base/common/platform';
import { UserDataAutoSync } from 'vs/platform/userDataSync/common/userDataSyncService';

const CONTEXT_SYNC_STATE = new RawContextKey<string>('syncStatus', SyncStatus.Uninitialized);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration)
	.registerConfiguration({
		id: 'userConfiguration',
		order: 30,
		title: localize('userConfiguration', "User Configuration"),
		type: 'object',
		properties: {
			'userConfiguration.enableSync': {
				type: 'boolean',
				description: localize('userConfiguration.enableSync', "When enabled, synchronises User Configuration: Settings, Keybindings, Extensions & Snippets."),
				default: true,
				scope: ConfigurationScope.APPLICATION
			}
		}
	});

class UserDataAutoSyncContribution extends Disposable implements IWorkbenchContribution {

	constructor(
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super();
		if (isWeb) {
			instantiationService.createInstance(UserDataAutoSync);
		}
	}
}

const SYNC_PUSH_LIGHT_ICON_URI = URI.parse(registerAndGetAmdImageURL(`vs/workbench/contrib/userDataSync/browser/media/sync-push-light.svg`));
const SYNC_PUSH_DARK_ICON_URI = URI.parse(registerAndGetAmdImageURL(`vs/workbench/contrib/userDataSync/browser/media/sync-push-dark.svg`));
class SyncActionsContribution extends Disposable implements IWorkbenchContribution {

	private readonly syncEnablementContext: IContextKey<string>;
	private readonly badgeDisposable = this._register(new MutableDisposable());
	private readonly conflictsWarningDisposable = this._register(new MutableDisposable());

	constructor(
		@IUserDataSyncService private readonly userDataSyncService: IUserDataSyncService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IActivityService private readonly activityService: IActivityService,
		@INotificationService private readonly notificationService: INotificationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEditorService private readonly editorService: IEditorService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IHistoryService private readonly historyService: IHistoryService,
		@IWorkbenchEnvironmentService private readonly workbenchEnvironmentService: IWorkbenchEnvironmentService,
	) {
		super();
		this.syncEnablementContext = CONTEXT_SYNC_STATE.bindTo(contextKeyService);
		this.onDidChangeStatus(userDataSyncService.status);
		this._register(Event.debounce(userDataSyncService.onDidChangeStatus, () => undefined, 500)(status => this.onDidChangeStatus(userDataSyncService.status)));
		this.registerActions();
	}

	private onDidChangeStatus(status: SyncStatus) {
		this.syncEnablementContext.set(status);

		let badge: IBadge | undefined = undefined;
		let clazz: string | undefined;

		if (status === SyncStatus.HasConflicts) {
			badge = new NumberBadge(1, () => localize('resolve conflicts', "Resolve Conflicts"));
		} else if (status === SyncStatus.Syncing) {
			badge = new ProgressBadge(() => localize('syncing', "Synchronising User Configuration..."));
			clazz = 'progress-badge';
		}

		this.badgeDisposable.clear();

		if (badge) {
			this.badgeDisposable.value = this.activityService.showActivity(GLOBAL_ACTIVITY_ID, badge, clazz);
		}

		if (status === SyncStatus.HasConflicts) {
			if (!this.conflictsWarningDisposable.value) {
				const handle = this.notificationService.prompt(Severity.Warning, localize('conflicts detected', "Unable to sync due to conflicts. Please resolve them to continue."),
					[
						{
							label: localize('resolve', "Resolve Conflicts"),
							run: () => this.handleConflicts()
						}
					]);
				this.conflictsWarningDisposable.value = toDisposable(() => handle.close());
				handle.onDidClose(() => this.conflictsWarningDisposable.clear());
			}
		} else {
			this.conflictsWarningDisposable.clear();
		}
	}

	private async continueSync(): Promise<void> {
		// Get the preview editor
		const editorInput = this.editorService.editors.filter(input => isEqual(input.getResource(), this.workbenchEnvironmentService.settingsSyncPreviewResource))[0];
		// Save the preview
		if (editorInput && editorInput.isDirty()) {
			await this.textFileService.save(editorInput.getResource()!);
		}
		try {
			// Continue Sync
			await this.userDataSyncService.sync(true);
		} catch (error) {
			this.notificationService.error(error);
			return;
		}
		// Close the preview editor
		if (editorInput) {
			editorInput.dispose();
		}
	}

	private async handleConflicts(): Promise<void> {
		if (this.userDataSyncService.conflictsSource === SyncSource.Settings) {
			const resourceInput = {
				resource: this.workbenchEnvironmentService.settingsSyncPreviewResource,
				options: {
					preserveFocus: false,
					pinned: false,
					revealIfVisible: true,
				},
				mode: 'jsonc'
			};
			this.editorService.openEditor(resourceInput).then(() => this.historyService.remove(resourceInput));
		}
	}

	private registerActions(): void {

		const startSyncMenuItem: IMenuItem = {
			group: '5_sync',
			command: {
				id: 'workbench.userData.actions.syncStart',
				title: localize('start sync', "Sync: Start")
			},
			when: ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized), ContextKeyExpr.not('config.userConfiguration.enableSync')),
		};
		CommandsRegistry.registerCommand(startSyncMenuItem.command.id, () => this.configurationService.updateValue('userConfiguration.enableSync', true));
		MenuRegistry.appendMenuItem(MenuId.GlobalActivity, startSyncMenuItem);
		MenuRegistry.appendMenuItem(MenuId.CommandPalette, startSyncMenuItem);

		const stopSyncMenuItem: IMenuItem = {
			group: '5_sync',
			command: {
				id: 'workbench.userData.actions.stopSync',
				title: localize('stop sync', "Sync: Stop")
			},
			when: ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized), ContextKeyExpr.has('config.userConfiguration.enableSync')),
		};
		CommandsRegistry.registerCommand(stopSyncMenuItem.command.id, () => this.configurationService.updateValue('userConfiguration.enableSync', false));
		MenuRegistry.appendMenuItem(MenuId.GlobalActivity, stopSyncMenuItem);
		MenuRegistry.appendMenuItem(MenuId.CommandPalette, stopSyncMenuItem);

		const resolveConflictsMenuItem: IMenuItem = {
			group: '5_sync',
			command: {
				id: 'sync.resolveConflicts',
				title: localize('resolveConflicts', "Sync: Resolve Conflicts"),
			},
			when: CONTEXT_SYNC_STATE.isEqualTo(SyncStatus.HasConflicts),
		};
		CommandsRegistry.registerCommand(resolveConflictsMenuItem.command.id, () => this.handleConflicts());
		MenuRegistry.appendMenuItem(MenuId.GlobalActivity, resolveConflictsMenuItem);
		MenuRegistry.appendMenuItem(MenuId.CommandPalette, resolveConflictsMenuItem);

		const continueSyncCommandId = 'workbench.userData.actions.continueSync';
		CommandsRegistry.registerCommand(continueSyncCommandId, () => this.continueSync());
		MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
			command: {
				id: continueSyncCommandId,
				title: localize('continue sync', "Sync: Continue")
			},
			when: ContextKeyExpr.and(CONTEXT_SYNC_STATE.isEqualTo(SyncStatus.HasConflicts)),
		});
		MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
			command: {
				id: continueSyncCommandId,
				title: localize('continue sync', "Sync: Continue"),
				iconLocation: {
					light: SYNC_PUSH_LIGHT_ICON_URI,
					dark: SYNC_PUSH_DARK_ICON_URI
				}
			},
			group: 'navigation',
			order: 1,
			when: ContextKeyExpr.and(CONTEXT_SYNC_STATE.isEqualTo(SyncStatus.HasConflicts), ResourceContextKey.Resource.isEqualTo(this.workbenchEnvironmentService.settingsSyncPreviewResource.toString())),
		});
	}
}

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(SyncActionsContribution, LifecyclePhase.Starting);
workbenchRegistry.registerWorkbenchContribution(UserDataAutoSyncContribution, LifecyclePhase.Restored);
