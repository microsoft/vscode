/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { HOOKS_BY_TARGET } from './hookTypes.js';
import { Target } from './promptTypes.js';
const COPILOT_CLI_HOOK_TYPE_MAP = HOOKS_BY_TARGET[Target.GitHubCopilot];
/**
 * Cached inverse mapping from HookType to Copilot CLI hook type name.
 * Lazily computed on first access.
 */
let _hookTypeToCopilotCliName;
function getHookTypeToCopilotCliNameMap() {
    if (!_hookTypeToCopilotCliName) {
        _hookTypeToCopilotCliName = new Map();
        for (const [copilotCliName, hookType] of Object.entries(COPILOT_CLI_HOOK_TYPE_MAP)) {
            _hookTypeToCopilotCliName.set(hookType, copilotCliName);
        }
    }
    return _hookTypeToCopilotCliName;
}
/**
 * Resolves a Copilot CLI hook type name to our abstract HookType.
 */
export function resolveCopilotCliHookType(name) {
    return COPILOT_CLI_HOOK_TYPE_MAP[name];
}
/**
 * Gets the Copilot CLI hook type name for a given abstract HookType.
 * Returns undefined if the hook type is not supported in Copilot CLI.
 */
export function getCopilotCliHookTypeName(hookType) {
    return getHookTypeToCopilotCliNameMap().get(hookType);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaG9va0NvcGlsb3RDbGlDb21wYXQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9wcm9tcHRTeW50YXgvaG9va0NvcGlsb3RDbGlDb21wYXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGVBQWUsRUFBWSxNQUFNLGdCQUFnQixDQUFDO0FBQzNELE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxrQkFBa0IsQ0FBQztBQUUxQyxNQUFNLHlCQUF5QixHQUE2QixlQUFlLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxDQUFDO0FBRWxHOzs7R0FHRztBQUNILElBQUkseUJBQTRELENBQUM7QUFFakUsU0FBUyw4QkFBOEI7SUFDdEMsSUFBSSxDQUFDLHlCQUF5QixFQUFFLENBQUM7UUFDaEMseUJBQXlCLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUN0QyxLQUFLLE1BQU0sQ0FBQyxjQUFjLEVBQUUsUUFBUSxDQUFDLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyx5QkFBeUIsQ0FBQyxFQUFFLENBQUM7WUFDcEYseUJBQXlCLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxjQUFjLENBQUMsQ0FBQztRQUN6RCxDQUFDO0lBQ0YsQ0FBQztJQUNELE9BQU8seUJBQXlCLENBQUM7QUFDbEMsQ0FBQztBQUVEOztHQUVHO0FBQ0gsTUFBTSxVQUFVLHlCQUF5QixDQUFDLElBQVk7SUFDckQsT0FBUSx5QkFBc0QsQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUN0RSxDQUFDO0FBRUQ7OztHQUdHO0FBQ0gsTUFBTSxVQUFVLHlCQUF5QixDQUFDLFFBQWtCO0lBQzNELE9BQU8sOEJBQThCLEVBQUUsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUM7QUFDdkQsQ0FBQyJ9