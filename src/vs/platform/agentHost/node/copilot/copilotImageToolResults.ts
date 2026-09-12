/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ToolResultObject } from '@github/copilot-sdk';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../log/common/log.js';
import { isClientImageGenerationTool } from '../../common/imageGenerationConstants.js';
import { ISessionDatabase } from '../../common/sessionDataService.js';
import type { ToolResultEmbeddedResourceContent } from '../../common/state/protocol/state.js';
import { ResponsePartKind, ToolCallStatus, ToolResultContentType, type Turn } from '../../common/state/sessionState.js';

const metadataPrefix = 'copilot.generatedImage.';

/** The SDK persists model-facing results only, so user-only images need a separate durable copy. */
export async function persistCopilotImageToolResult(database: ISessionDatabase, turnId: string, toolCallId: string, result: ToolResultObject): Promise<void> {
	const images = result.binaryResultsForLlm
		?.filter(part => part.type === 'image' && part.mimeType === 'image/png')
		.map(part => ({ type: ToolResultContentType.EmbeddedResource, contentType: 'image/png', data: part.data }));
	if (images?.length) {
		await database.setMetadata(metadataPrefix + toolCallId, JSON.stringify({ images, error: result.error, turnOwned: true }), turnId);
	}
}

export async function restoreCopilotImageToolResults(database: ISessionDatabase, turns: readonly Turn[], logService: ILogService): Promise<Turn[]> {
	const restored: Turn[] = [];
	for (const turn of turns) {
		const responseParts = [...turn.responseParts];
		for (let index = 0; index < responseParts.length; index++) {
			const part = responseParts[index];
			if (part.kind !== ResponsePartKind.ToolCall || part.toolCall.status !== ToolCallStatus.Completed
				|| !isClientImageGenerationTool(part.toolCall.toolName)
				|| part.toolCall.content?.some(content => content.type === ToolResultContentType.EmbeddedResource && content.contentType === 'image/png')) {
				continue;
			}
			const toolCall = part.toolCall;
			try {
				const raw = await database.getMetadata(metadataPrefix + toolCall.toolCallId);
				if (raw === undefined) {
					continue;
				}
				if (raw.length > 32 * 1024 * 1024) {
					throw new Error('Persisted image result exceeds the size limit');
				}
				const parsed: unknown = JSON.parse(raw);
				const stored: { images?: unknown; error?: unknown; turnOwned?: unknown } = typeof parsed === 'object' && parsed !== null ? parsed : {};
				if (!Array.isArray(stored.images) || stored.images.length === 0 || stored.images.length > 16
					|| stored.error !== undefined && typeof stored.error !== 'string') {
					throw new Error('Invalid persisted image result');
				}
				const images: ToolResultEmbeddedResourceContent[] = [];
				for (const entry of stored.images) {
					const value: unknown = entry;
					const image: { data?: unknown; contentType?: unknown } = typeof value === 'object' && value !== null ? value : {};
					if (image.contentType !== 'image/png' || typeof image.data !== 'string' || !image.data) {
						throw new Error('Invalid persisted PNG image');
					}
					images.push({ type: ToolResultContentType.EmbeddedResource, contentType: 'image/png', data: image.data });
				}
				if (stored.turnOwned !== true) {
					await database.setMetadata(metadataPrefix + toolCall.toolCallId, JSON.stringify({ images, error: stored.error, turnOwned: true }), turn.id);
				}
				responseParts[index] = {
					...part,
					toolCall: {
						...toolCall,
						content: [...(toolCall.content ?? []), ...images],
						...(stored.error ? { success: false, pastTenseMessage: stored.error, error: { ...toolCall.error, message: stored.error } } : {}),
					},
				};
			} catch {
				logService.warn('[Copilot] A generated image preview could not be restored from session storage.');
				const message = localize('copilot.generatedImage.restoreFailed', "The image was generated, but its preview could not be restored from session storage.");
				responseParts[index] = {
					...part,
					toolCall: { ...toolCall, pastTenseMessage: message, content: [...(toolCall.content ?? []), { type: ToolResultContentType.Text, text: message }] },
				};
			}
		}
		restored.push({ ...turn, responseParts });
	}
	return restored;
}
