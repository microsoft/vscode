/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize, localize2 } from '../../../../../nls.js';
import { Action2 } from '../../../../../platform/actions/common/actions.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IDynamicAuthenticationProviderStorageService } from '../../../../services/authentication/common/dynamicAuthenticationProviderStorage.js';
import { IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
export class RemoveDynamicAuthenticationProvidersAction extends Action2 {
    static { this.ID = 'workbench.action.removeDynamicAuthenticationProviders'; }
    constructor() {
        super({
            id: RemoveDynamicAuthenticationProvidersAction.ID,
            title: localize2('removeDynamicAuthProviders', 'Remove Dynamic Authentication Providers'),
            category: localize2('authenticationCategory', 'Authentication'),
            f1: true
        });
    }
    async run(accessor) {
        const quickInputService = accessor.get(IQuickInputService);
        const dynamicAuthStorageService = accessor.get(IDynamicAuthenticationProviderStorageService);
        const authenticationService = accessor.get(IAuthenticationService);
        const dialogService = accessor.get(IDialogService);
        const interactedProviders = dynamicAuthStorageService.getInteractedProviders();
        if (interactedProviders.length === 0) {
            await dialogService.info(localize('noDynamicProviders', 'No dynamic authentication providers'), localize('noDynamicProvidersDetail', 'No dynamic authentication providers have been used yet.'));
            return;
        }
        const items = interactedProviders.map(provider => ({
            label: provider.label,
            description: localize('clientId', 'Client ID: {0}', provider.clientId),
            provider
        }));
        const selected = await quickInputService.pick(items, {
            placeHolder: localize('selectProviderToRemove', 'Select a dynamic authentication provider to remove'),
            canPickMany: true
        });
        if (!selected || selected.length === 0) {
            return;
        }
        // Confirm deletion
        const providerNames = selected.map(item => item.provider.label).join(', ');
        const message = selected.length === 1
            ? localize('confirmDeleteSingleProvider', 'Are you sure you want to remove the dynamic authentication provider "{0}"?', providerNames)
            : localize('confirmDeleteMultipleProviders', 'Are you sure you want to remove {0} dynamic authentication providers: {1}?', selected.length, providerNames);
        const result = await dialogService.confirm({
            message,
            detail: localize('confirmDeleteDetail', 'This will remove all stored authentication data for the selected provider(s). You will need to re-authenticate if you use these providers again.'),
            primaryButton: localize('remove', 'Remove'),
            type: 'warning'
        });
        if (!result.confirmed) {
            return;
        }
        // Remove the selected providers
        for (const item of selected) {
            const providerId = item.provider.providerId;
            // Unregister from authentication service if still registered
            if (authenticationService.isAuthenticationProviderRegistered(providerId)) {
                authenticationService.unregisterAuthenticationProvider(providerId);
            }
            // Remove from dynamic storage service
            await dynamicAuthStorageService.removeDynamicProvider(providerId);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFuYWdlRHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXJzQWN0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvYXV0aGVudGljYXRpb24vYnJvd3Nlci9hY3Rpb25zL21hbmFnZUR5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyc0FjdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQzVELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUU1RSxPQUFPLEVBQUUsa0JBQWtCLEVBQWtCLE1BQU0seURBQXlELENBQUM7QUFDN0csT0FBTyxFQUFFLDRDQUE0QyxFQUFxQyxNQUFNLG9GQUFvRixDQUFDO0FBQ3JMLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQU1uRixNQUFNLE9BQU8sMENBQTJDLFNBQVEsT0FBTzthQUV0RCxPQUFFLEdBQUcsdURBQXVELENBQUM7SUFFN0U7UUFDQyxLQUFLLENBQUM7WUFDTCxFQUFFLEVBQUUsMENBQTBDLENBQUMsRUFBRTtZQUNqRCxLQUFLLEVBQUUsU0FBUyxDQUFDLDRCQUE0QixFQUFFLHlDQUF5QyxDQUFDO1lBQ3pGLFFBQVEsRUFBRSxTQUFTLENBQUMsd0JBQXdCLEVBQUUsZ0JBQWdCLENBQUM7WUFDL0QsRUFBRSxFQUFFLElBQUk7U0FDUixDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUEwQjtRQUNuQyxNQUFNLGlCQUFpQixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsQ0FBQztR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