/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Attachment, JsonValue } from '@github/copilot-sdk';
import { isBoundedCanvasJson, isCanvasRecord } from '../agentHostCanvasValidation.js';
import { MessageAttachmentKind, type MessageAttachment, type SimpleMessageAttachment } from '../state/protocol/state.js';

const extensionContextMetaKey = 'copilotExtensionContext';

export function isCopilotCanvasJson(value: unknown): value is JsonValue {
	return isBoundedCanvasJson(value);
}

export function extensionContextToProtocol(attachment: Extract<Attachment, { type: 'extension_context' }>, chat: string | undefined): SimpleMessageAttachment {
	return {
		type: MessageAttachmentKind.Simple,
		label: attachment.title,
		displayKind: 'extension-context',
		modelRepresentation: JSON.stringify({ extensionId: attachment.extensionId, payload: attachment.payload ?? null }),
		_meta: { [extensionContextMetaKey]: { chat, attachment } },
	};
}

export function readExtensionContext(attachment: MessageAttachment, chat: string): Extract<Attachment, { type: 'extension_context' }> | undefined {
	const meta = attachment._meta?.[extensionContextMetaKey];
	if (!isCanvasRecord(meta) || meta.chat !== chat || !isBoundedCanvasJson(meta.attachment) || !isCanvasRecord(meta.attachment)) {
		return undefined;
	}
	const value = meta.attachment;
	const payload = value.payload;
	if (value.type !== 'extension_context' || typeof value.extensionId !== 'string' || typeof value.title !== 'string' || typeof value.capturedAt !== 'string'
		|| value.canvasId !== undefined && typeof value.canvasId !== 'string' || value.instanceId !== undefined && typeof value.instanceId !== 'string') {
		return undefined;
	}
	if (payload !== undefined && !isCopilotCanvasJson(payload)) {
		return undefined;
	}
	return {
		type: 'extension_context', extensionId: value.extensionId, title: value.title, capturedAt: value.capturedAt,
		...(typeof value.canvasId === 'string' ? { canvasId: value.canvasId } : {}),
		...(typeof value.instanceId === 'string' ? { instanceId: value.instanceId } : {}),
		...(payload !== undefined ? { payload } : {}),
	};
}
