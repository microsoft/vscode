/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SimpleMessageAttachment } from '../../common/state/protocol/state.js';

const attachmentDisplayKindParameter = 'x-vscode-display-kind=';

export function addSimpleAttachmentDisplayKindToMimeType(attachment: SimpleMessageAttachment): string {
	if (attachment.displayKind === undefined) {
		return 'text/plain';
	}
	return `text/plain; ${attachmentDisplayKindParameter}${encodeURIComponent(attachment.displayKind)}`;
}

export function readSimpleAttachmentDisplayKindFromMimeType(mimeType: string): string | undefined {
	const parameter = mimeType.split(';').map(part => part.trim()).find(part => part.startsWith(attachmentDisplayKindParameter));
	if (!parameter) {
		return undefined;
	}
	try {
		return decodeURIComponent(parameter.slice(attachmentDisplayKindParameter.length));
	} catch {
		return undefined;
	}
}
