/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SimpleMessageAttachment } from '../../common/state/protocol/state.js';

const attachmentDisplayKindParameter = 'x-vscode-display-kind=';
const simpleAttachmentMimeType = 'text/x-vscode-simple-attachment';

export function addSimpleAttachmentDisplayKindToMimeType(attachment: SimpleMessageAttachment): string {
	return addAttachmentDisplayKindToMimeType(attachment.displayKind);
}

export function addAttachmentDisplayKindToMimeType(displayKind: string | undefined): string {
	if (displayKind === undefined) {
		return 'text/plain';
	}
	return `${simpleAttachmentMimeType}; ${attachmentDisplayKindParameter}${encodeURIComponent(displayKind)}`;
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
