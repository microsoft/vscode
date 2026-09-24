/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/githubResourceHover.css';

import { $, append } from '../../../../base/browser/dom.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { safeIntl } from '../../../../base/common/date.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { language } from '../../../../base/common/platform.js';
import { themeColorFromId, ThemeIcon } from '../../../../base/common/themables.js';
import { renderAsPlaintext } from '../../../../base/browser/markdownRenderer.js';
import { localize } from '../../../../nls.js';
import { asCssVariable } from '../../../../platform/theme/common/colorUtils.js';
import { computePullRequestIcon } from '../../../common/chatPullRequest.js';

const MAX_DESCRIPTION_LENGTH = 200;
const MAX_TITLE_LENGTH = 80;
const githubHoverDateFormatter = safeIntl.DateTimeFormat(language, { month: 'short', day: 'numeric' });

export interface IGitHubHoverActor {
	readonly login: string;
}

export interface IGitHubIssueHoverModel {
	readonly title: string;
	readonly body: string;
	readonly state: 'open' | 'closed';
	readonly stateReason?: 'completed' | 'not_planned' | 'duplicate' | 'reopened';
	readonly author: IGitHubHoverActor;
	readonly createdAt?: string;
}

export interface IGitHubPullRequestHoverModel {
	readonly title: string;
	readonly body: string;
	readonly state: 'open' | 'closed' | 'merged';
	readonly author: IGitHubHoverActor;
	readonly headRef: string;
	readonly baseRef: string;
	readonly isDraft: boolean;
	readonly createdAt?: string;
}

export type GitHubChecksStatus = 'pending' | 'success' | 'failure' | 'neutral';

interface IGitHubResourceHoverData {
	readonly owner: string;
	readonly repo: string;
	readonly repositoryHref: string;
	readonly referenceHref: string;
	readonly density: 'default' | 'compact';
	readonly onDidClickRepository?: () => void;
	readonly onDidClickReference?: () => void;
}

export interface IGitHubResourceHover {
	readonly element: HTMLElement;
	readonly tabbableElements: readonly HTMLElement[];
}

export interface IIssueResourceHoverData extends IGitHubResourceHoverData {
	readonly number: number;
	readonly issue: IGitHubIssueHoverModel;
}

export interface IPullRequestResourceHoverData extends IGitHubResourceHoverData {
	readonly number: number;
	readonly pullRequest: IGitHubPullRequestHoverModel;
	readonly checksStatus?: GitHubChecksStatus;
	readonly onDidClickBaseBranch?: () => void;
	readonly onDidClickHeadBranch?: () => void;
}

export interface IGitHubCommitHoverModel {
	readonly sha: string;
	readonly message: string;
	readonly author: IGitHubHoverActor;
	readonly committedAt: string;
}

export interface ICommitResourceHoverData extends IGitHubResourceHoverData {
	readonly commit: IGitHubCommitHoverModel;
}

export function createIssueResourceHover(data: IIssueResourceHoverData): IGitHubResourceHover {
	const hoverElement = $('.sessions-issue-hover');
	hoverElement.classList.toggle('compact', data.density === 'compact');

	const header = append(hoverElement, $('.sessions-issue-hover-header'));
	const repositoryLink = appendHoverLink(header, 'sessions-issue-hover-repository', data.repositoryHref, `${data.owner}/${data.repo}`, data.onDidClickRepository);
	const createdAt = getGitHubHoverDate(data.issue.createdAt);
	if (createdAt) {
		append(header, $('span.sessions-issue-hover-date', undefined, localize('github.issueHover.createdDate', "on {0}", createdAt)));
	}

	const title = data.issue.title || localize('github.issueHover.titleFallback', "Issue #{0}", data.number);
	const titleElement = append(hoverElement, $('.sessions-issue-hover-title'));
	const titleContent = append(titleElement, $('.sessions-issue-hover-title-content'));
	const titleLayout = appendGitHubHoverTitle(titleContent, title, 'sessions-issue-hover-title-tail');
	const referenceLink = appendHoverLink(titleLayout.referenceContainer, 'sessions-issue-hover-reference', data.referenceHref, `#${data.number}`, data.onDidClickReference, localize('github.issueHover.reference', "Issue #{0}", data.number));
	referenceLink.onfocus = titleLayout.showFullTitle;
	referenceLink.onblur = titleLayout.showBoundedTitle;
	titleElement.title = title;

	const statusRow = append(hoverElement, $('.sessions-issue-hover-status-row'));
	const status = getIssueResourceStatus(data.issue);
	const statusElement = append(statusRow, $('span.sessions-issue-hover-status'));
	statusElement.dataset.state = status.kind;
	const statusIcon = getIssueIcon(status.kind);
	const statusIconElement = append(statusElement, renderIcon(statusIcon));
	statusIconElement.setAttribute('aria-hidden', 'true');
	if (statusIcon.color) {
		statusIconElement.style.color = asCssVariable(statusIcon.color.id);
	}
	append(statusElement, $('span.sessions-issue-hover-status-label', undefined, status.label));

	appendDescription(hoverElement, 'sessions-issue-hover', data.issue.body, localize('github.issueHover.bodyFallback', "No description provided."));
	append(hoverElement, $('.sessions-issue-hover-author', undefined, localize('github.issueHover.author', "@{0} opened this issue", data.issue.author.login)));
	return { element: hoverElement, tabbableElements: [repositoryLink, referenceLink] };
}

export function createPullRequestResourceHover(data: IPullRequestResourceHoverData): IGitHubResourceHover {
	const hoverElement = $('.sessions-pr-hover');
	hoverElement.classList.toggle('compact', data.density === 'compact');

	const header = append(hoverElement, $('.sessions-pr-hover-header'));
	const repositoryLink = appendHoverLink(header, 'sessions-pr-hover-repository', data.repositoryHref, `${data.owner}/${data.repo}`, data.onDidClickRepository);
	const createdAt = getGitHubHoverDate(data.pullRequest.createdAt);
	if (createdAt) {
		append(header, $('span.sessions-pr-hover-date', undefined, localize('github.pullRequestHover.createdDate', "on {0}", createdAt)));
	}

	const title = data.pullRequest.title || localize('github.pullRequestHover.titleFallback', "Pull Request #{0}", data.number);
	const titleElement = append(hoverElement, $('.sessions-pr-hover-title'));
	const titleContent = append(titleElement, $('.sessions-pr-hover-title-content'));
	const titleLayout = appendGitHubHoverTitle(titleContent, title, 'sessions-pr-hover-title-tail');
	const referenceLink = appendHoverLink(titleLayout.referenceContainer, 'sessions-pr-hover-reference', data.referenceHref, `#${data.number}`, data.onDidClickReference, localize('github.pullRequestHover.reference', "Pull Request #{0}", data.number));
	referenceLink.onfocus = titleLayout.showFullTitle;
	referenceLink.onblur = titleLayout.showBoundedTitle;
	titleElement.title = title;

	const statusRow = append(hoverElement, $('.sessions-pr-hover-status-row'));
	const status = getPullRequestResourceStatus(data.pullRequest);
	const statusElement = append(statusRow, $('span.sessions-pr-hover-status'));
	statusElement.dataset.state = status.kind;
	const statusIcon = computePullRequestIcon(status.kind);
	const statusIconElement = append(statusElement, renderIcon(statusIcon));
	statusIconElement.setAttribute('aria-hidden', 'true');
	if (statusIcon.color) {
		statusIconElement.style.color = asCssVariable(statusIcon.color.id);
	}
	append(statusElement, $('span.sessions-pr-hover-status-label', undefined, status.label));
	appendChecksStatus(statusRow, data.pullRequest, data.checksStatus);

	appendDescription(hoverElement, 'sessions-pr-hover', data.pullRequest.body, localize('github.pullRequestHover.bodyFallback', "No description provided."));
	const branchRow = append(hoverElement, $('.sessions-pr-hover-branches'));
	const baseBranch = appendBranchPill(branchRow, data.pullRequest.baseRef || localize('github.pullRequestHover.baseFallback', "target"), 'base', data.onDidClickBaseBranch);
	const branchArrow = append(branchRow, $('span.sessions-pr-hover-branch-arrow', undefined, '\u2190'));
	branchArrow.setAttribute('aria-hidden', 'true');
	const headBranch = appendBranchPill(branchRow, data.pullRequest.headRef || localize('github.pullRequestHover.headFallback', "source"), 'head', data.onDidClickHeadBranch);
	append(hoverElement, $('.sessions-pr-hover-author', undefined, localize('github.pullRequestHover.author', "@{0} opened this pull request", data.pullRequest.author.login)));

	return {
		element: hoverElement,
		tabbableElements: [repositoryLink, referenceLink, ...(baseBranch ? [baseBranch] : []), ...(headBranch ? [headBranch] : [])],
	};
}

export function createCommitResourceHover(data: ICommitResourceHoverData): IGitHubResourceHover {
	const hoverElement = $('.sessions-commit-hover');
	hoverElement.classList.toggle('compact', data.density === 'compact');

	const header = append(hoverElement, $('.sessions-commit-hover-header'));
	const repositoryLink = appendHoverLink(header, 'sessions-commit-hover-repository', data.repositoryHref, `${data.owner}/${data.repo}`, data.onDidClickRepository);
	const committedAt = getGitHubHoverDate(data.commit.committedAt);
	if (committedAt) {
		append(header, $('span.sessions-commit-hover-date', undefined, localize('github.commitHover.committedDate', "on {0}", committedAt)));
	}

	const [headline, ...descriptionLines] = data.commit.message.split(/\r?\n/);
	const title = headline || data.commit.sha;
	const titleElement = append(hoverElement, $('.sessions-commit-hover-title'));
	const titleContent = append(titleElement, $('.sessions-commit-hover-title-content'));
	const titleLayout = appendGitHubHoverTitle(titleContent, title, 'sessions-commit-hover-title-tail');
	const shortSha = data.commit.sha.slice(0, 12);
	const referenceLink = appendHoverLink(titleLayout.referenceContainer, 'sessions-commit-hover-reference', data.referenceHref, `@${shortSha}`, data.onDidClickReference, localize('github.commitHover.reference', "Commit {0}", shortSha));
	referenceLink.onfocus = titleLayout.showFullTitle;
	referenceLink.onblur = titleLayout.showBoundedTitle;
	titleElement.title = title;

	appendDescription(hoverElement, 'sessions-commit-hover', descriptionLines.join('\n').trim(), localize('github.commitHover.bodyFallback', "No additional commit message."));
	append(hoverElement, $('.sessions-commit-hover-author', undefined, localize('github.commitHover.author', "@{0} committed this change", data.commit.author.login)));
	return { element: hoverElement, tabbableElements: [repositoryLink, referenceLink] };
}

export function getIssueResourceStatus(issue: IGitHubIssueHoverModel): { readonly kind: 'open' | 'closed' | 'notPlanned' | 'duplicate'; readonly label: string } {
	if (issue.state === 'open') {
		return { kind: 'open', label: localize('github.issueHover.open', "Open") };
	}
	if (issue.stateReason === 'duplicate') {
		return { kind: 'duplicate', label: localize('github.issueHover.duplicate', "Duplicate") };
	}
	if (issue.stateReason === 'not_planned') {
		return { kind: 'notPlanned', label: localize('github.issueHover.notPlanned', "Not planned") };
	}
	return { kind: 'closed', label: localize('github.issueHover.closed', "Closed") };
}

export function getPullRequestResourceStatus(pullRequest: IGitHubPullRequestHoverModel): { readonly kind: 'open' | 'closed' | 'merged' | 'draft'; readonly label: string } {
	if (pullRequest.state === 'merged') {
		return { kind: 'merged', label: localize('github.pullRequestHover.merged', "Merged") };
	}
	if (pullRequest.state === 'closed') {
		return { kind: 'closed', label: localize('github.pullRequestHover.closed', "Closed") };
	}
	if (pullRequest.isDraft) {
		return { kind: 'draft', label: localize('github.pullRequestHover.draft', "Draft") };
	}
	return { kind: 'open', label: localize('github.pullRequestHover.open', "Open") };
}

export function getPullRequestChecksStatusLabel(pullRequest: IGitHubPullRequestHoverModel, checksStatus: GitHubChecksStatus | undefined): string | undefined {
	return getPullRequestChecksStatus(pullRequest, checksStatus)?.label;
}

export function getGitHubHoverDescription(body: string, fallback: string): string {
	const description = renderAsPlaintext(new MarkdownString(body), { omitMarkdownSyntax: true }).replace(/\s+/g, ' ').trim() || fallback;
	return truncateGitHubHoverText(description, MAX_DESCRIPTION_LENGTH);
}

export function getGitHubHoverTitle(title: string): string {
	return truncateGitHubHoverText(title, MAX_TITLE_LENGTH);
}

export function getGitHubHoverTitleParts(title: string): { readonly leading: string; readonly trailing: string | undefined } {
	const visibleTitle = getGitHubHoverTitle(title);
	const lastSpace = visibleTitle.lastIndexOf(' ');
	if (lastSpace < 0 || Array.from(visibleTitle.slice(lastSpace + 1)).length > 20) {
		return { leading: visibleTitle, trailing: undefined };
	}
	return { leading: visibleTitle.slice(0, lastSpace + 1), trailing: visibleTitle.slice(lastSpace + 1) };
}

export function appendGitHubHoverTitle(container: HTMLElement, title: string, tailClassName: string) {
	const titleParts = getGitHubHoverTitleParts(title);
	const leadingText = container.ownerDocument.createTextNode(titleParts.leading);
	container.append(leadingText);
	const referenceContainer = titleParts.trailing === undefined ? container : container.ownerDocument.createElement('span');
	if (referenceContainer !== container) {
		referenceContainer.className = tailClassName;
		container.append(referenceContainer);
	}
	const trailingText = container.ownerDocument.createTextNode(titleParts.trailing === undefined ? '\u00a0' : `${titleParts.trailing}\u00a0`);
	referenceContainer.append(trailingText);
	return {
		referenceContainer,
		showFullTitle: () => { leadingText.nodeValue = title; trailingText.nodeValue = '\u00a0'; },
		showBoundedTitle: () => {
			leadingText.nodeValue = titleParts.leading;
			trailingText.nodeValue = titleParts.trailing === undefined ? '\u00a0' : `${titleParts.trailing}\u00a0`;
		},
	};
}

export function getGitHubHoverDate(value: string | undefined): string | undefined {
	if (!value) {
		return undefined;
	}
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? undefined : githubHoverDateFormatter.value.format(date);
}

function appendHoverLink(container: HTMLElement, className: string, href: string, label: string, onDidClick: (() => void) | undefined, ariaLabel?: string): HTMLAnchorElement {
	const link = document.createElement('a');
	link.className = className;
	link.href = href;
	link.textContent = label;
	link.title = label;
	if (ariaLabel) {
		link.setAttribute('aria-label', ariaLabel);
	}
	if (onDidClick) {
		link.onclick = event => {
			event.preventDefault();
			event.stopPropagation();
			onDidClick();
		};
	}
	append(container, link);
	return link;
}

function getIssueIcon(status: ReturnType<typeof getIssueResourceStatus>['kind']): ThemeIcon {
	if (status === 'open') {
		return { ...Codicon.issueOpened, color: themeColorFromId('charts.green') };
	}
	if (status === 'notPlanned' || status === 'duplicate') {
		return { ...Codicon.issueClosed, color: themeColorFromId('descriptionForeground') };
	}
	return { ...Codicon.issueClosed, color: themeColorFromId('charts.purple') };
}

function appendDescription(container: HTMLElement, classPrefix: string, body: string, fallback: string): void {
	const description = append(container, $(`.${classPrefix}-description`));
	append(description, $(`.${classPrefix}-description-content`, undefined, getGitHubHoverDescription(body, fallback)));
}

function appendChecksStatus(container: HTMLElement, pullRequest: IGitHubPullRequestHoverModel, checksStatus: GitHubChecksStatus | undefined): void {
	const status = getPullRequestChecksStatus(pullRequest, checksStatus);
	if (!status) {
		return;
	}
	const checksElement = append(container, $('span.sessions-pr-hover-checks'));
	checksElement.dataset.status = status.kind;
	const checksIcon = append(checksElement, renderIcon(status.icon));
	checksIcon.setAttribute('aria-hidden', 'true');
	append(checksElement, $('span.sessions-pr-hover-checks-label', undefined, status.label));
}

function getPullRequestChecksStatus(pullRequest: IGitHubPullRequestHoverModel, checksStatus: GitHubChecksStatus | undefined): { readonly kind: 'pending' | 'success' | 'failure'; readonly label: string; readonly icon: ThemeIcon } | undefined {
	if (pullRequest.state !== 'open' || !checksStatus || checksStatus === 'neutral') {
		return undefined;
	}
	switch (checksStatus) {
		case 'pending': return { kind: 'pending', label: localize('github.pullRequestHover.checksPending', "Checks pending"), icon: Codicon.circleFilledCompact };
		case 'failure': return { kind: 'failure', label: localize('github.pullRequestHover.checksFailed', "Checks failed"), icon: Codicon.errorCompact };
		case 'success': return { kind: 'success', label: localize('github.pullRequestHover.checksPassed', "Checks passed"), icon: Codicon.passFilledCompact };
	}
}

function appendBranchPill(container: HTMLElement, label: string, kind: 'base' | 'head', onDidClick: (() => void) | undefined): HTMLElement | undefined {
	const element = onDidClick ? document.createElement('button') : document.createElement('span');
	element.className = 'sessions-pr-hover-branch';
	element.textContent = label;
	element.title = label;
	if (onDidClick) {
		element.setAttribute('aria-label', kind === 'base'
			? localize('github.pullRequestHover.copyBaseBranch', "Copy base branch {0}", label)
			: localize('github.pullRequestHover.copyHeadBranch', "Copy head branch {0}", label));
		element.onclick = event => {
			event.preventDefault();
			event.stopPropagation();
			onDidClick();
		};
	}
	append(container, element);
	return onDidClick ? element : undefined;
}

function truncateGitHubHoverText(value: string, maxLength: number): string {
	const characters = Array.from(value);
	return characters.length <= maxLength ? value : `${characters.slice(0, maxLength - 1).join('').trimEnd()}…`;
}
