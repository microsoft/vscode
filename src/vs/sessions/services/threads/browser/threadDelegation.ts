/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createAgentThreadDelegationMeta } from '../../../../platform/agentHost/common/meta/agentThreadDelegationMeta.js';
import { localize } from '../../../../nls.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ISession } from '../../sessions/common/session.js';
import { IThreadDescriptor, IThreadsService } from './threadsService.js';

export function getThreadMentionLabel(name: string): string {
	const normalized = name.trim().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/gu, '');
	return `@${normalized || 'thread'}`;
}

export function createThreadDelegationRequestMetadata(
	thread: IThreadDescriptor,
	threads: readonly IThreadDescriptor[],
): Record<string, unknown> {
	return createAgentThreadDelegationMeta({
		threadId: thread.id,
		threadName: thread.name,
		primaryParticipantId: thread.primaryParticipantId,
		participants: thread.participants.map(participant => ({
			id: participant.id,
			name: participant.name,
			mention: getThreadMentionLabel(participant.name),
			...(participant.agent ? { agentUri: participant.agent.uri } : {}),
			primary: participant.id === thread.primaryParticipantId,
		})),
		threads: threads
			.filter(candidate => candidate.id !== thread.id)
			.map(candidate => ({
				id: candidate.id,
				name: candidate.name,
				mention: getThreadMentionLabel(candidate.name),
				sessionResource: candidate.routingResource.toString(),
			})),
	});
}

export function getMentionedThreads(
	query: string,
	currentThread: IThreadDescriptor,
	threads: readonly IThreadDescriptor[],
): readonly IThreadDescriptor[] {
	return threads.filter(thread =>
		thread.id !== currentThread.id
		&& query.includes(getThreadMentionLabel(thread.name))
	);
}

export async function prepareThreadDelegationRequest(
	threadsService: IThreadsService,
	dialogService: IDialogService,
	session: ISession,
	query: string,
): Promise<{ readonly allowed: boolean; readonly metadata?: Record<string, unknown> }> {
	const thread = threadsService.getThreadForSession(session) ?? threadsService.activeDraftThread.get();
	if (!thread) {
		return { allowed: true };
	}
	const threads = threadsService.threads.get();
	const mentionedThreads = getMentionedThreads(query, thread, threads);
	if (mentionedThreads.length > 0) {
		const result = await dialogService.confirm({
			type: 'info',
			message: mentionedThreads.length === 1
				? localize('threadDelegation.confirm.one', "Send work to \"{0}\"?", mentionedThreads[0].name)
				: localize('threadDelegation.confirm.many', "Send work to {0} Threads?", mentionedThreads.length),
			detail: localize('threadDelegation.confirm.detail', "The primary agent will queue this request in the mentioned Thread and include its source."),
			primaryButton: localize('threadDelegation.confirm.send', "Send"),
		});
		if (!result.confirmed) {
			return { allowed: false };
		}
	}
	return {
		allowed: true,
		metadata: createThreadDelegationRequestMetadata(thread, threads),
	};
}
