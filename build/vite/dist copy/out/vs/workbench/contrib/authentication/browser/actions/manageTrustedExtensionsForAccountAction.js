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
import { Codicon } from '../../../../../base/common/codicons.js';
import { fromNow } from '../../../../../base/common/date.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
import { IAuthenticationQueryService } from '../../../../services/authentication/common/authenticationQuery.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
export class ManageTrustedExtensionsForAccountAction extends Action2 {
    constructor() {
        super({
            id: '_manageTrustedExtensionsForAccount',
            title: localize2('manageTrustedExtensionsForAccount', "Manage Trusted Extensions For Account"),
            category: localize2('accounts', "Accounts"),
            f1: true
        });
    }
    run(accessor, options) {
        const instantiationService = accessor.get(IInstantiationService);
        return instantiationService.createInstance(ManageTrustedExtensionsForAccountActionImpl).run(options);
    }
}
let ManageTrustedExtensionsForAccountActionImpl = class ManageTrustedExtensionsForAccountActionImpl {
    constructor(_extensionService, _dialogService, _quickInputService, _authenticationService, _authenticationQueryService, _commandService, _extensionsWorkbenchService) {
        this._extensionService = _extensionService;
        this._dialogService = _dialogService;
        this._quickInputService = _quickInputService;
        this._authenticationService = _authenticationService;
        this._authenticationQueryService = _authenticationQueryService;
        this._commandService = _commandService;
        this._extensionsWorkbenchService = _extensionsWorkbenchService;
        this._viewDetailsButton = {
            tooltip: localize('viewExtensionDetails', "View extension details"),
            iconClass: ThemeIcon.asClassName(Codicon.info),
        };
        this._managePreferencesButton = {
            tooltip: localize('accountPreferences', "Manage account preferences for this extension"),
            iconClass: ThemeIcon.asClassName(Codicon.settingsGear),
        };
    }
    async run(options) {
        const accountQuery = await this._resolveAccountQuery(options?.providerId, options?.accountLabel);
        if (!accountQuery) {
            return;
        }
        const items = await this._getItems(accountQuery);
        if (!items.length) {
            return;
        }
        const picker = this._createQuickPick(accountQuery);
        picker.items = items;
        picker.selectedItems = items.filter((i) => i.type !== 'separator' && !!i.picked);
        picker.show();
    }
    //#region Account Query Resolution
    async _resolveAccountQuery(providerId, accountLabel) {
        if (providerId && accountLabel) {
            return this._authenticationQueryService.provider(providerId).account(accountLabel);
        }
        const accounts = await this._getAllAvailableAccounts();
        const pick = await this._quickInputService.pick(accounts, {
            placeHolder: localize('pickAccount', "Pick an account to manage trusted extensions for"),
            matchOnDescription: true,
        });
        return pick ? this._authenticationQueryService.provider(pick.providerId).account(pick.label) : undefined;
    }
    async _getAllAvailableAccounts() {
        const accounts = [];
        for (const providerId of this._authenticationService.getProviderIds()) {
            const provider = this._authenticationService.getProvider(providerId);
            const sessions = await this._authenticationService.getSessions(providerId);
            const uniqueLabels = new Set();
            for (const session of sessions) {
                if (!uniqueLabels.has(session.account.label)) {
                    uniqueLabels.add(session.account.label);
                    accounts.push({
                        providerId,
                        label: session.account.label,
                        description: provider.label
                    });
                }
            }
        }
        return accounts;
    }
    //#endregion
    //#region Item Retrieval and Quick Pick Creation
    async _getItems(accountQuery) {
        const allowedExtensions = accountQuery.extensions().getAllowedExtensions();
        const extensionIdToDisplayName = new Map();
        // Get display names for all allowed extensions
        const resolvedExtensions = await Promise.all(allowedExtensions.map(ext => this._extensionService.getExtension(ext.id)));
        resolvedExtensions.forEach((resolved, i) => {
            if (resolved) {
                extensionIdToDisplayName.set(allowedExtensions[i].id, resolved.displayName || resolved.name);
            }
        });
        // Filter out extensions that are not currently installed and enrich with display names
        const filteredExtensions = allowedExtensions
            .filter(ext => extensionIdToDisplayName.has(ext.id))
            .map(ext => {
            const usage = accountQuery.extension(ext.id).getUsage();
            return {
                ...ext,
                // Use the extension display name from the extension service
                name: extensionIdToDisplayName.get(ext.id),
                lastUsed: usage.length > 0 ? Math.max(...usage.map(u => u.lastUsed)) : ext.lastUsed
            };
        });
        if (!filteredExtensions.length) {
            this._dialogService.info(localize('noTrustedExtensions', "This account has not been used by any extensions."));
            return [];
        }
        const trustedExtensions = filteredExtensions.filter(e => e.trusted);
        const otherExtensions = filteredExtensions.filter(e => !e.trusted);
        const sortByLastUsed = (a, b) => (b.lastUsed || 0) - (a.lastUsed || 0);
        const _toQuickPickItem = this._toQuickPickItem.bind(this);
        return [
            ...otherExtensions.sort(sortByLastUsed).map(_toQuickPickItem),
            { type: 'separator', label: localize('trustedExtensions', "Trusted by Microsoft") },
            ...trustedExtensions.sort(sortByLastUsed).map(_toQuickPickItem)
        ];
    }
    _toQuickPickItem(extension) {
        const lastUsed = extension.lastUsed;
        const description = lastUsed
            ? localize({ key: 'accountLastUsedDate', comment: ['The placeholder {0} is a string with time information, such as "3 days ago"'] }, "Last used this account {0}", fromNow(lastUsed, true))
            : localize('notUsed', "Has not used this account");
        let tooltip;
        let disabled;
        if (extension.trusted) {
            tooltip = localize('trustedExtensionTooltip', "This extension is trusted by Microsoft and\nalways has access to this account");
            disabled = true;
        }
        return {
            label: extension.name,
            extension,
            description,
            tooltip,
            disabled,
            buttons: [this._viewDetailsButton, this._managePreferencesButton],
            picked: extension.allowed === undefined || extension.allowed
        };
    }
    _createQuickPick(accountQuery) {
        const disposableStore = new DisposableStore();
        const quickPick = disposableStore.add(this._quickInputService.createQuickPick({ useSeparators: true }));
        // Configure quick pick
        quickPick.canSelectMany = true;
        quickPick.customButton = true;
        quickPick.customLabel = localize('manageTrustedExtensions.cancel', 'Cancel');
        quickPick.customButtonSecondary = true;
        quickPick.title = localize('manageTrustedExtensions', "Manage Trusted Extensions");
        quickPick.placeholder = localize('manageExtensions', "Choose which extensions can access this account");
        // Set up event handlers
        disposableStore.add(quickPick.onDidAccept(() => {
            const updatedAllowedList = quickPick.items
                .filter((item) => item.type !== 'separator')
                .map(i => i.extension);
            const allowedExtensionsSet = new Set(quickPick.selectedItems.map(i => i.extension));
            for (const extension of updatedAllowedList) {
                const allowed = allowedExtensionsSet.has(extension);
                accountQuery.extension(extension.id).setAccessAllowed(allowed, extension.name);
            }
            quickPick.hide();
        }));
        disposableStore.add(quickPick.onDidHide(() => disposableStore.dispose()));
        disposableStore.add(quickPick.onDidCustom(() => quickPick.hide()));
        disposableStore.add(quickPick.onDidTriggerItemButton(e => {
            if (e.button === this._managePreferencesButton) {
                this._commandService.executeCommand('_manageAccountPreferencesForExtension', e.item.extension.id, accountQuery.providerId);
            }
            else if (e.button === this._viewDetailsButton) {
                this._extensionsWorkbenchService.open(e.item.extension.id);
            }
        }));
        return quickPick;
    }
};
ManageTrustedExtensionsForAccountActionImpl = __decorate([
    __param(0, IExtensionService),
    __param(1, IDialogService),
    __param(2, IQuickInputService),
    __param(3, IAuthenticationService),
    __param(4, IAuthenticationQueryService),
    __param(5, ICommandService),
    __param(6, IExtensionsWorkbenchService)
], ManageTrustedExtensionsForAccountActionImpl);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFuYWdlVHJ1c3RlZEV4dGVuc2lvbnNGb3JBY2NvdW50QWN0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvYXV0aGVudGljYXRpb24vYnJvd3Nlci9hY3Rpb25zL21hbmFnZVRydXN0ZWRFeHRlbnNpb25zRm9yQWNjb3VudEFjdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDakUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDcEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUM1RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDNUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNuRixPQUFPLEVBQUUscUJBQXFCLEVBQW9CLE1BQU0sK0RBQStELENBQUM7QUFDeEgsT0FBTyxFQUFFLGtCQUFrQixFQUF1QyxNQUFNLHlEQUF5RCxDQUFDO0FBQ2xJLE9BQU8sRUFBb0Isc0JBQXNCLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUN4SCxPQUFPLEVBQUUsMkJBQTJCLEVBQWlCLE1BQU0sbUVBQW1FLENBQUM7QUFDL0gsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDekYsT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1BQU0sMENBQTBDLENB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