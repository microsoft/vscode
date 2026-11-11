/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import type { IAgentModelInfo } from './agent.js';
import type { SessionMode } from './agentHostSchema.js';
import { readAgentModelPricingMeta } from './meta/agentModelMeta.js';
import { modelContextSizes } from './modelRouter.js';
import { MessageAttachmentKind, readSessionFolderGitHubState, readSessionGitState, type MessageAttachment, type SessionState } from './state/sessionState.js';

export interface IModelRouterAttachmentSummary {
	readonly kind: string;
	readonly count: number;
	/** Selected lines, summed over the attachments. */
	readonly lines?: number;
}

/** Facts a model router's decision is told about a turn besides its message. Never content. */
export interface IModelRouterSituation {
	readonly attachments?: readonly IModelRouterAttachmentSummary[];
	readonly mode?: Exclude<SessionMode, 'interactive'>;
	readonly agent?: string;
	readonly workspace?: string;
	/** As `owner/repo`. */
	readonly repository?: string;
	readonly uncommittedFiles?: number;
	readonly pullRequest?: 'open' | 'closed' | 'merged';
}

function attachmentKind(attachment: MessageAttachment): string {
	if (attachment.displayKind) {
		return attachment.displayKind;
	}
	switch (attachment.type) {
		case MessageAttachmentKind.EmbeddedResource: return attachment.contentType.startsWith('image/') ? 'image' : attachment.selection ? 'selection' : 'document';
		case MessageAttachmentKind.Resource: return attachment.contentType?.startsWith('image/') ? 'image' : attachment.selection ? 'selection' : 'document';
		case MessageAttachmentKind.Annotations: return 'review comments';
		case MessageAttachmentKind.Chat: return 'chat transcript';
		default: return 'attachment';
	}
}

export function summarizeModelRouterAttachments(attachments: readonly MessageAttachment[] | undefined): IModelRouterAttachmentSummary[] {
	const byKind = new Map<string, { count: number; lines: number }>();
	for (const attachment of attachments ?? []) {
		const kind = attachmentKind(attachment);
		const entry = byKind.get(kind) ?? { count: 0, lines: 0 };
		entry.count++;
		const selection = attachment.type === MessageAttachmentKind.Resource || attachment.type === MessageAttachmentKind.EmbeddedResource ? attachment.selection : undefined;
		if (selection) {
			entry.lines += selection.range.end.line - selection.range.start.line + 1;
		}
		byKind.set(kind, entry);
	}
	return [...byKind].map(([kind, { count, lines }]) => ({ kind, count, ...(lines ? { lines } : {}) }));
}

export function modelRouterWorkspaceSituation(session: Pick<SessionState, '_meta' | 'workingDirectories'> | undefined): Pick<IModelRouterSituation, 'workspace' | 'repository' | 'uncommittedFiles' | 'pullRequest'> {
	if (!session) {
		return {};
	}
	const folder = session.workingDirectories?.[0];
	const workspace = folder ? basename(URI.parse(folder)) : undefined;
	const git = readSessionGitState(session._meta);
	const gitHub = readSessionFolderGitHubState(session);
	return {
		...(workspace ? { workspace } : {}),
		...(gitHub?.owner && gitHub.repo ? { repository: `${gitHub.owner}/${gitHub.repo}` } : {}),
		...(git?.uncommittedChanges ? { uncommittedFiles: git.uncommittedChanges } : {}),
		...(gitHub?.pullRequestState ? { pullRequest: gitHub.pullRequestState } : {}),
	};
}

const modeDescriptions: Record<NonNullable<IModelRouterSituation['mode']>, string> = {
	plan: 'Plan mode: the agent plans first and carries the plan out when the user is ready',
	autopilot: 'Autopilot mode: the agent works on its own until the task is done',
};

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

/** A smaller count made the decision read a quick question as larger work. */
const MIN_UNCOMMITTED_FILES_TOLD = 10;

/** The lines a decision is given about a turn. */
export function describeModelRouterSituation(situation: IModelRouterSituation | undefined): string[] {
	if (!situation) {
		return [];
	}
	const lines: string[] = [];
	if (situation.attachments?.length) {
		lines.push(`Attached: ${situation.attachments.map(({ kind, count, lines }) => `${plural(count, kind)}${lines ? ` (${plural(lines, 'line')})` : ''}`).join(', ')}`);
	}
	if (situation.mode) {
		lines.push(modeDescriptions[situation.mode]);
	}
	if (situation.agent) {
		lines.push(`Custom agent chosen by the user: ${situation.agent}`);
	}
	const workspace = situation.workspace && situation.repository ? `${situation.workspace} (${situation.repository})` : situation.workspace ?? situation.repository;
	const workingTree = [
		...(situation.uncommittedFiles && situation.uncommittedFiles >= MIN_UNCOMMITTED_FILES_TOLD ? [`${plural(situation.uncommittedFiles, 'file')} with uncommitted changes`] : []),
		...(situation.pullRequest === 'open' ? ['the branch has an open pull request'] : []),
	];
	if (workspace || workingTree.length) {
		lines.push(`Workspace: ${[...(workspace ? [workspace] : []), ...workingTree].join('; ')}`);
	}
	return lines;
}

function formatContextWindow(tokens: number): string {
	return tokens >= 1_000_000 ? `${Math.round(tokens / 100_000) / 10}M` : `${Math.round(tokens / 1000)}K`;
}

/** A model's cost and context window, as the decision is told them. */
export function describeModelRouterModel(model: IAgentModelInfo): string | undefined {
	const priceCategory = readAgentModelPricingMeta(model).priceCategory?.replace(/[_-]+/g, ' ').trim().toLowerCase();
	const contextSizes = modelContextSizes(model);
	const facts = [
		...(priceCategory ? [`${priceCategory} cost`] : []),
		...(contextSizes.length ? [`context window ${contextSizes.length > 1 ? `${formatContextWindow(contextSizes[0])} or ${formatContextWindow(contextSizes[contextSizes.length - 1])}` : formatContextWindow(contextSizes[0])}`] : []),
	];
	return facts.length ? facts.join(', ') : undefined;
}
