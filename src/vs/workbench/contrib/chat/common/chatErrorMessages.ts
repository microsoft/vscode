/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import type { ErrorInfo } from '../../../../platform/agentHost/common/state/protocol/state.js';
import { ChatEntitlement } from '../../../services/chat/common/chatEntitlementService.js';
import { ChatErrorLevel, IChatResponseErrorDetails } from './chatService/chatService.js';

/**
 * Mirror of the Copilot extension's `ChatFetchResponseType` (see
 * `extensions/copilot/src/platform/chat/common/commonTypes.ts`). These string
 * values are forwarded verbatim from the agent host harnesses (Copilot CLI,
 * Claude, Codex) over `_meta`, so they MUST stay in sync with the extension.
 */
export const enum ChatFetchResponseType {
	OffTopic = 'offTopic',
	Canceled = 'canceled',
	Filtered = 'filtered',
	FilteredRetry = 'filteredRetry',
	PromptFiltered = 'promptFiltered',
	Length = 'length',
	RateLimited = 'rateLimited',
	QuotaExceeded = 'quotaExceeded',
	ExtensionBlocked = 'extensionBlocked',
	BadRequest = 'badRequest',
	NotFound = 'notFound',
	Failed = 'failed',
	Unknown = 'unknown',
	NetworkError = 'networkError',
	AgentUnauthorized = 'agent_unauthorized',
	AgentFailedDependency = 'agent_failed_dependency',
	InvalidStatefulMarker = 'invalid_stateful_marker',
	Success = 'success'
}

/**
 * Mirror of the Copilot extension's `FilterReason` (see
 * `extensions/copilot/src/platform/networking/common/openai.ts`).
 */
export const enum FilterReason {
	Hate = 'hate',
	SelfHarm = 'self_harm',
	Sexual = 'sexual',
	Violence = 'violence',
	Copyright = 'snippy',
	Prompt = 'prompt'
}

/**
 * Raw error payload forwarded from an agent host harness. This is the
 * serialized `ChatFetchError` from the Copilot extension. Because it crosses
 * the extension/core boundary as untyped JSON inside `_meta`, every field is
 * optional and consumers type-cast based on `type`.
 */
export interface IChatFetchErrorPayload {
	readonly type: ChatFetchResponseType | string;
	readonly reason?: string;
	readonly reasonDetail?: string;
	readonly requestId?: string;
	readonly serverRequestId?: string | undefined;
	readonly category?: FilterReason | string;
	readonly retryAfter?: number;
	readonly rateLimitKey?: string;
	readonly isAuto?: boolean;
	readonly capiError?: { code?: string; message?: string };
}

/**
 * The full forwarded chat error payload, including the user-context fields that
 * the extension would normally read from the Copilot token. This is the value
 * placed at `_meta.chatError` by the harnesses.
 */
export interface IForwardedChatError {
	readonly fetchError: IChatFetchErrorPayload;
	readonly copilotPlan?: string;
	readonly isUsageBasedBilling?: boolean;
	readonly quotaResetDate?: string;
}

const RATE_LIMIT_LEARN_MORE_URL = 'https://aka.ms/github-copilot-rate-limit-error';
const FILTERED_DOCS_URL = 'https://aka.ms/copilot-chat-filtered-docs';
const GITHUB_SUPPORT_URL = 'https://support.github.com/contact';

/**
 * Localized "canceled" message. Mirrors the extension's `CanceledMessage`,
 * which is intentionally not localized there; we localize it in core.
 */
const CanceledMessage: IChatResponseErrorDetails = { message: localize('chatError.canceled', "Canceled") };

/**
 * Converts a number of seconds into a human readable, localized string like
 * "6 hours 50 minutes". Based on the Copilot extension's
 * `secondsToHumanReadableTime` (`extensions/copilot/src/util/common/time.ts`),
 * but the unit fragments are externalized so they translate in non-English
 * locales.
 */
function secondsToHumanReadableTime(seconds: number): string {
	if (seconds < 90) {
		return localize('chatError.duration.seconds', "{0} seconds", seconds);
	}

	const minutes = Math.floor(seconds / 60);
	if (seconds <= 5400) {
		return localize('chatError.duration.minutes', "{0} minutes", minutes);
	}

	const hours = Math.floor(minutes / 60);
	const remainingMinutes = minutes % 60;

	if (remainingMinutes > 0) {
		return localize('chatError.duration.hoursMinutes', "{0} hours {1} minutes", hours, remainingMinutes);
	}
	return localize('chatError.duration.hours', "{0} hours", hours);
}

function getRateLimitMessage(fetchError: IChatFetchErrorPayload, copilotPlan: string | undefined): string {
	const retryAfterString = fetchError.retryAfter ? secondsToHumanReadableTime(fetchError.retryAfter) : localize('chatError.aMoment', "a moment");
	const code = fetchError.capiError?.code;
	if (code?.startsWith('agent_mode_limit_exceeded')) { // Rate limited in agent mode
		return localize({ key: 'chatError.rateLimit.agentMode', comment: [`{Locked=']({'}`] }, "Sorry, you have exceeded the agent mode rate limit. Please switch to ask mode and try again in {0}. [Learn More]({1})", retryAfterString, RATE_LIMIT_LEARN_MORE_URL);
	}
	if (code?.startsWith('model_overloaded') || code?.startsWith('upstream_provider_rate_limit')) {
		if (fetchError.isAuto) {
			return localize({ key: 'chatError.rateLimit.overloadedAuto', comment: [`{Locked=']({'}`] }, "Sorry, the upstream model provider is currently experiencing high demand. Please try again in {0}. [Learn More]({1})", retryAfterString, RATE_LIMIT_LEARN_MORE_URL);
		}
		return localize({ key: 'chatError.rateLimit.overloaded', comment: [`{Locked=']({'}`] }, "Sorry, the upstream model provider is currently experiencing high demand. Please try again in {0} or consider switching to Auto. [Learn More]({1})", retryAfterString, RATE_LIMIT_LEARN_MORE_URL);
	}
	if (code?.startsWith('user_global_rate_limited')) {
		if (copilotPlan === 'free' || copilotPlan === 'individual' || copilotPlan === 'individual_pro' || copilotPlan === 'edu') {
			return localize({ key: 'chatError.rateLimit.sessionUpgrade', comment: [`{Locked=']({'}`] }, "You've hit your session rate limit. Please upgrade your plan or wait {0} for your limit to reset. [Learn More]({1})", retryAfterString, RATE_LIMIT_LEARN_MORE_URL);
		}
		return localize({ key: 'chatError.rateLimit.session', comment: [`{Locked=']({'}`] }, "You've hit your session rate limit. Please wait {0} for your limit to reset. [Learn More]({1})", retryAfterString, RATE_LIMIT_LEARN_MORE_URL);
	}
	if (code?.startsWith('user_weekly_rate_limited')) {
		if (fetchError.retryAfter) {
			const resetDate = new Date(Date.now() + fetchError.retryAfter * 1000);
			const resetDateString = resetDate.toLocaleString(undefined, { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
			if (fetchError.isAuto) {
				return localize({ key: 'chatError.rateLimit.weeklyDateAuto', comment: [`{Locked=']({'}`] }, "You've reached your weekly rate limit. Please wait for your limit to reset on {0}. [Learn More]({1})", resetDateString, RATE_LIMIT_LEARN_MORE_URL);
			}
			return localize({ key: 'chatError.rateLimit.weeklyDate', comment: [`{Locked=']({'}`] }, "You've reached your weekly rate limit. Please switch to the Auto model to continue working or wait for your limit to reset on {0}. [Learn More]({1})", resetDateString, RATE_LIMIT_LEARN_MORE_URL);
		}
		if (fetchError.isAuto) {
			return localize({ key: 'chatError.rateLimit.weeklyAuto', comment: [`{Locked=']({'}`] }, "You've reached your weekly rate limit. Please wait {0} for your limit to reset. [Learn More]({1})", retryAfterString, RATE_LIMIT_LEARN_MORE_URL);
		}
		return localize({ key: 'chatError.rateLimit.weekly', comment: [`{Locked=']({'}`] }, "You've reached your weekly rate limit. Please switch to the Auto model to continue working or wait {0} for your limit to reset. [Learn More]({1})", retryAfterString, RATE_LIMIT_LEARN_MORE_URL);
	}
	if (code?.startsWith('user_model_rate_limited')) {
		if (fetchError.isAuto) {
			return localize({ key: 'chatError.rateLimit.modelAuto', comment: [`{Locked=']({'}`] }, "You've hit the rate limit for this model. Please try again in {0}. [Learn More]({1})", retryAfterString, RATE_LIMIT_LEARN_MORE_URL);
		}
		return localize({ key: 'chatError.rateLimit.model', comment: [`{Locked=']({'}`] }, "You've hit the rate limit for this model. Please try switching to Auto or try again in {0}. [Learn More]({1})", retryAfterString, RATE_LIMIT_LEARN_MORE_URL);
	}
	if (code?.startsWith('integration_rate_limited')) {
		return localize({ key: 'chatError.rateLimit.integration', comment: [`{Locked=']({'}`] }, "Sorry, GitHub Copilot Chat is currently experiencing high demand. Please try again in {0}. [Learn More]({1})", retryAfterString, RATE_LIMIT_LEARN_MORE_URL);
	}

	if (fetchError.capiError?.code && fetchError.capiError?.message) {
		if (fetchError.isAuto) {
			return localize({ key: 'chatError.rateLimit.serverAuto', comment: [`{Locked=']({'}`] }, "Sorry, you have been rate-limited. Please wait {0} before trying again. [Learn More]({1})\n\nServer Error: {2}\nError Code: {3}", retryAfterString, RATE_LIMIT_LEARN_MORE_URL, fetchError.capiError.message, fetchError.capiError.code);
		}
		return localize({ key: 'chatError.rateLimit.server', comment: [`{Locked=']({'}`] }, "Sorry, you have been rate-limited. Please wait {0} before trying again or consider switching to Auto. [Learn More]({1})\n\nServer Error: {2}\nError Code: {3}", retryAfterString, RATE_LIMIT_LEARN_MORE_URL, fetchError.capiError.message, fetchError.capiError.code);
	}

	if (fetchError.isAuto) {
		return localize({ key: 'chatError.rateLimit.genericAuto', comment: [`{Locked=']({'}`] }, "Sorry, your request was rate-limited. Please wait {0} before trying again. [Learn More]({1})", retryAfterString, RATE_LIMIT_LEARN_MORE_URL);
	}
	return localize({ key: 'chatError.rateLimit.generic', comment: [`{Locked=']({'}`] }, "Sorry, your request was rate-limited. Please wait {0} before trying again or consider switching to Auto. [Learn More]({1})", retryAfterString, RATE_LIMIT_LEARN_MORE_URL);
}

export function getQuotaMessageForPlan(copilotPlan: string | undefined, isUsageBasedBilling?: boolean, quotaResetDate?: string): string {
	const resetDateString = quotaResetDate
		? new Date(quotaResetDate).toLocaleString(undefined, { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
		: undefined;

	if (isUsageBasedBilling) {
		switch (copilotPlan) {
			case 'free':
				return resetDateString
					? localize('chatError.quota.ubb.freeDate', "You've reached your monthly credit limit. Upgrade to Copilot Pro or wait until your credits reset on {0}.", resetDateString)
					: localize('chatError.quota.ubb.free', "You've reached your monthly credit limit. Upgrade to Copilot Pro or wait for your credits to reset.");
			case 'individual':
				return resetDateString
					? localize('chatError.quota.ubb.individualDate', "You've reached your monthly credit limit. Please enable additional paid credits, upgrade to Copilot Pro+, or wait until your credits reset on {0}.", resetDateString)
					: localize('chatError.quota.ubb.individual', "You've reached your monthly credit limit. Please enable additional paid credits, upgrade to Copilot Pro+, or wait for your credits to reset.");
			case 'edu':
				return resetDateString
					? localize('chatError.quota.ubb.eduDate', "You've reached your monthly credit limit. Please enable additional paid credits, upgrade to Copilot Pro, or wait until your credits reset on {0}.", resetDateString)
					: localize('chatError.quota.ubb.edu', "You've reached your monthly credit limit. Please enable additional paid credits, upgrade to Copilot Pro, or wait for your credits to reset.");
			case 'individual_pro':
			case 'individual_max':
				return resetDateString
					? localize('chatError.quota.ubb.proDate', "You've reached your monthly credit limit. Please enable additional paid credits or wait until your credits reset on {0}.", resetDateString)
					: localize('chatError.quota.ubb.pro', "You've reached your monthly credit limit. Please enable additional paid credits or wait for your credits to reset.");
			case 'business':
			case 'enterprise':
				return resetDateString
					? localize('chatError.quota.ubb.businessDate', "You've reached your credit limit. To continue working, please contact your organization's Copilot admin or wait until your credits reset on {0}.", resetDateString)
					: localize('chatError.quota.ubb.business', "You've reached your credit limit. To continue working, please contact your organization's Copilot admin or wait for your credits to reset.");
			default:
				return resetDateString
					? localize('chatError.quota.ubb.defaultDate', "You've reached your credit limit. For additional paid credits, please reach out to your organization's Copilot admin or wait until your credits reset on {0}.", resetDateString)
					: localize('chatError.quota.ubb.default', "You've reached your credit limit. For additional paid credits, please reach out to your organization's Copilot admin or wait for your credits to reset.");
		}
	}

	switch (copilotPlan) {
		case 'free':
			return localize('chatError.quota.free', "You've reached your monthly chat messages quota. Upgrade to Copilot Pro or wait for your allowance to renew.");
		case 'individual':
			return localize('chatError.quota.individual', "You've exhausted your premium model quota. Please enable additional paid premium requests, upgrade to Copilot Pro+, or wait for your allowance to renew.");
		case 'edu':
			return localize('chatError.quota.edu', "You've exhausted your premium model quota. Please enable additional paid premium requests, upgrade to Copilot Pro, or wait for your allowance to renew.");
		case 'individual_pro':
		case 'individual_max':
			return localize('chatError.quota.pro', "You've exhausted your premium model quota. Please enable additional paid premium requests or wait for your allowance to renew.");
		case 'business':
		case 'enterprise':
			return localize('chatError.quota.business', "You've exhausted your credits. To continue working, please contact your organization's Copilot admin or wait for your allowance to renew.");
		default:
			return localize('chatError.quota.default', "You've exhausted your premium model quota. For additional paid premium requests, please reach out to your organization's Copilot admin or wait for your allowance to renew.");
	}
}

function getQuotaHitMessage(fetchError: IChatFetchErrorPayload, copilotPlan: string | undefined, isUsageBasedBilling?: boolean, quotaResetDate?: string): string {
	let code = fetchError.capiError?.code;
	if (code === 'free_quota_exceeded') {
		code = 'quota_exceeded'; // Remap this to the generic quota code so we get per plan handling
	}
	if (code === 'quota_exceeded') {
		return getQuotaMessageForPlan(copilotPlan, isUsageBasedBilling, quotaResetDate);
	} else if (code === 'overage_limit_reached') {
		return localize({ key: 'chatError.quota.overage', comment: [`{Locked=']({'}`] }, "You cannot accrue additional premium requests at this time. Please contact [GitHub Support]({0}) to continue using Copilot.", GITHUB_SUPPORT_URL);
	} else if (code === 'additional_spend_limit_reached') {
		return localize('chatError.quota.additionalSpend', "You've reached your additional usage limit for your plan. Upgrade your plan to keep going.");
	} else if (code === 'billing_not_configured' && fetchError.capiError?.message) {
		return fetchError.capiError.message;
	} else if (fetchError.capiError?.code && fetchError.capiError?.message) {
		return localize('chatError.quota.server', "Quota Exceeded\n\nServer Error: {0}\nError Code: {1}", fetchError.capiError.message, fetchError.capiError.code);
	} else {
		return localize('chatError.quota.generic', "Quota Exceeded");
	}
}

export function getFilteredMessage(category: FilterReason | string, supportsMarkdown: boolean = true): string {
	switch (category) {
		case FilterReason.Copyright:
			if (supportsMarkdown) {
				return localize({ key: 'chatError.filtered.copyrightMd', comment: [`{Locked='](https://aka.ms/copilot-chat-filtered-docs)'}`] }, "Sorry, the response matched public code so it was blocked. Please rephrase your prompt. [Learn more]({0}).", FILTERED_DOCS_URL);
			}
			return localize('chatError.filtered.copyright', "Sorry, the response matched public code so it was blocked. Please rephrase your prompt.");
		case FilterReason.Prompt:
			if (supportsMarkdown) {
				return localize({ key: 'chatError.filtered.promptMd', comment: [`{Locked='](https://aka.ms/copilot-chat-filtered-docs)'}`] }, "Sorry, your prompt was filtered by the Responsible AI Service. Please rephrase your prompt and try again. [Learn more]({0}).", FILTERED_DOCS_URL);
			}
			return localize('chatError.filtered.prompt', "Sorry, your prompt was filtered by the Responsible AI Service. Please rephrase your prompt and try again.");
		default:
			if (supportsMarkdown) {
				return localize({ key: 'chatError.filtered.defaultMd', comment: [`{Locked='](https://aka.ms/copilot-chat-filtered-docs)'}`] }, "Sorry, the response was filtered by the Responsible AI Service. Please rephrase your prompt and try again. [Learn more]({0}).", FILTERED_DOCS_URL);
			}
			return localize('chatError.filtered.default', "Sorry, the response was filtered by the Responsible AI Service. Please rephrase your prompt and try again.");
	}
}

/**
 * Builds the user-facing {@link IChatResponseErrorDetails} from a forwarded raw
 * chat fetch error. This is the core analog of the Copilot extension's
 * `getErrorDetailsFromChatFetchError`. Unlike the extension, core has no
 * access to the GitHub outage status, so the outage note is never appended
 * (assume no outage).
 */
export function getChatErrorDetailsFromFetchError(fetchError: IChatFetchErrorPayload, copilotPlan: string | undefined, isUsageBasedBilling?: boolean, quotaResetDate?: string): IChatResponseErrorDetails {
	return { code: fetchError.type, ...getChatErrorDetailsInner(fetchError, copilotPlan, isUsageBasedBilling, quotaResetDate) };
}

function getChatErrorDetailsInner(fetchError: IChatFetchErrorPayload, copilotPlan: string | undefined, isUsageBasedBilling?: boolean, quotaResetDate?: string): IChatResponseErrorDetails {
	const requestId = fetchError.requestId ?? '';
	const reason = fetchError.reason ?? '';
	switch (fetchError.type) {
		case ChatFetchResponseType.OffTopic:
			return { message: localize('chatError.offTopic', "Sorry, but I can only assist with programming related questions.") };
		case ChatFetchResponseType.Canceled:
			return CanceledMessage;
		case ChatFetchResponseType.RateLimited:
			return {
				message: getRateLimitMessage(fetchError, copilotPlan),
				level: ChatErrorLevel.Info,
				isRateLimited: true
			};
		case ChatFetchResponseType.QuotaExceeded:
			return {
				message: getQuotaHitMessage(fetchError, copilotPlan, isUsageBasedBilling, quotaResetDate),
				isQuotaExceeded: true,
				...(fetchError.capiError?.code && { code: fetchError.capiError.code }),
			};
		case ChatFetchResponseType.BadRequest:
		case ChatFetchResponseType.Failed:
			return fetchError.serverRequestId
				? { message: localize('chatError.failedWithServerId', "Sorry, your request failed. Please try again.\n\nClient Request Id: {0}\n\nGH Request Id: {1}\n\nReason: {2}", requestId, fetchError.serverRequestId, reason) }
				: { message: localize('chatError.failed', "Sorry, your request failed. Please try again.\n\nClient Request Id: {0}\n\nReason: {1}", requestId, reason) };
		case ChatFetchResponseType.NetworkError:
			return { message: localize('chatError.network', "Sorry, there was a network error. Please try again later. Request id: {0}\n\nReason: {1}", requestId, reason) };
		case ChatFetchResponseType.Filtered:
		case ChatFetchResponseType.PromptFiltered:
			return {
				message: getFilteredMessage(fetchError.category ?? ''),
				responseIsFiltered: true,
				level: ChatErrorLevel.Info,
			};
		case ChatFetchResponseType.AgentUnauthorized:
			return { message: localize('chatError.somethingWrong', "Sorry, something went wrong.") };
		case ChatFetchResponseType.AgentFailedDependency:
			return { message: reason };
		case ChatFetchResponseType.Length:
			return { message: localize('chatError.length', "Sorry, the response hit the length limit. Please rephrase your prompt.") };
		case ChatFetchResponseType.NotFound:
			return { message: localize('chatError.notFound', "Sorry, the resource was not found.") };
		case ChatFetchResponseType.Unknown:
			return { message: localize('chatError.unknown', "Sorry, no response was returned.") };
		case ChatFetchResponseType.ExtensionBlocked:
			return { message: localize('chatError.extensionBlocked', "Sorry, something went wrong.") };
		case ChatFetchResponseType.InvalidStatefulMarker:
			// should be unreachable, retried within the endpoint
			return { message: localize('chatError.invalidStatefulMarker', "Your chat session state is invalid, please start a new chat.") };
		default:
			return { message: reason || localize('chatError.somethingWrong', "Sorry, something went wrong.") };
	}
}

/**
 * Type guard for the forwarded chat error payload placed at `_meta.chatError`
 * by the agent host harnesses.
 */
function isForwardedChatError(value: unknown): value is IForwardedChatError {
	return !!value
		&& typeof value === 'object'
		&& 'fetchError' in value
		&& !!(value as IForwardedChatError).fetchError
		&& typeof (value as IForwardedChatError).fetchError === 'object'
		&& typeof (value as IForwardedChatError).fetchError.type === 'string';
}

/**
 * Extracts and formats {@link IChatResponseErrorDetails} from the `_meta`
 * forwarded by an agent host harness, if present. Returns `undefined` when no
 * forwarded chat error is found so callers can fall back to their existing
 * error handling.
 *
 * The agent host does not know the signed-in user's plan, so callers in core
 * pass an {@link IChatErrorContext} (resolved from `IChatEntitlementService`)
 * whose fields take precedence over the values forwarded in `_meta`.
 */
export function getChatErrorDetailsFromMeta(error: ErrorInfo | undefined, context?: IChatErrorContext): IChatResponseErrorDetails | undefined {
	const meta = error?._meta;
	const chatError = meta?.chatError;
	if (!isForwardedChatError(chatError)) {
		return undefined;
	}
	return getChatErrorDetailsFromFetchError(
		chatError.fetchError,
		context?.copilotPlan ?? chatError.copilotPlan,
		context?.isUsageBasedBilling ?? chatError.isUsageBasedBilling,
		context?.quotaResetDate ?? chatError.quotaResetDate,
	);
}

/**
 * User-context overrides for {@link getChatErrorDetailsFromMeta}. When a field
 * is set it takes precedence over the value forwarded by the agent host. Core
 * resolves these from `IChatEntitlementService`.
 */
export interface IChatErrorContext {
	readonly copilotPlan?: string;
	readonly isUsageBasedBilling?: boolean;
	readonly quotaResetDate?: string;
}

/**
 * Maps a core {@link ChatEntitlement} to the Copilot plan string understood by
 * the quota/rate-limit message helpers (mirrors the Copilot extension's
 * `CopilotToken.copilotPlan` values).
 */
export function getCopilotPlanFromEntitlement(entitlement: ChatEntitlement): string | undefined {
	switch (entitlement) {
		case ChatEntitlement.Free:
			return 'free';
		case ChatEntitlement.Pro:
			return 'individual';
		case ChatEntitlement.ProPlus:
			return 'individual_pro';
		case ChatEntitlement.Max:
			return 'individual_max';
		case ChatEntitlement.Business:
			return 'business';
		case ChatEntitlement.Enterprise:
			return 'enterprise';
		case ChatEntitlement.EDU:
			return 'edu';
		default:
			return undefined;
	}
}
