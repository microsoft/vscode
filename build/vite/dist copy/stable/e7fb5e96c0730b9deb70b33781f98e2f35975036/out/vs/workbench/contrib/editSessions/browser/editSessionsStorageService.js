/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var EditSessionsWorkbenchService_1;
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { createSyncHeaders } from '../../../../platform/userDataSync/common/userDataSync.js';
import { IAuthenticationService } from '../../../services/authentication/common/authentication.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { EDIT_SESSIONS_SIGNED_IN, EDIT_SESSION_SYNC_CATEGORY, EDIT_SESSIONS_SIGNED_IN_KEY, IEditSessionsLogService, EDIT_SESSIONS_PENDING_KEY } from '../common/editSessions.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { getCurrentAuthenticationSessionInfo } from '../../../services/authentication/browser/authenticationService.js';
import { isWeb } from '../../../../base/common/platform.js';
import { UserDataSyncMachinesService } from '../../../../platform/userDataSync/common/userDataSyncMachines.js';
import { Emitter } from '../../../../base/common/event.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { ISecretStorageService } from '../../../../platform/secrets/common/secrets.js';
let EditSessionsWorkbenchService = class EditSessionsWorkbenchService extends Disposable {
    static { EditSessionsWorkbenchService_1 = this; }
    static { this.CACHED_SESSION_STORAGE_KEY = 'editSessionAccountPreference'; }
    get isSignedIn() {
        return this.existingSessionId !== undefined;
    }
    get onDidSignIn() {
        return this._didSignIn.event;
    }
    get onDidSignOut() {
        return this._didSignOut.event;
    }
    get lastWrittenResources() {
        return this._lastWrittenResources;
    }
    get lastReadResources() {
        return this._lastReadResources;
    }
    constructor(fileService, storageService, quickInputService, authenticationService, extensionService, environmentService, logService, productService, contextKeyService, dialogService, secretStorageService) {
        super();
        this.fileService = fileService;
        this.storageService = storageService;
        this.quickInputService = quickInputService;
        this.authenticationService = authenticationService;
        this.extensionService = extensionService;
        this.environmentService = environmentService;
        this.logService = logService;
        this.productService = productService;
        this.contextKeyService = contextKeyService;
        this.dialogService = dialogService;
        this.secretStorageService = secretStorageService;
        this.SIZE_LIMIT = Math.floor(1024 * 1024 * 1.9); // 2 MB
        this.initialized = false;
        this._didSignIn = this._register(new Emitter());
        this._didSignOut = this._register(new Emitter());
        this._lastWrittenResources = new Map();
        this._lastReadResources = new Map();
        this.serverConfiguration = this.productService['editSessions.store'];
        // If the user signs out of the current session, reset our cached auth state in memory and on disk
        this._register(this.authenticationService.onDidChangeSessions((e) => this.onDidChangeSessions(e.event)));
        // If another window changes the preferred session storage, reset our cached auth state in memory
        this._register(this.storageService.onDidChangeValue(-1 /* StorageScope.APPLICATION */, EditSessionsWorkbenchService_1.CACHED_SESSION_STORAGE_KEY, this._store)(() => this.onDidChangeStorage()));
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
    async write(resource, content) {
        await this.initialize('write', false);
        if (!this.initialized) {
            throw new Error('Please sign in to store your edit session.');
        }
        if (typeof content !== 'string' && content.machine === undefined) {
            content.machine = await this.getOrCreateCurrentMachineId();
        }
        content = typeof content === 'string' ? content : JSON.stringify(content);
        const ref = await this.storeClient.writeResource(resource, content, null, undefined, createSyncHeaders(generateUuid()));
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
    async read(resource, ref) {
        await this.initialize('read', false);
        if (!this.initialized) {
            throw new Error('Please sign in to apply your latest edit session.');
        }
        let content;
        const headers = createSyncHeaders(generateUuid());
        try {
            if (ref !== undefined) {
                content = await this.storeClient?.resolveResourceContent(resource, ref, undefined, headers);
            }
            else {
                const result = await this.storeClient?.readResource(resource, null, undefined, headers);
                content = result?.content;
                ref = result?.ref;
            }
        }
        catch (ex) {
            this.logService.error(ex);
        }
        // TODO@joyceerhl Validate session data, check schema version
        if (content !== undefined && content !== null && ref !== undefined) {
            this._lastReadResources.set(resource, { ref, content });
            return { ref, content };
        }
        return undefined;
    }
    async delete(resource, ref) {
        await this.initialize('write', false);
        if (!this.initialized) {
            throw new Error(`Unable to delete edit session with ref ${ref}.`);
        }
        try {
            await this.storeClient?.deleteResource(resource, ref);
        }
        catch (ex) {
            this.logService.error(ex);
        }
    }
    async list(resource) {
        await this.initialize('read', false);
        if (!this.initialized) {
            throw new Error(`Unable to list edit sessions.`);
        }
        try {
            return this.storeClient?.getAllResourceRefs(resource) ?? [];
        }
        catch (ex) {
            this.logService.error(ex);
        }
        return [];
    }
    async initialize(reason, silent = false) {
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
    async doInitialize(reason, silent) {
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
            this.machineClient = new UserDataSyncMachinesService(this.environmentService, this.fileService, this.storageService, this.storeClient, this.logService, this.productService);
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
    async getMachineById(machineId) {
        await this.initialize('read', false);
        if (!this.cachedMachines) {
            const machines = await this.machineClient.getMachines();
            this.cachedMachines = machines.reduce((map, machine) => map.set(machine.id, machine.name), new Map());
        }
        return this.cachedMachines.get(machineId);
    }
    async getOrCreateCurrentMachineId() {
        const currentMachineId = await this.machineClient.getMachines().then((machines) => machines.find((m) => m.isCurrent)?.id);
        if (currentMachineId === undefined) {
            await this.machineClient.addCurrentMachine();
            return await this.machineClient.getMachines().then((machines) => machines.find((m) => m.isCurrent).id);
        }
        return currentMachineId;
    }
    async getAuthenticationSession(reason, silent) {
        // If the user signed in previously and the session is still available, reuse that without prompting the user again
        if (this.existingSessionId) {
            this.logService.info(`Searching for existing authentication session with ID ${this.existingSessionId}`);
            const existingSession = await this.getExistingSession();
            if (existingSession) {
                this.logService.info(`Found existing authentication session with ID ${existingSession.session.id}`);
                return { sessionId: existingSession.session.id, token: existingSession.session.idToken ?? existingSession.session.accessToken, providerId: existingSession.session.providerId };
            }
            else {
                this._didSignOut.fire();
            }
        }
        // If settings sync is already enabled, avoid asking again to authenticate
        if (this.shouldAttemptEditSessionInit()) {
            this.logService.info(`Reusing user data sync enablement`);
            const authenticationSessionInfo = await getCurrentAuthenticationSessionInfo(this.secretStorageService, this.productService);
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
    shouldAttemptEditSessionInit() {
        return isWeb && this.storageService.isNew(-1 /* StorageScope.APPLICATION */) && this.storageService.isNew(1 /* StorageScope.WORKSPACE */);
    }
    /**
     *
     * Prompts the user to pick an authentication option for storing and getting edit sessions.
     */
    async getAccountPreference(reason) {
        const disposables = new DisposableStore();
        const quickpick = disposables.add(this.quickInputService.createQuickPick({ useSeparators: true }));
        quickpick.ok = false;
        quickpick.placeholder = reason === 'read' ? localize('choose account read placeholder', "Select an account to restore your working changes from the cloud") : localize('choose account placeholder', "Select an account to store your working changes in the cloud");
        quickpick.ignoreFocusOut = true;
        quickpick.items = await this.createQuickpickItems();
        return new Promise((resolve, reject) => {
            disposables.add(quickpick.onDidHide((e) => {
                reject(new CancellationError());
                disposables.dispose();
            }));
            disposables.add(quickpick.onDidAccept(async (e) => {
                const selection = quickpick.selectedItems[0];
                const session = 'provider' in selection ? { ...await this.authenticationService.createSession(selection.provider.id, selection.provider.scopes), providerId: selection.provider.id } : ('session' in selection ? selection.session : undefined);
                resolve(session);
                quickpick.hide();
            }));
            quickpick.show();
        });
    }
    async createQuickpickItems() {
        const options = [];
        options.push({ type: 'separator', label: localize('signed in', "Signed In") });
        const sessions = await this.getAllSessions();
        options.push(...sessions);
        options.push({ type: 'separator', label: localize('others', "Others") });
        for (const authenticationProvider of (await this.getAuthenticationProviders())) {
            const signedInForProvider = sessions.some(account => account.session.providerId === authenticationProvider.id);
            if (!signedInForProvider || this.authenticationService.getProvider(authenticationProvider.id).supportsMultipleAccounts) {
                const providerName = this.authenticationService.getProvider(authenticationProvider.id).label;
                options.push({ label: localize('sign in using account', "Sign in with {0}", providerName), provider: authenticationProvider });
            }
        }
        return options;
    }
    /**
     *
     * Returns all authentication sessions available from {@link getAuthenticationProviders}.
     */
    async getAllSessions() {
        const authenticationProviders = await this.getAuthenticationProviders();
        const accounts = new Map();
        let currentSession;
        for (const provider of authenticationProviders) {
            const sessions = await this.authenticationService.getSessions(provider.id, provider.scopes);
            for (const session of sessions) {
                const item = {
                    label: session.account.label,
                    description: this.authenticationService.getProvider(provider.id).label,
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
    async getAuthenticationProviders() {
        if (!this.serverConfiguration) {
            throw new Error('Unable to get configured authentication providers as session sync preference is not configured in product.json.');
        }
        // Get the list of authentication providers configured in product.json
        const authenticationProviders = this.serverConfiguration.authenticationProviders;
        const configuredAuthenticationProviders = Object.keys(authenticationProviders).reduce((result, id) => {
            result.push({ id, scopes: authenticationProviders[id].scopes });
            return result;
        }, []);
        // Filter out anything that isn't currently available through the authenticationService
        const availableAuthenticationProviders = this.authenticationService.declaredProviders;
        return configuredAuthenticationProviders.filter(({ id }) => availableAuthenticationProviders.some(provider => provider.id === id));
    }
    get existingSessionId() {
        return this.storageService.get(EditSessionsWorkbenchService_1.CACHED_SESSION_STORAGE_KEY, -1 /* StorageScope.APPLICATION */);
    }
    set existingSessionId(sessionId) {
        this.logService.trace(`Saving authentication session preference for ID ${sessionId}.`);
        if (sessionId === undefined) {
            this.storageService.remove(EditSessionsWorkbenchService_1.CACHED_SESSION_STORAGE_KEY, -1 /* StorageScope.APPLICATION */);
        }
        else {
            this.storageService.store(EditSessionsWorkbenchService_1.CACHED_SESSION_STORAGE_KEY, sessionId, -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
        }
    }
    async getExistingSession() {
        const accounts = await this.getAllSessions();
        return accounts.find((account) => account.session.id === this.existingSessionId);
    }
    async onDidChangeStorage() {
        const newSessionId = this.existingSessionId;
        const previousSessionId = this.authenticationInfo?.sessionId;
        if (previousSessionId !== newSessionId) {
            this.logService.trace(`Resetting authentication state because authentication session ID preference changed from ${previousSessionId} to ${newSessionId}.`);
            this.authenticationInfo = undefined;
            this.initialized = false;
        }
    }
    clearAuthenticationPreference() {
        this.authenticationInfo = undefined;
        this.initialized = false;
        this.existingSessionId = undefined;
        this.signedInContext.set(false);
    }
    onDidChangeSessions(e) {
        if (this.authenticationInfo?.sessionId && e.removed?.find(session => session.id === this.authenticationInfo?.sessionId)) {
            this.clearAuthenticationPreference();
        }
    }
    registerSignInAction() {
        if (!this.serverConfiguration?.url) {
            return;
        }
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
    registerResetAuthenticationAction() {
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
};
EditSessionsWorkbenchService = EditSessionsWorkbenchService_1 = __decorate([
    __param(0, IFileService),
    __param(1, IStorageService),
    __param(2, IQuickInputService),
    __param(3, IAuthenticationService),
    __param(4, IExtensionService),
    __param(5, IEnvironmentService),
    __param(6, IEditSessionsLogService),
    __param(7, IProductService),
    __param(8, IContextKeyService),
    __param(9, IDialogService),
    __param(10, ISecretStorageService)
], EditSessionsWorkbenchService);
export { EditSessionsWorkbenchService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdFNlc3Npb25zU3RvcmFnZVNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9lZGl0U2Vzc2lvbnMvYnJvd3Nlci9lZGl0U2Vzc2lvbnNTdG9yYWdlU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNuRixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsWUFBWSxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2hILE9BQU8sRUFBRSxjQUFjLEVBQWUsa0JBQWtCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN2SCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUM3RixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDMUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxrQkFBa0IsRUFBdUMsTUFBTSxzREFBc0QsQ0FBQztBQUMvSCxPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLGdEQUFnRCxDQUFDO0FBQzlHLE9BQU8sRUFBRSxpQkFBaUIsRUFBK0MsTUFBTSwwREFBMEQsQ0FBQztBQUMxSSxPQUFPLEVBQTRELHNCQUFzQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDN0osT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDdEYsT0FBTyxFQUFFLHVCQUF1QixFQUFlLDBCQUEwQixFQUErQiwyQkFBMkIsRUFBRSx1QkFBdUIsRUFBZ0IseUJBQXlCLEVBQUUs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