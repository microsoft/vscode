/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../../../base/common/types.js';
import { ChatModeKind } from '../constants.js';

export const CHAT_DRAFT_TRYOUT_PRESENTATION = 'chatDraft';

/** Creates an independent, unsent draft without changing the user's default provider or mode. */
export interface IChatDraftTryoutPayload {
	readonly sessionType: string;
	readonly mode: ChatModeKind;
	readonly prompt?: string;
	readonly title?: string;
	readonly attachContext?: {
		/** Command identifiers of registered Add Context entries, not commands to execute directly. */
		readonly commandIds: readonly string[];
		/** An enabled extension to activate before checking its lazily registered picker commands. */
		readonly extensionId?: string;
		readonly placeholder?: string;
	};
}

export function isChatDraftTryoutPayload(value: unknown): value is IChatDraftTryoutPayload {
	if (!isObject(value)) {
		return false;
	}
	const payload = value as Partial<IChatDraftTryoutPayload>;
	return typeof payload.sessionType === 'string' && /^[a-zA-Z][a-zA-Z0-9+.-]*$/.test(payload.sessionType)
		&& (payload.mode === ChatModeKind.Ask || payload.mode === ChatModeKind.Edit || payload.mode === ChatModeKind.Agent)
		&& (payload.prompt === undefined || typeof payload.prompt === 'string')
		&& (payload.title === undefined || typeof payload.title === 'string')
		&& (payload.attachContext === undefined || (
			isObject(payload.attachContext)
			&& Array.isArray(payload.attachContext.commandIds)
			&& payload.attachContext.commandIds.length > 0
			&& payload.attachContext.commandIds.every(id => typeof id === 'string' && id.length > 0)
			&& new Set(payload.attachContext.commandIds).size === payload.attachContext.commandIds.length
			&& (payload.attachContext.extensionId === undefined || typeof payload.attachContext.extensionId === 'string' && payload.attachContext.extensionId.length > 0)
			&& (payload.attachContext.placeholder === undefined || typeof payload.attachContext.placeholder === 'string')
		));
}
