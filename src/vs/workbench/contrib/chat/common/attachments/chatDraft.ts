/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parse, stringify } from '../../../../../base/common/marshalling.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { isLocation } from '../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IAgentsWindowDraft } from '../../../../../platform/window/common/window.js';
import { ChatPasteAttachmentMetadata, IChatRequestVariableEntry, isChatRequestVariableEntry, isImplicitVariableEntry, isStringImplicitContextValue, isStringVariableEntry, toPasteVariableEntry } from './chatVariableEntries.js';

export interface IChatDraft {
	readonly inputText: string;
	readonly attachments: readonly IChatRequestVariableEntry[];
}

export class UnsupportedChatDraftAttachmentError extends Error {
	constructor() {
		super('Chat draft contains unresolved window-local context.');
	}
}

export function serializeChatDraft(draft: IChatDraft, getTextModel?: (resource: URI) => ITextModel | null): IAgentsWindowDraft {
	const attachments = draft.attachments.map(attachment => {
		const context = isStringVariableEntry(attachment)
			? attachment
			: isImplicitVariableEntry(attachment) && isStringImplicitContextValue(attachment.value)
				? attachment.value
				: undefined;
		if (context) {
			if (typeof context.value !== 'string') {
				throw new UnsupportedChatDraftAttachmentError();
			}
			return toPasteVariableEntry(attachment.name, context.value, { id: attachment.id, icon: attachment.icon });
		}
		const resource = IChatRequestVariableEntry.toUri(attachment);
		if (resource?.scheme === Schemas.untitled) {
			const model = getTextModel?.(resource);
			if (!model || (attachment.kind !== 'file' && attachment.kind !== 'implicit' && attachment.kind !== 'symbol')) {
				throw new UnsupportedChatDraftAttachmentError();
			}
			const selection = isLocation(attachment.value) && (attachment.kind !== 'implicit' || attachment.isSelection)
				? model.validateRange(attachment.value.range)
				: undefined;
			const text = selection && !selection.isEmpty() ? model.getValueInRange(selection) : model.getValue();
			return {
				...toPasteVariableEntry(attachment.name, text, {
					id: attachment.id,
					icon: attachment.icon,
					language: model.getLanguageId(),
					_meta: {
						...attachment._meta,
						...(attachment.kind === 'file' ? { [ChatPasteAttachmentMetadata.FileSnapshot]: true } : {}),
					},
				}),
				range: attachment.range,
			};
		}
		return IChatRequestVariableEntry.toExport(attachment);
	});
	return { inputText: draft.inputText, attachments: stringify(attachments) };
}

export function reviveChatDraft(draft: IAgentsWindowDraft): IChatDraft {
	const attachments: unknown = parse(draft.attachments);
	if (!Array.isArray(attachments) || !attachments.every(isChatRequestVariableEntry)) {
		throw new Error('Invalid chat draft attachments.');
	}
	return { inputText: draft.inputText, attachments: attachments.map(IChatRequestVariableEntry.fromExport) };
}
