/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Attachment, SendOptions } from '@github/copilot/sdk';

export interface ICopilotCLIPendingRequestContext {
	readonly prompt: string;
	readonly attachments: Attachment[];
	readonly source?: SendOptions['source'];
}

const pendingRequestContextBySessionId = new Map<string, ICopilotCLIPendingRequestContext>();

export function setPendingCopilotCLIRequestContext(sessionId: string, context: ICopilotCLIPendingRequestContext): void {
	pendingRequestContextBySessionId.set(sessionId, context);
}

export function takePendingCopilotCLIRequestContext(sessionId: string): ICopilotCLIPendingRequestContext | undefined {
	const context = pendingRequestContextBySessionId.get(sessionId);
	if (context) {
		pendingRequestContextBySessionId.delete(sessionId);
	}
	return context;
}

export function clearPendingCopilotCLIRequestContext(sessionId: string): void {
	pendingRequestContextBySessionId.delete(sessionId);
}
