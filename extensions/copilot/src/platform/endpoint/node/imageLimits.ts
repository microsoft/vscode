/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as l10n from '@vscode/l10n';
import { Raw } from '@vscode/prompt-tsx';
import { createHash } from 'crypto';

/**
 * Model-facing placeholder substituted for dropped history images.
 * Intentionally not localized — this text is sent to the model, not the user.
 */
const IMAGE_PLACEHOLDER_TEXT = '[Image omitted from conversation history due to model limit.]';
const UNAVAILABLE_IMAGE_PLACEHOLDER_TEXT = '[Image omitted from conversation history because it is no longer available.]';

function getCurrentTurnStart(messages: Raw.ChatMessage[]): number {
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i].role === Raw.ChatRole.User) {
			return i;
		}
	}
	return Math.max(messages.length - 1, 0);
}

function getImageSourceHash(source: string): string {
	return createHash('sha256').update(source).digest('hex');
}

export function getHistoryImageSourceHashes(messages: Raw.ChatMessage[]): string[] {
	const currentTurnStart = getCurrentTurnStart(messages);
	const hashes = new Set<string>();
	for (let messageIndex = 0; messageIndex < currentTurnStart; messageIndex++) {
		const content = messages[messageIndex].content;
		if (!Array.isArray(content)) {
			continue;
		}
		for (const part of content) {
			if (part.type === Raw.ChatCompletionContentPartKind.Image) {
				hashes.add(getImageSourceHash(part.imageUrl.url));
			}
		}
	}
	return [...hashes];
}

export function omitHistoryImages(messages: Raw.ChatMessage[], unavailableSourceHashes?: ReadonlySet<string>): Raw.ChatMessage[] {
	const currentTurnStart = getCurrentTurnStart(messages);
	let changed = false;
	const result = messages.map((message, messageIndex) => {
		if (messageIndex >= currentTurnStart || !Array.isArray(message.content)) {
			return message;
		}
		if (!message.content.some(part => part.type === Raw.ChatCompletionContentPartKind.Image && (!unavailableSourceHashes || unavailableSourceHashes.has(getImageSourceHash(part.imageUrl.url))))) {
			return message;
		}
		changed = true;
		return {
			...message,
			content: message.content.map(part => part.type === Raw.ChatCompletionContentPartKind.Image && (!unavailableSourceHashes || unavailableSourceHashes.has(getImageSourceHash(part.imageUrl.url)))
				? { type: Raw.ChatCompletionContentPartKind.Text as const, text: UNAVAILABLE_IMAGE_PLACEHOLDER_TEXT }
				: part),
		};
	});
	return changed ? result : messages;
}

/**
 * Silently drops the oldest images from history when the total number of images
 * in the conversation exceeds `maxImages`. Images belonging to the current turn
 * (the last user message and anything after it, e.g. recent tool results) are
 * always preserved.
 *
 * If the current turn alone exceeds the limit, throws a localized error rather
 * than sending a request we know will be rejected with an opaque server error.
 *
 * @returns A (possibly filtered) copy of messages. The original array is never mutated.
 */
export function filterHistoryImages(messages: Raw.ChatMessage[], maxImages: number): Raw.ChatMessage[] {
	// Anchor the current turn at the last user message; anything at or after this
	// index is treated as "current turn" and its images are never filtered.
	const lastUserIdx = getCurrentTurnStart(messages);

	// Count images in the current turn (the last user message and anything after it).
	let currentTurnImages = 0;
	for (let i = Math.max(lastUserIdx, 0); i < messages.length; i++) {
		const content = messages[i].content;
		if (!Array.isArray(content)) {
			continue;
		}
		for (const part of content) {
			if (part.type === Raw.ChatCompletionContentPartKind.Image) {
				currentTurnImages++;
			}
		}
	}

	// Count total images across all messages
	let totalImages = 0;
	for (const message of messages) {
		if (Array.isArray(message.content)) {
			for (const part of message.content) {
				if (part.type === Raw.ChatCompletionContentPartKind.Image) {
					totalImages++;
				}
			}
		}
	}

	// No filtering needed if total is within the limit
	if (totalImages <= maxImages) {
		return messages;
	}

	// Fail fast with a clear, localized error when the current turn alone exceeds
	// the limit — otherwise we'd send a request the server will reject with an
	// opaque error. Silent history filtering is only safe when dropping history
	// images can bring the total down to the limit.
	if (currentTurnImages > maxImages) {
		throw new Error(l10n.t('Too many images in request: {0} images provided, but the model supports a maximum of {1} images.', currentTurnImages, maxImages));
	}

	// Walk backward through history (before the current turn), keeping the
	// most recent images and replacing the oldest with placeholders.
	let historyBudget = maxImages - currentTurnImages;

	// Collect keep/drop decisions by walking backward through history
	const historyImageDecisions = new Map<string, boolean>(); // "msgIdx:partIdx" -> keep
	for (let i = lastUserIdx - 1; i >= 0; i--) {
		if (!Array.isArray(messages[i].content)) {
			continue;
		}
		for (let j = messages[i].content.length - 1; j >= 0; j--) {
			if (messages[i].content[j].type === Raw.ChatCompletionContentPartKind.Image) {
				const key = `${i}:${j}`;
				if (historyBudget > 0) {
					historyImageDecisions.set(key, true);
					historyBudget--;
				} else {
					historyImageDecisions.set(key, false);
				}
			}
		}
	}

	// Build filtered messages, replacing dropped images with text placeholders
	return messages.map((message, msgIdx) => {
		if (msgIdx >= lastUserIdx) {
			return message;
		}
		if (!Array.isArray(message.content)) {
			return message;
		}
		if (!message.content.some(p => p.type === Raw.ChatCompletionContentPartKind.Image)) {
			return message;
		}
		return {
			...message,
			content: message.content.map((part, partIdx) => {
				if (part.type !== Raw.ChatCompletionContentPartKind.Image) {
					return part;
				}
				if (historyImageDecisions.get(`${msgIdx}:${partIdx}`)) {
					return part;
				}
				return { type: Raw.ChatCompletionContentPartKind.Text, text: IMAGE_PLACEHOLDER_TEXT };
			})
		};
	});
}
