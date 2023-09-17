/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { Action2, MenuId, MenuRegistry, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr, IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { IProductService } from 'vs/platform/product/common/productService';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { createSyncHeaders, IAuthenticationProvider, IResourceRefHandle } from 'vs/platform/userDataSync/common/userDataSync';
import { AuthenticationSession, AuthenticationSessionsChangeEvent, IAuthenticationService } from 'vs/workbench/services/authentication/common/authentication';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { EDIT_SESSIONS_SIGNED_IN, EditSession, EDIT_SESSION_SYNC_CATEGORY, IEditSessionsStorageService, EDIT_SESSIONS_SIGNED_IN_KEY, IEditSessionsLogService, SyncResource, EDIT_SESSIONS_PENDING_KEY } from 'vs/workbench/contrib/editSessions/common/editSessions';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { generateUuid } from 'vs/base/common/uuid';
import { ICredentialsService } from 'vs/platform/credentials/common/credentials';
import { getCurrentAuthenticationSessionInfo } from 'vs/workbench/services/authentication/browser/authenticationService';
import { isWeb } from 'vs/base/common/platform';
import { IUserDataSyncMachinesService, UserDataSyncMachinesService } from 'vs/platform/userDataSync/common/userDataSyncMachines';
import { Emitter } from 'vs/base/common/event';
import { CancellationError } from 'vs/base/common/errors';
import { EditSessionsStoreClient } from 'vs/workbench/contrib/editSessions/common/editSessionsStorageClient';
import { ISecretStorageService } from 'vs/platform/secrets/common/secrets';

type ExistingSession = IQuickPickItem & { session: AuthenticationSession & { providerId: string } };
type AuthenticationProviderOption = IQuickPickItem & { provider: IAuthenticationProvider };

export class EditSessionsWorkbenchService extends Disposable implements IEditSessionsStorageService {

	declare _serviceBrand: undefined;

	public readonly SIZE_LIMIT = Math.floor(1024 * 1024 * 1.9); // 2 MB

	private serverConfiguration = this.productService['editSessions.store'];
	private machineClient: IUserDataSyncMachinesService | undefined;

	private authenticationInfo: { sessionId: string; token: string; providerId: string } | undefined;
	private static CACHED_SESSION_STORAGE_KEY = 'editSessionAccountPreference';

	private initialized = false;
	private readonly signedInContext: IContextKey<boolean>;

	get isSignedIn() {
		return this.existingSessionId !== undefined;
	}

	private _didSignIn = new Emitter<void>();
	get onDidSignIn() {
		return this._didSignIn.event;
	}

	private _didSignOut = new Emitter<void>();
	get onDidSignOut() {
		return this._didSignOut.event;
	}

	private _lastWrittenResources = new Map<SyncResource, { ref: string; content: string }>();
	get lastWrittenResources() {
		return this._lastWrittenResources;
	}

	private _lastReadResources = new Map<SyncResource, { ref: string; content: string }>();
	get lastReadResources() {
		return this._lastReadResources;
	}

	storeClient: EditSessionsStoreClient | undefined; // TODO@joyceerhl lifecycle hack

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IStorageService private readonly storageService: IStorageService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IEditSessionsLogService private readonly logService: IEditSessionsLogService,
		@IProductService private readonly productService: IProductService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IDialogService private readonly dialogService: IDialogService,
		@ISecretStorageService private readonly secretStorageService: ISecretStorageService,
		@ICredentialsService private readonly credentialsService: ICredentialsService
	) {
		super();

		// If the user signs out of the current session, reset our cached auth state in memory and on disk
		this._register(this.authenticationService.onDidChangeSessions((e) => this.onDidChangeSessions(e.event)));

		// If another window changes the preferred session storage, reset our cached auth state in memory
		this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, EditSessionsWorkbenchService.CACHED_SESSION_STORAGE_KEY, this._register(new DisposableStore()))(() => this.onDidChangeStorage()));

		this.registerSignInAction();
		this.registerResetAuthenticationAction();

		this.signedInContext = EDIT_SESSIONS_SIGNED_IN.bindTo(this.contextKeyService);
		this.signedInContext.set(this.existingSessionId !== undefined);
	}

	/**
	 * @param resource: The resource to retrieve content for.
	 * @param content An object representing resource state to be restored.
	 * @returns The ref of the stored state.
	 */
	async write(resource: SyncResource, content: string | EditSession): Promise<string> {
		await this.initialize('write', false);
		if (!this.initialized) {
			throw new Error('Please sign in to store your edit session.');
		}

		if (typeof content !== 'string' && content.machine === undefined) {
			content.machine = await this.getOrCreateCurrentMachineId();
		}

		content = typeof content === 'string' ? content : JSON.stringify(content);
		const ref = await this.storeClient!.writeResource(resource, content, null, undefined, createSyncHeaders(generateUuid()));

		this._lastWrittenResources.set(resource, { ref, content });

		return ref;
	}

	/**
	 * @param resource: The resource to retrieve content for.
	 * @param ref: A specific content ref to retrieve content for, if it exists.
	 * If undefined, this method will return the latest saved edit session, if any.
	 *
	 * @returns An object representing the requested or latest state, if any.
	 */
	async read(resource: SyncResource, ref: string | undefined): Promise<{ ref: string; content: string } | undefined> {
		await this.initialize('read', false);
		if (!this.initialized) {
			throw new Error('Please sign in to apply your latest edit session.');
		}

		let content: string | undefined | null;
		const headers = createSyncHeaders(generateUuid());
		try {
			if (ref !== undefined) {
				content = await this.storeClient?.resolveResourceContent(resource, ref, undefined, headers);
			} else {
				const result = await this.storeClient?.readResource(resource, null, undefined, headers);
				content = result?.content;
				ref = result?.ref;
			}
		} catch (ex) {
			this.logService.error(ex);
		}

		// TODO@joyceerhl Validate session data, check schema version
		if (content !== undefined && content !== null && ref !== undefined) {
			this._lastReadResources.set(resource, { ref, content });
			return { ref, content };
		}
		return undefined;
	}

	async delete(resource: SyncResource, ref: string | null) {
		await this.initialize('write', false);
		if (!this.initialized) {
			throw new Error(`Unable to delete edit session with ref ${ref}.`);
		}

		try {
			await this.storeClient?.deleteResource(resource, ref);
		} catch (ex) {
			this.logService.error(ex);
		}
	}

	async list(resource: SyncResource): Promise<IResourceRefHandle[]> {
		await this.initialize('read', false);
		if (!this.initialized) {
			throw new Error(`Unable to list edit sessions.`);
		}

		try {
			return this.storeClient?.getAllResourceRefs(resource) ?? [];
		} catch (ex) {
			this.logService.error(ex);
		}

		return [];
	}

	public async initialize(reason: 'read' | 'write', silent: boolean = false) {
		if (this.initialized) {
			return true;
		}
		this.initialized = await this.doInitialize(reason, silent);
		this.signedInContext.set(this.initialized);
		if (this.initialized) {
			this._didSignIn.fire();
		}
		return this.initialized;

	}

	/**
	 *
	 * Ensures that the store client is initialized,
	 * meaning that authentication is configured and it
	 * can be used to communicate with the remote storage service
	 */
	private async doInitialize(reason: 'read' | 'write', silent: boolean): Promise<boolean> {
		// Wait for authentication extensions to be registered
		await this.extensionService.whenInstalledExtensionsRegistered();

		if (!this.serverConfiguration?.url) {
			throw new Error('Unable to initialize sessions sync as session sync preference is not configured in product.json.');
		}

		if (this.storeClient === undefined) {
			return false;
		}

		this._register(this.storeClient.onTokenFailed(() => {
			this.logService.info('Clearing edit sessions authentication preference because of successive token failures.');
			this.clearAuthenticationPreference();
		}));

		if (this.machineClient === undefined) {
			this.machineClient = new UserDataSyncMachinesService(this.environmentService, this.fileService, this.storageService, this.storeClient!, this.logService, this.productService);
		}

		// If we already have an existing auth session in memory, use that
		if (this.authenticationInfo !== undefined) {
			return true;
		}

		const authenticationSession = await this.getAuthenticationSession(reason, silent);
		if (authenticationSession !== undefined) {
			this.authenticationInfo = authenticationSession;
			this.storeClient.setAuthToken(authenticationSession.token, authenticationSession.providerId);
		}

		return authenticationSession !== undefined;
	}

	private cachedMachines: Map<string, string> | undefined;

	async getMachineById(machineId: string) {
		await this.initialize('read', false);

		if (!this.cachedMachines) {
			const machines = await this.machineClient!.getMachines();
			this.cachedMachines = machines.reduce((map, machine) => map.set(machine.id, machine.name), new Map<string, string>());
		}

		return this.cachedMachines.get(machineId);
	}

	private async getOrCreateCurrentMachineId(): Promise<string> {
		const currentMachineId = await this.machineClient!.getMachines().then((machines) => machines.find((m) => m.isCurrent)?.id);

		if (currentMachineId === undefined) {
			await this.machineClient!.addCurrentMachine();
			return await this.machineClient!.getMachines().then((machines) => machines.find((m) => m.isCurrent)!.id);
		}

		return currentMachineId;
	}

	private async getAuthenticationSession(reason: 'read' | 'write', silent: boolean) {
		// If the user signed in previously and the session is still available, reuse that without prompting the user again
		if (this.existingSessionId) {
			this.logService.info(`Searching for existing authentication session with ID ${this.existingSessionId}`);
			const existingSession = await this.getExistingSession();
			if (existingSession) {
				this.logService.info(`Found existing authentication session with ID ${existingSession.session.id}`);
				return { sessionId: existingSession.session.id, token: existingSession.session.idToken ?? existingSession.session.accessToken, providerId: existingSession.session.providerId };
			} else {
				this._didSignOut.fire();
			}
		}

		// If settings sync is already enabled, avoid asking again to authenticate
		if (this.shouldAttemptEditSessionInit()) {
			this.logService.info(`Reusing user data sync enablement`);
			const authenticationSessionInfo = await getCurrentAuthenticationSessionInfo(this.credentialsService, this.secretStorageService, this.productService);
			if (authenticationSessionInfo !== undefined) {
				this.logService.info(`Using current authentication session with ID ${authenticationSessionInfo.id}`);
				this.existingSessionId = authenticationSessionInfo.id;
				return { sessionId: authenticationSessionInfo.id, token: authenticationSessionInfo.accessToken, providerId: authenticationSessionInfo.providerId };
			}
		}

		// If we aren't supposed to prompt the user because
		// we're in a silent flow, just return here
		if (silent) {
			return;
		}

		// Ask the user to pick a preferred account
		const authenticationSession = await this.getAccountPreference(reason);
		if (authenticationSession !== undefined) {
			this.existingSessionId = authenticationSession.id;
			return { sessionId: authenticationSession.id, token: authenticationSession.idToken ?? authenticationSession.accessToken, providerId: authenticationSession.providerId };
		}

		return undefined;
	}

	private shouldAttemptEditSessionInit(): boolean {
		return isWeb && this.storageService.isNew(StorageScope.APPLICATION) && this.storageService.isNew(StorageScope.WORKSPACE);
	}

	/**
	 *
	 * Prompts the user to pick an authentication option for storing and getting edit sessions.
	 */
	private async getAccountPreference(reason: 'read' | 'write'): Promise<AuthenticationSession & { providerId: string } | undefined> {
		const quickpick = this.quickInputService.createQuickPick<ExistingSession | AuthenticationProviderOption | IQuickPickItem>();
		quickpick.ok = false;
		quickpick.placeholder = reason === 'read' ? localize('choose account read placeholder', "Select an account to restore your working changes from the cloud") : localize('choose account placeholder', "Select an account to store your working changes in the cloud");
		quickpick.ignoreFocusOut = true;
		quickpick.items = await this.createQuickpickItems();

		return new Promise((resolve, reject) => {
			quickpick.onDidHide((e) => {
				reject(new CancellationError());
				quickpick.dispose();
			});

			quickpick.onDidAccept(async (e) => {
				const selection = quickpick.selectedItems[0];
				const session = 'provider' in selection ? { ...await this.authenticationService.createSession(selection.provider.id, selection.provider.scopes), providerId: selection.provider.id } : ('session' in selection ? selection.session : undefined);
				resolve(session);
				quickpick.hide();
			});

			quickpick.show();
		});
	}

	private async createQuickpickItems(): Promise<(ExistingSession | AuthenticationProviderOption | IQuickPickSeparator | IQuickPickItem & { canceledAuthentication: boolean })[]> {
		const options: (ExistingSession | AuthenticationProviderOption | IQuickPickSeparator | IQuickPickItem & { canceledAuthentication: boolean })[] = [];

		options.push({ type: 'separator', label: localize('signed in', "Signed In") });

		const sessions = await this.getAllSessions();
		options.push(...sessions);

		options.push({ type: 'separator', label: localize('others', "Others") });

		for (const authenticationProvider of (await this.getAuthenticationProviders())) {
			const signedInForProvider = sessions.some(account => account.session.providerId === authenticationProvider.id);
			if (!signedInForProvider || this.authenticationService.supportsMultipleAccounts(authenticationProvider.id)) {
				const providerName = this.authenticationService.getLabel(authenticationProvider.id);
				options.push({ label: localize('sign in using account', "Sign in with {0}", providerName), provider: authenticationProvider });
			}
		}

		return options;
	}

	/**
	 *
	 * Returns all authentication sessions available from {@link getAuthenticationProviders}.
	 */
	private async getAllSessions() {
		const authenticationProviders = await this.getAuthenticationProviders();
		const accounts = new Map<string, ExistingSession>();
		let currentSession: ExistingSession | undefined;

		for (const provider of authenticationProviders) {
			const sessions = await this.authenticationService.getSessions(provider.id, provider.scopes);

			for (const session of sessions) {
				const item = {
					label: session.account.label,
					description: this.authenticationService.getLabel(provider.id),
					session: { ...session, providerId: provider.id }
				};
				accounts.set(item.session.account.id, item);
				if (this.existingSessionId === session.id) {
					currentSession = item;
				}
			}
		}

		if (currentSession !== undefined) {
			accounts.set(currentSession.session.account.id, currentSession);
		}

		return [...accounts.values()].sort((a, b) => a.label.localeCompare(b.label));
	}

	/**
	 *
	 * Returns all authentication providers which can be used to authenticate
	 * to the remote storage service, based on product.json configuration
	 * and registered authentication providers.
	 */
	private async getAuthenticationProviders() {
		if (!this.serverConfiguration) {
			throw new Error('Unable to get configured authentication providers as session sync preference is not configured in product.json.');
		}

		// Get the list of authentication providers configured in product.json
		const authenticationProviders = this.serverConfiguration.authenticationProviders;
		const configuredAuthenticationProviders = Object.keys(authenticationProviders).reduce<IAuthenticationProvider[]>((result, id) => {
			result.push({ id, scopes: authenticationProviders[id].scopes });
			return result;
		}, []);

		// Filter out anything that isn't currently available through the authenticationService
		const availableAuthenticationProviders = this.authenticationService.declaredProviders;

		return configuredAuthenticationProviders.filter(({ id }) => availableAuthenticationProviders.some(provider => provider.id === id));
	}

	private get existingSessionId() {
		return this.storageService.get(EditSessionsWorkbenchService.CACHED_SESSION_STORAGE_KEY, StorageScope.APPLICATION);
	}

	private set existingSessionId(sessionId: string | undefined) {
		this.logService.trace(`Saving authentication session preference for ID ${sessionId}.`);
		if (sessionId === undefined) {
			this.storageService.remove(EditSessionsWorkbenchService.CACHED_SESSION_STORAGE_KEY, StorageScope.APPLICATION);
		} else {
			this.storageService.store(EditSessionsWorkbenchService.CACHED_SESSION_STORAGE_KEY, sessionId, StorageScope.APPLICATION, StorageTarget.MACHINE);
		}
	}

	private async getExistingSession() {
		const accounts = await this.getAllSessions();
		return accounts.find((account) => account.session.id === this.existingSessionId);
	}

	private async onDidChangeStorage(): Promise<void> {
		const newSessionId = this.existingSessionId;
		const previousSessionId = this.authenticationInfo?.sessionId;

		if (previousSessionId !== newSessionId) {
			this.logService.trace(`Resetting authentication state because authentication session ID preference changed from ${previousSessionId} to ${newSessionId}.`);
			this.authenticationInfo = undefined;
			this.initialized = false;
		}
	}

	private clearAuthenticationPreference(): void {
		this.authenticationInfo = undefined;
		this.initialized = false;
		this.existingSessionId = undefined;
		this.signedInContext.set(false);
	}

	private onDidChangeSessions(e: AuthenticationSessionsChangeEvent): void {
		if (this.authenticationInfo?.sessionId && e.removed.find(session => session.id === this.authenticationInfo?.sessionId)) {
			this.clearAuthenticationPreference();
		}
	}

	private registerSignInAction() {
		const that = this;
		const id = 'workbench.editSessions.actions.signIn';
		const when = ContextKeyExpr.and(ContextKeyExpr.equals(EDIT_SESSIONS_PENDING_KEY, false), ContextKeyExpr.equals(EDIT_SESSIONS_SIGNED_IN_KEY, false));
		this._register(registerAction2(class ResetEditSessionAuthenticationAction extends Action2 {
			constructor() {
				super({
					id,
					title: localize('sign in', 'Turn on Cloud Changes...'),
					category: EDIT_SESSION_SYNC_CATEGORY,
					precondition: when,
					menu: [{
						id: MenuId.CommandPalette,
					},
					{
						id: MenuId.AccountsContext,
						group: '2_editSessions',
						when,
					}]
				});
			}

			async run() {
				return await that.initialize('write', false);
			}
		}));

		this._register(MenuRegistry.appendMenuItem(MenuId.AccountsContext, {
			group: '2_editSessions',
			command: {
				id,
				title: localize('sign in badge', 'Turn on Cloud Changes... (1)'),
			},
			when: ContextKeyExpr.and(ContextKeyExpr.equals(EDIT_SESSIONS_PENDING_KEY, true), ContextKeyExpr.equals(EDIT_SESSIONS_SIGNED_IN_KEY, false))
		}));
	}

	private registerResetAuthenticationAction() {
		const that = this;
		this._register(registerAction2(class ResetEditSessionAuthenticationAction extends Action2 {
			constructor() {
				super({
					id: 'workbench.editSessions.actions.resetAuth',
					title: localize('reset auth.v3', 'Turn off Cloud Changes...'),
					category: EDIT_SESSION_SYNC_CATEGORY,
					precondition: ContextKeyExpr.equals(EDIT_SESSIONS_SIGNED_IN_KEY, true),
					menu: [{
						id: MenuId.CommandPalette,
					},
					{
						id: MenuId.AccountsContext,
						group: '2_editSessions',
						when: ContextKeyExpr.equals(EDIT_SESSIONS_SIGNED_IN_KEY, true),
					}]
				});
			}

			async run() {
				const result = await that.dialogService.confirm({
					message: localize('sign out of cloud changes clear data prompt', 'Do you want to disable storing working changes in the cloud?'),
					checkbox: { label: localize('delete all cloud changes', 'Delete all stored data from the cloud.') }
				});
				if (result.confirmed) {
					if (result.checkboxChecked) {
						that.storeClient?.deleteResource('editSessions', null);
					}
					that.clearAuthenticationPreference();
				}
			}
		}));
	}
}
