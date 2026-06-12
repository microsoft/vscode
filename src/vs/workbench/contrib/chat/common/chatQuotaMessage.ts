/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { safeIntl } from '../../../../base/common/date.js';
import { localize } from '../../../../nls.js';
import { ChatEntitlement } from '../../../services/chat/common/chatEntitlementService.js';

/**
 * Context used to build a user-friendly quota-exceeded message that mirrors the
 * default chat experience (plan- and reset-date-aware), rather than surfacing a
 * raw server error string (e.g. `402 {"error":...}`).
 */
export interface IQuotaErrorContext {
	readonly entitlement: ChatEntitlement;
	readonly quotaResetDate?: string;
	readonly quotaResetDateHasTime?: boolean;
}

/**
 * Builds a user-friendly, localized quota-exceeded message keyed on the user's
 * entitlement and (when known) quota reset date. Shared by every provider that
 * surfaces a quota error (agent host, Copilot CLI, Claude CLI, ...) so the
 * message is identical regardless of where the 402 originated. The accompanying
 * upgrade / manage-budget button is rendered separately by `ChatQuotaExceededPart`
 * based on entitlement, so this text intentionally avoids duplicating that action.
 */
export function buildQuotaExceededMessage(context: IQuotaErrorContext): string {
	const reset = context.quotaResetDate ? formatQuotaResetDate(context.quotaResetDate, context.quotaResetDateHasTime) : undefined;
	switch (context.entitlement) {
		case ChatEntitlement.Unknown:
			return reset
				? localize('chat.quotaExceeded.anonymous.reset', "You've reached your monthly credit limit. Sign in to keep going, or wait until your credits reset on {0}.", reset)
				: localize('chat.quotaExceeded.anonymous', "You've reached your monthly credit limit. Sign in to keep going.");
		case ChatEntitlement.Free:
			return reset
				? localize('chat.quotaExceeded.free.reset', "You've reached your monthly credit limit. Upgrade to Copilot Pro or wait until your credits reset on {0}.", reset)
				: localize('chat.quotaExceeded.free', "You've reached your monthly credit limit. Upgrade to Copilot Pro or wait for your credits to reset.");
		case ChatEntitlement.Business:
		case ChatEntitlement.Enterprise:
			return reset
				? localize('chat.quotaExceeded.managed.reset', "You've reached your credit limit. Contact your organization's Copilot admin or wait until your credits reset on {0}.", reset)
				: localize('chat.quotaExceeded.managed', "You've reached your credit limit. Contact your organization's Copilot admin to continue.");
		default:
			return reset
				? localize('chat.quotaExceeded.default.reset', "You've reached your monthly credit limit. Manage your budget or wait until your credits reset on {0}.", reset)
				: localize('chat.quotaExceeded.default', "You've reached your monthly credit limit. Manage your budget to keep building.");
	}
}

/**
 * Formats a quota reset date for display, matching the style used elsewhere in
 * chat quota UI. Includes the time component only when the source carried one,
 * and the year only when it differs from the current year.
 */
function formatQuotaResetDate(isoDate: string, hasTime: boolean | undefined): string {
	const resetDate = new Date(isoDate);
	const includeYear = resetDate.getFullYear() !== new Date().getFullYear();
	const dateParts: Intl.DateTimeFormatOptions = includeYear
		? { month: 'long', day: 'numeric', year: 'numeric' }
		: { month: 'long', day: 'numeric' };
	const options: Intl.DateTimeFormatOptions = hasTime
		? { ...dateParts, hour: 'numeric', minute: '2-digit' }
		: dateParts;
	return safeIntl.DateTimeFormat(undefined, options).value.format(resetDate);
}
