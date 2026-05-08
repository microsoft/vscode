/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * @fileoverview Expose current board snapshot + persona roster to the LLM
 * via CopilotKit's `useCopilotReadable`. Anything passed here is rendered
 * into the system context the agent sees on every chat call, so it can
 * answer "which card is in progress?" without any extra tool roundtrip.
 */

import { useCopilotReadable } from '@copilotkit/react-core';
import type { BoardSnapshotView, PersonaView } from './protocol';

export function useBoardReadable(
	snapshot: BoardSnapshotView | null,
	conversationTitle: string,
	personas: ReadonlyArray<PersonaView>,
): void {
	useCopilotReadable({
		description: 'Current Task Board snapshot for the active conversation.',
		value: snapshot
			? {
					conversationTitle,
					createdAt: new Date(snapshot.createdAt).toISOString(),
					tasks: snapshot.tasks.map(t => ({
						id: t.id,
						instruction: t.instruction,
						assignee: t.assignee,
						state: t.state,
						scopeFiles: t.scopeFiles,
						dependencies: t.dependencies,
						summary: t.summary,
					})),
				}
			: { conversationTitle, tasks: [] },
	});

	useCopilotReadable({
		description: 'Available agent handles for assigning cards. Use as the `assignee` argument when calling setCardAssignee.',
		value: personas.map(p => ({ handle: p.id, role: p.tagline })),
	});
}
