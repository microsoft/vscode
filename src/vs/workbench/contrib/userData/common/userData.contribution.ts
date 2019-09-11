/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IUserDataSyncService, SyncStatus } from 'vs/workbench/services/userData/common/userData';
import { localize } from 'vs/nls';
import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
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

const CONTEXT_SYNC_STATE = new RawContextKey<string>('syncStatus', SyncStatus.Uninitialized);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration)
	.registerConfiguration({
		id: 'userData',
		order: 30,
		title: localize('user data', "User Data"),
		type: 'object',
		properties: {
			'userData.autoSync': {
				type: 'boolean',
				description: localize('userData.autoSync', "When enabled, automatically synchronises user configuration - Settings, Keybindings, Extensions & Snippets."),
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
	}

	private loopAutoSync(): void {
		this.autoSync()
			.then(() => timeout(1000 * 10)) // every five minutes
			.then(() => this.loopAutoSync());
	}

	private autoSync(): Promise<any> {
		if (this.userDataSyncService.status === SyncStatus.Idle && this.configurationService.getValue<boolean>('userData.autoSync')) {
			return this.userDataSyncService.sync();
		}
		return Promise.resolve();
	}


}

class SyncContribution extends Disposable implements IWorkbenchContribution {

	private readonly syncEnablementContext: IContextKey<string>;
	private readonly badgeDisposable = this._register(new MutableDisposable());

	constructor(
		@IUserDataSyncService userDataSyncService: IUserDataSyncService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IActivityService private readonly activityService: IActivityService
	) {
		super();
		this.syncEnablementContext = CONTEXT_SYNC_STATE.bindTo(contextKeyService);
		this.onDidChangeStatus(userDataSyncService.status);
		this._register(userDataSyncService.onDidChangeStatus(status => this.onDidChangeStatus(status)));
		this.registerGlobalActivityActions();
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
	}

	private registerGlobalActivityActions(): void {
		CommandsRegistry.registerCommand('workbench.userData.actions.startSync', serviceAccessor => serviceAccessor.get(IUserDataSyncService).sync());
		MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
			group: '5_sync',
			command: {
				id: 'workbench.userData.actions.startSync',
				title: localize('start sync', "Sync: Start")
			},
			when: ContextKeyExpr.and(CONTEXT_SYNC_STATE.isEqualTo(SyncStatus.Idle), ContextKeyExpr.not('config.userData.autoSync')),
			order: 1
		});

		CommandsRegistry.registerCommand('workbench.userData.actions.turnOnAutoSync', serviceAccessor => serviceAccessor.get(IConfigurationService).updateValue('userData.autoSync', true));
		MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
			group: '5_sync',
			command: {
				id: 'workbench.userData.actions.turnOnAutoSync',
				title: localize('turn on auto sync', "Turn On Auto Sync")
			},
			when: ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized), ContextKeyExpr.not('config.userData.autoSync')),
			order: 1
		});

		CommandsRegistry.registerCommand('workbench.userData.actions.turnOffAutoSync', serviceAccessor => serviceAccessor.get(IConfigurationService).updateValue('userData.autoSync', false));
		MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
			group: '5_sync',
			command: {
				id: 'workbench.userData.actions.turnOffAutoSync',
				title: localize('turn off auto sync', "Turn Off Atuo Sync")
			},
			when: ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized), ContextKeyExpr.has('config.userData.autoSync')),
			order: 1
		});

		CommandsRegistry.registerCommand('sync.resolveConflicts', serviceAccessor => serviceAccessor.get(IUserDataSyncService).resolveConflicts());
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
	}
}

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(SyncContribution, LifecyclePhase.Starting);
workbenchRegistry.registerWorkbenchContribution(AutoSyncUserData, LifecyclePhase.Eventually);
