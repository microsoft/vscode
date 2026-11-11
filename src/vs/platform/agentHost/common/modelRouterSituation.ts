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

/*
 * What a model router's decision is told about a turn besides its message. A short message such as
 * "fix this" says little on its own: what is attached, how the user asked the agent to work and
 * where the work happens say more. These are facts only, never the content of an attachment, a
 * file or the working tree.
 */

/** Attachments of one kind. */
export interface IModelRouterAttachmentSummary {
	/** What the attachments are, such as `image`, `document`, `selection` or `directory`. */
	readonly kind: string;
	readonly count: number;
	/** Lines the user selected, summed over the attachments that say. */
	readonly lines?: number;
}

export interface IModelRouterSituation {
	readonly attachments?: readonly IModelRouterAttachmentSummary[];
	/** How the user asked the agent to approach the turn. `interactive`, the default, says nothing and is left out. */
	readonly mode?: Exclude<SessionMode, 'interactive'>;
	/** The custom agent the user selected, by name. */
	readonly agent?: string;
	/** The working folder's name. */
	readonly workspace?: string;
	/** The GitHub repository, as `owner/repo`. */
	readonly repository?: string;
	/** How many files have uncommitted changes. */
	readonly uncommittedFiles?: number;
	/** The pull request of the branch being worked on, when it has one. */
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

/** Counts a message's attachments by kind. It reads what the message says about them, not their content. */
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

/** What a session's state says about where a turn's work happens. */
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

/** The lines a decision is given about a turn, or none when nothing is known. */
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
		...(situation.uncommittedFiles ? [`${plural(situation.uncommittedFiles, 'file')} with uncommitted changes`] : []),
		...(situation.pullRequest ? [`the branch has ${situation.pullRequest === 'open' ? 'an open' : `a ${situation.pullRequest}`} pull request`] : []),
	];
	if (workspace || workingTree.length) {
		lines.push(`Workspace: ${[...(workspace ? [workspace] : []), ...workingTree].join('; ')}`);
	}
	return lines;
}

function formatContextWindow(tokens: number): string {
	return tokens >= 1_000_000 ? `${Math.round(tokens / 100_000) / 10}M` : `${Math.round(tokens / 1000)}K`;
}

/** What a decision is told about a model besides its name: what it costs and how much it can read. */
export function describeModelRouterModel(model: IAgentModelInfo): string | undefined {
	const priceCategory = readAgentModelPricingMeta(model).priceCategory?.replace(/[_-]+/g, ' ').trim().toLowerCase();
	const contextSizes = modelContextSizes(model);
	const facts = [
		...(priceCategory ? [`${priceCategory} cost`] : []),
		...(contextSizes.length ? [`context window ${contextSizes.length > 1 ? `${formatContextWindow(contextSizes[0])} or ${formatContextWindow(contextSizes[contextSizes.length - 1])}` : formatContextWindow(contextSizes[0])}`] : []),
	];
	return facts.length ? facts.join(', ') : undefined;
}
