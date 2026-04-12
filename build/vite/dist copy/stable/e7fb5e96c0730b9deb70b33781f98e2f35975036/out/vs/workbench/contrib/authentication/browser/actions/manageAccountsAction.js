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
import { Lazy } from '../../../../../base/common/lazy.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { ISecretStorageService } from '../../../../../platform/secrets/common/secrets.js';
import { getCurrentAuthenticationSessionInfo } from '../../../../services/authentication/browser/authenticationService.js';
import { IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
export class ManageAccountsAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.manageAccounts',
            title: localize2('manageAccounts', "Manage Accounts"),
            category: localize2('accounts', "Accounts"),
            f1: true
        });
    }
    run(accessor) {
        const instantiationService = accessor.get(IInstantiationService);
        return instantiationService.createInstance(ManageAccountsActionImpl).run();
    }
}
let ManageAccountsActionImpl = class ManageAccountsActionImpl {
    constructor(quickInputService, authenticationService, commandService, secretStorageService, productService) {
        this.quickInputService = quickInputService;
        this.authenticationService = authenticationService;
        this.commandService = commandService;
        this.secretStorageService = secretStorageService;
        this.productService = productService;
    }
    async run() {
        const placeHolder = localize('pickAccount', "Select an account to manage");
        const accounts = await this.listAccounts();
        if (!accounts.length) {
            await this.quickInputService.pick([{ label: localize('noActiveAccounts', "There are no active accounts.") }], { placeHolder });
            return;
        }
        const account = await this.quickInputService.pick(accounts, { placeHolder, matchOnDescription: true });
        if (!account) {
            return;
        }
        await this.showAccountActions(account);
    }
    async listAccounts() {
        const activeSession = new Lazy(() => getCurrentAuthenticationSessionInfo(this.secretStorageService, this.productService));
        const accounts = [];
        for (const providerId of this.authenticationService.getProviderIds()) {
            const provider = this.authenticationService.getProvider(providerId);
            for (const { label, id } of await this.authenticationService.getAccounts(providerId)) {
                accounts.push({
                    label,
                    description: provider.label,
                    providerId,
                    canUseMcp: !!provider.authorizationServers?.length,
                    canSignOut: async () => this.canSignOut(provider, id, await activeSession.value)
                });
            }
        }
        return accounts;
    }
    async canSignOut(provider, accountId, session) {
        if (session && !session.canSignOut && session.providerId === provider.id) {
            const sessions = await this.authenticationService.getSessions(provider.id);
            return !sessions.some(o => o.id === session.id && o.account.id === accountId);
        }
        return true;
    }
    async showAccountActions(account) {
        const { providerId, label: accountLabel, canUseMcp, canSignOut } = account;
        const store = new DisposableStore();
        const quickPick = store.add(this.quickInputService.createQuickPick());
        quickPick.title = localize('manageAccount', "Manage '{0}'", accountLabel);
        quickPick.placeholder = localize('selectAction', "Select an action");
        quickPick.buttons = [this.quickInputService.backButton];
        const items = [{
                label: localize('manageTrustedExtensions', "Manage Trusted Extensions"),
                action: () => this.commandService.executeCommand('_manageTrustedExtensionsForAccount', { providerId, accountLabel })
            }];
        if (canUseMcp) {
            items.push({
                label: localize('manageTrustedMCPServers', "Manage Trusted MCP Servers"),
                action: () => this.commandService.executeCommand('_manageTrustedMCPServersForAccount', { providerId, accountLabel })
            });
        }
        if (await canSignOut()) {
            items.push({
                label: localize('signOut', "Sign Out"),
                action: () => this.commandService.executeCommand('_signOutOfAccount', { providerId, accountLabel })
            });
        }
        quickPick.items = items;
        store.add(quickPick.onDidAccept(() => {
            const selected = quickPick.selectedItems[0];
            if (selected) {
                quickPick.hide();
                selected.action();
            }
        }));
        store.add(quickPick.onDidTriggerButton((button) => {
            if (button === this.quickInputService.backButton) {
                void this.run();
            }
        }));
        store.add(quickPick.onDidHide(() => store.dispose()));
        quickPick.show();
    }
};
ManageAccountsActionImpl = __decorate([
    __param(0, IQuickInputService),
    __param(1, IAuthenticationService),
    __param(2, ICommandService),
    __param(3, ISecretStorageService),
    __param(4, IProductService)
], ManageAccountsActionImpl);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFuYWdlQWNjb3VudHNBY3Rpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9hdXRoZW50aWNhdGlvbi9icm93c2VyL2FjdGlvbnMvbWFuYWdlQWNjb3VudHNBY3Rpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQzVELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUM1RSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDdEYsT0FBTyxFQUFFLHFCQUFxQixFQUFvQixNQUFNLCtEQUErRCxDQUFDO0FBQ3hILE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUMzRixPQUFPLEVBQUUsa0JBQWtCLEVBQWtCLE1BQU0seURBQXlELENBQUM7QUFDN0csT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDMUYsT0FBTyxFQUE2QixtQ0FBbUMsRUFBRSxNQUFNLHNFQUFzRSxDQUFDO0FBQ3RKLE9BQU8sRUFBMkIsc0JBQXNCLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUUvSCxNQUFNLE9BQU8sb0JBQXFCLFNBQVEsT0FBTztJQUNoRDtRQUNDLEtBQUssQ0FBQztZQUNMLEVBQUUsRUFBRSxpQ0FBaUM7WUFDckMsS0FBSyxFQUFFLFNBQVMsQ0FBQyxnQkFBZ0IsRUFBRSxpQkFBaUIsQ0FBQztZQUNyRCxRQUFRLEVBQUUsU0FBUyxDQUFDLFVBQVUsRUFBRSxVQUFV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