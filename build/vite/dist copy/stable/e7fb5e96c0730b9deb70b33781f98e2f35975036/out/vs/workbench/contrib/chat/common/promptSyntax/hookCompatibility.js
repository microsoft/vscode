/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { basename, dirname } from '../../../../../base/common/path.js';
import { toHookType } from './hookSchema.js';
import { parseClaudeHooks, extractHookCommandsFromItem } from './hookClaudeCompat.js';
import { resolveCopilotCliHookType } from './hookCopilotCliCompat.js';
/**
 * Supported hook file formats.
 */
export var HookSourceFormat;
(function (HookSourceFormat) {
    /** GitHub Copilot hooks .json format */
    HookSourceFormat["Copilot"] = "copilot";
    /** Claude settings.json / settings.local.json format */
    HookSourceFormat["Claude"] = "claude";
})(HookSourceFormat || (HookSourceFormat = {}));
/**
 * Determines the hook source format based on the file URI.
 */
export function getHookSourceFormat(fileUri) {
    const filename = basename(fileUri.path).toLowerCase();
    const dir = dirname(fileUri.path);
    // Claude format: .claude/settings.json or .claude/settings.local.json
    if ((filename === 'settings.json' || filename === 'settings.local.json') && dir.endsWith('.claude')) {
        return HookSourceFormat.Claude;
    }
    // Default to Copilot format
    return HookSourceFormat.Copilot;
}
/**
 * Checks if a file is read-only based on its source format.
 * Claude settings files should be read-only from our perspective since they have a different format.
 */
export function isReadOnlyHookSource(format) {
    return format === HookSourceFormat.Claude;
}
/**
 * Parses hooks from a Copilot hooks .json file (our native format).
 */
export function parseCopilotHooks(json, workspaceRootUri, userHome) {
    const result = new Map();
    if (!json || typeof json !== 'object') {
        return result;
    }
    const root = json;
    const hooks = root.hooks;
    if (!hooks || typeof hooks !== 'object') {
        return result;
    }
    const hooksObj = hooks;
    for (const originalId of Object.keys(hooksObj)) {
        const hookType = resolveCopilotCliHookType(originalId) ?? toHookType(originalId);
        if (!hookType) {
            continue;
        }
        const hookArray = hooksObj[originalId];
        if (!Array.isArray(hookArray)) {
            continue;
        }
        const commands = [];
        for (const item of hookArray) {
            // Use helper that handles both direct commands and Claude-style nested matcher structures
            const extracted = extractHookCommandsFromItem(item, workspaceRootUri, userHome);
            commands.push(...extracted);
        }
        if (commands.length > 0) {
            result.set(hookType, { hooks: commands, originalId });
        }
    }
    return result;
}
/**
 * Parses hooks from any supported format, auto-detecting the format from the file URI.
 */
export function parseHooksFromFile(fileUri, json, workspaceRootUri, userHome) {
    const format = getHookSourceFormat(fileUri);
    let hooks;
    let disabledAllHooks = false;
    switch (format) {
        case HookSourceFormat.Claude: {
            const result = parseClaudeHooks(json, workspaceRootUri, userHome);
            hooks = result.hooks;
            disabledAllHooks = result.disabledAllHooks;
            break;
        }
        case HookSourceFormat.Copilot:
        default:
            hooks = parseCopilotHooks(json, workspaceRootUri, userHome);
            break;
    }
    return { format, hooks, disabledAllHooks };
}
/**
 * Parses hooks from a file, ignoring the `disableAllHooks` flag.
 * Used by diagnostics to show which hooks are hidden when `disableAllHooks: true` is set.
 */
export function parseHooksIgnoringDisableAll(fileUri, json, workspaceRootUri, userHome) {
    const format = getHookSourceFormat(fileUri);
    let hooks;
    switch (format) {
        case HookSourceFormat.Claude: {
            // Strip `disableAllHooks` before parsing so the hooks are still extracted
            if (json && typeof json === 'object') {
                const { disableAllHooks: _, ...rest } = json;
                const result = parseClaudeHooks(rest, workspaceRootUri, userHome);
                hooks = result.hooks;
            }
            else {
                hooks = new Map();
            }
            break;
        }
        case HookSourceFormat.Copilot:
        default:
            hooks = parseCopilotHooks(json, workspaceRootUri, userHome);
            break;
    }
    return { format, hooks, disabledAllHooks: true };
}
/**
 * Gets a human-readable label for a hook source format.
 */
export function getHookSourceFormatLabel(format) {
    switch (format) {
        case HookSourceFormat.Claude:
            return 'Claude';
        case HookSourceFormat.Copilot:
            return 'GitHub Copilot';
    }
}
/**
 * Builds a new hook entry object in the appropriate format for the given source format.
 * - Copilot format: `{ type: 'command', command: '' }`
 * - Claude format: `{ matcher: '', hooks: [{ type: 'command', command: '' }] }`
 */
export function buildNewHookEntry(format) {
    const commandEntry = { type: 'command', command: '' };
    if (format === HookSourceFormat.Claude) {
        return { matcher: '', hooks: [commandEntry] };
    }
    return commandEntry;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaG9va0NvbXBhdGliaWxpdHkuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9wcm9tcHRTeW50YXgvaG9va0NvbXBhdGliaWxpdHkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUN2RSxPQUFPLEVBQWdCLFVBQVUsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQzNELE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSwyQkFBMkIsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ3RGLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBb0J0RTs7R0FFRztBQUNILE1BQU0sQ0FBTixJQUFZLGdCQUtYO0FBTEQsV0FBWSxnQkFBZ0I7SUFDM0Isd0NBQXdDO0lBQ3hDLHVDQUFtQixDQUFBO0lBQ25CLHdEQUF3RDtJQUN4RCxxQ0FBaUIsQ0FBQTtBQUNsQixDQUFDLEVBTFcsZ0JBQWdCLEtBQWhCLGdCQUFnQixRQUszQjtBQUVEOztHQUVHO0FBQ0gsTUFBTSxVQUFVLG1CQUFtQixDQUFDLE9BQVk7SUFDL0MsTUFBTSxRQUFRLEdBQUcsUUFBUSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQztJQUN0RCxNQUFNLEdBQUcsR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBRWxDLHNFQUFzRTtJQUN0RSxJQUFJLENBQUMsUUFBUSxLQUFLLGVBQWUsSUFBSSxRQUFRLEtBQUsscUJBQXFCLENBQUMsSUFBSSxHQUFHLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7UUFDckcsT0FBTyxnQkFBZ0IsQ0FBQyxNQUFNLENBQUM7SUFDaEMs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