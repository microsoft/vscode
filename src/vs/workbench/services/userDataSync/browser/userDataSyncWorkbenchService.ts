/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUserDataSyncService, IAuthenticationProvider, isAuthenticationProvider, IUserDataAutoSyncService, IUserDataSyncStoreManagementService, SyncStatus, IUserDataSyncEnablementService, IUserDataSyncResource, IResourcePreview, USER_DATA_SYNC_SCHEME, USER_DATA_SYNC_LOG_ID, } from '../../../../platform/userDataSync/common/userDataSync.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IUserDataSyncWorkbenchService, IUserDataSyncAccount, AccountStatus, CONTEXT_SYNC_ENABLEMENT, CONTEXT_SYNC_STATE, CONTEXT_ACCOUNT_STATE, SHOW_SYNC_LOG_COMMAND_ID, CONTEXT_ENABLE_ACTIVITY_VIEWS, SYNC_VIEW_CONTAINER_ID, SYNC_TITLE, SYNC_CONFLICTS_VIEW_ID, CONTEXT_ENABLE_SYNC_CONFLICTS_VIEW, CONTEXT_HAS_CONFLICTS, IUserDataSyncConflictsView, getSyncAreaLabel } from '../common/userDataSync.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { getCurrentAuthenticationSessionInfo } from '../../authentication/browser/authenticationService.js';
import { AuthenticationSession, AuthenticationSessionsChangeEvent, IAuthenticationService } from '../../authentication/common/authentication.js';
import { IUserDataSyncAccountService } from '../../../../platform/userDataSync/common/userDataSyncAccount.js';
import { IQuickInputService, IQuickPickSeparator } from '../../../../platform/quickinput/common/quickInput.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IExtensionService } from '../../extensions/common/extensions.js';
import { localize } from '../../../../nls.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IDialogService, IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { URI } from '../../../../base/common/uri.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IViewsService } from '../../views/common/viewsService.js';
import { ILifecycleService } from '../../lifecycle/common/lifecycle.js';
import { isWeb } from '../../../../base/common/platform.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { UserDataSyncStoreClient } from '../../../../platform/userDataSync/common/userDataSyncStoreService.js';
import { UserDataSyncStoreTypeSynchronizer } from '../../../../platform/userDataSync/common/globalStateSync.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { raceCancellationError } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { IEditorService } from '../../editor/common/editorService.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { isDiffEditorInput } from '../../../common/editor.js';
import { IBrowserWorkbenchEnvironmentService } from '../../environment/browser/environmentService.js';
import { IUserDataInitializationService } from '../../userData/browser/userDataInit.js';
import { ISecretStorageService } from '../../../../platform/secrets/common/secrets.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { escapeRegExpCharacters } from '../../../../base/common/strings.js';
import { IUserDataSyncMachinesService } from '../../../../platform/userDataSync/common/userDataSyncMachines.js';
import { equals } from '../../../../base/common/arrays.js';

type AccountQuickPickItem = { label: string; authenticationProvider: IAuthenticationProvider; account?: UserDataSyncAccount; description?: string };

class UserDataSyncAccount implements IUserDataSyncAccount {

	constructor(readonly authenticationProviderId: string, private readonly session: AuthenticationSession) { }

	get sessionId(): string { return this.session.id; }
	get accountName(): string { return this.session.account.label; }
	get accountId(): string { return this.session.account.id; }
	get token(): string { return this.session.idToken || this.session.accessToken; }
}

type MergeEditorInput = { base: URI; input1: { uri: URI }; input2: { uri: URI }; result: URI };
export function isMergeEditorInput(editor: unknown): editor is MergeEditorInput {
	const candidate = editor as MergeEditorInput;
	return URI.isUri(candidate?.base) && URI.isUri(candidate?.input1?.uri) && URI.isUri(candidate?.input2?.uri) && URI.isUri(candidate?.result);
}

export class UserDataSyncWorkbenchService extends Disposable implements IUserDataSyncWorkbenchService {

	_serviceBrand: any;

	private static DONOT_USE_WORKBENCH_SESSION_STORAGE_KEY = 'userDataSyncAccount.donotUseWorkbenchSession';
	private static CACHED_AUTHENTICATION_PROVIDER_KEY = 'userDataSyncAccountProvider';
	private static CACHED_SESSION_STORAGE_KEY = 'userDataSyncAccountPreference';

	get enabled() { return !!this.userDataSyncStoreManagementService.userDataSyncStore; }

	private _authenticationProviders: IAuthenticationProvider[] = [];
	get authenticationProviders() { return this._authenticationProviders; }

	private _accountStatus: AccountStatus = AccountStatus.Uninitialized;
	get accountStatus(): AccountStatus { return this._accountStatus; }
	private readonly _onDidChangeAccountStatus = this._register(new Emitter<AccountStatus>());
	readonly onDidChangeAccountStatus = this._onDidChangeAccountStatus.event;

	private readonly _onDidTurnOnSync = this._register(new Emitter<void>());
	readonly onDidTurnOnSync = this._onDidTurnOnSync.event;

	private _current: UserDataSyncAccount | undefined;
	get current(): UserDataSyncAccount | undefined { return this._current; }

	private readonly syncEnablementContext: IContextKey<boolean>;
	private readonly syncStatusContext: IContextKey<string>;
	private readonly accountStatusContext: IContextKey<string>;
	private readonly enableConflictsViewContext: IContextKey<boolean>;
	private readonly hasConflicts: IContextKey<boolean>;
	private readonly activityViewsEnablementContext: IContextKey<boolean>;

	private turnOnSyncCancellationToken: CancellationTokenSource | undefined = undefined;

	constructor(
		@IUserDataSyncService private readonly userDataSyncService: IUserDataSyncService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IUserDataSyncAccountService private readonly userDataSyncAccountService: IUserDataSyncAccountService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IStorageService private readonly storageService: IStorageService,
		@IUserDataSyncEnablementService private readonly userDataSyncEnablementService: IUserDataSyncEnablementService,
		@IUserDataAutoSyncService private readonly userDataAutoSyncService: IUserDataAutoSyncService,
		@ILogService private readonly logService: ILogService,
		@IProductService private readonly productService: IProductService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IBrowserWorkbenchEnvironmentService private readonly environmentService: IBrowserWorkbenchEnvironmentService,
		@ISecretStorageService private readonly secretStorageService: ISecretStorageService,
		@INotificationService private readonly notificationService: INotificationService,
		@IProgressService private readonly progressService: IProgressService,
		@IDialogService private readonly dialogService: IDialogService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewsService private readonly viewsService: IViewsService,
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
		@IUserDataSyncStoreManagementService private readonly userDataSyncStoreManagementService: IUserDataSyncStoreManagementService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEditorService private readonly editorService: IEditorService,
		@IUserDataInitializationService private readonly userDataInitializationService: IUserDataInitializationService,
		@IFileService private readonly fileService: IFileService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IUserDataSyncMachinesService private readonly userDataSyncMachinesService: IUserDataSyncMachinesService,
	) {
		super();
		this.syncEnablementContext = CONTEXT_SYNC_ENABLEMENT.bindTo(contextKeyService);
		this.syncStatusContext = CONTEXT_SYNC_STATE.bindTo(contextKeyService);
		this.accountStatusContext = CONTEXT_ACCOUNT_STATE.bindTo(contextKeyService);
		this.activityViewsEnablementContext = CONTEXT_ENABLE_ACTIVITY_VIEWS.bindTo(contextKeyService);
		this.hasConflicts = CONTEXT_HAS_CONFLICTS.bindTo(contextKeyService);
		this.enableConflictsViewContext = CONTEXT_ENABLE_SYNC_CONFLICTS_VIEW.bindTo(contextKeyService);

		if (this.userDataSyncStoreManagementService.userDataSyncStore) {
			this.syncStatusContext.set(this.userDataSyncService.status);
			this._register(userDataSyncService.onDidChangeStatus(status => this.syncStatusContext.set(status)));
			this.syncEnablementContext.set(userDataSyncEnablementService.isEnabled());
			this._register(userDataSyncEnablementService.onDidChangeEnablement(enabled => this.syncEnablementContext.set(enabled)));

			this.waitAndInitialize();
		}
	}

	private updateAuthenticationProviders(): boolean {
		const oldValue = this._authenticationProviders;
		this._authenticationProviders = (this.userDataSyncStoreManagementService.userDataSyncStore?.authenticationProviders || []).filter(({ id }) => this.authenticationService.declaredProviders.some(provider => provider.id === id));
		this.logService.trace('Settings Sync: Authentication providers updated', this._authenticationProviders.map(({ id }) => id));
		return equals(oldValue, this._authenticationProviders, (a, b) => a.id === b.id);
	}

	private isSupportedAuthenticationProviderId(authenticationProviderId: string): boolean {
		return this.authenticationProviders.some(({ id }) => id === authenticationProviderId);
	}

	private async waitAndInitialize(): Promise<void> {
		try {
			/* wait */
			await Promise.all([this.extensionService.whenInstalledExtensionsRegistered(), this.userDataInitializationService.whenInitializationFinished()]);

			/* initialize */
			await this.initialize();
		} catch (error) {
			// Do not log if the current window is running extension tests
			if (!this.environmentService.extensionTestsLocationURI) {
				this.logService.error(error);
			}
		}
	}

	private async initialize(): Promise<void> {
		if (isWeb) {
			const authenticationSession = await getCurrentAuthenticationSessionInfo(this.secretStorageService, this.productService);
			if (this.currentSessionId === undefined && authenticationSession?.id) {
				if (this.environmentService.options?.settingsSyncOptions?.authenticationProvider && this.environmentService.options.settingsSyncOptions.enabled) {
					this.currentSessionId = authenticationSession.id;
				}

				// Backward compatibility
				else if (this.useWorkbenchSessionId) {
					this.currentSessionId = authenticationSession.id;
				}
				this.useWorkbenchSessionId = false;
			}
		}

		const initPromise = this.update('initialize');
		this._register(this.authenticationService.onDidChangeDeclaredProviders(() => {
			if (this.updateAuthenticationProviders()) {
				// Trigger update only after the initialization is done
				initPromise.finally(() => this.update('declared authentication providers changed'));
			}
		}));
		await initPromise;

		this._register(Event.filter(
			Event.any(
				this.authenticationService.onDidRegisterAuthenticationProvider,
				this.authenticationService.onDidUnregisterAuthenticationProvider,
			), info => this.isSupportedAuthenticationProviderId(info.id))(() => this.update('authentication provider change')));

		this._register(Event.filter(this.userDataSyncAccountService.onTokenFailed, isSuccessive => !isSuccessive)(() => this.update('token failure')));

		this._register(Event.filter(this.authenticationService.onDidChangeSessions, e => this.isSupportedAuthenticationProviderId(e.providerId))(({ event }) => this.onDidChangeSessions(event)));
		this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, UserDataSyncWorkbenchService.CACHED_SESSION_STORAGE_KEY, this._store)(() => this.onDidChangeStorage()));
		this._register(Event.filter(this.userDataSyncAccountService.onTokenFailed, bailout => bailout)(() => this.onDidAuthFailure()));
		this.hasConflicts.set(this.userDataSyncService.conflicts.length > 0);
		this._register(this.userDataSyncService.onDidChangeConflicts(conflicts => {
			this.hasConflicts.set(conflicts.length > 0);
			if (!conflicts.length) {
				this.enableConflictsViewContext.reset();
			}
			// Close merge editors with no conflicts
			this.editorService.editors.filter(input => {
				const remoteResource = isDiffEditorInput(input) ? input.original.resource : isMergeEditorInput(input) ? input.input1.uri : undefined;
				if (remoteResource?.scheme !== USER_DATA_SYNC_SCHEME) {
					return false;
				}
				return !this.userDataSyncService.conflicts.some(({ conflicts }) => conflicts.some(({ previewResource }) => this.uriIdentityService.extUri.isEqual(previewResource, input.resource)));
			}).forEach(input => input.dispose());
		}));
	}

	private async update(reason: string): Promise<void> {
		this.logService.trace(`Settings Sync: Updating due to ${reason}`);

		this.updateAuthenticationProviders();
		await this.updateCurrentAccount();

		if (this._current) {
			this.currentAuthenticationProviderId = this._current.authenticationProviderId;
		}

		await this.updateToken(this._current);
		this.updateAccountStatus(this._current ? AccountStatus.Available : AccountStatus.Unavailable);
	}

	private async updateCurrentAccount(): Promise<void> {
		this.logService.trace('Settings Sync: Updating the current account');
		const currentSessionId = this.currentSessionId;
		const currentAuthenticationProviderId = this.currentAuthenticationProviderId;
		if (currentSessionId) {
			const authenticationProviders = currentAuthenticationProviderId ? this.authenticationProviders.filter(({ id }) => id === currentAuthenticationProviderId) : this.authenticationProviders;
			for (const { id, scopes } of authenticationProviders) {
				const sessions = (await this.authenticationService.getSessions(id, scopes)) || [];
				for (const session of sessions) {
					if (session.id === currentSessionId) {
						this._current = new UserDataSyncAccount(id, session);
						this.logService.trace('Settings Sync: Updated the current account', this._current.accountName);
						return;
					}
				}
			}
		}
		this._current = undefined;
	}

	private async updateToken(current: UserDataSyncAccount | undefined): Promise<void> {
		let value: { token: string; authenticationProviderId: string } | undefined = undefined;
		if (current) {
			try {
				this.logService.trace('Settings Sync: Updating the token for the account', current.accountName);
				const token = current.token;
				this.traceOrInfo('Settings Sync: Token updated for the account', current.accountName);
				value = { token, authenticationProviderId: current.authenticationProviderId };
			} catch (e) {
				this.logService.error(e);
			}
		}
		await this.userDataSyncAccountService.updateAccount(value);
	}

	private traceOrInfo(msg: string, ...args: any[]): void {
		if (this.environmentService.isBuilt) {
			this.logService.info(msg, ...args);
		} else {
			this.logService.trace(msg, ...args);
		}
	}

	private updateAccountStatus(accountStatus: AccountStatus): void {
		this.logService.trace(`Settings Sync: Updating the account status to ${accountStatus}`);
		if (this._accountStatus !== accountStatus) {
			const previous = this._accountStatus;
			this.traceOrInfo(`Settings Sync: Account status changed from ${previous} to ${accountStatus}`);

			this._accountStatus = accountStatus;
			this.accountStatusContext.set(accountStatus);
			this._onDidChangeAccountStatus.fire(accountStatus);
		}
	}

	async turnOn(): Promise<void> {
		if (!this.authenticationProviders.length) {
			throw new Error(localize('no authentication providers', "Settings sync cannot be turned on because there are no authentication providers available."));
		}
		if (this.userDataSyncEnablementService.isEnabled()) {
			return;
		}
		if (this.userDataSyncService.status !== SyncStatus.Idle) {
			throw new Error('Cannot turn on sync while syncing');
		}

		const picked = await this.pick();
		if (!picked) {
			throw new CancellationError();
		}

		// User did not pick an account or login failed
		if (this.accountStatus !== AccountStatus.Available) {
			throw new Error(localize('no account', "No account available"));
		}

		const turnOnSyncCancellationToken = this.turnOnSyncCancellationToken = new CancellationTokenSource();
		const disposable = isWeb ? Disposable.None : this.lifecycleService.onBeforeShutdown(e => e.veto((async () => {
			const { confirmed } = await this.dialogService.confirm({
				type: 'warning',
				message: localize('sync in progress', "Settings Sync is being turned on. Would you like to cancel it?"),
				title: localize('settings sync', "Settings Sync"),
				primaryButton: localize({ key: 'yes', comment: ['&& denotes a mnemonic'] }, "&&Yes"),
				cancelButton: localize('no', "No")
			});
			if (confirmed) {
				turnOnSyncCancellationToken.cancel();
			}
			return !confirmed;
		})(), 'veto.settingsSync'));
		try {
			await this.doTurnOnSync(turnOnSyncCancellationToken.token);
		} finally {
			disposable.dispose();
			this.turnOnSyncCancellationToken = undefined;
		}
		await this.userDataAutoSyncService.turnOn();

		if (this.userDataSyncStoreManagementService.userDataSyncStore?.canSwitch) {
			await this.synchroniseUserDataSyncStoreType();
		}

		this.currentAuthenticationProviderId = this.current?.authenticationProviderId;
		if (this.environmentService.options?.settingsSyncOptions?.enablementHandler && this.currentAuthenticationProviderId) {
			this.environmentService.options.settingsSyncOptions.enablementHandler(true, this.currentAuthenticationProviderId);
		}

		this.notificationService.info(localize('sync turned on', "{0} is turned on", SYNC_TITLE.value));
		this._onDidTurnOnSync.fire();
	}

	async turnoff(everywhere: boolean): Promise<void> {
		if (this.userDataSyncEnablementService.isEnabled()) {
			await this.userDataAutoSyncService.turnOff(everywhere);
			if (this.environmentService.options?.settingsSyncOptions?.enablementHandler && this.currentAuthenticationProviderId) {
				this.environmentService.options.settingsSyncOptions.enablementHandler(false, this.currentAuthenticationProviderId);
			}
		}
		if (this.turnOnSyncCancellationToken) {
			this.turnOnSyncCancellationToken.cancel();
		}
	}

	async synchroniseUserDataSyncStoreType(): Promise<void> {
		if (!this.userDataSyncAccountService.account) {
			throw new Error('Cannot update because you are signed out from settings sync. Please sign in and try again.');
		}
		if (!isWeb || !this.userDataSyncStoreManagementService.userDataSyncStore) {
			// Not supported
			return;
		}

		const userDataSyncStoreUrl = this.userDataSyncStoreManagementService.userDataSyncStore.type === 'insiders' ? this.userDataSyncStoreManagementService.userDataSyncStore.stableUrl : this.userDataSyncStoreManagementService.userDataSyncStore.insidersUrl;
		const userDataSyncStoreClient = this.instantiationService.createInstance(UserDataSyncStoreClient, userDataSyncStoreUrl);
		userDataSyncStoreClient.setAuthToken(this.userDataSyncAccountService.account.token, this.userDataSyncAccountService.account.authenticationProviderId);
		await this.instantiationService.createInstance(UserDataSyncStoreTypeSynchronizer, userDataSyncStoreClient).sync(this.userDataSyncStoreManagementService.userDataSyncStore.type);
	}

	syncNow(): Promise<void> {
		return this.userDataAutoSyncService.triggerSync(['Sync Now'], { immediately: true, disableCache: true });
	}

	private async doTurnOnSync(token: CancellationToken): Promise<void> {
		const disposables = new DisposableStore();
		const manualSyncTask = await this.userDataSyncService.createManualSyncTask();
		try {
			await this.progressService.withProgress({
				location: ProgressLocation.Window,
				title: SYNC_TITLE.value,
				command: SHOW_SYNC_LOG_COMMAND_ID,
				delay: 500,
			}, async progress => {
				progress.report({ message: localize('turning on', "Turning on...") });
				disposables.add(this.userDataSyncService.onDidChangeStatus(status => {
					if (status === SyncStatus.HasConflicts) {
						progress.report({ message: localize('resolving conflicts', "Resolving conflicts...") });
					} else {
						progress.report({ message: localize('syncing...', "Turning on...") });
					}
				}));
				await manualSyncTask.merge();
				if (this.userDataSyncService.status === SyncStatus.HasConflicts) {
					await this.handleConflictsWhileTurningOn(token);
				}
				await manualSyncTask.apply();
			});
		} catch (error) {
			await manualSyncTask.stop();
			throw error;
		} finally {
			disposables.dispose();
		}
	}

	private async handleConflictsWhileTurningOn(token: CancellationToken): Promise<void> {
		const conflicts = this.userDataSyncService.conflicts;
		const andSeparator = localize('and', ' and ');
		let conflictsText = '';
		for (let i = 0; i < conflicts.length; i++) {
			if (i === conflicts.length - 1 && i !== 0) {
				conflictsText += andSeparator;
			} else if (i !== 0) {
				conflictsText += ', ';
			}
			conflictsText += getSyncAreaLabel(conflicts[i].syncResource);
		}
		const singleConflictResource = conflicts.length === 1 ? getSyncAreaLabel(conflicts[0].syncResource) : undefined;
		await this.dialogService.prompt({
			type: Severity.Warning,
			message: localize('conflicts detected', "Conflicts Detected in {0}", conflictsText),
			detail: localize('resolve', "Please resolve conflicts to turn on..."),
			buttons: [
				{
					label: localize({ key: 'show conflicts', comment: ['&& denotes a mnemonic'] }, "&&Show Conflicts"),
					run: async () => {
						const waitUntilConflictsAreResolvedPromise = raceCancellationError(Event.toPromise(Event.filter(this.userDataSyncService.onDidChangeConflicts, conficts => conficts.length === 0)), token);
						await this.showConflicts(this.userDataSyncService.conflicts[0]?.conflicts[0]);
						await waitUntilConflictsAreResolvedPromise;
					}
				},
				{
					label: singleConflictResource ? localize({ key: 'replace local single', comment: ['&& denotes a mnemonic'] }, "Accept &&Remote {0}", singleConflictResource) : localize({ key: 'replace local', comment: ['&& denotes a mnemonic'] }, "Accept &&Remote"),
					run: async () => this.replace(true)
				},
				{
					label: singleConflictResource ? localize({ key: 'replace remote single', comment: ['&& denotes a mnemonic'] }, "Accept &&Local {0}", singleConflictResource) : localize({ key: 'replace remote', comment: ['&& denotes a mnemonic'] }, "Accept &&Local"),
					run: () => this.replace(false)
				},
			],
			cancelButton: {
				run: () => {
					throw new CancellationError();
				}
			}
		});
	}

	private async replace(local: boolean): Promise<void> {
		for (const conflict of this.userDataSyncService.conflicts) {
			for (const preview of conflict.conflicts) {
				await this.accept({ syncResource: conflict.syncResource, profile: conflict.profile }, local ? preview.remoteResource : preview.localResource, undefined, { force: true });
			}
		}
	}

	async accept(resource: IUserDataSyncResource, conflictResource: URI, content: string | null | undefined, apply: boolean | { force: boolean }): Promise<void> {
		return this.userDataSyncService.accept(resource, conflictResource, content, apply);
	}

	async showConflicts(conflictToOpen?: IResourcePreview): Promise<void> {
		if (!this.userDataSyncService.conflicts.length) {
			return;
		}
		this.enableConflictsViewContext.set(true);
		const view = await this.viewsService.openView<IUserDataSyncConflictsView>(SYNC_CONFLICTS_VIEW_ID);
		if (view && conflictToOpen) {
			await view.open(conflictToOpen);
		}
	}

	async resetSyncedData(): Promise<void> {
		const { confirmed } = await this.dialogService.confirm({
			type: 'info',
			message: localize('reset', "This will clear your data in the cloud and stop sync on all your devices."),
			title: localize('reset title', "Clear"),
			primaryButton: localize({ key: 'resetButton', comment: ['&& denotes a mnemonic'] }, "&&Reset"),
		});
		if (confirmed) {
			await this.userDataSyncService.resetRemote();
		}
	}

	async getAllLogResources(): Promise<URI[]> {
		const logsFolders: URI[] = [];
		const stat = await this.fileService.resolve(this.uriIdentityService.extUri.dirname(this.environmentService.logsHome));
		if (stat.children) {
			logsFolders.push(...stat.children
				.filter(stat => stat.isDirectory && /^\d{8}T\d{6}$/.test(stat.name))
				.sort()
				.reverse()
				.map(d => d.resource));
		}
		const result: URI[] = [];
		for (const logFolder of logsFolders) {
			const folderStat = await this.fileService.resolve(logFolder);
			const childStat = folderStat.children?.find(stat => this.uriIdentityService.extUri.basename(stat.resource).startsWith(`${USER_DATA_SYNC_LOG_ID}.`));
			if (childStat) {
				result.push(childStat.resource);
			}
		}
		return result;
	}

	async showSyncActivity(): Promise<void> {
		this.activityViewsEnablementContext.set(true);
		await this.waitForActiveSyncViews();
		await this.viewsService.openViewContainer(SYNC_VIEW_CONTAINER_ID);
	}

	async downloadSyncActivity(): Promise<URI | undefined> {
		const result = await this.fileDialogService.showOpenDialog({
			title: localize('download sync activity dialog title', "Select folder to download Settings Sync activity"),
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: false,
			openLabel: localize('download sync activity dialog open label', "Save"),
		});

		if (!result?.[0]) {
			return;
		}

		return this.progressService.withProgress({ location: ProgressLocation.Window }, async () => {
			const machines = await this.userDataSyncMachinesService.getMachines();
			const currentMachine = machines.find(m => m.isCurrent);
			const name = (currentMachine ? currentMachine.name + ' - ' : '') + 'Settings Sync Activity';
			const stat = await this.fileService.resolve(result[0]);

			const nameRegEx = new RegExp(`${escapeRegExpCharacters(name)}\\s(\\d+)`);
			const indexes: number[] = [];
			for (const child of stat.children ?? []) {
				if (child.name === name) {
					indexes.push(0);
				} else {
					const matches = nameRegEx.exec(child.name);
					if (matches) {
						indexes.push(parseInt(matches[1]));
					}
				}
			}
			indexes.sort((a, b) => a - b);

			const folder = this.uriIdentityService.extUri.joinPath(result[0], indexes[0] !== 0 ? name : `${name} ${indexes[indexes.length - 1] + 1}`);
			await Promise.all([
				this.userDataSyncService.saveRemoteActivityData(this.uriIdentityService.extUri.joinPath(folder, 'remoteActivity.json')),
				(async () => {
					const logResources = await this.getAllLogResources();
					await Promise.all(logResources.map(async logResource => this.fileService.copy(logResource, this.uriIdentityService.extUri.joinPath(folder, 'logs', `${this.uriIdentityService.extUri.basename(this.uriIdentityService.extUri.dirname(logResource))}.log`))));
				})(),
				this.fileService.copy(this.environmentService.userDataSyncHome, this.uriIdentityService.extUri.joinPath(folder, 'localActivity')),
			]);
			return folder;
		});
	}

	private async waitForActiveSyncViews(): Promise<void> {
		const viewContainer = this.viewDescriptorService.getViewContainerById(SYNC_VIEW_CONTAINER_ID);
		if (viewContainer) {
			const model = this.viewDescriptorService.getViewContainerModel(viewContainer);
			if (!model.activeViewDescriptors.length) {
				await Event.toPromise(Event.filter(model.onDidChangeActiveViewDescriptors, e => model.activeViewDescriptors.length > 0));
			}
		}
	}

	async signIn(): Promise<void> {
		const currentAuthenticationProviderId = this.currentAuthenticationProviderId;
		const authenticationProvider = currentAuthenticationProviderId ? this.authenticationProviders.find(p => p.id === currentAuthenticationProviderId) : undefined;
		if (authenticationProvider) {
			await this.doSignIn(authenticationProvider);
		} else {
			if (!this.authenticationProviders.length) {
				throw new Error(localize('no authentication providers during signin', "Cannot sign in because there are no authentication providers available."));
			}
			await this.pick();
		}
	}

	private async pick(): Promise<boolean> {
		const result = await this.doPick();
		if (!result) {
			return false;
		}
		await this.doSignIn(result);
		return true;
	}

	private async doPick(): Promise<UserDataSyncAccount | IAuthenticationProvider | undefined> {
		if (this.authenticationProviders.length === 0) {
			return undefined;
		}

		const authenticationProviders = [...this.authenticationProviders].sort(({ id }) => id === this.currentAuthenticationProviderId ? -1 : 1);
		const allAccounts = new Map<string, UserDataSyncAccount[]>();

		if (authenticationProviders.length === 1) {
			const accounts = await this.getAccounts(authenticationProviders[0].id, authenticationProviders[0].scopes);
			if (accounts.length) {
				allAccounts.set(authenticationProviders[0].id, accounts);
			} else {
				// Single auth provider and no accounts
				return authenticationProviders[0];
			}
		}

		let result: UserDataSyncAccount | IAuthenticationProvider | undefined;
		const disposables: DisposableStore = new DisposableStore();
		const quickPick = disposables.add(this.quickInputService.createQuickPick<AccountQuickPickItem>({ useSeparators: true }));

		const promise = new Promise<UserDataSyncAccount | IAuthenticationProvider | undefined>(c => {
			disposables.add(quickPick.onDidHide(() => {
				disposables.dispose();
				c(result);
			}));
		});

		quickPick.title = SYNC_TITLE.value;
		quickPick.ok = false;
		quickPick.ignoreFocusOut = true;
		quickPick.placeholder = localize('choose account placeholder', "Select an account to sign in");
		quickPick.show();

		if (authenticationProviders.length > 1) {
			quickPick.busy = true;
			for (const { id, scopes } of authenticationProviders) {
				const accounts = await this.getAccounts(id, scopes);
				if (accounts.length) {
					allAccounts.set(id, accounts);
				}
			}
			quickPick.busy = false;
		}

		quickPick.items = this.createQuickpickItems(authenticationProviders, allAccounts);
		disposables.add(quickPick.onDidAccept(() => {
			result = quickPick.selectedItems[0]?.account ? quickPick.selectedItems[0]?.account : quickPick.selectedItems[0]?.authenticationProvider;
			quickPick.hide();
		}));

		return promise;
	}

	private async getAccounts(authenticationProviderId: string, scopes: string[]): Promise<UserDataSyncAccount[]> {
		const accounts: Map<string, UserDataSyncAccount> = new Map<string, UserDataSyncAccount>();
		let currentAccount: UserDataSyncAccount | null = null;

		const sessions = await this.authenticationService.getSessions(authenticationProviderId, scopes) || [];
		for (const session of sessions) {
			const account: UserDataSyncAccount = new UserDataSyncAccount(authenticationProviderId, session);
			accounts.set(account.accountId, account);
			if (account.sessionId === this.currentSessionId) {
				currentAccount = account;
			}
		}

		if (currentAccount) {
			// Always use current account if available
			accounts.set(currentAccount.accountId, currentAccount);
		}

		return currentAccount ? [...accounts.values()] : [...accounts.values()].sort(({ sessionId }) => sessionId === this.currentSessionId ? -1 : 1);
	}

	private createQuickpickItems(authenticationProviders: IAuthenticationProvider[], allAccounts: Map<string, UserDataSyncAccount[]>): (AccountQuickPickItem | IQuickPickSeparator)[] {
		const quickPickItems: (AccountQuickPickItem | IQuickPickSeparator)[] = [];

		// Signed in Accounts
		if (allAccounts.size) {
			quickPickItems.push({ type: 'separator', label: localize('signed in', "Signed in") });
			for (const authenticationProvider of authenticationProviders) {
				const accounts = (allAccounts.get(authenticationProvider.id) || []).sort(({ sessionId }) => sessionId === this.currentSessionId ? -1 : 1);
				const providerName = this.authenticationService.getProvider(authenticationProvider.id).label;
				for (const account of accounts) {
					quickPickItems.push({
						label: `${account.accountName} (${providerName})`,
						description: account.sessionId === this.current?.sessionId ? localize('last used', "Last Used with Sync") : undefined,
						account,
						authenticationProvider,
					});
				}
			}
			quickPickItems.push({ type: 'separator', label: localize('others', "Others") });
		}

		// Account Providers
		for (const authenticationProvider of authenticationProviders) {
			const provider = this.authenticationService.getProvider(authenticationProvider.id);
			if (!allAccounts.has(authenticationProvider.id) || provider.supportsMultipleAccounts) {
				const providerName = provider.label;
				quickPickItems.push({ label: localize('sign in using account', "Sign in with {0}", providerName), authenticationProvider });
			}
		}

		return quickPickItems;
	}

	private async doSignIn(accountOrAuthProvider: UserDataSyncAccount | IAuthenticationProvider): Promise<void> {
		let sessionId: string;
		if (isAuthenticationProvider(accountOrAuthProvider)) {
			if (this.environmentService.options?.settingsSyncOptions?.authenticationProvider?.id === accountOrAuthProvider.id) {
				sessionId = await this.environmentService.options?.settingsSyncOptions?.authenticationProvider?.signIn();
			} else {
				sessionId = (await this.authenticationService.createSession(accountOrAuthProvider.id, accountOrAuthProvider.scopes)).id;
			}
			this.currentAuthenticationProviderId = accountOrAuthProvider.id;
		} else {
			if (this.environmentService.options?.settingsSyncOptions?.authenticationProvider?.id === accountOrAuthProvider.authenticationProviderId) {
				sessionId = await this.environmentService.options?.settingsSyncOptions?.authenticationProvider?.signIn();
			} else {
				sessionId = accountOrAuthProvider.sessionId;
			}
			this.currentAuthenticationProviderId = accountOrAuthProvider.authenticationProviderId;
		}
		this.currentSessionId = sessionId;
		await this.update('sign in');
	}

	private async onDidAuthFailure(): Promise<void> {
		this.currentSessionId = undefined;
		await this.update('auth failure');
	}

	private onDidChangeSessions(e: AuthenticationSessionsChangeEvent): void {
		if (this.currentSessionId && e.removed?.find(session => session.id === this.currentSessionId)) {
			this.currentSessionId = undefined;
		}
		this.update('change in sessions');
	}

	private onDidChangeStorage(): void {
		if (this.currentSessionId !== this.getStoredCachedSessionId() /* This checks if current window changed the value or not */) {
			this._cachedCurrentSessionId = null;
			this.update('change in storage');
		}
	}

	private _cachedCurrentAuthenticationProviderId: string | undefined | null = null;
	private get currentAuthenticationProviderId(): string | undefined {
		if (this._cachedCurrentAuthenticationProviderId === null) {
			this._cachedCurrentAuthenticationProviderId = this.storageService.get(UserDataSyncWorkbenchService.CACHED_AUTHENTICATION_PROVIDER_KEY, StorageScope.APPLICATION);
		}
		return this._cachedCurrentAuthenticationProviderId;
	}

	private set currentAuthenticationProviderId(currentAuthenticationProviderId: string | undefined) {
		if (this._cachedCurrentAuthenticationProviderId !== currentAuthenticationProviderId) {
			this._cachedCurrentAuthenticationProviderId = currentAuthenticationProviderId;
			if (currentAuthenticationProviderId === undefined) {
				this.storageService.remove(UserDataSyncWorkbenchService.CACHED_AUTHENTICATION_PROVIDER_KEY, StorageScope.APPLICATION);
			} else {
				this.storageService.store(UserDataSyncWorkbenchService.CACHED_AUTHENTICATION_PROVIDER_KEY, currentAuthenticationProviderId, StorageScope.APPLICATION, StorageTarget.MACHINE);
			}
		}
	}

	private _cachedCurrentSessionId: string | undefined | null = null;
	private get currentSessionId(): string | undefined {
		if (this._cachedCurrentSessionId === null) {
			this._cachedCurrentSessionId = this.getStoredCachedSessionId();
		}
		return this._cachedCurrentSessionId;
	}

	private set currentSessionId(cachedSessionId: string | undefined) {
		if (this._cachedCurrentSessionId !== cachedSessionId) {
			this._cachedCurrentSessionId = cachedSessionId;
			if (cachedSessionId === undefined) {
				this.logService.info('Settings Sync: Reset current session');
				this.storageService.remove(UserDataSyncWorkbenchService.CACHED_SESSION_STORAGE_KEY, StorageScope.APPLICATION);
			} else {
				this.logService.info('Settings Sync: Updated current session', cachedSessionId);
				this.storageService.store(UserDataSyncWorkbenchService.CACHED_SESSION_STORAGE_KEY, cachedSessionId, StorageScope.APPLICATION, StorageTarget.MACHINE);
			}
		}
	}

	private getStoredCachedSessionId(): string | undefined {
		return this.storageService.get(UserDataSyncWorkbenchService.CACHED_SESSION_STORAGE_KEY, StorageScope.APPLICATION);
	}

	private get useWorkbenchSessionId(): boolean {
		return !this.storageService.getBoolean(UserDataSyncWorkbenchService.DONOT_USE_WORKBENCH_SESSION_STORAGE_KEY, StorageScope.APPLICATION, false);
	}

	private set useWorkbenchSessionId(useWorkbenchSession: boolean) {
		this.storageService.store(UserDataSyncWorkbenchService.DONOT_USE_WORKBENCH_SESSION_STORAGE_KEY, !useWorkbenchSession, StorageScope.APPLICATION, StorageTarget.MACHINE);
	}

}

registerSingleton(IUserDataSyncWorkbenchService, UserDataSyncWorkbenchService, InstantiationType.Eager /* Eager because it initializes settings sync accounts */);
