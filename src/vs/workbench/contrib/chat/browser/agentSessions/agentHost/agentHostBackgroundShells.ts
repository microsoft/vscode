/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { readCopilotShellAttachment, readCopilotShellId } from '../../../../../../platform/agentHost/common/meta/copilotBackgroundWorkMeta.js';
import { BackgroundWorkKind, type BackgroundWork } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import type { IChatBackgroundShell } from '../../../common/sessionChatPills.js';

/** Projects a chat's background work onto the shells its Background Shells pill lists. */
export function toChatBackgroundShells(work: readonly BackgroundWork[] | undefined): readonly IChatBackgroundShell[] {
	const shells: IChatBackgroundShell[] = [];
	for (const entry of work ?? []) {
		// The kind set is non-exhaustive, so newer hosts can send kinds this client doesn't render.
		if (entry.kind !== BackgroundWorkKind.Shell) {
			continue;
		}
		const shellId = readCopilotShellId(entry);
		const attachmentMode = readCopilotShellAttachment(entry);
		shells.push({
			id: entry.id,
			...(shellId !== undefined ? { shellId } : {}),
			description: entry.label,
			command: entry.command,
			startedAt: entry.startedAt,
			...(attachmentMode ? { attachmentMode } : {}),
		});
	}
	return shells;
}
