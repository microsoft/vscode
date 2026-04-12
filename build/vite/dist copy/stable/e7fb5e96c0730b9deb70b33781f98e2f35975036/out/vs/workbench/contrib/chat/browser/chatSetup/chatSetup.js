/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import product from '../../../../../platform/product/common/product.js';
import { localize } from '../../../../../nls.js';
const defaultChat = {
    completionsRefreshTokenCommand: product.defaultChatAgent?.completionsRefreshTokenCommand ?? '',
    chatRefreshTokenCommand: product.defaultChatAgent?.chatRefreshTokenCommand ?? '',
    providerExtensionId: product.defaultChatAgent?.providerExtensionId ?? '',
};
export var ChatSetupAnonymous;
(function (ChatSetupAnonymous) {
    ChatSetupAnonymous[ChatSetupAnonymous["Disabled"] = 0] = "Disabled";
    ChatSetupAnonymous[ChatSetupAnonymous["EnabledWithDialog"] = 1] = "EnabledWithDialog";
    ChatSetupAnonymous[ChatSetupAnonymous["EnabledWithoutDialog"] = 2] = "EnabledWithoutDialog";
})(ChatSetupAnonymous || (ChatSetupAnonymous = {}));
export var ChatSetupStep;
(function (ChatSetupStep) {
    ChatSetupStep[ChatSetupStep["Initial"] = 1] = "Initial";
    ChatSetupStep[ChatSetupStep["SigningIn"] = 2] = "SigningIn";
    ChatSetupStep[ChatSetupStep["Installing"] = 3] = "Installing";
})(ChatSetupStep || (ChatSetupStep = {}));
export var ChatSetupStrategy;
(function (ChatSetupStrategy) {
    ChatSetupStrategy[ChatSetupStrategy["Canceled"] = 0] = "Canceled";
    ChatSetupStrategy[ChatSetupStrategy["DefaultSetup"] = 1] = "DefaultSetup";
    ChatSetupStrategy[ChatSetupStrategy["SetupWithoutEnterpriseProvider"] = 2] = "SetupWithoutEnterpriseProvider";
    ChatSetupStrategy[ChatSetupStrategy["SetupWithEnterpriseProvider"] = 3] = "SetupWithEnterpriseProvider";
    ChatSetupStrategy[ChatSetupStrategy["SetupWithGoogleProvider"] = 4] = "SetupWithGoogleProvider";
    ChatSetupStrategy[ChatSetupStrategy["SetupWithAppleProvider"] = 5] = "SetupWithAppleProvider";
})(ChatSetupStrategy || (ChatSetupStrategy = {}));
export function refreshTokens(commandService) {
    // ugly, but we need to signal to the extension that entitlements changed
    commandService.executeCommand(defaultChat.completionsRefreshTokenCommand);
    commandService.executeCommand(defaultChat.chatRefreshTokenCommand);
}
/**
 * Ensures the authentication provider extension is enabled.
 * If the extension is found locally but disabled, it will be
 * re-enabled and running extensions will be updated.
 *
 * @returns `true` if the extension was re-enabled, `false` otherwise.
 */
export async function maybeEnableAuthExtension(extensionsWorkbenchService, logService) {
    if (!defaultChat.providerExtensionId) {
        return false;
    }
    const providerExtension = extensionsWorkbenchService.local.find(e => ExtensionIdentifier.equals(e.identifier.id, defaultChat.providerExtensionId));
    if (!providerExtension) {
        return false;
    }
    if (providerExtension.enablementState === 10 /* EnablementState.DisabledGlobally */ ||
        providerExtension.enablementState === 11 /* EnablementState.DisabledWorkspace */) {
        logService.info(`[chat setup] auth provider extension '${defaultChat.providerExtensionId}' is disabled, re-enabling it`);
        try {
            await extensionsWorkbenchService.setEnablement([providerExtension], 12 /* EnablementState.EnabledGlobally */);
            await extensionsWorkbenchService.updateRunningExtensions(localize('enableAuthExtension', "Enabling GitHub Authentication"));
            return true;
        }
        catch (error) {
            logService.error(`[chat setup] failed to re-enable auth provider extension '${defaultChat.providerExtensionId}'`, error);
            return false;
        }
    }
    return false;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFNldHVwLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXRTZXR1cC9jaGF0U2V0dXAudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFFOUYsT0FBTyxPQUFPLE1BQU0sbURBQW1ELENBQUM7QUFDeEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBSWpELE1BQU0sV0FBVyxHQUFHO0lBQ25CLDhCQUE4QixFQUFFLE9BQU8sQ0FBQyxnQkFBZ0IsRUFBRSw4QkFBOEIsSUFBSSxFQUFFO0lBQzlGLHVCQUF1QixFQUFFLE9BQU8sQ0FBQyxnQkFBZ0IsRUFBRSx1QkFBdUIsSUFBSSxFQUFFO0lBQ2hGLG1CQUFtQixFQUFFLE9BQU8sQ0FBQyxnQkFBZ0IsRUFBRSxtQkFBbUIsSUFBSSxFQUFFO0NBQ3hFLENBQUM7QUFpQkYsTUFBTSxDQUFOLElBQVksa0JBSVg7QUFKRCxXQUFZLGtCQUFrQjtJQUM3QixtRUFBWSxDQUFBO0lBQ1oscUZBQXFCLENBQUE7SUFDckIsMkZBQXdCLENBQUE7QUFDekIsQ0FBQyxFQUpXLGtCQUFrQixLQUFsQixrQkFBa0IsUUFJN0I7QUFFRCxNQUFNLENBQU4sSUFBWSxhQUlYO0FBSkQsV0FBWSxhQUFhO0lBQ3hCLHVEQUFXLENBQUE7SUFDWCwyREFBUyxDQUFBO0lBQ1QsNkRBQVUsQ0FBQTtBQUNYLENBQUMsRUFKVyxhQUFhLEtBQWIsYUFBYSxRQUl4QjtBQUVELE1BQU0sQ0FBTixJQUFZLGlCQU9YO0FBUEQsV0FBWSxpQkFBaUI7SUFDNUIsaUVBQVksQ0FBQTtJQUNaLHlFQUFnQixDQUFBO0lBQ2hCLDZHQUFrQyxDQUFBO0lBQ2xDLHVHQUErQixDQUFBO0lBQy9CLCtGQUEyQixDQUFBO0lBQzNCLDZGQUEwQixDQUFBO0FBQzNCLENBQUMsRUFQVyxpQkFBaUIsS0FBakIsaUJBQWlCLFFBTzVCO0FBU0QsTUFBTSxVQUFVLGFBQWEsQ0FBQyxjQUErQjtJQUM1RCx5RUFBeUU7SUFDekUsY0FBYyxDQUFDLGNBQWMsQ0FBQyxXQUFXLENBQUMsOEJBQThCLENBQUMsQ0FBQztJQUMxRSxjQUFjLENBQUMsY0FBYyxDQUFDLFdBQVcsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO0FBQ3BFLENBQUM7QUFFRDs7Ozs7O0dBTUc7QUFDSCxNQUFNLENBQUMsS0FBSyxVQUFVLHdCQUF3QixDQUM3QywwQkFBdUQsRUFDdkQsVUFBdUI7SUFFdkIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO1FBQ3RDLE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUVELE1BQU0saUJBQWlCLEdBQUcsMEJBQTBCLENBQUMsS0FBSyxDQUFDLElBQUksQ0FDOUQsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxFQUFFLEVBQUUsV0FBVyxDQUFDLG1CQUFtQixDQUFDLENBQ2pGLENBQUM7SUFFRixJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztRQUN4QixPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7SUFFRCxJQUNDLGlCQUFpQixDQUFDLGVBQWUsOENBQXFDO1FBQ3RFLGlCQUFpQixDQUFDLGVBQWUsK0NBQXNDLEVBQ3RFLENBQUM7UUFDRixVQUFVLENBQUMsSUFBSSxDQUFDLHlDQUF5QyxXQUFXLENBQUMsbUJBQW1CLCtCQUErQixDQUFDLENBQUM7UUFDekgsSUFBSSxDQUFDO1lBQ0osTUFBTSwwQkFBMEIsQ0FBQyxhQUFhLENBQUMsQ0FBQyxpQkFBaUIsQ0FBQywyQ0FBa0MsQ0FBQztZQUNyRyxNQUFNLDBCQUEwQixDQUFDLHVCQUF1QixDQUFDLFFBQVEsQ0FBQyxxQkFBcUIsRUFBRSxnQ0FBZ0MsQ0FBQyxDQUFDLENBQUM7WUFDNUgsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNoQixVQUFVLENBQUMsS0FBSyxDQUFDLDZEQUE2RCxXQUFXLENBQUMsbUJBQW1CLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUN6SCxPQUFPLEtBQUssQ0FBQztRQUNkLENBQUM7SUFDRixDQUFDO0lBRUQsT0FBTyxLQUFLLENBQUM7QUFDZCxDQUFDIn0=