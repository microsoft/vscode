/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isDefined } from '../../../../base/common/types.js';
import { readCompletionAttachmentMeta, restoreLegacySkillAttachment, toCommandCompletionAttachmentMeta } from '../../common/meta/agentCompletionAttachmentMeta.js';
import type { ISessionDatabase } from '../../common/sessionDataService.js';
import { MessageAttachmentKind, type MessageAttachment, type MessageResourceAttachment, type SimpleMessageAttachment, type TextRange } from '../../common/state/protocol/state.js';

const completionReferencesMetadataKey = 'copilot.completionReferences';

export interface ICopilotCompletionReference {
	readonly attachment: (SimpleMessageAttachment | MessageResourceAttachment) & { readonly range: TextRange };
	readonly sdkAttachmentIndex?: number;
}

export interface ICopilotCompletionReferenceMessage {
	readonly text: string;
	readonly references: readonly ICopilotCompletionReference[];
}

/** Keeps completion identity and presentation, without model text or binary payloads. */
export function getCopilotCompletionReferences(attachments: readonly MessageAttachment[] | undefined): readonly ICopilotCompletionReference[] {
	return attachments?.flatMap((attachment): ICopilotCompletionReference[] => {
		if (!attachment.range) {
			return [];
		}
		if (attachment.type === MessageAttachmentKind.Resource && attachment.displayKind === 'skill') {
			return [{ attachment: { ...attachment, range: attachment.range } }];
		}
		if (attachment.type !== MessageAttachmentKind.Simple) {
			return [];
		}
		const meta = readCompletionAttachmentMeta(attachment);
		if (!meta?.command) {
			return [];
		}
		return [{
			attachment: {
				type: MessageAttachmentKind.Simple,
				label: attachment.label,
				range: attachment.range,
				...(attachment.displayKind !== undefined ? { displayKind: attachment.displayKind } : {}),
				_meta: toCommandCompletionAttachmentMeta({ command: meta.command, isSkill: meta.isSkill, description: meta.description }),
			},
		}];
	}) ?? [];
}

export function storeCopilotCompletionReferences(db: ISessionDatabase, turnId: string, text: string, references: readonly ICopilotCompletionReference[]): Promise<void> {
	return references.length ? db.setMetadata(completionReferencesMetadataKey, JSON.stringify({ text, references } satisfies ICopilotCompletionReferenceMessage), turnId) : Promise.resolve();
}

export async function readCopilotCompletionReferences(db: ISessionDatabase | undefined): Promise<ReadonlyMap<string, ICopilotCompletionReferenceMessage>> {
	const result = new Map<string, ICopilotCompletionReferenceMessage>();
	for (const [id, raw] of await db?.getTurnMetadata(completionReferencesMetadataKey) ?? []) {
		const message = JSON.parse(raw) as ICopilotCompletionReferenceMessage;
		result.set(id, {
			...message,
			references: message.references.map(reference => {
				const attachment = reference.attachment;
				const restored = attachment.type === MessageAttachmentKind.Simple ? restoreLegacySkillAttachment(attachment) : undefined;
				return restored ? { ...reference, attachment: { ...restored, range: attachment.range } } : reference;
			}),
		});
	}
	return result;
}

export function mergeCopilotCompletionReferences(attachments: readonly (MessageAttachment | undefined)[] | undefined, references: readonly ICopilotCompletionReference[] | undefined): MessageAttachment[] | undefined {
	if (!references?.length) {
		const result = attachments?.filter(isDefined);
		return result?.length ? result : undefined;
	}
	const result = [...attachments ?? []];
	for (const { attachment, sdkAttachmentIndex } of references) {
		if (sdkAttachmentIndex !== undefined) {
			result[sdkAttachmentIndex] = { ...result[sdkAttachmentIndex], ...attachment };
		} else {
			result.push(attachment);
		}
	}
	return result.filter(isDefined);
}
