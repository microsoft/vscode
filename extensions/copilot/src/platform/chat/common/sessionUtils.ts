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
	export const Codex = 'openai-codex';
	export const Growth = 'copilot-growth';
	export const AgentHostCopilot = 'agent-host-copilot';
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
