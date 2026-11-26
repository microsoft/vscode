/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parse, stringify } from '../../../../../base/common/marshalling.js';
import { Schemas } from '../../../../../base/common/network.js';
import { hasKey, isObject } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { isLocation, Location } from '../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IAgentsWindowDraft } from '../../../../../platform/window/common/window.js';
import { IChatContentReference } from '../chatService/chatService.js';
import { ChatPasteAttachmentMetadata, IChatRequestVariableEntry, isChatRequestVariableEntry, isImplicitVariableEntry, isStringImplicitContextValue, isStringVariableEntry, toPasteVariableEntry } from './chatVariableEntries.js';
import { IDynamicVariable } from './chatVariables.js';

export interface IChatDraft {
	readonly inputText: string;
	readonly attachments: readonly IChatRequestVariableEntry[];
	/**
	 * The references of the input text, by the id of what they stand for and
	 * their range in the text. They tell apart mentions of attachments that
	 * share a name, which inline attachment pills are saved as.
	 */
	readonly references?: readonly IDynamicVariable[];
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

/**
 * Replaces the resources of a draft's attachments and inline references that `mapResource` maps, such as the files of
 * an agent host whose draft moves to another connection of it, along with the ids derived from them. Other resources
 * stay as they are, and so does `draft` when none of them map.
 */
export function remapChatDraftResources(draft: IChatDraft, mapResource: (resource: URI) => URI | undefined): IChatDraft {
	// Mentions of attachments refer to them by their ids.
	const ids = new Map<string, string>();
	let changed = false;
	const attachments = draft.attachments.map(attachment => {
		const remapped = remapResourceValue(attachment.value, mapResource);
		const uri = hasKey(attachment, { uri: true }) && URI.isUri(attachment.uri) ? mapResource(attachment.uri) : undefined;
		// An image kept as bytes and pasted code record the resource they came from in their references.
		const contentReferences = remapContentReferences(attachment.references, mapResource);
		const kindResources = remapKindResources(attachment, mapResource);
		if (!remapped && !uri && !contentReferences && !kindResources) {
			return attachment;
		}
		changed = true;
		const source = remapped ?? contentReferences ?? kindResources;
		const id = source ? remapResourceId(attachment.id, source) : attachment.id;
		ids.set(attachment.id, id);
		return Object.assign({ ...attachment, id }, remapped ? { value: remapped.value } : {}, uri ? { uri } : {}, { ...(contentReferences && { references: contentReferences.references }), ...kindResources?.changes });
	});
	const references = draft.references?.map(reference => {
		const remapped = remapResourceValue(reference.data, mapResource);
		const id = ids.get(reference.id) ?? (remapped ? remapResourceId(reference.id, remapped) : reference.id);
		if (!remapped && id === reference.id) {
			return reference;
		}
		changed = true;
		return { ...reference, id, ...(remapped ? { data: remapped.value } : {}) };
	});
	return changed ? { ...draft, attachments, ...(references ? { references } : {}) } : draft;
}

function remapResourceValue(value: unknown, mapResource: (resource: URI) => URI | undefined): { readonly from: URI; readonly to: URI; readonly value: URI | Location } | undefined {
	if (URI.isUri(value)) {
		const to = mapResource(value);
		return to && { from: value, to, value: to };
	}
	if (isLocation(value)) {
		const to = mapResource(value.uri);
		return to && { from: value.uri, to, value: { ...value, uri: to } };
	}
	return undefined;
}

/** Remaps the resources of an attachment's references, with the first one that maps, or `undefined` when none map. */
function remapContentReferences(references: readonly IChatContentReference[] | undefined, mapResource: (resource: URI) => URI | undefined): { readonly references: IChatContentReference[]; readonly from: URI; readonly to: URI } | undefined {
	let first: { readonly from: URI; readonly to: URI } | undefined;
	const result: IChatContentReference[] = [];
	for (const entry of references ?? []) {
		const remapped = remapResourceValue(entry.reference, mapResource);
		first ??= remapped;
		result.push(remapped ? { ...entry, reference: remapped.value } : entry);
	}
	return first && { references: result, from: first.from, to: first.to };
}

/**
 * Remaps the resource that some kinds of attachments keep beside their value, such as the file that pasted code was
 * copied from or that a diagnostic is in, which opening and dragging the attachment use, or `undefined` when it doesn't map.
 */
function remapKindResources(attachment: IChatRequestVariableEntry, mapResource: (resource: URI) => URI | undefined) {
	switch (attachment.kind) {
		case 'paste': {
			const copiedFrom = attachment.copiedFrom;
			const to = copiedFrom && mapResource(copiedFrom.uri);
			return copiedFrom && to && { from: copiedFrom.uri, to, changes: { copiedFrom: { ...copiedFrom, uri: to }, fileName: attachment.fileName === copiedFrom.uri.toString() ? to.toString() : attachment.fileName } };
		}
		case 'diagnostic': {
			// Its value is the same filter it keeps beside it.
			const from = attachment.filterUri;
			const to = from && mapResource(from);
			const value = attachment.value;
			return from && to && { from, to, changes: { filterUri: to, value: isObject(value) ? { ...value, filterUri: to } : value } };
		}
		case 'string': {
			const from = attachment.resourceUri;
			const to = from && mapResource(from);
			return from && to && { from, to, changes: { resourceUri: to } };
		}
	}
	return undefined;
}

function remapResourceId(id: string, { from, to }: { readonly from: URI; readonly to: URI }): string {
	return id.replaceAll(from.toString(), to.toString());
}

export function reviveChatDraft(draft: IAgentsWindowDraft): IChatDraft {
	const attachments: unknown = parse(draft.attachments);
	if (!Array.isArray(attachments) || !attachments.every(isChatRequestVariableEntry)) {
		throw new Error('Invalid chat draft attachments.');
	}
	return { inputText: draft.inputText, attachments: attachments.map(IChatRequestVariableEntry.fromExport) };
}
