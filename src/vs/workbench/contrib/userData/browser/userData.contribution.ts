/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IUserDataSyncService, SyncStatus } from 'vs/workbench/services/userData/common/userData';
import { localize } from 'vs/nls';
import { Disposable, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { Registry } from 'vs/platform/registry/common/platform';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { RawContextKey, IContextKeyService, IContextKey, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { FalseContext } from 'vs/platform/contextkey/common/contextkeys';
import { IActivityService, IBadge, NumberBadge, ProgressBadge } from 'vs/workbench/services/activity/common/activity';
import { GLOBAL_ACTIVITY_ID } from 'vs/workbench/common/activity';
import { timeout } from 'vs/base/common/async';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { AcceptChangesController } from 'vs/workbench/contrib/userData/browser/userDataPreviewEditorContribution';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';

const CONTEXT_SYNC_STATE = new RawContextKey<string>('syncStatus', SyncStatus.Uninitialized);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration)
	.registerConfiguration({
		id: 'userConfiguration',
		order: 30,
		title: localize('userConfiguration', "User Configuration"),
		type: 'object',
		properties: {
			'userConfiguration.autoSync': {
				type: 'boolean',
				description: localize('userConfiguration.autoSync', "When enabled, automatically synchronises User Configuration: Settings, Keybindings, Extensions & Snippets."),
				default: false,
				scope: ConfigurationScope.APPLICATION
			}
		}
	});

class AutoSyncUserData extends Disposable implements IWorkbenchContribution {

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IUserDataSyncService private readonly userDataSyncService: IUserDataSyncService,
	) {
		super();
		this.loopAutoSync();
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('userConfiguration.autoSync') && this.configurationService.getValue<boolean>('userConfiguration.autoSync')) {
				this.autoSync();
			}
		}));
	}

	private loopAutoSync(): void {
		this.autoSync()
			.then(() => timeout(1000 * 60 * 5)) // every five minutes
			.then(() => this.loopAutoSync());
	}

	private autoSync(): Promise<any> {
		if (this.userDataSyncService.status === SyncStatus.Idle && this.configurationService.getValue<boolean>('userConfiguration.autoSync')) {
			return this.userDataSyncService.sync();
		}
		return Promise.resolve();
	}


}

class SyncContribution extends Disposable implements IWorkbenchContribution {

	private readonly syncEnablementContext: IContextKey<string>;
	private readonly badgeDisposable = this._register(new MutableDisposable());
	private readonly conflictsWarningDisposable = this._register(new MutableDisposable());

	constructor(
		@IUserDataSyncService private readonly userDataSyncService: IUserDataSyncService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IActivityService private readonly activityService: IActivityService,
		@INotificationService private readonly notificationService: INotificationService
	) {
		super();
		this.syncEnablementContext = CONTEXT_SYNC_STATE.bindTo(contextKeyService);
		this.onDidChangeStatus(userDataSyncService.status);
		this._register(userDataSyncService.onDidChangeStatus(status => this.onDidChangeStatus(status)));
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

		if (status !== SyncStatus.HasConflicts) {
			this.conflictsWarningDisposable.clear();
		}
	}

	private async sync(): Promise<void> {
		await this.userDataSyncService.sync();
		if (this.userDataSyncService.status === SyncStatus.HasConflicts) {
			const handle = this.notificationService.prompt(Severity.Warning, localize('conflicts detected', "Unable to sync due to conflicts. Please resolve them to continue."),
				[
					{
						label: localize('resolve', "Resolve Conflicts"),
						run: () => this.userDataSyncService.handleConflicts()
					}
				]);
			this.conflictsWarningDisposable.value = toDisposable(() => handle.close());
		}
	}

	private registerActions(): void {

		// Global Activity Actions

		CommandsRegistry.registerCommand('workbench.userData.actions.turnOnSync', serviceAccessor => serviceAccessor.get(IConfigurationService).updateValue('userConfiguration.autoSync', true));
		MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
			group: '5_sync',
			command: {
				id: 'workbench.userData.actions.turnOnSync',
				title: localize('turn on auto sync', "Sync: Turn On")
			},
			when: ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized), ContextKeyExpr.not('config.userConfiguration.autoSync')),
		});

		CommandsRegistry.registerCommand('workbench.userData.actions.turnOffSync', serviceAccessor => serviceAccessor.get(IConfigurationService).updateValue('userConfiguration.autoSync', false));
		MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
			group: '5_sync',
			command: {
				id: 'workbench.userData.actions.turnOffSync',
				title: localize('turn off auto sync', "Sync: Turn Off")
			},
			when: ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized), ContextKeyExpr.has('config.userConfiguration.autoSync')),
		});

		CommandsRegistry.registerCommand('sync.resolveConflicts', serviceAccessor => serviceAccessor.get(IUserDataSyncService).handleConflicts());
		MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
			group: '5_sync',
			command: {
				id: 'sync.resolveConflicts',
				title: localize('resolveConflicts', "Sync: Resolve Conflicts"),
			},
			when: CONTEXT_SYNC_STATE.isEqualTo(SyncStatus.HasConflicts),
		});

		CommandsRegistry.registerCommand('sync.synchronising', () => { });
		MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
			group: '5_sync',
			command: {
				id: 'sync.synchronising',
				title: localize('Synchronising', "Synchronising..."),
				precondition: FalseContext
			},
			when: CONTEXT_SYNC_STATE.isEqualTo(SyncStatus.Syncing)
		});

		// Command Pallette Actions

		CommandsRegistry.registerCommand('workbench.userData.actions.startSync', () => this.sync());
		MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
			command: {
				id: 'workbench.userData.actions.startSync',
				title: localize('start sync', "Sync: Start")
			},
			when: ContextKeyExpr.and(CONTEXT_SYNC_STATE.isEqualTo(SyncStatus.Idle), ContextKeyExpr.not('config.userConfiguration.autoSync')),
		});

		CommandsRegistry.registerCommand('workbench.userData.actions.stopSync', serviceAccessor => serviceAccessor.get(IUserDataSyncService).stopSync());
		MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
			command: {
				id: 'workbench.userData.actions.stopSync',
				title: localize('stop sync', "Sync: Stop")
			},
			when: ContextKeyExpr.and(CONTEXT_SYNC_STATE.isEqualTo(SyncStatus.HasConflicts), ContextKeyExpr.not('config.userConfiguration.autoSync')),
		});

		MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
			command: {
				id: 'sync.resolveConflicts',
				title: localize('resolveConflicts', "Sync: Resolve Conflicts"),
			},
			when: CONTEXT_SYNC_STATE.isEqualTo(SyncStatus.HasConflicts),
		});
	}
}

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(SyncContribution, LifecyclePhase.Starting);
workbenchRegistry.registerWorkbenchContribution(AutoSyncUserData, LifecyclePhase.Eventually);

registerEditorContribution(AcceptChangesController);
