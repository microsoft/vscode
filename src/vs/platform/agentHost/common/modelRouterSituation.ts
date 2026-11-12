/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { getPullRequestUrlKey } from '../../github/common/githubUrls.js';
import type { IAgentModelInfo } from './agent.js';
import type { SessionMode } from './agentHostSchema.js';
import { getWorkingDirectoryKey } from './agentHostWorkingDirectories.js';
import { readAgentModelPricingMeta } from './meta/agentModelMeta.js';
import { modelContextSizes } from './modelRouter.js';
import { MessageAttachmentKind, readFolderScopeGitState, readSessionGitHubState, readSessionGitState, readWorkingDirectoryScopeId, type MessageAttachment, type SessionState } from './state/sessionState.js';

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
	/** Only when there are enough to say something about the request. */
	readonly uncommittedFiles?: number;
	/** Only an open one is told. */
	readonly pullRequest?: 'open';
}

function attachmentKind(attachment: MessageAttachment): string {
	// Selected lines are counted for selections, whatever else the attachment is called.
	if ((attachment.type === MessageAttachmentKind.Resource || attachment.type === MessageAttachmentKind.EmbeddedResource) && attachment.selection) {
		return 'selection';
	}
	if (attachment.displayKind) {
		return attachment.displayKind;
	}
	switch (attachment.type) {
		case MessageAttachmentKind.EmbeddedResource: return attachment.contentType.startsWith('image/') ? 'image' : 'document';
		case MessageAttachmentKind.Resource: return attachment.contentType?.startsWith('image/') ? 'image' : 'document';
		case MessageAttachmentKind.Annotations: return 'set of review comments';
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
			const { start, end } = selection.range;
			// A range that ends at the start of a line does not select that line.
			entry.lines += end.line - start.line + (end.character === 0 && end.line > start.line ? 0 : 1);
		}
		byKind.set(kind, entry);
	}
	// Sorted, so the same attachments read the same in whatever order a client sends them.
	return [...byKind].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([kind, { count, lines }]) => ({ kind, count, ...(lines ? { lines } : {}) }));
}

/**
 * Where a turn's work happens. `workingDirectories` are the chat's own, which for a peer chat can
 * be another folder than the session's.
 */
export function modelRouterWorkspaceSituation(session: Pick<SessionState, '_meta' | 'workingDirectories'> | undefined, workingDirectories: readonly string[] | undefined, isDefaultChat: boolean): Pick<IModelRouterSituation, 'workspace' | 'repository' | 'uncommittedFiles' | 'pullRequest'> {
	const folder = workingDirectories?.[0];
	if (!session || !folder) {
		return {};
	}
	const workspace = basename(URI.parse(folder));
	const sessionFolder = session.workingDirectories?.[0];
	const isSessionFolder = sessionFolder !== undefined && getWorkingDirectoryKey(sessionFolder) === getWorkingDirectoryKey(folder);
	// As the host's git state service reads it: the session's state is its default chat's, a peer's is stored for its folders.
	const git = isDefaultChat && isSessionFolder
		? readSessionGitState(session._meta)
		: readFolderScopeGitState(session._meta, readWorkingDirectoryScopeId(session._meta, workingDirectories)) ?? (isSessionFolder ? readSessionGitState(session._meta) : undefined);
	const gitHub = readSessionGitHubState(session._meta, folder);
	// A stored pull request can be one of a branch the checkout has since left, and the stored state is one pull request's.
	const branchPullRequest = git?.branchName && gitHub?.pullRequestBranchName === git.branchName ? gitHub.pullRequestUrls?.[0] : undefined;
	const pullRequestState = branchPullRequest && gitHub?.pullRequestStateUrl && getPullRequestUrlKey(gitHub.pullRequestStateUrl) === getPullRequestUrlKey(branchPullRequest) ? gitHub.pullRequestState : undefined;
	return {
		...(workspace ? { workspace } : {}),
		...(gitHub?.owner && gitHub.repo ? { repository: `${gitHub.owner}/${gitHub.repo}` } : {}),
		...(git?.uncommittedChanges && git.uncommittedChanges >= MIN_UNCOMMITTED_FILES_TOLD ? { uncommittedFiles: git.uncommittedChanges } : {}),
		...(pullRequestState === 'open' ? { pullRequest: pullRequestState } : {}),
	};
}

/** A smaller count made the decision read a quick question as larger work. */
const MIN_UNCOMMITTED_FILES_TOLD = 10;

const modeDescriptions: Record<NonNullable<IModelRouterSituation['mode']>, string> = {
	plan: 'Plan mode: the agent plans first and carries the plan out when the user is ready',
	autopilot: 'Autopilot mode: the agent works on its own until the task is done',
};

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

const attachmentKindPlurals: Record<string, string> = {
	'attachment': 'attachments',
	'chat transcript': 'chat transcripts',
	'directory': 'directories',
	'document': 'documents',
	'image': 'images',
	'selection': 'selections',
	'set of review comments': 'sets of review comments',
	'symbol': 'symbols',
};

/** A kind a client names itself has no known plural, so it is left as it is. */
function countOfKind(count: number, kind: string): string {
	return `${count} ${count === 1 ? kind : attachmentKindPlurals[kind] ?? kind}`;
}

const MAX_NAME_LENGTH = 80;

/** Names come from files, folders and clients, so each stays one short line of the request. */
function oneLine(name: string | undefined): string | undefined {
	return name?.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH) || undefined;
}

/** The lines a decision is given about a turn. */
export function describeModelRouterSituation(situation: IModelRouterSituation | undefined): string[] {
	if (!situation) {
		return [];
	}
	const lines: string[] = [];
	if (situation.attachments?.length) {
		lines.push(`Attached: ${situation.attachments.map(({ kind, count, lines: selectedLines }) => `${countOfKind(count, oneLine(kind) ?? 'attachment')}${selectedLines ? ` (${plural(selectedLines, 'line')})` : ''}`).join(', ')}`);
	}
	if (situation.mode) {
		lines.push(modeDescriptions[situation.mode]);
	}
	const agent = oneLine(situation.agent);
	if (agent) {
		lines.push(`Custom agent chosen by the user: ${agent}`);
	}
	const folder = oneLine(situation.workspace);
	const repository = oneLine(situation.repository);
	const workspace = folder && repository ? `${folder} (${repository})` : folder ?? repository;
	const workingTree = [
		...(situation.uncommittedFiles ? [`${plural(situation.uncommittedFiles, 'file')} with uncommitted changes`] : []),
		...(situation.pullRequest ? ['the branch has an open pull request'] : []),
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
	const selectable = modelContextSizes(model);
	// A model with one window has no size to choose, so its window is only on the model itself.
	const contextSizes = selectable.length ? selectable : model.maxContextWindow && model.maxContextWindow > 0 ? [model.maxContextWindow] : [];
	const facts = [
		...(priceCategory ? [`${priceCategory} cost`] : []),
		...(contextSizes.length ? [`context window ${contextSizes.length > 1 ? `${formatContextWindow(contextSizes[0])} or ${formatContextWindow(contextSizes[contextSizes.length - 1])}` : formatContextWindow(contextSizes[0])}`] : []),
	];
	return facts.length ? facts.join(', ') : undefined;
}
