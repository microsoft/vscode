/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isString } from '../../../../base/common/types.js';
import { MessageAttachmentKind, type MessageAttachment, type SimpleMessageAttachment } from '../state/protocol/state.js';

export const BrowserViewAttachmentDisplayKind = 'browser';
export const BrowserViewAttachmentMetadataKey = 'browserView';

export interface IBrowserViewAttachmentMetadata {
	readonly browserId: string;
	readonly browserUri: string;
}

export function isBrowserViewAttachment(attachment: MessageAttachment): attachment is SimpleMessageAttachment {
	return attachment.type === MessageAttachmentKind.Simple && attachment.displayKind === BrowserViewAttachmentDisplayKind;
}

export function getBrowserViewAttachmentMetadata(attachment: MessageAttachment): IBrowserViewAttachmentMetadata | undefined {
	if (!isBrowserViewAttachment(attachment)) {
		return undefined;
	}
	// eslint-disable-next-line local/code-no-untyped-meta-access -- sanctioned first hop into the namespaced browser view slot; validated below.
	const metadata = attachment._meta?.[BrowserViewAttachmentMetadataKey];
	if (!isRecord(metadata) || !isString(metadata.browserId) || !isString(metadata.browserUri)) {
		return undefined;
	}
	return { browserId: metadata.browserId, browserUri: metadata.browserUri };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}
