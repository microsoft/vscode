/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * DEMO: how a host server tool is deferred behind tool search on Copilot SDK sessions.
 *
 * Launch VS Code with `VSCODE_AGENT_HOST_DEFERRAL_DEMO` set to:
 * - `deferred`: both demo tools use the default. `deferLoading` is unset, so
 *   `CopilotAgentSession._createServerSdkTools` hands the SDK `defer: 'auto'` and
 *   the runtime hides the schema until the model calls `tool_search_tool`.
 * - `eager`: `demo_pin_session_note` opts out through `getDefinitionForSession`
 *   (`deferLoading: false` → SDK `defer: 'never'`), so its schema is sent on every
 *   request. `demo_lookup_release_codename` stays deferred.
 *
 * Deferral only applies when tool search is active for the session
 * (`chat.agentHost.copilot.toolSearch.enabled`, a model that supports it, and a
 * client that forwards `toolSearch`). Otherwise every server tool is sent with
 * `defer: 'never'`.
 *
 * Unset (the default) contributes nothing, so prompts and the deferral budget
 * baseline in `serverToolGroups.test.ts` are unchanged.
 */

import type { IAgentServerToolDefinition } from '../../common/agentServerTools.js';
import type { IServerToolGroup } from './agentServerToolHost.js';

export const DEFERRAL_DEMO_ENV_VAR = 'VSCODE_AGENT_HOST_DEFERRAL_DEMO';

export type DeferralDemoMode = 'off' | 'deferred' | 'eager';

export const enum DeferralDemoToolName {
	LookupReleaseCodename = 'demo_lookup_release_codename',
	PinSessionNote = 'demo_pin_session_note',
}

export function parseDeferralDemoMode(value: string | undefined): DeferralDemoMode {
	switch (value?.trim().toLowerCase()) {
		case 'deferred':
		case '1':
		case 'true':
			return 'deferred';
		case 'eager':
			return 'eager';
		default:
			return 'off';
	}
}

const definitions: readonly IAgentServerToolDefinition[] = [
	{
		// Default path: no `deferLoading`, so Copilot sessions defer it.
		name: DeferralDemoToolName.LookupReleaseCodename,
		description: 'Look up the demo codename for a VS Code release version, such as 1.105. Use only when the user asks for a release codename in the tool deferral demo.',
		inputSchema: {
			type: 'object',
			properties: { version: { type: 'string', description: 'Release version, for example 1.105.' } },
			required: ['version'],
		},
	},
	{
		// Also deferred by default; `eager` mode flips it per session below.
		name: DeferralDemoToolName.PinSessionNote,
		description: 'Pin a short note to the current chat in the tool deferral demo. Use when the user asks to pin or remember a demo note.',
		inputSchema: {
			type: 'object',
			properties: { note: { type: 'string', description: 'The note to pin.' } },
			required: ['note'],
		},
	},
];

function readStringArg(rawArgs: unknown, key: string, toolName: string): string {
	const value = rawArgs && typeof rawArgs === 'object' ? (rawArgs as Record<string, unknown>)[key] : undefined;
	if (typeof value !== 'string' || !value.trim()) {
		throw new Error(`${toolName} requires a non-empty "${key}" string.`);
	}
	return value.trim();
}

/** Returns the demo group for {@link mode}, or no groups when the demo is off. */
export function createDeferralDemoServerToolGroups(mode: DeferralDemoMode): readonly IServerToolGroup[] {
	if (mode === 'off') {
		return [];
	}
	return [{
		definitions,
		isEnabled: () => true,
		isEnabledForSession: () => true,
		getDefinitionForSession(definition) {
			// Real tools scope this to the session condition that needs the tool on
			// the first turn (see `rename_chat` and `set_workspace` in sessionServerTools.ts).
			if (mode === 'eager' && definition.name === DeferralDemoToolName.PinSessionNote) {
				return { ...definition, deferLoading: false };
			}
			return definition;
		},
		execute(_stateManager, _context, toolName, rawArgs) {
			switch (toolName) {
				case DeferralDemoToolName.LookupReleaseCodename: {
					const version = readStringArg(rawArgs, 'version', toolName);
					return `Demo codename for ${version}: "Deferred ${version}". This tool was loaded through tool search.`;
				}
				case DeferralDemoToolName.PinSessionNote:
					return `Pinned demo note: ${readStringArg(rawArgs, 'note', toolName)}`;
				default:
					throw new Error(`Unknown deferral demo tool: ${toolName}`);
			}
		},
	}];
}
