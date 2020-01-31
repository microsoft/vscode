/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IUserDataSyncService, SyncStatus, SyncSource, CONTEXT_SYNC_STATE, IUserDataSyncStore, registerConfiguration, getUserDataSyncStore, ISyncConfiguration, IUserDataAuthTokenService, IUserDataAutoSyncService, USER_DATA_SYNC_SCHEME, toRemoteContentResource, getSyncSourceFromRemoteContentResource, UserDataSyncErrorCode } from 'vs/platform/userDataSync/common/userDataSync';
import { localize } from 'vs/nls';
import { Disposable, MutableDisposable, toDisposable, DisposableStore, dispose } from 'vs/base/common/lifecycle';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IConfigurationService, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { MenuRegistry, MenuId, IMenuItem } from 'vs/platform/actions/common/actions';
import { IContextKeyService, IContextKey, ContextKeyExpr, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IActivityService, IBadge, NumberBadge, ProgressBadge } from 'vs/workbench/services/activity/common/activity';
import { GLOBAL_ACTIVITY_ID } from 'vs/workbench/common/activity';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { URI } from 'vs/base/common/uri';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Event } from 'vs/base/common/event';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { isEqual } from 'vs/base/common/resources';
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
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { ITextModelService, ITextModelContentProvider } from 'vs/editor/common/services/resolverService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import type { ITextModel } from 'vs/editor/common/model';
import type { IEditorContribution } from 'vs/editor/common/editorCommon';
import type { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { FloatingClickWidget } from 'vs/workbench/browser/parts/editor/editorWidgets';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import type { IEditorInput } from 'vs/workbench/common/editor';
import { Action } from 'vs/base/common/actions';
import { IPreferencesService } from 'vs/workbench/services/preferences/common/preferences';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

const enum AuthStatus {
	Initializing = 'Initializing',
	SignedIn = 'SignedIn',
	SignedOut = 'SignedOut'
}
const CONTEXT_AUTH_TOKEN_STATE = new RawContextKey<string>('authTokenStatus', AuthStatus.Initializing);

type ConfigureSyncQuickPickItem = { id: string, label: string, description?: string };

function getSyncAreaLabel(source: SyncSource): string {
	switch (source) {
		case SyncSource.Settings: return localize('settings', "Settings");
		case SyncSource.Keybindings: return localize('keybindings', "Keybindings");
		case SyncSource.Extensions: return localize('extensions', "Extensions");
		case SyncSource.GlobalState: return localize('ui state label', "UI State");
	}
}

type FirstTimeSyncClassification = {
	action: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
};

type SyncErrorClassification = {
	source: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
};

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
		@IWorkbenchEnvironmentService private readonly workbenchEnvironmentService: IWorkbenchEnvironmentService,
		@IDialogService private readonly dialogService: IDialogService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOutputService private readonly outputService: IOutputService,
		@IUserDataAuthTokenService private readonly userDataAuthTokenService: IUserDataAuthTokenService,
		@IUserDataAutoSyncService userDataAutoSyncService: IUserDataAutoSyncService,
		@ITextModelService textModelResolverService: ITextModelService,
		@IPreferencesService private readonly preferencesService: IPreferencesService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
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
			this._register(userDataAutoSyncService.onError(({ code, source }) => this.onAutoSyncError(code, source)));
			this.registerActions();
			this.initializeActiveAccount().then(_ => {
				if (isWeb) {
					this._register(instantiationService.createInstance(UserDataAutoSync));
				} else {
					this._register(instantiationService.createInstance(UserDataSyncTrigger).onDidTriggerSync(() => userDataAutoSyncService.triggerAutoSync()));
				}
			});

			textModelResolverService.registerTextModelContentProvider(USER_DATA_SYNC_SCHEME, instantiationService.createInstance(UserDataRemoteContentProvider));
			registerEditorContribution(AcceptChangesContribution.ID, AcceptChangesContribution);
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
			const conflictsEditorInput = this.getConflictsEditorInput(this.userDataSyncService.conflictsSource!);
			if (!conflictsEditorInput && !this.conflictsWarningDisposable.value) {
				const conflictsArea = getSyncAreaLabel(this.userDataSyncService.conflictsSource!);
				const handle = this.notificationService.prompt(Severity.Warning, localize('conflicts detected', "Unable to sync due to conflicts in {0}. Please resolve them to continue.", conflictsArea),
					[
						{
							label: localize('show conflicts', "Show Conflicts"),
							run: () => {
								this.telemetryService.publicLog2('sync/showConflicts');
								this.handleConflicts();
							}
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
			this.getAllConflictsEditorInputs().forEach(input => input.dispose());
			this.conflictsWarningDisposable.clear();
		}
	}

	private onDidChangeEnablement() {
		this.updateBadge();
		const enabled = this.configurationService.getValue<boolean>(UserDataSyncWorkbenchContribution.ENABLEMENT_SETTING);
		if (enabled) {
			if (this.authenticationState.get() === AuthStatus.SignedOut) {
				const displayName = this.authenticationService.getDisplayName(this.userDataSyncStore!.authenticationProviderId);
				const handle = this.notificationService.prompt(Severity.Info, localize('sign in message', "Please sign in with your {0} account to continue sync", displayName),
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

	private onAutoSyncError(code: UserDataSyncErrorCode, source?: SyncSource): void {
		switch (code) {
			case UserDataSyncErrorCode.TooManyFailures:
				this.telemetryService.publicLog2('sync/errorTooMany');
				this.disableSync();
				this.notificationService.notify({
					severity: Severity.Error,
					message: localize('too many errors', "Turned off sync because of too many failure attempts. Please open Sync log to check the failures and turn on sync."),
					actions: {
						primary: [new Action('open sync log', localize('open log', "Show logs"), undefined, true, () => this.showSyncLog())]
					}
				});
				return;
			case UserDataSyncErrorCode.TooLarge:
				this.telemetryService.publicLog2<{ source: string }, SyncErrorClassification>('sync/errorTooLarge', { source: source! });
				if (source === SyncSource.Keybindings || source === SyncSource.Settings) {
					const sourceArea = getSyncAreaLabel(source);
					this.disableSync();
					this.notificationService.notify({
						severity: Severity.Error,
						message: localize('too large', "Turned off sync because size of the {0} file to sync is larger than {1}. Please open the file and reduce the size and turn on sync", sourceArea, '1MB'),
						actions: {
							primary: [new Action('open sync log', localize('open file', "Show {0} file", sourceArea), undefined, true,
								() => source === SyncSource.Settings ? this.preferencesService.openGlobalSettings(true) : this.preferencesService.openGlobalKeybindingSettings(true))]
						}
					});
				}
				return;
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
			badge = new NumberBadge(1, () => localize('show conflicts', "Show Conflicts"));
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
				quickPick.customLabel = localize('turn on', "Turn on");
			} else {
				const displayName = this.authenticationService.getDisplayName(this.userDataSyncStore!.authenticationProviderId);
				quickPick.description = localize('sign in and turn on sync detail', "Please sign in with your {0} account to synchronize your following data across all your devices.", displayName);
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
			label: getSyncAreaLabel(SyncSource.Settings)
		}, {
			id: 'sync.enableKeybindings',
			label: getSyncAreaLabel(SyncSource.Keybindings)
		}, {
			id: 'sync.enableExtensions',
			label: getSyncAreaLabel(SyncSource.Extensions)
		}, {
			id: 'sync.enableUIState',
			label: getSyncAreaLabel(SyncSource.GlobalState),
			description: localize('ui state description', "only 'Display Language' for now")
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
				detail: localize('first time sync detail', "Synchronizing from this device for the first time.\nWould you like to merge or replace with the data from the cloud?"),
			}
		);
		switch (result.choice) {
			case 0:
				this.telemetryService.publicLog2<{ action: string }, FirstTimeSyncClassification>('sync/firstTimeSync', { action: 'merge' });
				break;
			case 1:
				this.telemetryService.publicLog2<{ action: string }, FirstTimeSyncClassification>('sync/firstTimeSync', { action: 'cancelled' });
				throw canceled();
			case 2:
				this.telemetryService.publicLog2<{ action: string }, FirstTimeSyncClassification>('sync/firstTimeSync', { action: 'replace-local' });
				await this.userDataSyncService.pull();
				break;
		}
	}

	private enableSync(): Promise<void> {
		return this.configurationService.updateValue(UserDataSyncWorkbenchContribution.ENABLEMENT_SETTING, true);
	}

	private async turnOff(): Promise<void> {
		const result = await this.dialogService.confirm({
			type: 'info',
			message: localize('turn off sync confirmation', "Turn off Sync"),
			detail: localize('turn off sync detail', "Your settings, keybindings, extensions and UI State will no longer be synced."),
			primaryButton: localize('turn off', "Turn off"),
			checkbox: {
				label: localize('turn off sync everywhere', "Turn off sync on all your devices and clear the data from the cloud.")
			}
		});
		if (result.confirmed) {
			await this.disableSync();
			if (result.checkboxChecked) {
				this.telemetryService.publicLog2('sync/turnOffEveryWhere');
				await this.userDataSyncService.reset();
			} else {
				await this.userDataSyncService.resetLocal();
			}
		}
	}

	private disableSync(): Promise<void> {
		return this.configurationService.updateValue(UserDataSyncWorkbenchContribution.ENABLEMENT_SETTING, undefined, ConfigurationTarget.USER);
	}

	private async signIn(): Promise<void> {
		try {
			this.activeAccount = await this.authenticationService.login(this.userDataSyncStore!.authenticationProviderId, ['https://management.core.windows.net/.default', 'offline_access']);
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

	private getConflictsEditorInput(source: SyncSource): IEditorInput | undefined {
		const previewResource = source === SyncSource.Settings ? this.workbenchEnvironmentService.settingsSyncPreviewResource
			: source === SyncSource.Keybindings ? this.workbenchEnvironmentService.keybindingsSyncPreviewResource
				: null;
		return previewResource ? this.editorService.editors.filter(input => input instanceof DiffEditorInput && isEqual(previewResource, input.master.getResource()))[0] : undefined;
	}

	private getAllConflictsEditorInputs(): IEditorInput[] {
		return this.editorService.editors.filter(input => {
			const resource = input instanceof DiffEditorInput ? input.master.getResource() : input.getResource();
			return isEqual(resource, this.workbenchEnvironmentService.settingsSyncPreviewResource) || isEqual(resource, this.workbenchEnvironmentService.keybindingsSyncPreviewResource);
		});
	}

	private async handleConflicts(): Promise<void> {
		let previewResource: URI | undefined = undefined;
		let label: string = '';
		if (this.userDataSyncService.conflictsSource === SyncSource.Settings) {
			previewResource = this.workbenchEnvironmentService.settingsSyncPreviewResource;
			label = localize('settings conflicts preview', "Settings Conflicts (Remote ↔ Local)");
		} else if (this.userDataSyncService.conflictsSource === SyncSource.Keybindings) {
			previewResource = this.workbenchEnvironmentService.keybindingsSyncPreviewResource;
			label = localize('keybindings conflicts preview', "Keybindings Conflicts (Remote ↔ Local)");
		}
		if (previewResource) {
			const remoteContentResource = toRemoteContentResource(this.userDataSyncService.conflictsSource!);
			await this.editorService.openEditor({
				leftResource: remoteContentResource,
				rightResource: previewResource,
				label,
				options: {
					preserveFocus: false,
					pinned: true,
					revealIfVisible: true,
				},
			});
		}
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
				title: localize('global activity turn on sync', "Turn on Sync...")
			},
			when: turnOnSyncWhenContext,
		});
		MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
			command: {
				id: turnOnSyncCommandId,
				title: localize('turn on sync...', "Sync: Turn on Sync...")
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
				title: localize('global activity sign in', "Sign in to Sync... (1)")
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
				title: localize('global activity stop sync', "Turn off Sync")
			},
			when: ContextKeyExpr.and(ContextKeyExpr.has(`config.${UserDataSyncWorkbenchContribution.ENABLEMENT_SETTING}`), CONTEXT_AUTH_TOKEN_STATE.isEqualTo(AuthStatus.SignedIn), CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized), CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.HasConflicts))
		});
		MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
			command: {
				id: stopSyncCommandId,
				title: localize('stop sync', "Sync: Turn off Sync")
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
				title: localize('resolveConflicts_global', "Show Sync Conflicts (1)"),
			},
			when: resolveConflictsWhenContext,
		});
		MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
			command: {
				id: resolveConflictsCommandId,
				title: localize('showConflicts', "Sync: Show Sync Conflicts"),
			},
			when: resolveConflictsWhenContext,
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

class UserDataRemoteContentProvider implements ITextModelContentProvider {

	constructor(
		@IUserDataSyncService private readonly userDataSyncService: IUserDataSyncService,
		@IModelService private readonly modelService: IModelService,
		@IModeService private readonly modeService: IModeService,
	) {
	}

	provideTextContent(uri: URI): Promise<ITextModel> | null {
		let promise: Promise<string | null> | undefined;
		if (isEqual(uri, toRemoteContentResource(SyncSource.Settings))) {
			promise = this.userDataSyncService.getRemoteContent(SyncSource.Settings);
		}
		if (isEqual(uri, toRemoteContentResource(SyncSource.Keybindings))) {
			promise = this.userDataSyncService.getRemoteContent(SyncSource.Keybindings);
		}
		if (promise) {
			return promise.then(content => this.modelService.createModel(content || '', this.modeService.create('jsonc'), uri));
		}
		return null;
	}
}

type SyncConflictsClassification = {
	source: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
	action: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
};

class AcceptChangesContribution extends Disposable implements IEditorContribution {

	static get(editor: ICodeEditor): AcceptChangesContribution {
		return editor.getContribution<AcceptChangesContribution>(AcceptChangesContribution.ID);
	}

	public static readonly ID = 'editor.contrib.acceptChangesButton';

	private acceptChangesButton: FloatingClickWidget | undefined;

	constructor(
		private editor: ICodeEditor,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IUserDataSyncService private readonly userDataSyncService: IUserDataSyncService,
		@INotificationService private readonly notificationService: INotificationService,
		@IDialogService private readonly dialogService: IDialogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService
	) {
		super();

		this.update();
		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.editor.onDidChangeModel(e => this.update()));
		this._register(Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration('diffEditor.renderSideBySide'))(() => this.update()));
	}

	private update(): void {
		if (!this.shouldShowButton(this.editor)) {
			this.disposeAcceptChangesWidgetRenderer();
			return;
		}

		this.createAcceptChangesWidgetRenderer();
	}

	private shouldShowButton(editor: ICodeEditor): boolean {
		const model = editor.getModel();
		if (!model) {
			return false; // we need a model
		}

		if (this.isSyncPreviewResource(model.uri)) {
			return true;
		}

		if (getSyncSourceFromRemoteContentResource(model.uri) !== undefined) {
			return this.configurationService.getValue<boolean>('diffEditor.renderSideBySide');
		}

		return false;
	}

	private isSyncPreviewResource(uri: URI): boolean {
		if (isEqual(uri, this.environmentService.settingsSyncPreviewResource)) {
			return true;
		}

		if (isEqual(uri, this.environmentService.keybindingsSyncPreviewResource)) {
			return true;
		}

		return false;
	}

	private createAcceptChangesWidgetRenderer(): void {
		if (!this.acceptChangesButton) {
			const replaceLabel = localize('accept remote', "Replace (Overwrite Local)");
			const applyLabel = localize('accept local', "Apply");
			this.acceptChangesButton = this.instantiationService.createInstance(FloatingClickWidget, this.editor, getSyncSourceFromRemoteContentResource(this.editor.getModel()!.uri) !== undefined ? replaceLabel : applyLabel, null);
			this._register(this.acceptChangesButton.onClick(async () => {
				const model = this.editor.getModel();
				if (model) {
					const conflictsSource = this.userDataSyncService.conflictsSource;
					const syncSource = getSyncSourceFromRemoteContentResource(model.uri);
					this.telemetryService.publicLog2<{ source: string, action: string }, SyncConflictsClassification>('sync/handleConflicts', { source: conflictsSource!, action: syncSource !== undefined ? 'replaceLocal' : 'apply' });
					if (syncSource !== undefined) {
						const syncAreaLabel = getSyncAreaLabel(syncSource);
						const result = await this.dialogService.confirm({
							type: 'info',
							title: localize('Sync overwrite local', "Sync: {0}", replaceLabel),
							message: localize('confirm replace and overwrite local', "Would you like to replace Local {0} with Remote {1}?", syncAreaLabel, syncAreaLabel),
							primaryButton: replaceLabel
						});
						if (!result.confirmed) {
							return;
						}
					}
					try {
						await this.userDataSyncService.resolveConflictsAndContinueSync(model.getValue(), syncSource !== undefined);
					} catch (e) {
						this.userDataSyncService.restart().then(() => {
							if (conflictsSource === this.userDataSyncService.conflictsSource) {
								this.notificationService.warn(localize('update conflicts', "Could not resolve conflicts as there is new local version available. Please try again."));
							}
						});
					}
				}
			}));

			this.acceptChangesButton.render();
		}
	}

	private disposeAcceptChangesWidgetRenderer(): void {
		dispose(this.acceptChangesButton);
		this.acceptChangesButton = undefined;
	}

	dispose(): void {
		this.disposeAcceptChangesWidgetRenderer();
		super.dispose();
	}
}
