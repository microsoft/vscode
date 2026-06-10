/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMarkdownString, MarkdownString } from '../../../../../base/common/htmlContent.js';
import { localize } from '../../../../../nls.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';

/**
 * Whether the given session type is locked behind a plan upgrade for the
 * current user's entitlement. A session type opts in declaratively by
 * contributing an `upgradeMessage` (rather than core hardcoding which
 * providers are paid-only); when present, Copilot Free or Copilot Student
 * (EDU) users see that type greyed out with the message in its hover instead
 * of being able to select it.
 */
export function isSessionTypeLockedForEntitlement(
	chatSessionsService: IChatSessionsService,
	chatEntitlementService: IChatEntitlementService,
	type: string,
): boolean {
	if (!chatSessionsService.getChatSessionContribution(type)?.upgradeMessage) {
		return false;
	}
	const entitlement = chatEntitlementService.entitlement;
	return entitlement === ChatEntitlement.Free || entitlement === ChatEntitlement.EDU;
}

/**
 * The inline "[Upgrade]" link shown as the description of a locked session
 * type. Trusts only the upgrade command.
 */
export function getSessionTypeUpgradeDescription(): IMarkdownString {
	return new MarkdownString(
		localize('chat.sessionType.upgradeLink', "[Upgrade](command:workbench.action.chat.upgradePlan)"),
		{ isTrusted: { enabledCommands: ['workbench.action.chat.upgradePlan'] } }
	);
}

/**
 * The hover for a locked session type. Renders the contributed
 * `upgradeMessage` (it supports markdown, e.g. its own upgrade link); the
 * generic fallback is only a safety net.
 */
export function getSessionTypeUpgradeHover(
	chatSessionsService: IChatSessionsService,
	type: string,
	label: string,
): MarkdownString {
	const hover = new MarkdownString('', { isTrusted: { enabledCommands: ['workbench.action.chat.upgradePlan'] }, supportThemeIcons: true });
	const contributedMessage = chatSessionsService.getChatSessionContribution(type)?.upgradeMessage;
	hover.appendMarkdown(contributedMessage ?? localize('chat.sessionType.upgradeHover', "[Upgrade to GitHub Copilot Pro](command:workbench.action.chat.upgradePlan) to use {0}.", label));
	return hover;
}
