/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IUserDataSyncService, IRemoteUserDataService } from 'vs/workbench/services/userData/common/userData';
import { localize } from 'vs/nls';
import { Disposable } from 'vs/base/common/lifecycle';
import { Action } from 'vs/base/common/actions';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { ICommandService, CommandsRegistry } from 'vs/platform/commands/common/commands';
import { Registry } from 'vs/platform/registry/common/platform';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { RawContextKey, IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';

const CONTEXT_SYNC_ENABLED = new RawContextKey<boolean>('syncEnabled', false);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration)
	.registerConfiguration({
		id: 'userData',
		order: 30,
		title: localize('user data', "User Data"),
		type: 'object',
		properties: {
			'userData.autoSync': {
				type: 'boolean',
				description: localize('userData.autoSync', "When enabled, automatically gets user data. User data is fetched from the installed user data sync extension."),
				default: false,
				scope: ConfigurationScope.APPLICATION
			}
		}
	});

class AutoSyncUserDataContribution extends Disposable implements IWorkbenchContribution {

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IUserDataSyncService private readonly userDataSyncService: IUserDataSyncService,
	) {
		super();
		this.autoSync();
	}

	private async autoSync(): Promise<void> {
		if (this.configurationService.getValue<boolean>('userData.autoSync')) {
			this.userDataSyncService.synchronise();
		}
	}

}

class UserDataSyncContextUpdateContribution extends Disposable implements IWorkbenchContribution {

	private syncEnablementContext: IContextKey<boolean>;

	constructor(
		@IRemoteUserDataService remoteUserDataService: IRemoteUserDataService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super();
		this.syncEnablementContext = CONTEXT_SYNC_ENABLED.bindTo(contextKeyService);
		this.syncEnablementContext.set(remoteUserDataService.isEnabled());
		this._register(remoteUserDataService.onDidChangeEnablement(enabled => this.syncEnablementContext.set(enabled)));
	}

}

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(UserDataSyncContextUpdateContribution, LifecyclePhase.Starting);
workbenchRegistry.registerWorkbenchContribution(AutoSyncUserDataContribution, LifecyclePhase.Ready);

class ShowUserDataSyncActions extends Action {

	public static ID: string = 'workbench.userData.actions.showUserDataSyncActions';
	public static LABEL: string = localize('workbench.userData.actions.showUserDataSyncActions.label', "Show User Data Sync Actions");

	constructor(
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@ICommandService private commandService: ICommandService,
		@IConfigurationService private configurationService: IConfigurationService,
	) {
		super(ShowUserDataSyncActions.ID, ShowUserDataSyncActions.LABEL);
	}

	async run(): Promise<void> {
		return this.showSyncActions();
	}

	private async showSyncActions(): Promise<void> {
		const autoSync = this.configurationService.getValue<boolean>('userData.autoSync');
		const picks = [];
		if (autoSync) {
			picks.push({ label: localize('turn off sync', "Sync: Turn Off Sync"), id: 'workbench.userData.actions.stopAutoSync' });
		} else {
			picks.push({ label: localize('sync', "Sync: Start Sync"), id: 'workbench.userData.actions.startSync' });
			picks.push({ label: localize('turn on sync', "Sync: Turn On Auto Sync"), id: 'workbench.userData.actions.startAutoSync' });
		}
		picks.push({ label: localize('customise', "Sync: Settings"), id: 'workbench.userData.actions.syncSettings' });
		const result = await this.quickInputService.pick(picks, { canPickMany: false });
		if (result && result.id) {
			return this.commandService.executeCommand(result.id);
		}
	}
}

CommandsRegistry.registerCommand(ShowUserDataSyncActions.ID, (serviceAccessor) => {
	const instantiationService = serviceAccessor.get(IInstantiationService);
	return instantiationService.createInstance(ShowUserDataSyncActions).run();
});

CommandsRegistry.registerCommand('workbench.userData.actions.stopAutoSync', (serviceAccessor) => {
	const configurationService = serviceAccessor.get(IConfigurationService);
	return configurationService.updateValue('userData.autoSync', false);
});

CommandsRegistry.registerCommand('workbench.userData.actions.startAutoSync', (serviceAccessor) => {
	const configurationService = serviceAccessor.get(IConfigurationService);
	return configurationService.updateValue('userData.autoSync', true);
});

MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
	group: '5_sync',
	command: {
		id: ShowUserDataSyncActions.ID,
		title: localize('synchronise user data', "Sync...")
	},
	when: CONTEXT_SYNC_ENABLED,
	order: 1
});
