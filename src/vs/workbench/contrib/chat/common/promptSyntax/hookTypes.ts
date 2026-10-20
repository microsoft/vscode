/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../../nls.js';
import { Target } from './promptTypes.js';

/**
 * Enum of hook types across all targets. For the set of supported hooks per target, see HOOKS_BY_TARGET.
 */
export enum HookType {
	SessionStart = 'SessionStart',
	SessionEnd = 'SessionEnd',
	UserPromptSubmit = 'UserPromptSubmit',
	PreToolUse = 'PreToolUse',
	PostToolUse = 'PostToolUse',
	PreCompact = 'PreCompact',
	SubagentStart = 'SubagentStart',
	SubagentStop = 'SubagentStop',
	Stop = 'Stop',
	ErrorOccurred = 'ErrorOccurred',
}

/**
 * String literal type derived from HookType enum values.
 */
export type HookTypeValue = `${HookType}`;

export const HOOKS_BY_TARGET: Record<Target, Record<string, HookType>> = {
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
		'errorOccurred': HookType.ErrorOccurred,
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
	[Target.Undefined]: {
		'SessionStart': HookType.SessionStart,
		'SessionEnd': HookType.SessionEnd,
		'UserPromptSubmit': HookType.UserPromptSubmit,
		'PreToolUse': HookType.PreToolUse,
		'PostToolUse': HookType.PostToolUse,
		'PreCompact': HookType.PreCompact,
		'SubagentStart': HookType.SubagentStart,
		'SubagentStop': HookType.SubagentStop,
		'Stop': HookType.Stop,
		'ErrorOccurred': HookType.ErrorOccurred,
	}
};

/**
 * Metadata for a hook type including localized label and description.
 */
export interface IHookTypeMeta {
	readonly label: string;
	readonly description: string;
}

/**
 * Metadata for hook types including localized labels and descriptions
 */
export const HOOK_METADATA: { [key in HookType]: IHookTypeMeta } = {
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

const copilotAgentHookMetadata: Record<string, IHookTypeMeta> = {
	sessionStart: HOOK_METADATA[HookType.SessionStart],
	sessionEnd: HOOK_METADATA[HookType.SessionEnd],
	userPromptSubmitted: HOOK_METADATA[HookType.UserPromptSubmit],
	userPromptTransformed: {
		label: nls.localize('hookType.userPromptTransformed.label', "User Prompt Transformed"),
		description: nls.localize('hookType.userPromptTransformed.description', "Executed after the user's prompt is transformed.")
	},
	preToolUse: HOOK_METADATA[HookType.PreToolUse],
	preMcpToolCall: {
		label: nls.localize('hookType.preMcpToolCall.label', "Pre-MCP Tool Call"),
		description: nls.localize('hookType.preMcpToolCall.description', "Executed before an MCP tool is called.")
	},
	postToolUse: HOOK_METADATA[HookType.PostToolUse],
	postToolUseFailure: {
		label: nls.localize('hookType.postToolUseFailure.label', "Post-Tool Use Failure"),
		description: nls.localize('hookType.postToolUseFailure.description', "Executed after a tool invocation fails.")
	},
	errorOccurred: HOOK_METADATA[HookType.ErrorOccurred],
	agentStop: HOOK_METADATA[HookType.Stop],
	subagentStart: HOOK_METADATA[HookType.SubagentStart],
	subagentStop: HOOK_METADATA[HookType.SubagentStop],
	preCompact: HOOK_METADATA[HookType.PreCompact],
	permissionRequest: {
		label: nls.localize('hookType.permissionRequest.label', "Permission Request"),
		description: nls.localize('hookType.permissionRequest.description', "Executed when the agent requests permission.")
	},
	notification: {
		label: nls.localize('hookType.notification.label', "Notification"),
		description: nls.localize('hookType.notification.description', "Executed when the agent emits a notification.")
	},
};

const copilotAgentHookAliases: Record<string, string> = {
	SessionStart: 'sessionStart',
	SessionEnd: 'sessionEnd',
	UserPromptSubmit: 'userPromptSubmitted',
	PreToolUse: 'preToolUse',
	PreMcpToolCall: 'preMcpToolCall',
	PostToolUse: 'postToolUse',
	PostToolUseFailure: 'postToolUseFailure',
	ErrorOccurred: 'errorOccurred',
	Stop: 'agentStop',
	SubagentStart: 'subagentStart',
	SubagentStop: 'subagentStop',
	PreCompact: 'preCompact',
	PermissionRequest: 'permissionRequest',
	Notification: 'notification',
};

export function getCanonicalAgentHookName(target: Target, name: string): string | undefined {
	if (target === Target.GitHubCopilot) {
		const canonicalName = copilotAgentHookAliases[name] ?? name;
		return copilotAgentHookMetadata[canonicalName] ? canonicalName : undefined;
	}
	return HOOKS_BY_TARGET[target]?.[name] ? name : undefined;
}

export function getAgentHookMetadata(target: Target, name: string): IHookTypeMeta | undefined {
	const canonicalName = getCanonicalAgentHookName(target, name);
	if (!canonicalName) {
		return undefined;
	}
	if (target === Target.GitHubCopilot) {
		return copilotAgentHookMetadata[canonicalName];
	}
	const hookType = HOOKS_BY_TARGET[target]?.[canonicalName];
	return hookType ? HOOK_METADATA[hookType] : undefined;
}

export function getValidAgentHookNames(target: Target, includeAliases: boolean): readonly string[] {
	if (target === Target.GitHubCopilot) {
		const names = Object.keys(copilotAgentHookMetadata);
		return includeAliases ? [...names, ...Object.keys(copilotAgentHookAliases)] : names;
	}
	return Object.keys(HOOKS_BY_TARGET[target] ?? HOOKS_BY_TARGET[Target.Undefined]);
}
