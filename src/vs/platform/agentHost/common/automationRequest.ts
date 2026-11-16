/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { MessageAttachmentKind, type Message } from './state/protocol/channels-chat/state.js';

/** Validates an absolute ISO 8601 instant with `Z` or an explicit offset, and returns it in UTC. */
export function validateAutomationRunAt(runAt: string | undefined): string {
	const match = runAt && /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.(?<fraction>\d+))?(?:Z|(?<sign>[+-])(?<offsetHour>\d{2}):(?<offsetMinute>\d{2}))$/.exec(runAt);
	const groups = match ? match.groups! : undefined;
	if (groups) {
		const [year, month, day, hour, minute, second] = [groups.year, groups.month, groups.day, groups.hour, groups.minute, groups.second].map(Number);
		const offsetHour = Number(groups.offsetHour ?? 0);
		const offsetMinute = Number(groups.offsetMinute ?? 0);
		const local = new Date(Date.UTC(year, month - 1, day, hour, minute, second, Number((groups.fraction ?? '').padEnd(3, '0').slice(0, 3))));
		if (local.getUTCFullYear() === year && local.getUTCMonth() === month - 1 && local.getUTCDate() === day
			&& local.getUTCHours() === hour && local.getUTCMinutes() === minute && local.getUTCSeconds() === second
			&& offsetHour <= 23 && offsetMinute <= 59) {
			const offset = (groups.sign === '-' ? -1 : 1) * (offsetHour * 60 + offsetMinute) * 60_000;
			return new Date(local.getTime() - offset).toISOString();
		}
	}
	throw new Error(localize('automation.invalidRunAt', "Choose a valid absolute UTC date and time."));
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
