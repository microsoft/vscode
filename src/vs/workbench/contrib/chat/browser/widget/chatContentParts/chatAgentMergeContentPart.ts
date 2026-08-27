/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { Button, IButtonStyles } from '../../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { shorten } from '../../../../../../base/common/labels.js';
import { Disposable, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { posix } from '../../../../../../base/common/path.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IAgentMergePromptSummary, parseAgentMergePrompt } from '../../../../../../platform/agentHost/common/agentMergePrompt.js';
import { CommandsRegistry, ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IMarkdownRenderer } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { AgentFeedbackReviewCommandId, IChatAgentFeedbackPullRequestThreadLink } from '../../../common/chatService/chatService.js';
import { IChatRequestViewModel } from '../../../common/model/chatViewModel.js';
import './media/chatAgentMergeContent.css';

/** The widget draws its own chrome, so the button contributes no colors of its own. */
const transparentButtonStyles: IButtonStyles = {
	buttonBackground: undefined,
	buttonBorder: undefined,
	buttonForeground: undefined,
	buttonHoverBackground: undefined,
	buttonSecondaryBackground: undefined,
	buttonSecondaryBorder: undefined,
	buttonSecondaryForeground: undefined,
	buttonSecondaryHoverBackground: undefined,
	buttonSeparator: undefined,
};

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

const agentMergeTitle = localize('chat.agentMerge.title', "Agent Merge");

/** The counts shown next to the title, describing why the turn was started. */
function describeBadges(summary: IAgentMergePromptSummary, commentCount: number): { readonly icon: ThemeIcon; readonly label: string }[] {
	const badges: { icon: ThemeIcon; label: string }[] = [];
	if (commentCount > 0) {
		badges.push({
			icon: Codicon.commentCompact,
			label: commentCount === 1
				? localize('chat.agentMerge.oneComment', "1 comment")
				: localize('chat.agentMerge.comments', "{0} comments", commentCount),
		});
	}
	if (summary.failedChecks.length > 0) {
		badges.push({
			icon: Codicon.errorCompact,
			label: summary.failedChecks.length === 1
				? localize('chat.agentMerge.oneCheck', "1 check failing")
				: localize('chat.agentMerge.checks', "{0} checks failing", summary.failedChecks.length),
		});
	}
	if (badges.length === 0) {
		badges.push({
			icon: summary.conflicting ? Codicon.warningCompact : Codicon.arrowDown,
			label: summary.conflicting
				? localize('chat.agentMerge.conflicting', "Merge conflicts")
				: summary.behind
					? localize('chat.agentMerge.behind', "Behind base branch")
					: localize('chat.agentMerge.upToDate', "No pending feedback"),
		});
	}
	return badges;
}

/**
 * Plain-text rendering of the widget's collapsed header. The request's own text
 * is the machine-facing prompt, which is never displayed, so screen readers and
 * transcript find use this in its place.
 */
export function getAgentMergeSummaryLabel(summary: IAgentMergePromptSummary): string {
	const badges = describeBadges(summary, collectComments(summary).length);
	return [agentMergeTitle, ...badges.map(badge => badge.label)].join(', ');
}

/**
 * Stand-in label for a system-initiated Agent Merge request, whose own text is
 * the machine-facing prompt this widget renders in place of. Returns
 * `undefined` for every other request, which keeps its own text.
 */
export function getAgentMergeRequestLabel(element: IChatRequestViewModel): string | undefined {
	if (element.systemInitiatedLabel !== undefined) {
		return undefined;
	}
	const summary = parseAgentMergePrompt(element.messageText);
	return summary && getAgentMergeSummaryLabel(summary);
}

/**
 * Renders the machine-facing Agent Merge prompt as a compact disclosure: a
 * header naming the pull request work in progress with counts of the review
 * feedback and failing checks that triggered it, expanding to the feedback
 * itself and a nested disclosure holding the verbatim instructions sent to the
 * agent.
 *
 * Review threads the session mirrored into agent feedback link to their local
 * comment, so a click on the file label reveals that comment in the editor.
 */
export class ChatAgentMergeContentPart extends Disposable {

	readonly domNode: HTMLElement;

	private readonly _comments: readonly IAgentMergeCommentItem[];
	private readonly _fileLabels: readonly (IAgentMergeFileLabel | undefined)[];

	constructor(
		private readonly _summary: IAgentMergePromptSummary,
		private readonly _sessionResource: URI,
		private readonly _markdownRenderer: IMarkdownRenderer,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IHoverService private readonly _hoverService: IHoverService,
		@ICommandService private readonly _commandService: ICommandService,
	) {
		super();

		this._comments = collectComments(_summary);
		this._fileLabels = describeAgentMergeFileLabels(this._comments);

		this.domNode = dom.$('.chat-agent-merge');
		this._createHeader(this.domNode);

		const body = dom.append(this.domNode, dom.$('.chat-agent-merge-body'));
		this._createPullRequestRow(body);
		this._createCommentsSection(body);
		this._createChecksSection(body);
		this._createAgentMessageSection(body);
	}

	private _createHeader(parent: HTMLElement): void {
		const button = this._register(new Button(parent, { ...transparentButtonStyles, title: false }));
		button.element.classList.add('chat-agent-merge-header');

		const twistie = dom.append(button.element, dom.$('span.chat-agent-merge-twistie'));
		twistie.classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronRightCompact));
		const icon = dom.append(button.element, dom.$('span.chat-agent-merge-icon'));
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.gitMerge));
		dom.append(button.element, dom.$('span.chat-agent-merge-title', undefined, agentMergeTitle));

		const badges = dom.append(button.element, dom.$('span.chat-agent-merge-badges'));
		for (const badge of describeBadges(this._summary, this._comments.length)) {
			const badgeElement = dom.append(badges, dom.$('span.chat-agent-merge-badge'));
			const badgeIcon = dom.append(badgeElement, dom.$('span'));
			badgeIcon.classList.add(...ThemeIcon.asClassNameArray(badge.icon));
			dom.append(badgeElement, dom.$('span', undefined, badge.label));
		}

		this._register(toggleDisclosure(button, this.domNode, getAgentMergeSummaryLabel(this._summary)));
	}

	private _createPullRequestRow(body: HTMLElement): void {
		if (!this._summary.pullRequestUrl) {
			return;
		}

		const row = dom.append(body, dom.$('.chat-agent-merge-pr'));
		const icon = dom.append(row, dom.$('span.chat-agent-merge-row-icon'));
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.gitPullRequest));

		const link: HTMLAnchorElement = dom.append(row, dom.$('a.chat-agent-merge-link.chat-agent-merge-pr-title', undefined, this._summary.title || this._summary.pullRequestUrl));
		link.href = this._summary.pullRequestUrl;
		this._registerLink(link, this._summary.pullRequestUrl, () => this._openerService.open(URI.parse(this._summary.pullRequestUrl)));
	}

	private _createCommentsSection(body: HTMLElement): void {
		if (this._comments.length === 0) {
			return;
		}

		const section = dom.append(body, dom.$('.chat-agent-merge-section'));
		dom.append(section, dom.$('.chat-agent-merge-section-title', undefined, localize('chat.agentMerge.commentsTitle', "Review Feedback")));

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
		dom.append(section, dom.$('.chat-agent-merge-section-title', undefined, localize('chat.agentMerge.checksTitle', "Failing Checks")));
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

	private _createAgentMessageSection(body: HTMLElement): void {
		if (!this._summary.agentMessage) {
			return;
		}

		const label = localize('chat.agentMerge.agentMessage', "Agent message");
		const section = dom.append(body, dom.$('.chat-agent-merge-message'));
		const messageBody = dom.$('.chat-agent-merge-message-body', undefined, this._summary.agentMessage);

		const button = this._register(new Button(section, { ...transparentButtonStyles, title: false }));
		button.element.classList.add('chat-agent-merge-message-header');
		const twistie = dom.append(button.element, dom.$('span.chat-agent-merge-twistie'));
		twistie.classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronRightCompact));
		dom.append(button.element, dom.$('span', undefined, label));

		section.appendChild(messageBody);
		this._register(toggleDisclosure(button, section, label));
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

/**
 * Wires a button to expand and collapse the region its owner holds, keeping the
 * collapsed state on the owner so CSS can drive both the twistie and the
 * region's visibility from one class.
 */
function toggleDisclosure(button: Button, owner: HTMLElement, ariaLabel: string): IDisposable {
	const apply = (expanded: boolean) => {
		owner.classList.toggle('collapsed', !expanded);
		button.element.ariaExpanded = String(expanded);
		button.element.ariaLabel = ariaLabel;
	};
	apply(false);
	return button.onDidClick(() => apply(owner.classList.contains('collapsed')));
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
