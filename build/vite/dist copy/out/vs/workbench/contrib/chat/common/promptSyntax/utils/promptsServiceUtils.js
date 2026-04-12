/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { PromptsStorage } from '../service/promptsService.js';
/**
 * Checks if a prompt file is organization-provided.
 * Organization-provided prompt files come from the built-in chat extension
 * and are located under a `/github/` path.
 *
 * @param uri The URI of the prompt file
 * @param extensionId The extension identifier that provides the prompt file
 * @param productService The product service to get the built-in chat extension ID
 * @returns `true` if the prompt file is organization-provided, `false` otherwise
 */
export function isOrganizationPromptFile(uri, extensionId, productService) {
    const chatExtensionId = productService.defaultChatAgent?.chatExtensionId;
    if (!chatExtensionId) {
        return false;
    }
    const isFromBuiltinChatExtension = ExtensionIdentifier.equals(extensionId, chatExtensionId);
    const pathContainsGithub = uri.path.includes('/github/');
    return isFromBuiltinChatExtension && pathContainsGithub;
}
/**
 * Checks if a custom agent is considered "builtin" - i.e. shipped by the
 * built-in chat extension and not organization-provided. Used for telemetry
 * to decide whether the agent name is safe to send as-is.
 */
export function isBuiltinAgent(source, uri, productService) {
    if (source.storage !== PromptsStorage.extension) {
        return false;
    }
    const chatExtensionId = productService.defaultChatAgent?.chatExtensionId;
    if (!chatExtensionId || !ExtensionIdentifier.equals(source.extensionId, chatExtensionId)) {
        return false;
    }
    return !isOrganizationPromptFile(uri, source.extensionId, productService);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvbXB0c1NlcnZpY2VVdGlscy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Byb21wdFN5bnRheC91dGlscy9wcm9tcHRzU2VydmljZVV0aWxzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBRWpHLE9BQU8sRUFBZ0IsY0FBYyxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFFNUU7Ozs7Ozs7OztHQVNHO0FBQ0gsTUFBTSxVQUFVLHdCQUF3QixDQUFDLEdBQVEsRUFBRSxXQUFnQyxFQUFFLGNBQStCO0lBQ25ILE1BQU0sZUFBZSxHQUFHLGNBQWMsQ0FBQyxnQkFBZ0IsRUFBRSxlQUFlLENBQUM7SUFDekUsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO1FBQ3RCLE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUNELE1BQU0sMEJBQTBCLEdBQUcsbUJBQW1CLENBQUMsTUFBTSxDQUFDLFdBQVcsRUFBRSxlQUFlLENBQUMsQ0FBQztJQUM1RixNQUFNLGtCQUFrQixHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQ3pELE9BQU8sMEJBQTBCLElBQUksa0JBQWtCLENBQUM7QUFDekQsQ0FBQztBQUVEOzs7O0dBSUc7QUFDSCxNQUFNLFVBQVUsY0FBYyxDQUFDLE1BQW9CLEVBQUUsR0FBUSxFQUFFLGNBQStCO0lBQzdGLElBQUksTUFBTSxDQUFDLE9BQU8sS0FBSyxjQUFjLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDakQsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBQ0QsTUFBTSxlQUFlLEdBQUcsY0FBYyxDQUFDLGdCQUFnQixFQUFFLGVBQWUsQ0FBQztJQUN6RSxJQUFJLENBQUMsZUFBZSxJQUFJLENBQUMsbUJBQW1CLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxXQUFXLEVBQUUsZUFBZSxDQUFDLEVBQUUsQ0FBQztRQUMxRixPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7SUFDRCxPQUFPLENBQUMsd0JBQXdCLENBQUMsR0FBRyxFQUFFLE1BQU0sQ0FBQyxXQUFXLEVBQUUsY0FBYyxDQUFDLENBQUM7QUFDM0UsQ0FBQyJ9