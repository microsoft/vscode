/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { IAgentSession, AgentSessionStatus, isSessionInProgressStatus, hasValidDiff, getAgentChangesSummary } from './agentSessionsModel.js';
import { localize } from '../../../../../nls.js';

const $ = dom.$;

/**
 * Renders individual session items in the agent sessions quick pick
 */
export class AgentSessionsQuickPickItemRenderer extends Disposable {

	render(session: IAgentSession, container: HTMLElement): HTMLElement {
		const itemElement = dom.append(container, $('.agent-sessions-quick-pick-item'));

		// Status indicator
		const statusIcon = this._renderStatusIcon(session);
		dom.append(itemElement, statusIcon);

		// Content container (title + metadata)
		const contentContainer = dom.append(itemElement, $('.agent-sessions-quick-pick-item-content'));

		// Title
		const titleElement = dom.append(contentContainer, $('.agent-sessions-quick-pick-item-title'));
		titleElement.textContent = session.label || localize('agentSessions.untitled', "Untitled Session");

		// Metadata container (badges, provider, time)
		const metadataContainer = dom.append(itemElement, $('.agent-sessions-quick-pick-item-metadata'));

		// Diff stats badge (if available)
		if (hasValidDiff(session.changes)) {
			const diffSummary = getAgentChangesSummary(session.changes);
			if (diffSummary) {
				const diffBadge = this._renderDiffBadge(diffSummary);
				dom.append(metadataContainer, diffBadge);
			}
		}

		// Badge (PR link or other info)
		if (session.badge) {
			const badgeElement = this._renderBadge(session.badge);
			dom.append(metadataContainer, badgeElement);
		}

		// Provider label
		const providerLabel = dom.append(metadataContainer, $('.agent-sessions-quick-pick-item-provider'));
		providerLabel.textContent = session.providerLabel;

		// Separator dot
		const separatorDot = dom.append(metadataContainer, $('.agent-sessions-quick-pick-item-separator'));
		separatorDot.textContent = '•';

		// Relative time
		const timeLabel = dom.append(metadataContainer, $('.agent-sessions-quick-pick-item-time'));
		timeLabel.textContent = this._formatRelativeTime(session.timing?.finishedOrFailedTime ?? session.timing?.inProgressTime);

		return itemElement;
	}

	private _renderStatusIcon(session: IAgentSession): HTMLElement {
		const iconContainer = dom.append($('.agent-sessions-quick-pick-item-status'), $(''));
		iconContainer.classList.add('agent-sessions-quick-pick-item-status');

		let icon: ThemeIcon;
		let statusClass: string;

		if (session.status === AgentSessionStatus.NeedsInput) {
			// Needs attention - use report icon with accent color
			icon = Codicon.report;
			statusClass = 'needs-attention';
		} else if (isSessionInProgressStatus(session.status)) {
			// In progress - spinning icon
			icon = ThemeIcon.modify(Codicon.loading, 'spin');
			statusClass = 'in-progress';
		} else if (!session.isRead) {
			// Unread - filled circle (blue)
			icon = Codicon.circleFilled;
			statusClass = 'unread';
		} else {
			// Read/completed - outline circle (gray)
			icon = Codicon.circle;
			statusClass = 'read';
		}

		const iconElement = $(ThemeIcon.asCSSSelector(icon));
		iconElement.classList.add('codicon', statusClass);

		iconContainer.appendChild(iconElement);
		return iconContainer;
	}

	private _renderDiffBadge(diffStats: { files: number; insertions: number; deletions: number }): HTMLElement {
		const badge = $('.agent-sessions-quick-pick-diff-badge');

		// File count
		const fileCount = dom.append(badge, $('.diff-files'));
		fileCount.textContent = `${diffStats.files} ${diffStats.files === 1 ? 'File' : 'Files'}`;

		// Additions
		if (diffStats.insertions > 0) {
			const additions = dom.append(badge, $('.diff-additions'));
			additions.textContent = `+${diffStats.insertions}`;
		}

		// Deletions
		if (diffStats.deletions > 0) {
			const deletions = dom.append(badge, $('.diff-deletions'));
			deletions.textContent = `-${diffStats.deletions}`;
		}

		return badge;
	}

	private _renderBadge(badge: string | { value: string }): HTMLElement {
		const badgeElement = $('.agent-sessions-quick-pick-pr-badge');
		const text = typeof badge === 'string' ? badge : badge.value;
		badgeElement.textContent = text;
		return badgeElement;
	}

	private _formatRelativeTime(timestamp: number | undefined): string {
		if (!timestamp) {
			return '';
		}

		const now = Date.now();
		const diff = now - timestamp;

		const seconds = Math.floor(diff / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);

		if (days > 0) {
			return days === 1 ? localize('agentSessions.time.day', "1 day") : localize('agentSessions.time.days', "{0} days", days);
		}
		if (hours > 0) {
			return hours === 1 ? localize('agentSessions.time.hour', "1 hr") : localize('agentSessions.time.hours', "{0} hr", hours);
		}
		if (minutes > 0) {
			return minutes === 1 ? localize('agentSessions.time.minute', "1 min") : localize('agentSessions.time.minutes', "{0} min", minutes);
		}
		return localize('agentSessions.time.now', "just now");
	}
}
