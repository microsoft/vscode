/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { MessageResourceAttachment } from '../../state/protocol/state.js';

const clientResourceAttachmentKey = 'vscode.agentHost.clientResourceAttachment';

/** Retains a client-authenticated resource identity until the host replaces it with a snapshot. */
export function withClientResourceAttachment<T extends MessageResourceAttachment>(attachment: T, token: string): T {
	return {
		...attachment,
		_meta: { ...attachment._meta, [clientResourceAttachmentKey]: { token, uri: attachment.uri } },
	};
}

/** Restores ownership only when the unchanged URI and token match client-held state. */
export function readClientResourceAttachmentUri(attachment: MessageResourceAttachment, tokens: ReadonlyMap<string, string> | undefined): string | undefined {
	const metadata = attachment._meta?.[clientResourceAttachmentKey];
	return tokens && isRecord(metadata)
		&& typeof metadata.token === 'string' && typeof metadata.uri === 'string' && metadata.uri === attachment.uri
		&& tokens.get(metadata.uri) === metadata.token
		? metadata.uri
		: undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
