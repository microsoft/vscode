/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IUserDataSyncService, SyncStatus, SyncSource, CONTEXT_SYNC_STATE, IUserDataSyncStore, registerConfiguration, getUserDataSyncStore, ISyncConfiguration, IUserDataAuthTokenService, IUserDataAutoSyncService } from 'vs/platform/userDataSync/common/userDataSync';
import { localize } from 'vs/nls';
import { Disposable, MutableDisposable, toDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { MenuRegistry, MenuId, IMenuItem } from 'vs/platform/actions/common/actions';
import { IContextKeyService, IContextKey, ContextKeyExpr, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
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
import { IEditorInput } from 'vs/workbench/common/editor';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { isWeb } from 'vs/base/common/platform';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { UserDataAutoSync } from 'vs/workbench/contrib/userDataSync/browser/userDataAutoSync';
import { UserDataSyncTrigger } from 'vs/workbench/contrib/userDataSync/browser/userDataSyncTrigger';
import { timeout } from 'vs/base/common/async';
import { IOutputService } from 'vs/workbench/contrib/output/common/output';
import * as Constants from 'vs/workbench/contrib/logs/common/logConstants';
import { IAuthenticationService } from 'vs/workbench/services/authentication/browser/authenticationService';
import { Session } from 'vs/editor/common/modes';
import { isPromiseCanceledError, canceled } from 'vs/base/common/errors';
import { toErrorMessage } from 'vs/base/common/errorMessage';

const enum AuthStatus {
	Initializing = 'Initializing',
	SignedIn = 'SignedIn',
	SignedOut = 'SignedOut'
}
const CONTEXT_AUTH_TOKEN_STATE = new RawContextKey<string>('authTokenStatus', AuthStatus.Initializing);
const SYNC_PUSH_LIGHT_ICON_URI = URI.parse(registerAndGetAmdImageURL(`vs/workbench/contrib/userDataSync/browser/media/check-light.svg`));
const SYNC_PUSH_DARK_ICON_URI = URI.parse(registerAndGetAmdImageURL(`vs/workbench/contrib/userDataSync/browser/media/check-dark.svg`));

type ConfigureSyncQuickPickItem = { id: string, label: string, description?: string };

export class UserDataSyncWorkbenchContribution extends Disposable implements IWorkbenchContribution {

	private static readonly ENABLEMENT_SETTING = 'sync.enable';

	private readonly userDataSyncStore: IUserDataSyncStore | undefined;
	private readonly syncStatusContext: IContextKey<string>;
	private readonly authenticationState: IContextKey<string>;
	private readonly badgeDisposable = this._register(new MutableDisposable());
	private readonly conflictsWarningDisposable = this._register(new MutableDisposable());
	private readonly signInNotificationDisposable = this._register(new MutableDisposable());
	private _activeAccount: Session | undefined;

	constructor(
		@IUserDataSyncService private readonly userDataSyncService: IUserDataSyncService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IActivityService private readonly activityService: IActivityService,
		@INotificationService private readonly notificationService: INotificationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEditorService private readonly editorService: IEditorService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IHistoryService private readonly historyService: IHistoryService,
		@IWorkbenchEnvironmentService private readonly workbenchEnvironmentService: IWorkbenchEnvironmentService,
		@IDialogService private readonly dialogService: IDialogService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOutputService private readonly outputService: IOutputService,
		@IUserDataAuthTokenService private readonly userDataAuthTokenService: IUserDataAuthTokenService,
		@IUserDataAutoSyncService userDataAutoSyncService: IUserDataAutoSyncService,
	) {
		super();
		this.userDataSyncStore = getUserDataSyncStore(configurationService);
		this.syncStatusContext = CONTEXT_SYNC_STATE.bindTo(contextKeyService);
		this.authenticationState = CONTEXT_AUTH_TOKEN_STATE.bindTo(contextKeyService);
		if (this.userDataSyncStore) {
			registerConfiguration();
			this.onDidChangeSyncStatus(this.userDataSyncService.status);
			this._register(Event.debounce(userDataSyncService.onDidChangeStatus, () => undefined, 500)(() => this.onDidChangeSyncStatus(this.userDataSyncService.status)));
			this._register(Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(UserDataSyncWorkbenchContribution.ENABLEMENT_SETTING))(() => this.onDidChangeEnablement()));
			this._register(this.authenticationService.onDidRegisterAuthenticationProvider(e => this.onDidRegisterAuthenticationProvider(e)));
			this._register(this.authenticationService.onDidUnregisterAuthenticationProvider(e => this.onDidUnregisterAuthenticationProvider(e)));
			this._register(this.authenticationService.onDidChangeSessions(e => this.onDidChangeSessions(e)));
			this.registerActions();
			this.initializeActiveAccount().then(_ => {
				if (isWeb) {
					this._register(instantiationService.createInstance(UserDataAutoSync));
				} else {
					this._register(instantiationService.createInstance(UserDataSyncTrigger).onDidTriggerSync(() => userDataAutoSyncService.triggerAutoSync()));
				}
			});
		}
	}

	private async initializeActiveAccount(): Promise<void> {
		const accounts = await this.authenticationService.getSessions(this.userDataSyncStore!.authenticationProviderId);
		// Auth provider has not yet been registered
		if (!accounts) {
			return;
		}

		if (accounts.length === 0) {
			this.activeAccount = undefined;
			return;
		}

		if (accounts.length === 1) {
			this.activeAccount = accounts[0];
			return;
		}

		const selectedAccount = await this.quickInputService.pick(accounts.map(account => {
			return {
				id: account.id,
				label: account.displayName
			};
		}), { canPickMany: false });

		if (selectedAccount) {
			this.activeAccount = accounts.filter(account => selectedAccount.id === account.id)[0];
		}
	}

	get activeAccount(): Session | undefined {
		return this._activeAccount;
	}

	set activeAccount(account: Session | undefined) {
		this._activeAccount = account;

		if (account) {
			this.userDataAuthTokenService.setToken(account.accessToken);
			this.authenticationState.set(AuthStatus.SignedIn);
		} else {
			this.userDataAuthTokenService.setToken(undefined);
			this.authenticationState.set(AuthStatus.SignedOut);
		}

		this.updateBadge();
	}

	private async onDidChangeSessions(providerId: string): Promise<void> {
		if (providerId === this.userDataSyncStore!.authenticationProviderId) {
			if (this.activeAccount) {
				// Try to update existing account, case where access token has been refreshed
				const accounts = (await this.authenticationService.getSessions(this.userDataSyncStore!.authenticationProviderId) || []);
				const matchingAccount = accounts.filter(a => a.id === this.activeAccount?.id)[0];
				this.activeAccount = matchingAccount;
			} else {
				this.initializeActiveAccount();
			}
		}
	}

	private async onDidRegisterAuthenticationProvider(providerId: string) {
		if (providerId === this.userDataSyncStore!.authenticationProviderId) {
			await this.initializeActiveAccount();
		}
	}

	private onDidUnregisterAuthenticationProvider(providerId: string) {
		if (providerId === this.userDataSyncStore!.authenticationProviderId) {
			this.activeAccount = undefined;
			this.authenticationState.reset();
		}
	}

	private onDidChangeSyncStatus(status: SyncStatus) {
		this.syncStatusContext.set(status);

		if (status === SyncStatus.Syncing) {
			// Show syncing progress if takes more than 1s.
			timeout(1000).then(() => this.updateBadge());
		} else {
			this.updateBadge();
		}

		if (this.userDataSyncService.status === SyncStatus.HasConflicts) {
			if (!this.conflictsWarningDisposable.value) {
				const handle = this.notificationService.prompt(Severity.Warning, localize('conflicts detected', "Unable to sync due to conflicts. Please resolve them to continue."),
					[
						{
							label: localize('resolve', "Resolve Conflicts"),
							run: () => this.handleConflicts()
						}
					],
					{
						sticky: true
					}
				);
				this.conflictsWarningDisposable.value = toDisposable(() => handle.close());
				handle.onDidClose(() => this.conflictsWarningDisposable.clear());
			}
		} else {
			const previewEditorInput = this.getPreviewEditorInput();
			if (previewEditorInput) {
				previewEditorInput.dispose();
			}
			this.conflictsWarningDisposable.clear();
		}
	}

	private onDidChangeEnablement() {
		this.updateBadge();
		const enabled = this.configurationService.getValue<boolean>(UserDataSyncWorkbenchContribution.ENABLEMENT_SETTING);
		if (enabled) {
			if (this.authenticationState.get() === AuthStatus.SignedOut) {
				const handle = this.notificationService.prompt(Severity.Info, localize('sign in message', "Please sign in with your {0} account to continue sync", this.userDataSyncStore!.account),
					[
						{
							label: localize('Sign in', "Sign in"),
							run: () => this.signIn()
						}
					]);
				this.signInNotificationDisposable.value = toDisposable(() => handle.close());
				handle.onDidClose(() => this.signInNotificationDisposable.clear());
			}
		} else {
			this.signInNotificationDisposable.clear();
		}
	}

	private async updateBadge(): Promise<void> {
		this.badgeDisposable.clear();

		let badge: IBadge | undefined = undefined;
		let clazz: string | undefined;
		let priority: number | undefined = undefined;

		if (this.userDataSyncService.status !== SyncStatus.Uninitialized && this.configurationService.getValue<boolean>(UserDataSyncWorkbenchContribution.ENABLEMENT_SETTING) && this.authenticationState.get() === AuthStatus.SignedOut) {
			badge = new NumberBadge(1, () => localize('sign in to sync', "Sign in to Sync"));
		} else if (this.userDataSyncService.status === SyncStatus.HasConflicts) {
			badge = new NumberBadge(1, () => localize('resolve conflicts', "Resolve Conflicts"));
		} else if (this.userDataSyncService.status === SyncStatus.Syncing) {
			badge = new ProgressBadge(() => localize('syncing', "Synchronizing User Configuration..."));
			clazz = 'progress-badge';
			priority = 1;
		}

		if (badge) {
			this.badgeDisposable.value = this.activityService.showActivity(GLOBAL_ACTIVITY_ID, badge, clazz, priority);
		}
	}

	private async turnOn(): Promise<void> {
		return new Promise((c, e) => {
			const disposables: DisposableStore = new DisposableStore();
			const quickPick = this.quickInputService.createQuickPick<ConfigureSyncQuickPickItem>();
			disposables.add(quickPick);
			quickPick.title = localize('turn on sync', "Turn on Sync");
			quickPick.ok = false;
			quickPick.customButton = true;
			if (this.authenticationState.get() === AuthStatus.SignedIn) {
				quickPick.description = localize('turn on sync detail', "Turn on to synchronize your following data across all your devices.");
				quickPick.customLabel = localize('turn on', "Turn on");
			} else {
				quickPick.description = localize('sign in and turn on sync detail', "Please sign in with your {0} account to synchronize your following data across all your devices.", this.userDataSyncStore!.account);
				quickPick.customLabel = localize('sign in and turn on sync', "Sign in & Turn on");
			}
			quickPick.placeholder = localize('configure sync placeholder', "Choose what to sync");
			quickPick.canSelectMany = true;
			quickPick.ignoreFocusOut = true;
			const items = this.getConfigureSyncQuickPickItems();
			quickPick.items = items;
			quickPick.selectedItems = items.filter(item => this.configurationService.getValue(item.id));
			disposables.add(Event.any(quickPick.onDidAccept, quickPick.onDidCustom)(async () => {
				if (quickPick.selectedItems.length) {
					await this.updateConfiguration(items, quickPick.selectedItems);
					this.doTurnOn().then(c, e);
					quickPick.hide();
				}
			}));
			disposables.add(quickPick.onDidHide(() => disposables.dispose()));
			quickPick.show();
		});
	}

	private async doTurnOn(): Promise<void> {
		if (this.authenticationState.get() === AuthStatus.SignedOut) {
			await this.signIn();
		}
		await this.handleFirstTimeSync();
		await this.enableSync();
	}

	private getConfigureSyncQuickPickItems(): ConfigureSyncQuickPickItem[] {
		return [{
			id: 'sync.enableSettings',
			label: localize('settings', "Settings")
		}, {
			id: 'sync.enableKeybindings',
			label: localize('keybindings', "Keybindings")
		}, {
			id: 'sync.enableExtensions',
			label: localize('extensions', "Extensions")
		}, {
			id: 'sync.enableUIState',
			label: localize('ui state label', "UI State"),
			description: localize('ui state description', "Display Language (Only)")
		}];
	}

	private async updateConfiguration(items: ConfigureSyncQuickPickItem[], selectedItems: ReadonlyArray<ConfigureSyncQuickPickItem>): Promise<void> {
		for (const item of items) {
			const wasEnabled = this.configurationService.getValue(item.id);
			const isEnabled = !!selectedItems.filter(selected => selected.id === item.id)[0];
			if (wasEnabled !== isEnabled) {
				await this.configurationService.updateValue(item.id!, isEnabled);
			}
		}
	}

	private async configureSyncOptions(): Promise<ISyncConfiguration> {
		return new Promise((c, e) => {
			const disposables: DisposableStore = new DisposableStore();
			const quickPick = this.quickInputService.createQuickPick<ConfigureSyncQuickPickItem>();
			disposables.add(quickPick);
			quickPick.title = localize('turn on sync', "Turn on Sync");
			quickPick.placeholder = localize('configure sync placeholder', "Choose what to sync");
			quickPick.canSelectMany = true;
			quickPick.ignoreFocusOut = true;
			const items = this.getConfigureSyncQuickPickItems();
			quickPick.items = items;
			quickPick.selectedItems = items.filter(item => this.configurationService.getValue(item.id));
			disposables.add(quickPick.onDidAccept(async () => {
				if (quickPick.selectedItems.length) {
					await this.updateConfiguration(items, quickPick.selectedItems);
					quickPick.hide();
				}
			}));
			disposables.add(quickPick.onDidHide(() => {
				disposables.dispose();
				c();
			}));
			quickPick.show();
		});
	}

	private async handleFirstTimeSync(): Promise<void> {
		const hasRemote = await this.userDataSyncService.hasRemoteData();
		if (!hasRemote) {
			return;
		}
		const isFirstSyncAndHasUserData = await this.userDataSyncService.isFirstTimeSyncAndHasUserData();
		if (!isFirstSyncAndHasUserData) {
			return;
		}
		const result = await this.dialogService.show(
			Severity.Info,
			localize('firs time sync', "First time Sync"),
			[
				localize('merge', "Merge"),
				localize('cancel', "Cancel"),
				localize('replace', "Replace (Overwrite Local)"),
			],
			{
				cancelId: 1,
				detail: localize('first time sync detail', "Synchronizing from this device for the first time.\nWould you like to merge or replace with the data from cloud?"),
			}
		);
		switch (result.choice) {
			case 0: await this.userDataSyncService.sync(); break;
			case 1: throw canceled();
			case 2: await this.userDataSyncService.pull(); break;
		}
	}

	private enableSync(): Promise<void> {
		return this.configurationService.updateValue(UserDataSyncWorkbenchContribution.ENABLEMENT_SETTING, true);
	}

	private async turnOff(): Promise<void> {
		const result = await this.dialogService.confirm({
			type: 'info',
			message: localize('turn off sync confirmation', "Turn off Sync"),
			detail: localize('turn off sync detail', "Your settings, keybindings, extensions and more will no longer be synced."),
			primaryButton: localize('turn off', "Turn off"),
			checkbox: {
				label: localize('turn off sync everywhere', "Turn off sync in all your devices and clear the data in cloud.")
			}
		});
		if (result.confirmed) {
			await this.configurationService.updateValue(UserDataSyncWorkbenchContribution.ENABLEMENT_SETTING, false);
			if (result.checkboxChecked) {
				await this.userDataSyncService.reset();
			}
		}
	}

	private async signIn(): Promise<void> {
		try {
			this.activeAccount = await this.authenticationService.login(this.userDataSyncStore!.authenticationProviderId);
		} catch (e) {
			this.notificationService.error(e);
			throw e;
		}
	}

	private async signOut(): Promise<void> {
		if (this.activeAccount) {
			await this.authenticationService.logout(this.userDataSyncStore!.authenticationProviderId, this.activeAccount.id);
			this.activeAccount = undefined;
		}
	}

	private async continueSync(): Promise<void> {
		// Get the preview editor
		const previewEditorInput = this.getPreviewEditorInput();
		// Save the preview
		if (previewEditorInput && previewEditorInput.isDirty()) {
			await this.textFileService.save(previewEditorInput.getResource()!);
		}
		try {
			// Continue Sync
			await this.userDataSyncService.sync(true);
		} catch (error) {
			this.notificationService.error(error);
			return;
		}
		// Close the preview editor
		if (previewEditorInput) {
			previewEditorInput.dispose();
		}
	}

	private getPreviewEditorInput(): IEditorInput | undefined {
		return this.editorService.editors.filter(input => isEqual(input.getResource(), this.workbenchEnvironmentService.settingsSyncPreviewResource) || isEqual(input.getResource(), this.workbenchEnvironmentService.keybindingsSyncPreviewResource))[0];
	}

	private async handleConflicts(): Promise<void> {
		const conflictsResource = this.getConflictsResource();
		if (conflictsResource) {
			const resourceInput = {
				resource: conflictsResource,
				options: {
					preserveFocus: false,
					pinned: false,
					revealIfVisible: true,
				},
				mode: 'jsonc'
			};
			this.editorService.openEditor(resourceInput)
				.then(editor => {
					this.historyService.remove(resourceInput);
					if (editor && editor.input) {
						// Trigger sync after closing the conflicts editor.
						const disposable = editor.input.onDispose(() => {
							disposable.dispose();
							this.userDataSyncService.sync(true);
						});
					}
				});
		}
	}

	private getConflictsResource(): URI | null {
		if (this.userDataSyncService.conflictsSource === SyncSource.Settings) {
			return this.workbenchEnvironmentService.settingsSyncPreviewResource;
		}
		if (this.userDataSyncService.conflictsSource === SyncSource.Keybindings) {
			return this.workbenchEnvironmentService.keybindingsSyncPreviewResource;
		}
		return null;
	}

	private showSyncLog(): Promise<void> {
		return this.outputService.showChannel(Constants.userDataSyncLogChannelId);
	}

	private registerActions(): void {

		const turnOnSyncCommandId = 'workbench.userData.actions.syncStart';
		const turnOnSyncWhenContext = ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized), ContextKeyExpr.not(`config.${UserDataSyncWorkbenchContribution.ENABLEMENT_SETTING}`), CONTEXT_AUTH_TOKEN_STATE.notEqualsTo(AuthStatus.Initializing));
		CommandsRegistry.registerCommand(turnOnSyncCommandId, async () => {
			try {
				await this.turnOn();
			} catch (e) {
				if (!isPromiseCanceledError(e)) {
					this.notificationService.error(localize('turn on failed', "Error while starting Sync: {0}", toErrorMessage(e)));
				}
			}
		});
		MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
			group: '5_sync',
			command: {
				id: turnOnSyncCommandId,
				title: localize('global activity turn on sync', "Turn on sync...")
			},
			when: turnOnSyncWhenContext,
		});
		MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
			command: {
				id: turnOnSyncCommandId,
				title: localize('turn on sync...', "Sync: Turn on sync...")
			},
			when: turnOnSyncWhenContext,
		});

		const signInCommandId = 'workbench.userData.actions.signin';
		const signInWhenContext = ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized), ContextKeyExpr.has(`config.${UserDataSyncWorkbenchContribution.ENABLEMENT_SETTING}`), CONTEXT_AUTH_TOKEN_STATE.isEqualTo(AuthStatus.SignedOut));
		CommandsRegistry.registerCommand(signInCommandId, () => this.signIn());
		MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
			group: '5_sync',
			command: {
				id: signInCommandId,
				title: localize('global activity sign in', "Sign in to sync... (1)")
			},
			when: signInWhenContext,
		});
		MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
			command: {
				id: signInCommandId,
				title: localize('sign in', "Sync: Sign in to sync...")
			},
			when: signInWhenContext,
		});

		const stopSyncCommandId = 'workbench.userData.actions.stopSync';
		CommandsRegistry.registerCommand(stopSyncCommandId, () => this.turnOff());
		MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
			group: '5_sync',
			command: {
				id: stopSyncCommandId,
				title: localize('global activity stop sync', "Turn off sync")
			},
			when: ContextKeyExpr.and(ContextKeyExpr.has(`config.${UserDataSyncWorkbenchContribution.ENABLEMENT_SETTING}`), CONTEXT_AUTH_TOKEN_STATE.isEqualTo(AuthStatus.SignedIn), CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized), CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.HasConflicts))
		});
		MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
			command: {
				id: stopSyncCommandId,
				title: localize('stop sync', "Sync: Turn off sync")
			},
			when: ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized), ContextKeyExpr.has(`config.${UserDataSyncWorkbenchContribution.ENABLEMENT_SETTING}`)),
		});

		const resolveConflictsCommandId = 'workbench.userData.actions.resolveConflicts';
		const resolveConflictsWhenContext = CONTEXT_SYNC_STATE.isEqualTo(SyncStatus.HasConflicts);
		CommandsRegistry.registerCommand(resolveConflictsCommandId, () => this.handleConflicts());
		MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
			group: '5_sync',
			command: {
				id: resolveConflictsCommandId,
				title: localize('resolveConflicts_global', "Resolve sync conflicts (1)"),
			},
			when: resolveConflictsWhenContext,
		});
		MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
			command: {
				id: resolveConflictsCommandId,
				title: localize('resolveConflicts', "Sync: Resolve sync conflicts"),
			},
			when: resolveConflictsWhenContext,
		});

		const continueSyncCommandId = 'workbench.userData.actions.continueSync';
		CommandsRegistry.registerCommand(continueSyncCommandId, () => this.continueSync());
		MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
			command: {
				id: continueSyncCommandId,
				title: localize('continue sync', "Sync: Continue sync")
			},
			when: ContextKeyExpr.and(CONTEXT_SYNC_STATE.isEqualTo(SyncStatus.HasConflicts)),
		});
		MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
			command: {
				id: continueSyncCommandId,
				title: localize('continue sync', "Sync: Continue sync"),
				icon: {
					light: SYNC_PUSH_LIGHT_ICON_URI,
					dark: SYNC_PUSH_DARK_ICON_URI
				}
			},
			group: 'navigation',
			order: 1,
			when: ContextKeyExpr.and(CONTEXT_SYNC_STATE.isEqualTo(SyncStatus.HasConflicts), ResourceContextKey.Resource.isEqualTo(this.workbenchEnvironmentService.settingsSyncPreviewResource.toString())),
		});
		MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
			command: {
				id: continueSyncCommandId,
				title: localize('continue sync', "Sync: Continue sync"),
				icon: {
					light: SYNC_PUSH_LIGHT_ICON_URI,
					dark: SYNC_PUSH_DARK_ICON_URI
				}
			},
			group: 'navigation',
			order: 1,
			when: ContextKeyExpr.and(CONTEXT_SYNC_STATE.isEqualTo(SyncStatus.HasConflicts), ResourceContextKey.Resource.isEqualTo(this.workbenchEnvironmentService.keybindingsSyncPreviewResource.toString())),
		});

		const signOutMenuItem: IMenuItem = {
			group: '5_sync',
			command: {
				id: 'workbench.userData.actions.signout',
				title: localize('sign out', "Sync: Sign out")
			},
			when: ContextKeyExpr.and(CONTEXT_AUTH_TOKEN_STATE.isEqualTo(AuthStatus.SignedIn)),
		};
		CommandsRegistry.registerCommand(signOutMenuItem.command.id, () => this.signOut());
		MenuRegistry.appendMenuItem(MenuId.CommandPalette, signOutMenuItem);

		const configureSyncCommandId = 'workbench.userData.actions.configureSync';
		CommandsRegistry.registerCommand(configureSyncCommandId, () => this.configureSyncOptions());
		MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
			command: {
				id: configureSyncCommandId,
				title: localize('configure sync', "Sync: Configure")
			},
			when: ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized), ContextKeyExpr.has(`config.${UserDataSyncWorkbenchContribution.ENABLEMENT_SETTING}`)),
		});

		const showSyncLogCommandId = 'workbench.userData.actions.showSyncLog';
		CommandsRegistry.registerCommand(showSyncLogCommandId, () => this.showSyncLog());
		MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
			command: {
				id: showSyncLogCommandId,
				title: localize('show sync log', "Sync: Show Sync Log")
			},
			when: ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized)),
		});

		const resetLocalCommandId = 'workbench.userData.actions.resetLocal';
		CommandsRegistry.registerCommand(resetLocalCommandId, () => this.userDataSyncService.resetLocal());
		MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
			command: {
				id: resetLocalCommandId,
				title: localize('reset local', "Developer: Reset Local (Sync)")
			},
			when: ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized)),
		});
	}
}
