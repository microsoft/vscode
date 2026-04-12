/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isEqualOrParent } from '../../../../base/common/resources.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { PromptsStorage } from './promptSyntax/service/promptsService.js';
export const IAICustomizationWorkspaceService = createDecorator('aiCustomizationWorkspaceService');
/**
 * Storage type discriminator for built-in customizations shipped with the application.
 */
export const BUILTIN_STORAGE = 'builtin';
/**
 * Possible section IDs for the AI Customization Management Editor sidebar.
 */
export const AICustomizationManagementSection = {
    Agents: 'agents',
    Skills: 'skills',
    Instructions: 'instructions',
    Prompts: 'prompts',
    Hooks: 'hooks',
    McpServers: 'mcpServers',
    Plugins: 'plugins',
    Models: 'models',
};
/**
 * Applies a storage source filter to an array of items that have uri and storage.
 * Removes items whose storage is not in the filter's source list,
 * and for user-storage items, removes those not under an allowed root.
 */
export function applyStorageSourceFilter(items, filter) {
    const sourceSet = new Set(filter.sources);
    return items.filter(item => {
        if (!sourceSet.has(item.storage)) {
            return false;
        }
        if (item.storage === PromptsStorage.user && filter.includedUserFileRoots) {
            return filter.includedUserFileRoots.some(root => isEqualOrParent(item.uri, root));
        }
        return true;
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2FpQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFLaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUU3RixPQUFPLEVBQTJCLGNBQWMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRW5HLE1BQU0sQ0FBQyxNQUFNLGdDQUFnQyxHQUFHLGVBQWUsQ0FBbUMsaUNBQWlDLENBQUMsQ0FBQztBQVFySTs7R0FFRztBQUNILE1BQU0sQ0FBQyxNQUFNLGVBQWUsR0FBa0MsU0FBUyxDQUFDO0FBRXhFOztHQUVHO0FBQ0gsTUFBTSxDQUFDLE1BQU0sZ0NBQWdDLEdBQUc7SUFDL0MsTUFBTSxFQUFFLFFBQVE7SUFDaEIsTUFBTSxFQUFFLFFBQVE7SUFDaEIsWUFBWSxFQUFFLGNBQWM7SUFDNUIsT0FBTyxFQUFFLFNBQVM7SUFDbEIsS0FBSyxFQUFFLE9BQU87SUFDZCxVQUFVLEVBQUUsWUFBWTtJQUN4QixPQUFPLEVBQUUsU0FBUztJQUNsQixNQUFNLEVBQUUsUUFBUTtDQUNQLENBQUM7QUFxQlg7Ozs7R0FJRztBQUNILE1BQU0sVUFBVSx3QkFBd0IsQ0FBNEQsS0FBbUIsRUFBRSxNQUE0QjtJQUNwSixNQUFNLFNBQVMsR0FBRyxJQUFJLEdBQUcsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDMUMsT0FBTyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFO1FBQzFCLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ2xDLE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQztRQUNELElBQUksSUFBSSxDQUFDLE9BQU8sS0FBSyxjQUFjLENBQUMsSUFBSSxJQUFJLE1BQU0sQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1lBQzFFLE9BQU8sTUFBTSxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDbkYsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDIn0=