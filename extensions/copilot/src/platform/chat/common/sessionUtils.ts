/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../util/vs/base/common/uri';
import { Schemas } from '../../../util/vs/base/common/network';

/**
 * A set of well-known session types
 */
export namespace SessionType {
	export const CopilotCLI = 'copilotcli';
	export const CopilotCloud = 'copilot-cloud-agent';
	export const Local = 'local';
	export const ClaudeCode = 'claude-code';
	export const Codex = 'openai-codex';
	export const Growth = 'copilot-growth';
	export const AgentHostCopilot = 'agent-host-copilot';
}



/**
 * Decode a VS Code chat session resource URI to extract the raw session ID.
 *
 * Handles multiple URI schemes:
 * - `vscode-chat-session://local/<base64EncodedSessionId>` — foreground chat sessions
 * - `copilotcli://<sessionId>` — CLI in-process sessions
 * - `claude-code://<sessionId>` — Claude Code sessions
 *
 * Used by the debug panel, span export, and other session-aware features.
 */
export function decodeSessionId(sessionResource: URI): string {
	if (sessionResource.scheme === SessionType.CopilotCLI || sessionResource.scheme === SessionType.ClaudeCode) {
		return sessionResource.path.replace(/^\//, '');
	}
	const pathSegment = sessionResource.path.replace(/^\//, '').split('/').pop() || '';
	if (pathSegment) {
		try {
			return Buffer.from(pathSegment, 'base64').toString('utf-8');
		} catch { /* not base64, use as-is */ }
	}
	return sessionResource.toString();
}

/**
 * Extracts the chat session type from a resource URI.
 *
 * @param sessionResource - The chat session resource URI
 * @returns The session type string. Returns `SessionType.Local` for local sessions
 *          (vscodeChatEditor and vscodeLocalChatSession schemes), or the scheme/authority
 *          for contributed sessions.
 */
export function getChatSessionType(sessionResource: URI): string {
	if (sessionResource.scheme === Schemas.vscodeChatEditor) {
		return SessionType.Local;
	}

	if (sessionResource.scheme === Schemas.vscodeLocalChatSession) {
		return sessionResource.authority || SessionType.Local;
	}

	return sessionResource.scheme;
}

/**
 * Returns whether a customization is offered in the provided session type.
 * Mirrors core's `matchesSessionType`.
 */
export function matchesSessionType(sessionTypes: readonly string[] | undefined, currentSessionType: string | undefined): boolean {
	return sessionTypes === undefined || currentSessionType === undefined || sessionTypes.includes(currentSessionType);
}

