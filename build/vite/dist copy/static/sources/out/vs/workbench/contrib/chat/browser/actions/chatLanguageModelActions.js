/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { ILanguageModelsService } from '../../common/languageModels.js';
import { IAuthenticationAccessService } from '../../../../services/authentication/browser/authenticationAccessService.js';
import { localize, localize2 } from '../../../../../nls.js';
import { INTERNAL_AUTH_PROVIDER_PREFIX } from '../../../../services/authentication/common/authentication.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { CHAT_CATEGORY } from './chatActions.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
class ManageLanguageModelAuthenticationAction extends Action2 {
    static { this.ID = 'workbench.action.chat.manageLanguageModelAuthentication'; }
    constructor() {
        super({
            id: ManageLanguageModelAuthenticationAction.ID,
            title: localize2('manageLanguageModelAuthentication', 'Manage Language Model Access...'),
            category: CHAT_CATEGORY,
            precondition: ChatContextKeys.enabled,
            menu: [{
                    id: MenuId.AccountsContext,
                    order: 100,
                }],
            f1: true
        });
    }
    async run(accessor) {
        const quickInputService = accessor.get(IQuickInputService);
        const languageModelsService = accessor.get(ILanguageModelsService);
        const authenticationAccessService = accessor.get(IAuthenticationAccessService);
        const dialogService = accessor.get(IDialogService);
        const extensionService = accessor.get(IExtensionService);
        const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
        const productService = accessor.get(IProductService);
        // Get all registered language models
        const modelIds = languageModelsService.getLanguageModelIds();
        // Group models by owning extension and collect all allowed extensions
        const extensionAuth = new Map();
        const ownerToAccountLabel = new Map();
        for (const modelId of modelIds) {
            const model = languageModelsService.lookupLanguageModel(modelId);
            if (!model?.auth) {
                continue; // Skip if model is not found
            }
            const ownerId = model.extension.value;
            if (extensionAuth.has(ownerId)) {
                // If the owner already exists, just continue
                continue;
            }
            // Get allowed extensions for this model's auth provider
            try {
                // Use providerLabel as the providerId and accountLabel (or default)
                const providerId = INTERNAL_AUTH_PROVIDER_PREFIX + ownerId;
                const accountLabel = model.auth.accountLabel || 'Language Models';
                ownerToAccountLabel.set(ownerId, accountLabel);
                const allowedExtensions = authenticationAccessService.readAllowedExtensions(providerId, accountLabel).filter(ext => !ext.trusted); // Filter out trusted extensions because those should not be modified
                if (productService.trustedExtensionAuthAccess && !Array.isArray(productService.trustedExtensionAuthAccess)) {
                    const trustedExtensions = productService.trustedExtensionAuthAccess[providerId];
                    // If the provider is trusted, add all trusted extensions to the allowed list
                    for (const ext of trustedExtensions) {
                        const index = allowedExtensions.findIndex(a => a.id === ext);
                        if (index !== -1) {
                            allowedExtensions.splice(index, 1);
                        }
                        const extension = await extensionService.getExtension(ext);
                        if (!extension) {
                            continue; // Skip if the extension is not found
                        }
                        allowedExtensions.push({
                            id: ext,
                            name: extension.displayName || extension.name,
                            allowed: true, // Assume trusted extensions are allowed by default
                            trusted: true // Mark as trusted
                        });
                    }
                }
                // Only grab extensions that are gettable from the extension service
                const filteredExtensions = new Array();
                for (const ext of allowedExtensions) {
                    if (await extensionService.getExtension(ext.id)) {
                        filteredExtensions.push(ext);
                    }
                }
                extensionAuth.set(ownerId, filteredExtensions);
                // Add all allowed extensions to the set for this owner
            }
            catch (error) {
                // Handle error by ensuring the owner is in the map
                if (!extensionAuth.has(ownerId)) {
                    extensionAuth.set(ownerId, []);
                }
            }
        }
        if (extensionAuth.size === 0) {
            dialogService.prompt({
                type: 'info',
                message: localize('noLanguageModels', 'No language models requiring authentication found.'),
                detail: localize('noLanguageModelsDetail', 'There are currently no language models that require authentication.')
            });
            return;
        }
        const items = [];
        // Create QuickPick items grouped by owner extension
        for (const [ownerId, allowedExtensions] of extensionAuth) {
            const extension = await extensionService.getExtension(ownerId);
            if (!extension) {
                // If the extension is not found, skip it
                continue;
            }
            // Add separator for the owning extension
            items.push({
                type: 'separator',
                id: ownerId,
                label: localize('extensionOwner', '{0}', extension.displayName || extension.name),
                buttons: [{
                        iconClass: ThemeIcon.asClassName(Codicon.info),
                        tooltip: localize('openExtension', 'Open Extension'),
                    }]
            });
            // Add allowed extensions as checkboxes (visual representation)
            let addedTrustedSeparator = false;
            if (allowedExtensions.length > 0) {
                for (const allowedExt of allowedExtensions) {
                    if (allowedExt.trusted && !addedTrustedSeparator) {
                        items.push({
                            type: 'separator',
                            label: localize('trustedExtension', 'Trusted by Microsoft'),
                        });
                        addedTrustedSeparator = true;
                    }
                    items.push({
                        label: allowedExt.name,
                        ownerId,
                        id: allowedExt.id,
                        picked: allowedExt.allowed ?? false,
                        extension: allowedExt,
                        disabled: allowedExt.trusted, // Don't allow toggling trusted extensions
                        buttons: [{
                                iconClass: ThemeIcon.asClassName(Codicon.info),
                                tooltip: localize('openExtension', 'Open Extension'),
                            }]
                    });
                }
            }
            else {
                items.push({
                    label: localize('noAllowedExtensions', 'No extensions have access'),
                    description: localize('noAccessDescription', 'No extensions are currently allowed to use models from {0}', ownerId),
                    pickable: false
                });
            }
        }
        // Show the QuickPick
        const result = await quickInputService.pick(items, {
            canPickMany: true,
            sortByLabel: true,
            onDidTriggerSeparatorButton(context) {
                // Handle separator button clicks
                const extId = context.separator.id;
                if (extId) {
                    // Open the extension in the editor
                    void extensionsWorkbenchService.open(extId);
                }
            },
            onDidTriggerItemButton(context) {
                // Handle item button clicks
                const extId = context.item.id;
                if (extId) {
                    // Open the extension in the editor
                    void extensionsWorkbenchService.open(extId);
                }
            },
            title: localize('languageModelAuthTitle', 'Manage Language Model Access'),
            placeHolder: localize('languageModelAuthPlaceholder', 'Choose which extensions can access language models'),
        });
        if (!result) {
            return;
        }
        for (const [ownerId, allowedExtensions] of extensionAuth) {
            // diff with result to find out which extensions are allowed or not
            // but we need to only look at the result items that have the ownerId
            const allowedSet = new Set(result
                .filter(item => item.ownerId === ownerId)
                // only save items that are not trusted automatically
                .filter(item => !item.extension?.trusted)
                .map(item => item.id));
            for (const allowedExt of allowedExtensions) {
                allowedExt.allowed = allowedSet.has(allowedExt.id);
            }
            authenticationAccessService.updateAllowedExtensions(INTERNAL_AUTH_PROVIDER_PREFIX + ownerId, ownerToAccountLabel.get(ownerId) || 'Language Models', allowedExtensions);
        }
    }
}
class ConfigureLanguageModelsGroupAction extends Action2 {
    constructor() {
        super({
            id: 'lm.addLanguageModelsProviderGroup',
            title: localize('lm.configureGroup', 'Add Language Models Group'),
        });
    }
    async run(accessor, languageModelsProviderGroup) {
        const languageModelsService = accessor.get(ILanguageModelsService);
        if (!languageModelsProviderGroup) {
            throw new Error('Language model group is required');
        }
        const { name, vendor, ...configuration } = languageModelsProviderGroup;
        await languageModelsService.addLanguageModelsProviderGroup(name, vendor, configuration);
    }
}
class MigrateLanguageModelsGroupAction extends Action2 {
    constructor() {
        super({
            id: 'lm.migrateLanguageModelsProviderGroup',
            title: localize('lm.migrateGroup', 'Migrate Language Models Group'),
        });
    }
    async run(accessor, languageModelsProviderGroup) {
        const languageModelsService = accessor.get(ILanguageModelsService);
        if (!languageModelsProviderGroup) {
            throw new Error('Language model group is required');
        }
        await languageModelsService.migrateLanguageModelsProviderGroup(languageModelsProviderGroup);
    }
}
export function registerLanguageModelActions() {
    registerAction2(ManageLanguageModelAuthenticationAction);
    registerAction2(ConfigureLanguageModelsGroupAction);
    registerAction2(MigrateLanguageModelsGroupAction);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdExhbmd1YWdlTW9kZWxBY3Rpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FjdGlvbnMvY2hhdExhbmd1YWdlTW9kZWxBY3Rpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLGVBQWUsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBRXJHLE9BQU8sRUFBRSxrQkFBa0IsRUFBa0MsTUFBTSx5REFBeUQsQ0FBQztBQUM3SCxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUN4RSxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSw0RUFBNEUsQ0FBQztBQUMxSCxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQzVELE9BQU8sRUFBb0IsNkJBQTZCLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUMvSCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDbkYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBQ2pELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3pGLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUMzRixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDakUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUcxRSxNQUFNLHVDQUF3QyxTQUFRLE9BQU87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