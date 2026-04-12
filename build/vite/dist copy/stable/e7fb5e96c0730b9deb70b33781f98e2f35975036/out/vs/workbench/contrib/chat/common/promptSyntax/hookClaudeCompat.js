/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { toHookType, extractHookCommandsFromItem } from './hookSchema.js';
import { HOOKS_BY_TARGET } from './hookTypes.js';
import { Target } from './promptTypes.js';
export { extractHookCommandsFromItem };
/**
 * Cached inverse mapping from HookType to Claude hook type name.
 * Lazily computed on first access.
 */
let _hookTypeToClaudeName;
function getHookTypeToClaudeNameMap() {
    if (!_hookTypeToClaudeName) {
        _hookTypeToClaudeName = new Map();
        for (const [claudeName, hookType] of Object.entries(HOOKS_BY_TARGET[Target.Claude])) {
            _hookTypeToClaudeName.set(hookType, claudeName);
        }
    }
    return _hookTypeToClaudeName;
}
/**
 * Resolves a Claude hook type name to our abstract HookType.
 */
export function resolveClaudeHookType(name) {
    return HOOKS_BY_TARGET[Target.Claude][name];
}
/**
 * Gets the Claude hook type name for a given abstract HookType.
 * Returns undefined if the hook type is not supported in Claude.
 */
export function getClaudeHookTypeName(hookType) {
    return getHookTypeToClaudeNameMap().get(hookType);
}
/**
 * Parses hooks from a Claude settings.json file.
 * Claude format:
 * {
 *   "hooks": {
 *     "PreToolUse": [
 *       { "matcher": "Bash", "hooks": [{ "type": "command", "command": "..." }] }
 *     ]
 *   }
 * }
 *
 * Or simpler format:
 * {
 *   "hooks": {
 *     "PreToolUse": [{ "type": "command", "command": "..." }]
 *   }
 * }
 *
 * If the file has `disableAllHooks: true` at the top level, all hooks are filtered out.
 */
export function parseClaudeHooks(json, workspaceRootUri, userHome) {
    const result = new Map();
    if (!json || typeof json !== 'object') {
        return { hooks: result, disabledAllHooks: false };
    }
    const root = json;
    // Check for disableAllHooks property at the top level
    if (root.disableAllHooks === true) {
        return { hooks: result, disabledAllHooks: true };
    }
    const hooks = root.hooks;
    if (!hooks || typeof hooks !== 'object') {
        return { hooks: result, disabledAllHooks: false };
    }
    const hooksObj = hooks;
    for (const originalId of Object.keys(hooksObj)) {
        // Resolve Claude hook type name to our canonical HookType
        const hookType = resolveClaudeHookType(originalId) ?? toHookType(originalId);
        if (!hookType) {
            continue;
        }
        const hookArray = hooksObj[originalId];
        if (!Array.isArray(hookArray)) {
            continue;
        }
        const commands = [];
        for (const item of hookArray) {
            // Use shared helper that handles both direct commands and nested matcher structures
            const extracted = extractHookCommandsFromItem(item, workspaceRootUri, userHome);
            commands.push(...extracted);
        }
        if (commands.length > 0) {
            const existing = result.get(hookType);
            if (existing) {
                existing.hooks.push(...commands);
            }
            else {
                result.set(hookType, { hooks: commands, originalId });
            }
        }
    }
    return { hooks: result, disabledAllHooks: false };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaG9va0NsYXVkZUNvbXBhdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Byb21wdFN5bnRheC9ob29rQ2xhdWRlQ29tcGF0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxVQUFVLEVBQWdCLDJCQUEyQixFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFDeEYsT0FBTyxFQUFFLGVBQWUsRUFBWSxNQUFNLGdCQUFnQixDQUFDO0FBQzNELE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxrQkFBa0IsQ0FBQztBQUUxQyxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsQ0FBQztBQUV2Qzs7O0dBR0c7QUFDSCxJQUFJLHFCQUF3RCxDQUFDO0FBRTdELFNBQVMsMEJBQTBCO0lBQ2xDLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1FBQzVCLHFCQUFxQixHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7UUFDbEMsS0FBSyxNQUFNLENBQUMsVUFBVSxFQUFFLFFBQVEsQ0FBQyxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDckYscUJBQXFCLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxVQUFVLENBQUMsQ0FBQztRQUNqRCxDQUFDO0lBQ0YsQ0FBQztJQUNELE9BQU8scUJBQXFCLENBQUM7QUFDOUIsQ0FBQztBQUVEOztHQUVHO0FBQ0gsTUFBTSxVQUFVLHFCQUFxQixDQUFDLElBQVk7SUFDakQsT0FBTyxlQUFlLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQzdDLENBQUM7QUFFRDs7O0dBR0c7QUFDSCxNQUFNLFVBQVUscUJBQXFCLENBQUMsUUFBa0I7SUFDdkQsT0FB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