/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { findNodeAtLocation, parse as parseJSONC, parseTree } from '../../../../../base/common/json.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { formatHookCommandLabel } from '../../common/promptSyntax/hookSchema.js';
import { HOOK_METADATA, HookType } from '../../common/promptSyntax/hookTypes.js';
import { parseHooksFromFile, parseHooksIgnoringDisableAll } from '../../common/promptSyntax/hookCompatibility.js';
import * as nls from '../../../../../nls.js';
/**
 * Converts an offset in content to a 1-based line and column.
 */
function offsetToPosition(content, offset) {
    let line = 1;
    let column = 1;
    for (let i = 0; i < offset && i < content.length; i++) {
        if (content[i] === '\n') {
            line++;
            column = 1;
        }
        else {
            column++;
        }
    }
    return { line, column };
}
/**
 * Finds the n-th command field node in a hook type array, handling both simple and nested formats.
 * This iterates through the structure in the same order as the parser flattens hooks.
 */
function findNthCommandNode(tree, hookType, targetIndex, fieldName) {
    const hookTypeArray = findNodeAtLocation(tree, ['hooks', hookType]);
    if (!hookTypeArray || hookTypeArray.type !== 'array' || !hookTypeArray.children) {
        return undefined;
    }
    let currentIndex = 0;
    for (let i = 0; i < hookTypeArray.children.length; i++) {
        const item = hookTypeArray.children[i];
        if (item.type !== 'object') {
            continue;
        }
        // Check if this item has nested hooks (matcher format)
        const nestedHooksNode = findNodeAtLocation(tree, ['hooks', hookType, i, 'hooks']);
        if (nestedHooksNode && nestedHooksNode.type === 'array' && nestedHooksNode.children) {
            // Iterate through nested hooks
            for (let j = 0; j < nestedHooksNode.children.length; j++) {
                if (currentIndex === targetIndex) {
                    return findNodeAtLocation(tree, ['hooks', hookType, i, 'hooks', j, fieldName]);
                }
                currentIndex++;
            }
        }
        else {
            // Simple format - direct command
            if (currentIndex === targetIndex) {
                return findNodeAtLocation(tree, ['hooks', hookType, i, fieldName]);
            }
            currentIndex++;
        }
    }
    return undefined;
}
/**
 * Finds the selection range for a hook command field value in JSON content.
 * Supports both simple format and nested matcher format:
 * - Simple: { hooks: { hookType: [{ command: "..." }] } }
 * - Nested: { hooks: { hookType: [{ matcher: "", hooks: [{ command: "..." }] }] } }
 *
 * The index is a flattened index across all commands in the hook type, regardless of nesting.
 *
 * @param content The JSON file content
 * @param hookType The hook type (e.g., "sessionStart")
 * @param index The flattened index of the hook command within the hook type
 * @param fieldName The field name to find ('command', 'bash', or 'powershell')
 * @returns The selection range for the field value, or undefined if not found
 */
export function findHookCommandSelection(content, hookType, index, fieldName) {
    const tree = parseTree(content);
    if (!tree) {
        return undefined;
    }
    const node = findNthCommandNode(tree, hookType, index, fieldName);
    if (!node || node.type !== 'string') {
        return undefined;
    }
    // Node offset/length includes quotes, so adjust to select only the value content
    const valueStart = node.offset + 1; // After opening quote
    const valueEnd = node.offset + node.length - 1; // Before closing quote
    const start = offsetToPosition(content, valueStart);
    const end = offsetToPosition(content, valueEnd);
    return {
        startLineNumber: start.line,
        startColumn: start.column,
        endLineNumber: end.line,
        endColumn: end.column
    };
}
/**
 * Finds the selection range for a hook command string in a YAML/Markdown file
 * (e.g., an agent `.md` file with YAML frontmatter).
 *
 * Searches for the command text within command field lines and selects the value.
 * Supports all hook command field keys: command, windows, linux, osx, bash, powershell.
 *
 * @param content The full file content
 * @param commandText The command string to locate
 * @returns The selection range, or undefined if not found
 */
export function findHookCommandInYaml(content, commandText) {
    const commandFieldKeys = ['command', 'windows', 'linux', 'osx', 'bash', 'powershell'];
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trimStart();
        // Only match lines whose YAML key is a known command field
        const matchedKey = commandFieldKeys.find(key => trimmed.startsWith(`${key}:`) || trimmed.startsWith(`- ${key}:`));
        if (!matchedKey) {
            continue;
        }
        // Search after the colon to avoid matching within the key name itself
        const colonIdx = line.indexOf(':');
        const idx = line.indexOf(commandText, colonIdx + 1);
        if (idx !== -1) {
            // Verify this is a full match (not a substring of a longer command)
            const afterIdx = idx + commandText.length;
            const charAfter = afterIdx < line.length ? line.charCodeAt(afterIdx) : -1;
            // Accept if what follows is end of line, a quote, or whitespace
            if (charAfter === -1 || charAfter === 34 /* " */ || charAfter === 39 /* ' */ || charAfter === 32 /* space */ || charAfter === 9 /* tab */) {
                return {
                    startLineNumber: i + 1,
                    startColumn: idx + 1,
                    endLineNumber: i + 1,
                    endColumn: idx + 1 + commandText.length
                };
            }
        }
    }
    return undefined;
}
/**
 * Parses all hook files and extracts individual hooks.
 * This is a shared helper used by both the configure action and diagnostics.
 */
export async function parseAllHookFiles(promptsService, fileService, labelService, workspaceRootUri, userHome, os, token, options) {
    const hookFiles = await promptsService.listPromptFiles(PromptsType.hook, token);
    const parsedHooks = [];
    for (const hookFile of hookFiles) {
        try {
            const content = await fileService.readFile(hookFile.uri);
            const json = parseJSONC(content.value.toString());
            // Use format-aware parsing
            const { hooks } = parseHooksFromFile(hookFile.uri, json, workspaceRootUri, userHome);
            for (const [hookType, { hooks: commands, originalId }] of hooks) {
                const hookTypeMeta = HOOK_METADATA[hookType];
                if (!hookTypeMeta) {
                    continue;
                }
                for (let i = 0; i < commands.length; i++) {
                    const command = commands[i];
                    const commandLabel = formatHookCommandLabel(command, os) || nls.localize('commands.hook.emptyCommand', '(empty command)');
                    parsedHooks.push({
                        hookType,
                        hookTypeLabel: hookTypeMeta.label,
                        command,
                        commandLabel,
                        fileUri: hookFile.uri,
                        filePath: labelService.getUriLabel(hookFile.uri, { relative: true }),
                        index: i,
                        originalHookTypeId: originalId
                    });
                }
            }
        }
        catch (error) {
            // Skip files that can't be parsed, but surface the failure for diagnostics
            console.error('Failed to read or parse hook file', hookFile.uri.toString(), error);
        }
    }
    // Parse additional disabled files (e.g., files with disableAllHooks: true)
    // These are parsed ignoring the disableAllHooks flag so we can show their hooks as disabled
    if (options?.additionalDisabledFileUris) {
        for (const uri of options.additionalDisabledFileUris) {
            try {
                const content = await fileService.readFile(uri);
                const json = parseJSONC(content.value.toString());
                // Parse hooks ignoring disableAllHooks - use the underlying format parsers directly
                const { hooks } = parseHooksIgnoringDisableAll(uri, json, workspaceRootUri, userHome);
                for (const [hookType, { hooks: commands, originalId }] of hooks) {
                    const hookTypeMeta = HOOK_METADATA[hookType];
                    if (!hookTypeMeta) {
                        continue;
                    }
                    for (let i = 0; i < commands.length; i++) {
                        const command = commands[i];
                        const commandLabel = formatHookCommandLabel(command, os) || nls.localize('commands.hook.emptyCommand', '(empty command)');
                        parsedHooks.push({
                            hookType,
                            hookTypeLabel: hookTypeMeta.label,
                            command,
                            commandLabel,
                            fileUri: uri,
                            filePath: labelService.getUriLabel(uri, { relative: true }),
                            index: i,
                            originalHookTypeId: originalId,
                            disabled: true
                        });
                    }
                }
            }
            catch (error) {
                console.error('Failed to read or parse disabled hook file', uri.toString(), error);
            }
        }
    }
    // Collect hooks from custom agents' frontmatter
    if (options?.includeAgentHooks) {
        const agents = await promptsService.getCustomAgents(token);
        for (const agent of agents) {
            if (!agent.hooks) {
                continue;
            }
            for (const hookTypeValue of Object.values(HookType)) {
                const commands = agent.hooks[hookTypeValue];
                if (!commands || commands.length === 0) {
                    continue;
                }
                const hookTypeMeta = HOOK_METADATA[hookTypeValue];
                if (!hookTypeMeta) {
                    continue;
                }
                for (let i = 0; i < commands.length; i++) {
                    const command = commands[i];
                    const commandLabel = formatHookCommandLabel(command, os) || nls.localize('commands.hook.emptyCommand', '(empty command)');
                    parsedHooks.push({
                        hookType: hookTypeValue,
                        hookTypeLabel: hookTypeMeta.label,
                        command,
                        commandLabel,
                        fileUri: agent.uri,
                        filePath: labelService.getUriLabel(agent.uri, { relative: true }),
                        index: i,
                        originalHookTypeId: hookTypeValue,
                        agentName: agent.name,
                    });
                }
            }
        }
    }
    return parsedHooks;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaG9va1V0aWxzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3Byb21wdFN5bnRheC9ob29rVXRpbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGtCQUFrQixFQUFRLEtBQUssSUFBSSxVQUFVLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFJOUcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBR3ZFLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBRWpGLE9BQU8sRUFBRSxhQUFhLEVBQUUsUUFBUSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDakYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLDRCQUE0QixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDbEgsT0FBTyxLQUFLLEdBQUcsTUFBTSx1QkFBdUIsQ0FBQztBQUk3Qzs7R0FFRztBQUNILFNBQVMsZ0JBQWdCLENBQUMsT0FBZSxFQUFFLE1BQWM7SUFDeEQsSUFBSSxJQUFJLEdBQUcsQ0FBQyxDQUFDO0lBQ2IsSUFBSSxNQUFNLEdBQUcsQ0FBQyxDQUFDO0lBQ2YsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLE1BQU0sSUFBSSxDQUFDLEdBQUcsT0FBTyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1FBQ3ZELElBQUksT0FBTyxDQUFDLENBQUMsQ0FBQyxLQUFLLElBQUksRUFBRSxDQUFDO1lBQ3pCLElBQUksRUFBRSxDQUFDO1lBQ1AsTUFBTSxHQUFHLENBQUMsQ0FBQztRQUNaLENBQUM7YUFBTSxDQUFDO1lBQ1AsTUFBTSxFQUFFLENBQUM7UUFDVixDQUFDO0lBQ0YsQ0FBQztJQUNELE9BQU8sRUFBRSxJ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