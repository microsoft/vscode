/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { MessageResourceAttachment } from '../../state/protocol/state.js';

const clientResourceAttachmentKey = 'vscode.agentHost.clientResourceAttachment';

/** Retains the originating client's resource identity until the host replaces it with a snapshot. */
export function withClientResourceAttachment<T extends MessageResourceAttachment>(attachment: T, clientId: string): T {
	return {
		...attachment,
		_meta: { ...attachment._meta, [clientResourceAttachmentKey]: { clientId, uri: attachment.uri } },
	};
}

/** Restores client ownership only for the originating client and an unchanged resource identity. */
export function readClientResourceAttachmentUri(attachment: MessageResourceAttachment, clientId: string | undefined): string | undefined {
	const metadata = attachment._meta?.[clientResourceAttachmentKey];
	return clientId && isRecord(metadata)
		&& metadata.clientId === clientId && typeof metadata.uri === 'string' && metadata.uri === attachment.uri
		? metadata.uri
		: undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
