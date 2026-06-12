/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { safeIntl } from '../../../../base/common/date.js';
import { localize } from '../../../../nls.js';
import { ChatEntitlement } from '../../../services/chat/common/chatEntitlementService.js';

/**
 * Well-known backend (CAPI) quota error codes forwarded verbatim by providers
 * (the Copilot fetch layer and the agent host both surface the same codes).
 * Core uses these to render the exact same message regardless of provider.
 */
export const enum QuotaExceededCode {
	QuotaExceeded = 'quota_exceeded',
	FreeQuotaExceeded = 'free_quota_exceeded',
	OverageLimitReached = 'overage_limit_reached',
	AdditionalSpendLimitReached = 'additional_spend_limit_reached',
	BillingNotConfigured = 'billing_not_configured',
}

/**
 * Context used to build a user-friendly quota-exceeded message that mirrors the
 * default chat experience (plan- and reset-date-aware), rather than surfacing a
 * raw server error string (e.g. `402 {"error":...}`).
 *
 * `entitlement` / `usageBasedBilling` / `quotaResetDate` describe the user's
 * plan (resolved centrally from `IChatEntitlementService`), while `code` and
 * `serverMessage` carry the structured backend error forwarded by whichever
 * provider hit the limit (Copilot fetch layer, agent host, CLIs).
 */
export interface IQuotaErrorContext {
	readonly entitlement: ChatEntitlement;
	readonly usageBasedBilling?: boolean;
	readonly quotaResetDate?: string;
	readonly quotaResetDateHasTime?: boolean;
	/** Backend (CAPI) quota error code, forwarded verbatim from the provider. */
	readonly code?: string;
	/** Raw server-provided message, used for `billing_not_configured` passthrough and unrecognized codes. */
	readonly serverMessage?: string;
}

/**
 * Builds a user-friendly, localized quota-exceeded message. This is the single
 * source of truth for quota messaging across every provider (agent host,
 * Copilot, Copilot CLI, Claude CLI, ...): providers forward the structured
 * backend error and core renders the text, so the message is identical
 * regardless of where the 402 originated. The accompanying upgrade /
 * manage-budget button is rendered separately by `ChatQuotaExceededPart` based
 * on entitlement, so this text intentionally avoids duplicating that action.
 */
export function buildQuotaExceededMessage(context: IQuotaErrorContext): string {
	// `free_quota_exceeded` is handled identically to the generic quota code so
	// it gets the same per-plan handling.
	const code = context.code === QuotaExceededCode.FreeQuotaExceeded ? QuotaExceededCode.QuotaExceeded : context.code;

	switch (code) {
		case QuotaExceededCode.OverageLimitReached:
			return localize('chat.quotaExceeded.overage', "You cannot accrue additional premium requests at this time. Please contact [GitHub Support]({0}) to continue using Copilot.", 'https://support.github.com/contact');
		case QuotaExceededCode.AdditionalSpendLimitReached:
			return localize('chat.quotaExceeded.additionalSpend', "You've reached your additional usage limit for your plan. Upgrade your plan to keep going.");
		case QuotaExceededCode.BillingNotConfigured:
			return context.serverMessage || buildPlanQuotaMessage(context);
		case undefined:
		case QuotaExceededCode.QuotaExceeded:
			return buildPlanQuotaMessage(context);
		default:
			// An unrecognized code: surface the raw server error when present,
			// otherwise fall back to the standard plan-aware message.
			return context.serverMessage
				? localize('chat.quotaExceeded.serverError', "Quota Exceeded\n\nServer Error: {0}\nError Code: {1}", context.serverMessage, code)
				: buildPlanQuotaMessage(context);
	}
}

/**
 * Maps the user's entitlement to the standard plan-aware quota message,
 * branching on usage-based billing and (when known) the quota reset date.
 * Faithfully mirrors the per-plan wording used across the default chat
 * experience so every surface reads identically.
 */
function buildPlanQuotaMessage(context: IQuotaErrorContext): string {
	const reset = context.quotaResetDate ? formatQuotaResetDate(context.quotaResetDate, context.quotaResetDateHasTime) : undefined;

	if (context.usageBasedBilling) {
		switch (context.entitlement) {
			case ChatEntitlement.Free:
				return reset
					? localize('chat.quotaExceeded.ubb.free.reset', "You've reached your monthly credit limit. Upgrade to Copilot Pro or wait until your credits reset on {0}.", reset)
					: localize('chat.quotaExceeded.ubb.free', "You've reached your monthly credit limit. Upgrade to Copilot Pro or wait for your credits to reset.");
			case ChatEntitlement.Pro:
				return reset
					? localize('chat.quotaExceeded.ubb.individual.reset', "You've reached your monthly credit limit. Please enable additional paid credits, upgrade to Copilot Pro+, or wait until your credits reset on {0}.", reset)
					: localize('chat.quotaExceeded.ubb.individual', "You've reached your monthly credit limit. Please enable additional paid credits, upgrade to Copilot Pro+, or wait for your credits to reset.");
			case ChatEntitlement.ProPlus:
				return reset
					? localize('chat.quotaExceeded.ubb.individualPro.reset', "You've reached your monthly credit limit. Please enable additional paid credits or wait until your credits reset on {0}.", reset)
					: localize('chat.quotaExceeded.ubb.individualPro', "You've reached your monthly credit limit. Please enable additional paid credits or wait for your credits to reset.");
			case ChatEntitlement.Business:
			case ChatEntitlement.Enterprise:
				return reset
					? localize('chat.quotaExceeded.ubb.managed.reset', "You've reached your credit limit. To continue working, please contact your organization's Copilot admin or wait until your credits reset on {0}.", reset)
					: localize('chat.quotaExceeded.ubb.managed', "You've reached your credit limit. To continue working, please contact your organization's Copilot admin or wait for your credits to reset.");
			default:
				return reset
					? localize('chat.quotaExceeded.ubb.default.reset', "You've reached your credit limit. To continue working, switch to Auto. For additional paid credits, please reach out to your organization's Copilot admin or wait until your credits reset on {0}.", reset)
					: localize('chat.quotaExceeded.ubb.default', "You've reached your credit limit. To continue working, switch to Auto. For additional paid credits, please reach out to your organization's Copilot admin or wait for your credits to reset.");
		}
	}

	switch (context.entitlement) {
		case ChatEntitlement.Free:
			return localize('chat.quotaExceeded.free', "You've reached your monthly chat messages quota. Upgrade to Copilot Pro or wait for your allowance to renew.");
		case ChatEntitlement.Pro:
			return localize('chat.quotaExceeded.individual', "You've exhausted your premium model quota. Please enable additional paid premium requests, upgrade to Copilot Pro+, or wait for your allowance to renew.");
		case ChatEntitlement.ProPlus:
			return localize('chat.quotaExceeded.individualPro', "You've exhausted your premium model quota. Please enable additional paid premium requests or wait for your allowance to renew.");
		case ChatEntitlement.Business:
		case ChatEntitlement.Enterprise:
			return localize('chat.quotaExceeded.managed', "You've exhausted your credits. To continue working, please contact your organization's Copilot admin or wait for your allowance to renew.");
		default:
			return localize('chat.quotaExceeded.default', "You've exhausted your premium model quota. To continue working, switch to Auto. For additional paid premium requests, please reach out to your organization's Copilot admin or wait for your allowance to renew.");
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
