/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IUserIdentityService, IUserDataProviderService, IUserIdentity } from 'vs/workbench/services/userData/common/userData';
import { IStatusbarService, StatusbarAlignment, IStatusbarEntryAccessor } from 'vs/platform/statusbar/common/statusbar';
import { localize } from 'vs/nls';
import { Disposable } from 'vs/base/common/lifecycle';
import { Action } from 'vs/base/common/actions';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { ICommandService, CommandsRegistry } from 'vs/platform/commands/common/commands';
import { Registry } from 'vs/platform/registry/common/platform';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

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

class UserDataExtensionActivationContribution extends Disposable implements IWorkbenchContribution {

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IUserIdentityService private readonly userIdentityService: IUserIdentityService,
		@IExtensionService private readonly extensionService: IExtensionService,
	) {
		super();
		this.activateUserDataExtensionsOnAutoSync();
		this._register(Event.any<any>(this.userIdentityService.onDidDeregisterUserIdentities, this.configurationService.onDidChangeConfiguration)(() => this.activateUserDataExtensionsOnAutoSync()));
	}

	private activateUserDataExtensionsOnAutoSync(): void {
		if (this.configurationService.getValue<boolean>('userData.autoSync')) {
			this.userIdentityService.getUserIndetities().forEach(({ identity }) => this.extensionService.activateByEvent(`onUserData:${identity}`));
		}
	}

}

class UserDataSyncStatusContribution extends Disposable implements IWorkbenchContribution {

	private readonly userDataSyncStatusAccessor: IStatusbarEntryAccessor;

	constructor(
		@IUserIdentityService private userIdentityService: IUserIdentityService,
		@IStatusbarService private statusbarService: IStatusbarService
	) {
		super();
		this.userDataSyncStatusAccessor = this.statusbarService.addEntry({
			text: '',
			command: ShowUserDataSyncActions.ID
		}, 'userDataSyncStatusEntry', '', StatusbarAlignment.LEFT);
		this.updateUserDataSyncStatusAccessor();
		this._register(Event.any<any>(
			this.userIdentityService.onDidRegisterUserIdentities, this.userIdentityService.onDidDeregisterUserIdentities,
			this.userIdentityService.onDidRegisterUserLoginProvider, this.userIdentityService.onDidDeregisterUserLoginProvider)
			(() => this.updateUserDataSyncStatusAccessor()));
		this._register(this.userIdentityService.onDidRegisterUserLoginProvider((identity => this.onDidRegisterUserLoginProvider(identity))));
	}

	private onDidRegisterUserLoginProvider(identity: string): void {
		const userLoginProvider = this.userIdentityService.getUserLoginProvider(identity);
		if (userLoginProvider) {
			this._register(userLoginProvider.onDidChange(() => this.updateUserDataSyncStatusAccessor()));
		}
	}

	private updateUserDataSyncStatusAccessor(): void {
		const userIdentity = this.userIdentityService.getUserIndetities()[0];
		if (userIdentity) {
			const loginProvider = this.userIdentityService.getUserLoginProvider(userIdentity.identity);
			const neededSignIn = loginProvider && !loginProvider.loggedIn;
			const text = this.getText(userIdentity, !!neededSignIn);
			this.userDataSyncStatusAccessor.update({ text, command: ShowUserDataSyncActions.ID });
			this.statusbarService.updateEntryVisibility('userDataSyncStatusEntry', true);
		} else {
			this.statusbarService.updateEntryVisibility('userDataSyncStatusEntry', false);
		}
	}

	private getText(userIdentity: IUserIdentity, neededSignIn: boolean): string {
		if (neededSignIn) {
			const signinText = localize('sign in', "{0}: Sign in to sync", userIdentity.title);
			return userIdentity.iconText ? `${userIdentity.iconText} ${signinText}` : signinText;
		}
		if (userIdentity.iconText) {
			return `${userIdentity.iconText} ${localize('sync user data', "{0}: Sync", userIdentity.title)}`;
		}
		return userIdentity.title;
	}
}

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(UserDataSyncStatusContribution, LifecyclePhase.Starting);
workbenchRegistry.registerWorkbenchContribution(UserDataExtensionActivationContribution, LifecyclePhase.Ready);

export class ShowUserDataSyncActions extends Action {

	public static ID: string = 'workbench.userData.actions.showUserDataSyncActions';
	public static LABEL: string = localize('workbench.userData.actions.showUserDataSyncActions.label', "Show User Data Sync Actions");

	constructor(
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IUserDataProviderService private readonly userDataProviderService: IUserDataProviderService,
		@IUserIdentityService private userIdentityService: IUserIdentityService,
		@ICommandService private commandService: ICommandService,
		@IExtensionService private extensionService: IExtensionService,
		@IStorageService private storageService: IStorageService,
		@IDialogService private dialogService: IDialogService,
		@IConfigurationService private configurationService: IConfigurationService,
	) {
		super(ShowUserDataSyncActions.ID, ShowUserDataSyncActions.LABEL);
	}

	async run(): Promise<void> {
		const userIdentity = this.userIdentityService.getUserIndetities()[0];
		if (!userIdentity) {
			return;
		}

		await this.extensionService.activateByEvent(`onUserData:${userIdentity.identity}`);
		const userDataProvider = this.userDataProviderService.getUserDataProvider(userIdentity.identity);
		if (!userDataProvider) {
			return;
		}

		const loginProvider = this.userIdentityService.getUserLoginProvider(userIdentity.identity);
		if (loginProvider && !loginProvider.loggedIn) {
			if (!await this.promptToSigin(userIdentity)) {
				return;
			}
			await loginProvider.login();
			if (!loginProvider.loggedIn) {
				return;
			}
		}
		return this.showSyncActions();
	}

	private async promptToSigin(userIdentity: IUserIdentity): Promise<boolean> {
		if (!this.storageService.getBoolean(`workbench.userData.${userIdentity.identity}.donotAskSignIn`, StorageScope.GLOBAL, false)) {
			const result = await this.dialogService.confirm({
				message: localize('sign in to start sync', "Sign In to Start Sync"),
				detail: localize('sign in deatils', "Sign in to {0} to get your settings, keybindings, snippets and extensions.", userIdentity.title),
				primaryButton: localize('sign in primary', "Sign In"),
				secondaryButton: localize('no thanks', "No Thanks"),
				checkbox: {
					label: localize('doNotAskAgain', "Do not ask me again")
				},
			});
			if (result.confirmed && result.checkboxChecked) {
				this.storageService.store(`workbench.userData.${userIdentity.identity}.donotAskSignIn`, true, StorageScope.GLOBAL);
			}
			return result.confirmed;
		}
		return true;
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
