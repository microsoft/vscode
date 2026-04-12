/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../../nls.js';
import { Target } from './promptTypes.js';
/**
 * Enum of hook types across all targets. For the set of supported hooks per target, see HOOKS_BY_TARGET.
 */
export var HookType;
(function (HookType) {
    HookType["SessionStart"] = "SessionStart";
    HookType["SessionEnd"] = "SessionEnd";
    HookType["UserPromptSubmit"] = "UserPromptSubmit";
    HookType["PreToolUse"] = "PreToolUse";
    HookType["PostToolUse"] = "PostToolUse";
    HookType["PreCompact"] = "PreCompact";
    HookType["SubagentStart"] = "SubagentStart";
    HookType["SubagentStop"] = "SubagentStop";
    HookType["Stop"] = "Stop";
    HookType["ErrorOccurred"] = "ErrorOccurred";
})(HookType || (HookType = {}));
export const HOOKS_BY_TARGET = {
    // see https://code.visualstudio.com/docs/copilot/customization/hooks#_hook-lifecycle-events
    [Target.VSCode]: {
        'SessionStart': HookType.SessionStart,
        'UserPromptSubmit': HookType.UserPromptSubmit,
        'PreToolUse': HookType.PreToolUse,
        'PostToolUse': HookType.PostToolUse,
        'PreCompact': HookType.PreCompact,
        'SubagentStart': HookType.SubagentStart,
        'SubagentStop': HookType.SubagentStop,
        'Stop': HookType.Stop,
    },
    // see https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-hooks#types-of-hooks
    [Target.GitHubCopilot]: {
        'sessionStart': HookType.SessionStart,
        'sessionEnd': HookType.SessionEnd,
        'userPromptSubmitted': HookType.UserPromptSubmit,
        'preToolUse': HookType.PreToolUse,
        'postToolUse': HookType.PostToolUse,
        'agentStop': HookType.Stop,
        'subagentStop': HookType.SubagentStop,
        'errorOccurred': HookType.ErrorOccurred
    },
    // see https://docs.anthropic.com/en/docs/claude-code/hooks
    [Target.Claude]: {
        'SessionStart': HookType.SessionStart,
        'UserPromptSubmit': HookType.UserPromptSubmit,
        'PreToolUse': HookType.PreToolUse,
        'PostToolUse': HookType.PostToolUse,
        'PreCompact': HookType.PreCompact,
        'SubagentStart': HookType.SubagentStart,
        'SubagentStop': HookType.SubagentStop,
        'Stop': HookType.Stop,
    },
    // if no target, just list all known hook types.
    [Target.Undefined]: Object.fromEntries(Object.values(HookType).map(h => [h, h]))
};
/**
 * Metadata for hook types including localized labels and descriptions
 */
export const HOOK_METADATA = {
    [HookType.SessionStart]: {
        label: nls.localize('hookType.sessionStart.label', "Session Start"),
        description: nls.localize('hookType.sessionStart.description', "Executed when a new agent session begins.")
    },
    [HookType.UserPromptSubmit]: {
        label: nls.localize('hookType.userPromptSubmit.label', "User Prompt Submit"),
        description: nls.localize('hookType.userPromptSubmit.description', "Executed when the user submits a prompt to the agent.")
    },
    [HookType.PreToolUse]: {
        label: nls.localize('hookType.preToolUse.label', "Pre-Tool Use"),
        description: nls.localize('hookType.preToolUse.description', "Executed before the agent uses any tool.")
    },
    [HookType.PostToolUse]: {
        label: nls.localize('hookType.postToolUse.label', "Post-Tool Use"),
        description: nls.localize('hookType.postToolUse.description', "Executed after a tool completes execution successfully.")
    },
    [HookType.PreCompact]: {
        label: nls.localize('hookType.preCompact.label', "Pre-Compact"),
        description: nls.localize('hookType.preCompact.description', "Executed before the agent compacts the conversation context.")
    },
    [HookType.SubagentStart]: {
        label: nls.localize('hookType.subagentStart.label', "Subagent Start"),
        description: nls.localize('hookType.subagentStart.description', "Executed when a subagent is started.")
    },
    [HookType.SubagentStop]: {
        label: nls.localize('hookType.subagentStop.label', "Subagent Stop"),
        description: nls.localize('hookType.subagentStop.description', "Executed when a subagent stops.")
    },
    [HookType.Stop]: {
        label: nls.localize('hookType.stop.label', "Stop"),
        description: nls.localize('hookType.stop.description', "Executed when the agent stops.")
    },
    [HookType.SessionEnd]: {
        label: nls.localize('hookType.sessionEnd.label', "Session End"),
        description: nls.localize('hookType.sessionEnd.description', "Executed when an agent session ends.")
    },
    [HookType.ErrorOccurred]: {
        label: nls.localize('hookType.errorOccurred.label', "Error Occurred"),
        description: nls.localize('hookType.errorOccurred.description', "Executed when an error occurs during the agent session.")
    }
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaG9va1R5cGVzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vcHJvbXB0U3ludGF4L2hvb2tUeXBlcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLHVCQUF1QixDQUFDO0FBQzdDLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxrQkFBa0IsQ0FBQztBQUUxQzs7R0FFRztBQUNILE1BQU0sQ0FBTixJQUFZLFFBV1g7QUFYRCxXQUFZLFFBQVE7SUFDbkIseUNBQTZCLENBQUE7SUFDN0IscUNBQXlCLENBQUE7SUFDekIsaURBQXFDLENBQUE7SUFDckMscUNBQXlCLENBQUE7SUFDekIsdUNBQTJCLENBQUE7SUFDM0IscUNBQXlCLENBQUE7SUFDekIsMkNBQStCLENBQUE7SUFDL0IseUNBQTZCLENBQUE7SUFDN0IseUJBQWEsQ0FBQTtJQUNiLDJDQUErQixDQUFBO0FBQ2hDLENBQUMsRUFYVyxRQUFRLEtBQVIsUUFBUSxRQVduQjtBQU9ELE1BQU0sQ0FBQyxNQUFNLGVBQWUsR0FBNkM7SUFDeEUsNEZBQTRGO0lBQzVGLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxFQUFFO1FBQ2hCLGNBQWMsRUFBRSxRQUFRLENBQUMsWUFBWTtRQUNyQyxrQkFBa0IsRUFBRSxRQUFRLENBQUMsZ0JBQWdCO1FBQzdDLFlBQVksRUFBRSxRQUFRLENBQUMsVUFBVTtRQUNqQyxhQUFhLEVBQUUsUUFBUSxDQUFDLFdBQVc7UUFDbkMsWUFBWSxFQUFFLFFBQVEsQ0FBQyxVQUFVO1FBQ2pDLGVBQWUsRUFBRSxRQUFRLENBQUMsYUFBYTtRQUN2QyxjQUFjLEVBQUUsUUFBUSxDQUFDLFlBQVk7UUFDckMsTUFBTSxFQUFFLFFBQVEsQ0FBQyxJQUFJO0tBQ3JCO0lBQ0QsaUdBQWlHO0lB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