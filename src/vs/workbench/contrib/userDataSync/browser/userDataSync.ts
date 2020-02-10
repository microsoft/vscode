/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IUserDataSyncService, SyncStatus, SyncSource, CONTEXT_SYNC_STATE, IUserDataSyncStore, registerConfiguration, getUserDataSyncStore, ISyncConfiguration, IUserDataAuthTokenService, IUserDataAutoSyncService, USER_DATA_SYNC_SCHEME, toRemoteContentResource, getSyncSourceFromRemoteContentResource, UserDataSyncErrorCode, UserDataSyncError, getSyncSourceFromPreviewResource, IUserDataSyncEnablementService, ResourceKey } from 'vs/platform/userDataSync/common/userDataSync';
import { localize } from 'vs/nls';
import { Disposable, MutableDisposable, toDisposable, DisposableStore, dispose, IDisposable } from 'vs/base/common/lifecycle';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { MenuRegistry, MenuId, IMenuItem } from 'vs/platform/actions/common/actions';
import { IContextKeyService, IContextKey, ContextKeyExpr, RawContextKey, ContextKeyRegexExpr } from 'vs/platform/contextkey/common/contextkey';
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
import { UserDataSyncTrigger } from 'vs/workbench/contrib/userDataSync/browser/userDataSyncTrigger';
import { timeout } from 'vs/base/common/async';
import { IOutputService } from 'vs/workbench/contrib/output/common/output';
import * as Constants from 'vs/workbench/contrib/logs/common/logConstants';
import { IAuthenticationService } from 'vs/workbench/services/authentication/browser/authenticationService';
import { AuthenticationSession } from 'vs/editor/common/modes';
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
	SignedOut = 'SignedOut',
	Unavailable = 'Unavailable'
}
const CONTEXT_SYNC_ENABLEMENT = new RawContextKey<boolean>('syncEnabled', false);
const CONTEXT_AUTH_TOKEN_STATE = new RawContextKey<string>('authTokenStatus', AuthStatus.Initializing);
const CONTEXT_CONFLICTS_SOURCES = new RawContextKey<string>('conflictsSources', '');

type ConfigureSyncQuickPickItem = { id: ResourceKey, label: string, description?: string };

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

export class UserDataSyncWorkbenchContribution extends Disposable implements IWorkbenchContribution {

	private readonly userDataSyncStore: IUserDataSyncStore | undefined;
	private readonly syncEnablementContext: IContextKey<boolean>;
	private readonly syncStatusContext: IContextKey<string>;
	private readonly authenticationState: IContextKey<string>;
	private readonly conflictsSources: IContextKey<string>;
	private readonly conflictsDisposables = new Map<SyncSource, IDisposable>();
	private readonly badgeDisposable = this._register(new MutableDisposable());
	private readonly signInNotificationDisposable = this._register(new MutableDisposable());
	private _activeAccount: AuthenticationSession | undefined;

	constructor(
		@IUserDataSyncEnablementService private readonly userDataSyncEnablementService: IUserDataSyncEnablementService,
		@IUserDataSyncService private readonly userDataSyncService: IUserDataSyncService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IActivityService private readonly activityService: IActivityService,
		@INotificationService private readonly notificationService: INotificationService,
		@IConfigurationService configurationService: IConfigurationService,
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
		this.syncEnablementContext = CONTEXT_SYNC_ENABLEMENT.bindTo(contextKeyService);
		this.syncStatusContext = CONTEXT_SYNC_STATE.bindTo(contextKeyService);
		this.authenticationState = CONTEXT_AUTH_TOKEN_STATE.bindTo(contextKeyService);
		this.conflictsSources = CONTEXT_CONFLICTS_SOURCES.bindTo(contextKeyService);
		if (this.userDataSyncStore) {
			registerConfiguration();
			this.onDidChangeSyncStatus(this.userDataSyncService.status);
			this.onDidChangeConflicts(this.userDataSyncService.conflictsSources);
			this.onDidChangeEnablement(this.userDataSyncEnablementService.isEnabled());
			this._register(Event.debounce(userDataSyncService.onDidChangeStatus, () => undefined, 500)(() => this.onDidChangeSyncStatus(this.userDataSyncService.status)));
			this._register(userDataSyncService.onDidChangeConflicts(() => this.onDidChangeConflicts(this.userDataSyncService.conflictsSources)));
			this._register(this.userDataSyncEnablementService.onDidChangeEnablement(enabled => this.onDidChangeEnablement(enabled)));
			this._register(this.authenticationService.onDidRegisterAuthenticationProvider(e => this.onDidRegisterAuthenticationProvider(e)));
			this._register(this.authenticationService.onDidUnregisterAuthenticationProvider(e => this.onDidUnregisterAuthenticationProvider(e)));
			this._register(this.authenticationService.onDidChangeSessions(e => this.onDidChangeSessions(e)));
			this._register(userDataAutoSyncService.onError(({ code, source }) => this.onAutoSyncError(code, source)));
			this.registerActions();
			this.initializeActiveAccount().then(_ => {
				if (!isWeb) {
					this._register(instantiationService.createInstance(UserDataSyncTrigger).onDidTriggerSync(() => userDataAutoSyncService.triggerAutoSync()));
				}
			});

			textModelResolverService.registerTextModelContentProvider(USER_DATA_SYNC_SCHEME, instantiationService.createInstance(UserDataRemoteContentProvider));
			registerEditorContribution(AcceptChangesContribution.ID, AcceptChangesContribution);
		}
	}

	private async initializeActiveAccount(): Promise<void> {
		const sessions = await this.authenticationService.getSessions(this.userDataSyncStore!.authenticationProviderId);
		// Auth provider has not yet been registered
		if (!sessions) {
			return;
		}

		if (sessions.length === 0) {
			this.setActiveAccount(undefined);
			return;
		}

		if (sessions.length === 1) {
			this.logAuthenticatedEvent(sessions[0]);
			this.setActiveAccount(sessions[0]);
			return;
		}

		const selectedAccount = await this.quickInputService.pick(sessions.map(session => {
			return {
				id: session.id,
				label: session.accountName
			};
		}), { canPickMany: false });

		if (selectedAccount) {
			const selected = sessions.filter(account => selectedAccount.id === account.id)[0];
			this.logAuthenticatedEvent(selected);
			this.setActiveAccount(selected);
		}
	}

	private logAuthenticatedEvent(session: AuthenticationSession): void {
		type UserAuthenticatedClassification = {
			id: { classification: 'EndUserPseudonymizedInformation', purpose: 'BusinessInsight' };
		};

		type UserAuthenticatedEvent = {
			id: string;
		};

		const id = session.id.split('/')[1];
		this.telemetryService.publicLog2<UserAuthenticatedEvent, UserAuthenticatedClassification>('user.authenticated', { id });
	}

	get activeAccount(): AuthenticationSession | undefined {
		return this._activeAccount;
	}

	async setActiveAccount(account: AuthenticationSession | undefined) {
		this._activeAccount = account;

		if (account) {
			try {
				const token = await account.accessToken();
				this.userDataAuthTokenService.setToken(token);
				this.authenticationState.set(AuthStatus.SignedIn);
			} catch (e) {
				this.userDataAuthTokenService.setToken(undefined);
				this.authenticationState.set(AuthStatus.Unavailable);
			}
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
				this.setActiveAccount(matchingAccount);
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
			this.setActiveAccount(undefined);
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
	}

	private onDidChangeConflicts(conflicts: SyncSource[]) {
		this.updateBadge();
		if (conflicts.length) {
			this.conflictsSources.set(this.userDataSyncService.conflictsSources.join(','));

			// Clear and dispose conflicts those were cleared
			this.conflictsDisposables.forEach((disposable, conflictsSource) => {
				if (this.userDataSyncService.conflictsSources.indexOf(conflictsSource) === -1) {
					disposable.dispose();
					this.conflictsDisposables.delete(conflictsSource);
				}
			});

			for (const conflictsSource of this.userDataSyncService.conflictsSources) {
				const conflictsEditorInput = this.getConflictsEditorInput(conflictsSource);
				if (!conflictsEditorInput && !this.conflictsDisposables.has(conflictsSource)) {
					const conflictsArea = getSyncAreaLabel(conflictsSource);
					const handle = this.notificationService.prompt(Severity.Warning, localize('conflicts detected', "Unable to sync due to conflicts in {0}. Please resolve them to continue.", conflictsArea),
						[
							{
								label: localize('show conflicts', "Show Conflicts"),
								run: () => {
									this.telemetryService.publicLog2('sync/showConflicts');
									this.handleConflicts(conflictsSource);
								}
							}
						],
						{
							sticky: true
						}
					);
					this.conflictsDisposables.set(conflictsSource, toDisposable(() => {

						// close the conflicts warning notification
						handle.close();

						// close opened conflicts editor previews
						const conflictsEditorInput = this.getConflictsEditorInput(conflictsSource);
						if (conflictsEditorInput) {
							conflictsEditorInput.dispose();
						}

						this.conflictsDisposables.delete(conflictsSource);
					}));
				}
			}
		} else {
			this.conflictsSources.reset();
			this.getAllConflictsEditorInputs().forEach(input => input.dispose());
			this.conflictsDisposables.forEach(disposable => disposable.dispose());
			this.conflictsDisposables.clear();
		}
	}

	private onDidChangeEnablement(enabled: boolean) {
		this.syncEnablementContext.set(enabled);
		this.updateBadge();
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
			case UserDataSyncErrorCode.TooLarge:
				if (source === SyncSource.Keybindings || source === SyncSource.Settings) {
					const sourceArea = getSyncAreaLabel(source);
					this.notificationService.notify({
						severity: Severity.Error,
						message: localize('too large', "Disabled synchronizing {0} because size of the {1} file to sync is larger than {2}. Please open the file and reduce the size and enable sync", sourceArea, sourceArea, '100kb'),
						actions: {
							primary: [new Action('open sync file', localize('open file', "Show {0} file", sourceArea), undefined, true,
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

		if (this.userDataSyncService.status !== SyncStatus.Uninitialized && this.userDataSyncEnablementService.isEnabled() && this.authenticationState.get() === AuthStatus.SignedOut) {
			badge = new NumberBadge(1, () => localize('sign in to sync', "Sign in to Sync"));
		} else if (this.userDataSyncService.conflictsSources.length) {
			badge = new NumberBadge(this.userDataSyncService.conflictsSources.length, () => localize('has conflicts', "Sync: Conflicts Detected"));
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
			quickPick.selectedItems = items.filter(item => this.userDataSyncEnablementService.isResourceEnabled(item.id));
			disposables.add(Event.any(quickPick.onDidAccept, quickPick.onDidCustom)(async () => {
				if (quickPick.selectedItems.length) {
					this.updateConfiguration(items, quickPick.selectedItems);
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
		this.userDataSyncEnablementService.setEnablement(true);
	}

	private getConfigureSyncQuickPickItems(): ConfigureSyncQuickPickItem[] {
		return [{
			id: 'settings',
			label: getSyncAreaLabel(SyncSource.Settings)
		}, {
			id: 'keybindings',
			label: getSyncAreaLabel(SyncSource.Keybindings)
		}, {
			id: 'extensions',
			label: getSyncAreaLabel(SyncSource.Extensions)
		}, {
			id: 'globalState',
			label: getSyncAreaLabel(SyncSource.GlobalState),
			description: localize('ui state description', "only 'Display Language' for now")
		}];
	}

	private updateConfiguration(items: ConfigureSyncQuickPickItem[], selectedItems: ReadonlyArray<ConfigureSyncQuickPickItem>): void {
		for (const item of items) {
			const wasEnabled = this.userDataSyncEnablementService.isResourceEnabled(item.id);
			const isEnabled = !!selectedItems.filter(selected => selected.id === item.id)[0];
			if (wasEnabled !== isEnabled) {
				this.userDataSyncEnablementService.setResourceEnablement(item.id!, isEnabled);
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
			quickPick.ok = true;
			const items = this.getConfigureSyncQuickPickItems();
			quickPick.items = items;
			quickPick.selectedItems = items.filter(item => this.userDataSyncEnablementService.isResourceEnabled(item.id));
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
		const isFirstSyncWithMerge = await this.userDataSyncService.isFirstTimeSyncWithMerge();
		if (!isFirstSyncWithMerge) {
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

	private disableSync(source?: SyncSource): void {
		if (source === undefined) {
			this.userDataSyncEnablementService.setEnablement(false);
		} else {
			switch (source) {
				case SyncSource.Settings: return this.userDataSyncEnablementService.setResourceEnablement('settings', false);
				case SyncSource.Keybindings: return this.userDataSyncEnablementService.setResourceEnablement('keybindings', false);
				case SyncSource.Extensions: return this.userDataSyncEnablementService.setResourceEnablement('extensions', false);
				case SyncSource.GlobalState: return this.userDataSyncEnablementService.setResourceEnablement('globalState', false);
			}
		}
	}

	private async signIn(): Promise<void> {
		try {
			this.setActiveAccount(await this.authenticationService.login(this.userDataSyncStore!.authenticationProviderId, ['https://management.core.windows.net/.default', 'offline_access']));
		} catch (e) {
			this.notificationService.error(e);
			throw e;
		}
	}

	private async signOut(): Promise<void> {
		if (this.activeAccount) {
			await this.authenticationService.logout(this.userDataSyncStore!.authenticationProviderId, this.activeAccount.id);
			this.setActiveAccount(undefined);
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

	private async handleConflicts(source: SyncSource): Promise<void> {
		let previewResource: URI | undefined = undefined;
		let label: string = '';
		if (source === SyncSource.Settings) {
			previewResource = this.workbenchEnvironmentService.settingsSyncPreviewResource;
			label = localize('settings conflicts preview', "Settings Conflicts (Remote ↔ Local)");
		} else if (source === SyncSource.Keybindings) {
			previewResource = this.workbenchEnvironmentService.keybindingsSyncPreviewResource;
			label = localize('keybindings conflicts preview', "Keybindings Conflicts (Remote ↔ Local)");
		}
		if (previewResource) {
			const remoteContentResource = toRemoteContentResource(source);
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
		const turnOnSyncWhenContext = ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized), CONTEXT_SYNC_ENABLEMENT.toNegated(), CONTEXT_AUTH_TOKEN_STATE.notEqualsTo(AuthStatus.Initializing));
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
		const signInWhenContext = ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized), CONTEXT_SYNC_ENABLEMENT, CONTEXT_AUTH_TOKEN_STATE.isEqualTo(AuthStatus.SignedOut));
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
			when: ContextKeyExpr.and(CONTEXT_SYNC_ENABLEMENT, CONTEXT_AUTH_TOKEN_STATE.isEqualTo(AuthStatus.SignedIn), CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized), CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.HasConflicts))
		});
		MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
			command: {
				id: stopSyncCommandId,
				title: localize('stop sync', "Sync: Turn off Sync")
			},
			when: ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized), CONTEXT_SYNC_ENABLEMENT),
		});

		const resolveSettingsConflictsCommandId = 'workbench.userData.actions.resolveSettingsConflicts';
		const resolveSettingsConflictsWhenContext = ContextKeyRegexExpr.create(CONTEXT_CONFLICTS_SOURCES.keys()[0], /.*settings.*/i);
		CommandsRegistry.registerCommand(resolveSettingsConflictsCommandId, () => this.handleConflicts(SyncSource.Settings));
		MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
			group: '5_sync',
			command: {
				id: resolveSettingsConflictsCommandId,
				title: localize('resolveConflicts_global', "Sync: Show Settings Conflicts (1)"),
			},
			when: resolveSettingsConflictsWhenContext,
		});
		MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
			command: {
				id: resolveSettingsConflictsCommandId,
				title: localize('showConflicts', "Sync: Show Settings Conflicts"),
			},
			when: resolveSettingsConflictsWhenContext,
		});

		const resolveKeybindingsConflictsCommandId = 'workbench.userData.actions.resolveKeybindingsConflicts';
		const resolveKeybindingsConflictsWhenContext = ContextKeyRegexExpr.create(CONTEXT_CONFLICTS_SOURCES.keys()[0], /.*keybindings.*/i);
		CommandsRegistry.registerCommand(resolveKeybindingsConflictsCommandId, () => this.handleConflicts(SyncSource.Keybindings));
		MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
			group: '5_sync',
			command: {
				id: resolveKeybindingsConflictsCommandId,
				title: localize('resolveKeybindingsConflicts_global', "Sync: Show Keybindings Conflicts (1)"),
			},
			when: resolveKeybindingsConflictsWhenContext,
		});
		MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
			command: {
				id: resolveKeybindingsConflictsCommandId,
				title: localize('showKeybindingsConflicts', "Sync: Show Keybindings Conflicts"),
			},
			when: resolveKeybindingsConflictsWhenContext,
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
			when: ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized), CONTEXT_SYNC_ENABLEMENT),
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
			promise = this.userDataSyncService.getRemoteContent(SyncSource.Settings, true);
		}
		if (isEqual(uri, toRemoteContentResource(SyncSource.Keybindings))) {
			promise = this.userDataSyncService.getRemoteContent(SyncSource.Keybindings, true);
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

		if (getSyncSourceFromPreviewResource(model.uri, this.environmentService) !== undefined) {
			return true;
		}

		if (getSyncSourceFromRemoteContentResource(model.uri) !== undefined) {
			return this.configurationService.getValue<boolean>('diffEditor.renderSideBySide');
		}

		return false;
	}


	private createAcceptChangesWidgetRenderer(): void {
		if (!this.acceptChangesButton) {
			const isRemote = getSyncSourceFromRemoteContentResource(this.editor.getModel()!.uri) !== undefined;
			const acceptRemoteLabel = localize('accept remote', "Accept Remote");
			const acceptLocalLabel = localize('accept local', "Accept Local");
			this.acceptChangesButton = this.instantiationService.createInstance(FloatingClickWidget, this.editor, isRemote ? acceptRemoteLabel : acceptLocalLabel, null);
			this._register(this.acceptChangesButton.onClick(async () => {
				const model = this.editor.getModel();
				if (model) {
					const conflictsSource = (getSyncSourceFromPreviewResource(model.uri, this.environmentService) || getSyncSourceFromRemoteContentResource(model.uri))!;
					this.telemetryService.publicLog2<{ source: string, action: string }, SyncConflictsClassification>('sync/handleConflicts', { source: conflictsSource, action: isRemote ? 'acceptRemote' : 'acceptLocal' });
					const syncAreaLabel = getSyncAreaLabel(conflictsSource);
					const result = await this.dialogService.confirm({
						type: 'info',
						title: isRemote
							? localize('Sync accept remote', "Sync: {0}", acceptRemoteLabel)
							: localize('Sync accept local', "Sync: {0}", acceptLocalLabel),
						message: isRemote
							? localize('confirm replace and overwrite local', "Would you like to accept Remote {0} and replace Local {1}?", syncAreaLabel, syncAreaLabel)
							: localize('confirm replace and overwrite remote', "Would you like to accept Local {0} and replace Remote {1}?", syncAreaLabel, syncAreaLabel),
						primaryButton: isRemote ? acceptRemoteLabel : acceptLocalLabel
					});
					if (result.confirmed) {
						try {
							await this.userDataSyncService.accept(conflictsSource, model.getValue());
						} catch (e) {
							if (e instanceof UserDataSyncError && e.code === UserDataSyncErrorCode.LocalPreconditionFailed) {
								if (this.userDataSyncService.conflictsSources.indexOf(conflictsSource) !== -1) {
									this.notificationService.warn(localize('update conflicts', "Could not resolve conflicts as there is new local version available. Please try again."));
								}
							} else {
								this.notificationService.error(e);
							}
						}
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
