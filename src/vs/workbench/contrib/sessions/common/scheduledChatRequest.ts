/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { detectImageMimeType } from '../../../../base/common/image.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { OffsetRange } from '../../../../editor/common/core/ranges/offsetRange.js';
import { PositionOffsetTransformer } from '../../../../editor/common/core/text/positionToOffset.js';
import { isLocation } from '../../../../editor/common/languages.js';
import { localize } from '../../../../nls.js';
import { Message, MessageAttachment, MessageAttachmentKind, MessageKind } from '../../../../platform/agentHost/common/state/protocol/state.js';
import { IChatDraft } from '../../chat/common/attachments/chatDraft.js';
import { coerceImageBuffer } from '../../chat/common/chatImageExtraction.js';

/** Captures ephemeral context now; only host-readable files and folders may remain references. */
export async function captureScheduledChatRequest(
	input: IChatDraft,
	readSelection: (uri: URI, range?: IRange) => Promise<string>,
	readFile: (uri: URI) => Promise<VSBuffer>,
	isDirty: (uri: URI) => boolean = () => false,
): Promise<Message> {
	const positions = new PositionOffsetTransformer(input.inputText);
	const attachments: MessageAttachment[] = [];
	for (const entry of input.attachments) {
		const reference = input.references?.find(reference => reference.id === entry.id);
		const range = reference?.range ?? (entry.range ? positions.getRange(new OffsetRange(entry.range.start, entry.range.endExclusive)) : undefined);
		const common = {
			label: entry.name,
			...(entry._meta ? { _meta: entry._meta } : {}),
			...(range ? {
				range: {
					start: { line: range.startLineNumber - 1, character: range.startColumn - 1 },
					end: { line: range.endLineNumber - 1, character: range.endColumn - 1 },
				}
			} : {}),
		};
		if ((entry.kind === 'file' || entry.kind === 'symbol') && isLocation(entry.value)) {
			if (entry.value.uri.scheme !== Schemas.untitled) {
				assertLocalResource(entry.value.uri);
			}
			attachments.push({ ...common, type: MessageAttachmentKind.EmbeddedResource, displayKind: 'selection', contentType: 'text/plain', data: encodeBase64(VSBuffer.fromString(await readSelection(entry.value.uri, entry.value.range))) });
		} else if ((entry.kind === 'file' || entry.kind === 'directory' || entry.kind === 'promptFile') && URI.isUri(entry.value)) {
			if (entry.kind !== 'directory' && (entry.value.scheme === Schemas.untitled || isDirty(entry.value))) {
				attachments.push({ ...common, type: MessageAttachmentKind.EmbeddedResource, displayKind: 'document', contentType: 'text/plain', data: encodeBase64(VSBuffer.fromString(await readSelection(entry.value))) });
			} else {
				assertLocalResource(entry.value);
				attachments.push({ ...common, type: MessageAttachmentKind.Resource, uri: entry.value.toString(), displayKind: entry.kind === 'directory' ? 'directory' : 'document' });
			}
		} else if (entry.kind === 'image') {
			let bytes = coerceImageBuffer(entry.value);
			if (!bytes) {
				const uri = entry.references?.find(reference => URI.isUri(reference.reference))?.reference;
				if (URI.isUri(uri)) {
					assertLocalResource(uri);
					bytes = (await readFile(uri)).buffer;
				}
			}
			if (!bytes) {
				throw new Error(localize('sendLater.imageUnavailable', "The image '{0}' cannot be saved for later. Attach the image again.", entry.name));
			}
			const contentType = detectImageMimeType(bytes) ?? entry.mimeType;
			if (!contentType) {
				throw new Error(localize('sendLater.imageTypeUnavailable', "The type of image '{0}' could not be determined.", entry.name));
			}
			attachments.push({ ...common, type: MessageAttachmentKind.EmbeddedResource, data: encodeBase64(VSBuffer.wrap(bytes)), contentType, displayKind: 'image' });
		} else if (entry.kind === 'paste') {
			attachments.push({ ...common, type: MessageAttachmentKind.Simple, modelRepresentation: entry.code });
		} else if ((entry.kind === 'promptText' || entry.kind === 'string' || entry.kind === 'workspace') && typeof entry.value === 'string') {
			attachments.push({ ...common, type: MessageAttachmentKind.Simple, modelRepresentation: entry.value });
		} else {
			throw new Error(localize('sendLater.unsupportedAttachment', "The attachment '{0}' cannot be saved for later. Remove it or send this request now.", entry.name));
		}
	}
	return { text: input.inputText, origin: { kind: MessageKind.User }, ...(attachments.length ? { attachments } : {}) };
}

function assertLocalResource(uri: URI): void {
	if (uri.scheme !== Schemas.file) {
		throw new Error(localize('sendLater.nonLocalAttachment', "Send Later requires attachments on this device. Capture the content or remove the remote attachment."));
	}
}

/** Parses local wall-clock input without silently normalizing invalid or skipped DST times. */
export function parseScheduledChatTime(value: string): Date | undefined {
	const match = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})[T ](?<hour>\d{2}):(?<minute>\d{2})$/.exec(value.trim());
	if (!match?.groups) {
		return undefined;
	}
	const { year, month, day, hour, minute } = match.groups;
	const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
	return date.getFullYear() === Number(year) && date.getMonth() === Number(month) - 1 && date.getDate() === Number(day)
		&& date.getHours() === Number(hour) && date.getMinutes() === Number(minute) ? date : undefined;
}
