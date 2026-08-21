/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isString } from '../../../../base/common/types.js';
import { MessageAttachmentKind, type MessageAttachment } from '../state/protocol/state.js';

/**
 * Namespaced `_meta` slot marking a {@link MessageAttachmentKind.Resource} attachment as a
 * host-created snapshot: an on-disk copy the agent host wrote under the session attachments
 * directory to carry client-resident or derived content (pasted text/images, unsaved editors,
 * read-only `git:` diff views) that cannot be referenced as a real workspace file.
 *
 * Such snapshots are **read-only context** — the model should consume their content, not edit
 * the copy. Providers use {@link isHostSnapshotAttachment} / {@link readHostSnapshotAttachmentMeta}
 * to signal read-only: Copilot still sends the file path (so the model can read it on demand) but
 * conveys the read-only intent out-of-band on the prompt (an `additionalContext` / `<reminder>`
 * note), while Codex/Claude annotate the path reference inline as read-only. The `contentType` is
 * preserved because the on-disk `Resource` no longer carries the original MIME type.
 */
export const HostSnapshotAttachmentMetadataKey = 'vscode.agentHost.snapshotAttachment';

export interface IHostSnapshotAttachmentMetadata {
	/** Always `true`; marks the attachment as a host-created read-only snapshot. */
	readonly isSnapshot: true;
	/** The original content MIME type, preserved so consumers can inline without re-sniffing. */
	readonly contentType?: string;
}

export function toHostSnapshotAttachmentMeta(contentType: string | undefined): Record<string, IHostSnapshotAttachmentMetadata> {
	return {
		[HostSnapshotAttachmentMetadataKey]: contentType ? { isSnapshot: true, contentType } : { isSnapshot: true }
	};
}

export function readHostSnapshotAttachmentMeta(attachment: { readonly _meta?: Record<string, unknown> }): IHostSnapshotAttachmentMetadata | undefined {
	// eslint-disable-next-line local/code-no-untyped-meta-access -- sanctioned first hop into the namespaced snapshot attachment slot; validated below.
	const metadata = attachment._meta?.[HostSnapshotAttachmentMetadataKey];
	if (!isRecord(metadata) || metadata.isSnapshot !== true) {
		return undefined;
	}
	const contentType = isString(metadata.contentType) ? metadata.contentType : undefined;
	return contentType ? { isSnapshot: true, contentType } : { isSnapshot: true };
}

export function isHostSnapshotAttachment(attachment: MessageAttachment): boolean {
	return attachment.type === MessageAttachmentKind.Resource && readHostSnapshotAttachmentMeta(attachment) !== undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}
