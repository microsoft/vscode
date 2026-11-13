/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { MessageAttachmentKind, type Message } from './state/protocol/channels-chat/state.js';

/** Validates an absolute instant without reinterpreting a local wall-clock time. */
export function validateAutomationRunAt(runAt: string | undefined): string {
	if (!runAt || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(runAt)
		|| !Number.isFinite(Date.parse(runAt))
		|| new Date(runAt).toISOString() !== runAt.replace(/Z$/, runAt.includes('.') ? 'Z' : '.000Z')) {
		throw new Error(localize('automation.invalidRunAt', "Choose a valid absolute UTC date and time."));
	}
	return new Date(runAt).toISOString();
}

/** Rejects context that would require a connected client or change before execution. */
export function validateDurableAutomationMessage(message: Message): void {
	for (const attachment of message.attachments ?? []) {
		switch (attachment.type) {
			case MessageAttachmentKind.Simple:
				if (typeof attachment.modelRepresentation === 'string') {
					continue;
				}
				break;
			case MessageAttachmentKind.EmbeddedResource:
				if (attachment.contentType && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(attachment.data)) {
					continue;
				}
				break;
			case MessageAttachmentKind.Resource:
				if (URI.parse(attachment.uri).scheme === Schemas.file && attachment.selection === undefined) {
					continue;
				}
				break;
		}
		throw new Error(localize('automation.unsupportedAttachment', "The attachment '{0}' cannot be saved for later execution. Capture its content or remove it before scheduling.", attachment.label));
	}
}
