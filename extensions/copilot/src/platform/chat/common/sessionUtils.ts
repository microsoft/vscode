/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../util/vs/base/common/uri';
import { Schemas } from '../../../util/vs/base/common/network';

const LOCAL_SESSION_TYPE = 'local';

/**
 * Extracts the chat session type from a resource URI.
 *
 * @param sessionResource - The chat session resource URI
 * @returns The session type string. Returns `'local'` for local sessions
 *          (vscodeChatEditor and vscodeLocalChatSession schemes), or the scheme/authority
 *          for contributed sessions.
 */
export function getChatSessionType(sessionResource: URI): string {
	if (sessionResource.scheme === Schemas.vscodeChatEditor) {
		return LOCAL_SESSION_TYPE;
	}

	if (sessionResource.scheme === Schemas.vscodeLocalChatSession) {
		return sessionResource.authority || LOCAL_SESSION_TYPE;
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
