/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { Action } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { shorten } from '../../../../../../base/common/labels.js';
import { posix } from '../../../../../../base/common/path.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IAgentMergePromptSummary, parseAgentMergePrompt } from '../../../../../../platform/agentHost/common/agentMergePrompt.js';
import { CommandsRegistry, ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IMarkdownRenderer } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { ChatPillActionViewItem } from '../../../../../browser/chatPills.js';
import { AgentFeedbackReviewCommandId, IChatAgentFeedbackPullRequestThreadLink } from '../../../common/chatService/chatService.js';
import { IChatRequestViewModel } from '../../../common/model/chatViewModel.js';
import { ChatAutomatedRequestContentPart, getAutomatedRequestSummaryLabel } from './chatAutomatedRequestContentPart.js';
import './media/chatAgentMergeContent.css';

/** Where a piece of review feedback is anchored in the repository. */
export interface IAgentMergeFileLocation {
	/** Repository-relative POSIX path, absent for pull request level feedback. */
	readonly path?: string;
	readonly line?: number;
}

/** A commented file's label, disambiguated only as far as its siblings require. */
export interface IAgentMergeFileLabel {
	/** File name, with the commented line appended when known. */
	readonly name: string;
	/** Shortest directory prefix that tells same-named files apart. */
	readonly description?: string;
	/** Full path, for the hover. */
	readonly title: string;
}

/** A single piece of review feedback, flattened out of threads and reviews. */
interface IAgentMergeCommentItem extends IAgentMergeFileLocation {
	readonly author?: string;
	readonly body: string;
	/** GitHub review thread id, used to link the comment to local feedback. */
	readonly threadId?: string;
}

const agentMergeSource = localize('chat.agentMerge.source', "Agent Merge");

/** The status shown in the header, describing why the turn was started. */
function describeAgentMergeStatus(summary: IAgentMergePromptSummary, commentCount: number): string {
	const events: string[] = [];
	if (commentCount > 0) {
		events.push(commentCount === 1
			? localize('chat.agentMerge.oneReviewComment', "1 Review Comment")
			: localize('chat.agentMerge.reviewComments', "{0} Review Comments", commentCount));
	}
	if (summary.failedChecks.length > 0) {
		events.push(summary.failedChecks.length === 1
			? localize('chat.agentMerge.oneFailingCheck', "1 Failing Check")
			: localize('chat.agentMerge.failingChecks', "{0} Failing Checks", summary.failedChecks.length));
	}
	if (summary.conflicting) {
		events.push(localize('chat.agentMerge.mergeConflicts', "Merge Conflicts"));
	}
	if (summary.behind) {
		events.push(localize('chat.agentMerge.behindBaseBranch', "Behind Base Branch"));
	}
	if (events.length === 0) {
		events.push(localize('chat.agentMerge.noPendingFeedback', "No Pending Feedback"));
	}

	return formatAgentMergeEvents(events);
}

function formatAgentMergeEvents(events: readonly string[]): string {
	switch (events.length) {
		case 1:
			return events[0];
		case 2:
			return localize('chat.agentMerge.twoEvents', "{0} and {1}", events[0], events[1]);
		case 3:
			return localize('chat.agentMerge.threeEvents', "{0}, {1}, and {2}", events[0], events[1], events[2]);
		default:
			return localize('chat.agentMerge.fourEvents', "{0}, {1}, {2}, and {3}", events[0], events[1], events[2], events[3]);
	}
}

/**
 * Plain-text rendering of the widget's collapsed header. The request's own text
 * is the machine-facing prompt, which is never displayed, so screen readers and
 * transcript find use this in its place.
 */
export function getAgentMergeSummaryLabel(summary: IAgentMergePromptSummary): string {
	const status = describeAgentMergeStatus(summary, collectComments(summary).length);
	return getAutomatedRequestSummaryLabel(status, agentMergeSource);
}

/**
 * Stand-in label for a system-initiated Agent Merge request, whose own text is
 * the machine-facing prompt this widget renders in place of. Returns
 * `undefined` for every other request, which keeps its own text.
 */
export function getAgentMergeRequestLabel(element: IChatRequestViewModel): string | undefined {
	const summary = getAgentMergeRequestSummary(element);
	return summary && getAgentMergeSummaryLabel(summary);
}

/** Extracts display data only for explicitly identified Agent Merge requests. */
export function getAgentMergeRequestSummary(element: IChatRequestViewModel): IAgentMergePromptSummary | undefined {
	if (!element.isSystemInitiated || element.requestSource !== 'agentMerge' || element.systemInitiatedLabel !== undefined) {
		return undefined;
	}
	return parseAgentMergePrompt(element.messageText);
}

/** Renders the Agent Merge prompt as a compact disclosure whose header action switches between merge details and the agent message. Mirrored review file labels link to their local comments. */
export class ChatAgentMergeContentPart extends ChatAutomatedRequestContentPart {

	private readonly _comments: readonly IAgentMergeCommentItem[];
	private readonly _fileLabels: readonly (IAgentMergeFileLabel | undefined)[];

	constructor(
		private readonly _summary: IAgentMergePromptSummary,
		private readonly _sessionResource: URI,
		private readonly _markdownRenderer: IMarkdownRenderer,
		timestamp: number | undefined,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IHoverService hoverService: IHoverService,
		@ICommandService private readonly _commandService: ICommandService,
	) {
		const comments = collectComments(_summary);
		super({
			title: describeAgentMergeStatus(_summary, comments.length),
			participant: agentMergeSource,
			timestamp,
			agentMessage: { text: _summary.agentMessage, showDetailsLabel: localize('chat.agentMerge.showMergeDetails', "Show Merge Details") },
		}, hoverService);

		this._comments = comments;
		this._fileLabels = describeAgentMergeFileLabels(this._comments);

		this.domNode.classList.add('chat-agent-merge');
		this._createPullRequestRow(this.content);
		this._createCommentsSection(this.content);
		this._createChecksSection(this.content);
	}

	private _createPullRequestRow(body: HTMLElement): void {
		if (!this._summary.pullRequestUrl) {
			return;
		}

		const row = dom.append(body, dom.$('.chat-agent-merge-pr'));
		const title = this._summary.title || this._summary.pullRequestUrl;
		const pullRequestNumber = /\/pull\/(?<number>\d+)\/?$/.exec(URI.parse(this._summary.pullRequestUrl).path)?.groups?.number;
		const label = pullRequestNumber
			? localize('chat.agentMerge.pullRequestPillLabel', "#{0} {1}", pullRequestNumber, title)
			: title;
		const tooltip = pullRequestNumber
			? localize('chat.agentMerge.openPullRequestWithTitle', "Open Pull Request #{0}: {1}", pullRequestNumber, title)
			: localize('chat.agentMerge.openPullRequestWithTitleFallback', "Open Pull Request: {0}", title);
		const action = this._register(new Action(
			'chat.agentMerge.openPullRequest',
			label,
			ThemeIcon.asClassName(Codicon.gitPullRequest),
			true,
			() => this._openerService.open(URI.parse(this._summary.pullRequestUrl)),
		));
		action.tooltip = tooltip;
		const viewItem = this._register(new ChatPillActionViewItem(undefined, action, {}));
		viewItem.render(row);
	}

	private _createCommentsSection(body: HTMLElement): void {
		if (this._comments.length === 0) {
			return;
		}

		const section = dom.append(body, dom.$('.chat-agent-merge-section'));
		if (this._summary.failedChecks.length > 0) {
			dom.append(section, dom.$('.chat-agent-merge-section-title', undefined, localize('chat.agentMerge.commentsTitle', "Feedback")));
		}

		const fileElements = new Map<string, HTMLElement>();
		this._comments.forEach((comment, index) => {
			const item = dom.append(section, dom.$('.chat-agent-merge-comment'));
			const icon = dom.append(item, dom.$('span.chat-agent-merge-row-icon.chat-agent-merge-comment-icon'));
			icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.commentCompact));

			const header = dom.append(item, dom.$('.chat-agent-merge-comment-header'));
			if (comment.author) {
				dom.append(header, dom.$('span.chat-agent-merge-comment-author', undefined, comment.author));
			}
			const label = this._fileLabels[index];
			if (label) {
				const file = dom.append(header, dom.$('span.chat-agent-merge-comment-file', undefined, label.name));
				this._register(this._hoverService.setupDelayedHover(file, { content: label.title }));
				if (label.description) {
					dom.append(header, dom.$('span.chat-agent-merge-comment-file-description', undefined, label.description));
				}
				if (comment.threadId) {
					fileElements.set(comment.threadId, file);
				}
			}

			// Review feedback is untrusted pull request content, so it renders
			// through the chat markdown pipeline, which forbids trusted commands.
			const rendered = this._register(this._markdownRenderer.render(new MarkdownString(comment.body)));
			rendered.element.classList.add('chat-agent-merge-comment-body');
			item.appendChild(rendered.element);
		});

		this._linkMirroredComments(fileElements);
	}

	/**
	 * Turns the file label of each thread the session mirrored into agent
	 * feedback into a link that reveals that comment in the editor. Runs only
	 * where the feedback commands exist (the Agents window) and after the lookup
	 * resolves, so an unmirrored thread stays plain text.
	 */
	private async _linkMirroredComments(fileElements: Map<string, HTMLElement>): Promise<void> {
		if (fileElements.size === 0 || !CommandsRegistry.getCommand(AgentFeedbackReviewCommandId.GetPullRequestThreadLinks)) {
			return;
		}

		const links = await this._commandService.executeCommand<readonly IChatAgentFeedbackPullRequestThreadLink[]>(
			AgentFeedbackReviewCommandId.GetPullRequestThreadLinks, this._sessionResource);
		if (this._store.isDisposed || !links) {
			return;
		}

		for (const link of links) {
			const file = fileElements.get(link.pullRequestThreadId);
			if (!file) {
				continue;
			}
			file.classList.add('chat-agent-merge-link');
			file.setAttribute('role', 'link');
			this._registerLink(file, localize('chat.agentMerge.revealComment', "Reveal Comment in Editor"), () =>
				this._commandService.executeCommand(AgentFeedbackReviewCommandId.Reveal, this._sessionResource, link.commentId));
		}
	}

	private _createChecksSection(body: HTMLElement): void {
		if (this._summary.failedChecks.length === 0) {
			return;
		}

		const section = dom.append(body, dom.$('.chat-agent-merge-section'));
		if (this._comments.length > 0) {
			dom.append(section, dom.$('.chat-agent-merge-section-title', undefined, localize('chat.agentMerge.checksTitle', "Checks")));
		}
		// A check's own run URL is not part of the prompt, so the pull request's
		// checks tab is the closest target that always resolves.
		const checksUrl = this._summary.pullRequestUrl ? `${this._summary.pullRequestUrl}/checks` : undefined;
		for (const check of this._summary.failedChecks) {
			const item = dom.append(section, dom.$('.chat-agent-merge-check'));
			const icon = dom.append(item, dom.$('span.chat-agent-merge-row-icon.chat-agent-merge-check-icon'));
			icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.errorCompact));
			if (!checksUrl) {
				dom.append(item, dom.$('span.chat-agent-merge-check-name', undefined, check));
				continue;
			}
			const link: HTMLAnchorElement = dom.append(item, dom.$('a.chat-agent-merge-link.chat-agent-merge-check-name', undefined, check));
			link.href = checksUrl;
			this._registerLink(link, localize('chat.agentMerge.openCheck', "Open Checks on GitHub"), () => this._openerService.open(URI.parse(checksUrl)));
		}
	}

	/** Makes an element activate `run` by mouse or keyboard, with a hover describing it. */
	private _registerLink(element: HTMLElement, hover: string, run: () => void): void {
		element.tabIndex = 0;
		this._register(this._hoverService.setupDelayedHover(element, { content: hover }));
		this._register(dom.addDisposableListener(element, dom.EventType.CLICK, event => {
			dom.EventHelper.stop(event, true);
			run();
		}));
		this._register(dom.addDisposableListener(element, dom.EventType.KEY_DOWN, event => {
			const keyboardEvent = new StandardKeyboardEvent(event);
			if (keyboardEvent.equals(KeyCode.Enter) || keyboardEvent.equals(KeyCode.Space)) {
				dom.EventHelper.stop(event, true);
				run();
			}
		}));
	}
}

function collectComments(summary: IAgentMergePromptSummary): readonly IAgentMergeCommentItem[] {
	const comments: IAgentMergeCommentItem[] = [];
	for (const thread of summary.reviewThreads) {
		for (const comment of thread.comments) {
			comments.push({
				...comment,
				...(thread.path ? { path: thread.path } : {}),
				...(thread.line !== undefined ? { line: thread.line } : {}),
				threadId: thread.id,
			});
		}
	}
	comments.push(...summary.reviewSummaries, ...summary.newComments);
	return comments;
}

/**
 * Labels each commented file by name alone, adding the shortest distinguishing
 * directory prefix only when several comments share a file name — the same
 * disambiguation editor tabs apply to duplicate labels. Entries without a path
 * (pull request level feedback) get no label.
 */
export function describeAgentMergeFileLabels(locations: readonly IAgentMergeFileLocation[]): readonly (IAgentMergeFileLabel | undefined)[] {
	const indicesByName = new Map<string, number[]>();
	locations.forEach((location, index) => {
		if (location.path) {
			// GitHub always reports repository-relative POSIX paths.
			const name = posix.basename(location.path);
			const existing = indicesByName.get(name);
			if (existing) {
				existing.push(index);
			} else {
				indicesByName.set(name, [index]);
			}
		}
	});

	const labels: (IAgentMergeFileLabel | undefined)[] = locations.map(() => undefined);
	for (const [name, indices] of indicesByName) {
		const directories = indices.map(index => posix.dirname(locations[index].path!));
		const distinct = [...new Set(directories)];
		const shortened = distinct.length > 1 ? shorten(distinct, posix.sep) : undefined;
		indices.forEach((index, position) => {
			const location = locations[index];
			const description = shortened?.[distinct.indexOf(directories[position])];
			labels[index] = {
				name: location.line === undefined ? name : `${name}:${location.line}`,
				...(description ? { description } : {}),
				title: location.path!,
			};
		});
	}
	return labels;
}
