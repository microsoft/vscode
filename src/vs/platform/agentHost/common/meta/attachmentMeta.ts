/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { MessageAttachment } from '../state/protocol/state.js';
import { readCopilotAttachmentDetail, withCopilotAttachmentDetail } from './copilotd/copilotdMetadataReader.js';

export interface IAttachmentDetail {
	readonly type: string;
	readonly raw: Record<string, unknown>;
	readonly text?: string;
	readonly url?: string;
}

export function readAttachmentDetail(attachment: Pick<MessageAttachment, '_meta'>): IAttachmentDetail | undefined {
	return readCopilotAttachmentDetail(attachment);
}

export function withAttachmentDetail<T extends MessageAttachment>(attachment: T, detail: Record<string, unknown>): T {
	return withCopilotAttachmentDetail(attachment, detail);
}
