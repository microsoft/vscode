/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
import { AgentSession } from './agent.js';

export interface INonPtyShellTerminalUri {
	readonly storage: URI;
	readonly session: URI;
	readonly chat: URI;
	readonly toolCallId: string;
}

export function buildNonPtyShellTerminalUri(storage: URI | string, session: URI | string, chat: URI | string, toolCallId: string): string {
	return URI.from({
		scheme: Schemas.agentHostTerminal,
		authority: 'shell',
		path: `/${AgentSession.id(session)}/${toolCallId}`,
		query: JSON.stringify({
			storage: storage.toString(),
			session: session.toString(),
			chat: chat.toString(),
			toolCallId,
		}),
	}).toString();
}

export function parseNonPtyShellTerminalUri(resource: URI): INonPtyShellTerminalUri | undefined {
	if (resource.scheme !== Schemas.agentHostTerminal || resource.authority !== 'shell' || !resource.query) {
		return undefined;
	}
	let fields: { readonly storage?: string; readonly session?: string; readonly chat?: string; readonly toolCallId?: string };
	try {
		fields = JSON.parse(resource.query);
	} catch {
		return undefined;
	}
	const { storage, session, chat, toolCallId } = fields;
	if (!storage || !session || !chat || !toolCallId) {
		return undefined;
	}
	try {
		return {
			storage: URI.parse(storage),
			session: URI.parse(session),
			chat: URI.parse(chat),
			toolCallId,
		};
	} catch {
		return undefined;
	}
}
