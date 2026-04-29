/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import type { ChatErrorDetails, ChatResult } from 'vscode';
import { secondsToHumanReadableTime } from '../../../util/common/time';
import { ChatErrorLevel } from '../../../vscodeTypes';
import { GitHubOutageStatus } from '../../github/common/githubService';
import { APIErrorResponse, APIUsage, FilterReason } from '../../networking/common/openai';

/**
 * The location of a chat request.
 */
export enum ChatLocation {
	/**
	 * The chat panel
	 */
	Panel = 1,
	/**
	 * Terminal inline chat
	 */
	Terminal = 2,
	/**
	 * Notebook inline chat
	 */
	Notebook = 3,
	/**
	 * Code editor inline chat
	 */
	Editor = 4,
	/**
	 * Chat is happening in an editing session.
	 * This location doesn't exist in vscode API, but is still used to compute the location sent for some intents.
	 */
	EditingSession = 5,
	/**
	 * The chat request does not correspond directly to a user chat request.
	 */
	Other = 6,
	/**
	 * The chat is an agent mode edit session.
	 */
	Agent = 7,
	/**
	 * A request coming through the OpenAILanguageModelServer
	 */
	ResponsesProxy = 8,
	/**
	 * A request coming through the ClaudeLanguageModelServer (Messages API)
	 */
	MessagesProxy = 9
}

export namespace ChatLocation {

	/**
	 * Use this for passing uiKind to github telemetry, which we don't want to impact.
	 * Also known as UIKind in the telemetry data.
	 */
	export function toString(chatLocation: ChatLocation): string {
		switch (chatLocation) {
			case ChatLocation.Editor:
				return 'conversationInline';
			case ChatLocation.Panel:
				return 'conversationPanel';
			case ChatLocation.EditingSession:
				return 'editingSession';
			case ChatLocation.Agent:
				return 'editingSessionAgent';
			default:
				return 'none';
		}
	}

	/**
	 * This goes to logs and msft telemetry and is ok to change
	 */
	export function toStringShorter(chatLocation: ChatLocation): string {
		switch (chatLocation) {
			case ChatLocation.Editor:
			case ChatLocation.Notebook:
				return 'inline';
			case ChatLocation.Panel:
				return 'panel';
			case ChatLocation.EditingSession:
				return 'editingSession';
			default:
				return 'none';
		}
	}
}

export enum ChatFetchResponseType {
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

export const RESPONSE_CONTAINED_NO_CHOICES = 'Response contained no choices.';

export type ChatFetchError =
	/**
	 * We requested conversation, but the message was deemed off topic by the intent classifier.
	 */
	{ type: ChatFetchResponseType.OffTopic; reason: string; reasonDetail?: string; requestId: string; serverRequestId: string | undefined }
	/**
	 * Communication with a third party agent failed.
	 * The error message provides further details, usually indicating either an invocation timeout or an improper response.
	 */
	| { type: ChatFetchResponseType.AgentFailedDependency; reason: string; reasonDetail?: string; requestId: string; serverRequestId: string | undefined }
	/**
	 * User authorization is required to proceed.
	 */
	| { type: ChatFetchResponseType.AgentUnauthorized; reason: string; reasonDetail?: string; authorizationUrl: string; requestId: string; serverRequestId: string | undefined }
	/**
	 * We requested conversation, but we decided to cancel mid-way, for example because the
	 * user requested cancelation.
	 */
	| { type: ChatFetchResponseType.Canceled; reason: string; reasonDetail?: string; requestId: string; serverRequestId: string | undefined }
	/**
	 * We requested conversation, but the response was filtered by RAI.
	 */
	| { type: ChatFetchResponseType.Filtered; reason: string; reasonDetail?: string; category: FilterReason; requestId: string; serverRequestId: string | undefined }
	/**
	 * We requested conversation, but the prompt was filtered by RAI.
	 */
	| { type: ChatFetchResponseType.PromptFiltered; reason: string; reasonDetail?: string; category: FilterReason; requestId: string; serverRequestId: string | undefined }
	/**
	 * We requested conversation, but the response was too long.
	 */
	| { type: ChatFetchResponseType.Length; reason: string; reasonDetail?: string; requestId: string; serverRequestId: string | undefined; truncatedValue: string }
	/**
	 * We requested conversation, but didn't come up with any results because the rate limit was exceeded.
	 */
	| { type: ChatFetchResponseType.RateLimited; reason: string; reasonDetail?: string; requestId: string; serverRequestId: string | undefined; retryAfter: number | undefined; rateLimitKey: string; isAuto: boolean; capiError?: { code?: string; message?: string } }
	/**
	 * We requested conversation, but didn't come up with any results because the free tier quota was exceeded.
	 */
	| { type: ChatFetchResponseType.QuotaExceeded; reason: string; reasonDetail?: string; requestId: string; serverRequestId: string | undefined; retryAfter: Date | undefined; capiError?: { code?: string; message?: string } }
	/**
	 * We requested conversation, but the extension is blocked
	 */
	| { type: ChatFetchResponseType.ExtensionBlocked; reason: string; reasonDetail?: string; requestId: string; serverRequestId: string | undefined; retryAfter: number; learnMoreLink: string }
	/**
	 * We requested conversation, but didn't come up with any results because of a bad request
	 */
	| { type: ChatFetchResponseType.BadRequest; reason: string; reasonDetail?: string; requestId: string; serverRequestId: string | undefined }
	| { type: ChatFetchResponseType.NotFound; reason: string; reasonDetail?: string; requestId: string; serverRequestId: string | undefined }
	/**
	 * We requested conversation, but didn't come up with any results because something
	 * unexpected went wrong.
	 */
	| { type: ChatFetchResponseType.Failed; reason: string; reasonDetail?: string; requestId: string; serverRequestId: string | undefined; streamError?: APIErrorResponse }
	/**
	 * We requested conversation, but didn't come up with any results because of a network error
	 */
	| { type: ChatFetchResponseType.NetworkError; reason: string; reasonDetail?: string; requestId: string; serverRequestId: string | undefined; streamError?: APIErrorResponse; isNetworkProcessCrash?: boolean }
	/**
	 * We requested conversation, but didn't come up with any results for some "unknown"
	 * reason, such as slur redaction or snippy.
	 */
	| { type: ChatFetchResponseType.Unknown; reason: string; reasonDetail?: string; requestId: string; serverRequestId: string | undefined }
	/**
	 * The `statefulMarker` present in the request was invalid or expired. The
	 * request may be retried without that marker to resubmit it anew.
	 */
	| { type: ChatFetchResponseType.InvalidStatefulMarker; reason: string; reasonDetail?: string; requestId: string; serverRequestId: string | undefined };

export type ChatFetchRetriableError<T> =
	/**
	 * We requested conversation, the response was filtered by RAI, but we want to retry.
	 */
	{ type: ChatFetchResponseType.FilteredRetry; reason: string; category: FilterReason; value: T; requestId: string; serverRequestId: string | undefined };

export type FetchSuccess<T> =
	{ type: ChatFetchResponseType.Success; value: T; requestId: string; serverRequestId: string | undefined; usage: APIUsage | undefined; resolvedModel: string };

export type FetchResponse<T> = FetchSuccess<T> | ChatFetchError;

export type ChatResponse = FetchResponse<string>;

export type ChatResponses = FetchResponse<string[]>;

function getRateLimitMessage(fetchResult: ChatFetchError, copilotPlan: string | undefined): string {
	if (fetchResult.type !== ChatFetchResponseType.RateLimited) {
		throw new Error('Expected RateLimited error');
	}
	const retryAfterString = fetchResult.retryAfter ? secondsToHumanReadableTime(fetchResult.retryAfter) : 'a moment';
	if (fetchResult.capiError?.code?.startsWith('agent_mode_limit_exceeded')) { // Rate limited in agent mode
		return l10n.t({
			message: 'Sorry, you have exceeded the agent mode rate limit. Please switch to ask mode and try again in {0}. [Learn More]({1})',
			args: [retryAfterString, 'https://aka.ms/github-copilot-rate-limit-error'],
			comment: [`{Locked=']({'}`]
		});
	}
	if (fetchResult.capiError?.code?.startsWith('model_overloaded') || fetchResult.capiError?.code?.startsWith('upstream_provider_rate_limit')) {
		if (fetchResult.isAuto) {
			return l10n.t({
				message: 'Sorry, the upstream model provider is currently experiencing high demand. Please try again in {0}. [Learn More]({1})',
				args: [retryAfterString, 'https://aka.ms/github-copilot-rate-limit-error'],
				comment: [`{Locked=']({'}`]
			});
		}
		return l10n.t({
			message: 'Sorry, the upstream model provider is currently experiencing high demand. Please try again in {0} or consider switching to Auto. [Learn More]({1})',
			args: [retryAfterString, 'https://aka.ms/github-copilot-rate-limit-error'],
			comment: [`{Locked=']({'}`]
		});
	}
	if (fetchResult.capiError?.code?.startsWith('user_global_rate_limited')) {
		if (copilotPlan === 'free' || copilotPlan === 'individual' || copilotPlan === 'individual_pro') {
			return l10n.t({
				message: 'You\'ve hit your session rate limit. Please upgrade your plan or wait {0} for your limit to reset. [Learn More]({1})',
				args: [retryAfterString, 'https://aka.ms/github-copilot-rate-limit-error'],
				comment: [`{Locked=']({'}`]
			});
		}

		return l10n.t({
			message: 'You\'ve hit your session rate limit. Please wait {0} for your limit to reset. [Learn More]({1})',
			args: [retryAfterString, 'https://aka.ms/github-copilot-rate-limit-error'],
			comment: [`{Locked=']({'}`]
		});
	}
	if (fetchResult.capiError?.code?.startsWith('user_weekly_rate_limited')) {
		if (fetchResult.retryAfter) {
			const resetDate = new Date(Date.now() + fetchResult.retryAfter * 1000);
			const resetDateString = resetDate.toLocaleString(undefined, { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
			if (fetchResult.isAuto) {
				return l10n.t({
					message: 'You\'ve reached your weekly rate limit. Please wait for your limit to reset on {0}. [Learn More]({1})',
					args: [resetDateString, 'https://aka.ms/github-copilot-rate-limit-error'],
					comment: [`{Locked=']({'}`]
				});
			}

			return l10n.t({
				message: 'You\'ve reached your weekly rate limit. Please switch to the Auto model to continue working or wait for your limit to reset on {0}. [Learn More]({1})',
				args: [resetDateString, 'https://aka.ms/github-copilot-rate-limit-error'],
				comment: [`{Locked=']({'}`]
			});
		}

		if (fetchResult.isAuto) {
			return l10n.t({
				message: 'You\'ve reached your weekly rate limit. Please wait {0} for your limit to reset. [Learn More]({1})',
				args: [retryAfterString, 'https://aka.ms/github-copilot-rate-limit-error'],
				comment: [`{Locked=']({'}`]
			});
		}

		return l10n.t({
			message: 'You\'ve reached your weekly rate limit. Please switch to the Auto model to continue working or wait {0} for your limit to reset. [Learn More]({1})',
			args: [retryAfterString, 'https://aka.ms/github-copilot-rate-limit-error'],
			comment: [`{Locked=']({'}`]
		});
	}
	if (fetchResult.capiError?.code?.startsWith('user_model_rate_limited')) {
		if (fetchResult.isAuto) {
			return l10n.t({
				message: 'You\'ve hit the rate limit for this model. Please try again in {0}. [Learn More]({1})',
				args: [retryAfterString, 'https://aka.ms/github-copilot-rate-limit-error'],
				comment: [`{Locked=']({'}`]
			});
		}
		return l10n.t({
			message: 'You\'ve hit the rate limit for this model. Please try switching to Auto or try again in {0}. [Learn More]({1})',
			args: [retryAfterString, 'https://aka.ms/github-copilot-rate-limit-error'],
			comment: [`{Locked=']({'}`]
		});
	}
	if (fetchResult.capiError?.code?.startsWith('integration_rate_limited')) {
		return l10n.t({
			message: 'Sorry, GitHub Copilot Chat is currently experiencing high demand. Please try again in {0}. [Learn More]({1})',
			args: [retryAfterString, 'https://aka.ms/github-copilot-rate-limit-error'],
			comment: [`{Locked=']({'}`]
		});
	}

	if (fetchResult?.capiError?.code && fetchResult?.capiError?.message) {
		if (fetchResult.isAuto) {
			return l10n.t({
				message: 'Sorry, you have been rate-limited. Please wait {0} before trying again. [Learn More]({1})\n\nServer Error: {2}\nError Code: {3}',
				args: [retryAfterString, 'https://aka.ms/github-copilot-rate-limit-error', fetchResult.capiError.message, fetchResult.capiError.code],
				comment: [`{Locked=']({'}`]
			});
		}
		return l10n.t({
			message: 'Sorry, you have been rate-limited. Please wait {0} before trying again or consider switching to Auto. [Learn More]({1})\n\nServer Error: {2}\nError Code: {3}',
			args: [retryAfterString, 'https://aka.ms/github-copilot-rate-limit-error', fetchResult.capiError.message, fetchResult.capiError.code],
			comment: [`{Locked=']({'}`]
		});
	}

	if (fetchResult.isAuto) {
		return l10n.t({
			message: 'Sorry, your request was rate-limited. Please wait {0} before trying again. [Learn More]({1})',
			args: [retryAfterString, 'https://aka.ms/github-copilot-rate-limit-error'],
			comment: [`{Locked=']({'}`]
		});
	}
	return l10n.t({
		message: 'Sorry, your request was rate-limited. Please wait {0} before trying again or consider switching to Auto. [Learn More]({1})',
		args: [retryAfterString, 'https://aka.ms/github-copilot-rate-limit-error'],
		comment: [`{Locked=']({'}`]
	});
}

function getQuotaHitMessage(fetchResult: ChatFetchError, copilotPlan: string | undefined): string {
	if (fetchResult.type !== ChatFetchResponseType.QuotaExceeded) {
		throw new Error('Expected QuotaExceeded error');
	}
	if (fetchResult.capiError?.code === 'free_quota_exceeded') {
		fetchResult.capiError.code = 'quota_exceeded'; // Remap this to the generic quota code so we get per plan handling
	}
	if (fetchResult.capiError?.code === 'quota_exceeded') {
		switch (copilotPlan) {
			case 'free':
				return l10n.t(`You've reached your monthly chat messages quota. Upgrade to Copilot Pro or wait for your allowance to renew.`);
			case 'individual':
				return l10n.t(`You've exhausted your premium model quota. Please enable additional paid premium requests, upgrade to Copilot Pro+, or wait for your allowance to renew.`);
			case 'individual_pro':
				return l10n.t(`You've exhausted your premium model quota. Please enable additional paid premium requests or wait for your allowance to renew.`);
			default:
				return l10n.t(`You've exhausted your premium model quota. To continue working, switch to Auto. For additional paid premium requests, please reach out to your organization's Copilot admin or wait for your allowance to renew.`);
		}
	} else if (fetchResult.capiError?.code === 'overage_limit_reached') {
		return l10n.t({
			message: 'You cannot accrue additional premium requests at this time. Please contact [GitHub Support]({0}) to continue using Copilot.',
			args: ['https://support.github.com/contact'],
			comment: [`{Locked=']({'}`]
		});
	} else if (fetchResult.capiError?.code && fetchResult.capiError?.message) {
		return l10n.t({
			message: 'Quota Exceeded\n\nServer Error: {0}\nError Code: {1}',
			args: [fetchResult.capiError.message, fetchResult.capiError.code],
			comment: ''
		});
	} else {
		return l10n.t('Quota Exceeded');
	}
}

export function getErrorDetailsFromChatFetchError(fetchResult: ChatFetchError, copilotPlan: string, gitHubOutageStatus: GitHubOutageStatus): ChatErrorDetails {
	return { code: fetchResult.type, ...getErrorDetailsFromChatFetchErrorInner(fetchResult, copilotPlan, gitHubOutageStatus) };
}

function getErrorDetailsFromChatFetchErrorInner(fetchResult: ChatFetchError, copilotPlan: string, gitHubOutageStatus: GitHubOutageStatus): ChatErrorDetails {
	let details: ChatErrorDetails;
	switch (fetchResult.type) {
		case ChatFetchResponseType.OffTopic:
			details = { message: l10n.t('Sorry, but I can only assist with programming related questions.') };
			break;
		case ChatFetchResponseType.Canceled:
			details = CanceledMessage;
			break;
		case ChatFetchResponseType.RateLimited:
			details = {
				message: getRateLimitMessage(fetchResult, copilotPlan),
				level: ChatErrorLevel.Info,
				isRateLimited: true
			};
			break;
		case ChatFetchResponseType.QuotaExceeded:
			details = {
				message: getQuotaHitMessage(fetchResult, copilotPlan),
				isQuotaExceeded: true
			};
			break;
		case ChatFetchResponseType.BadRequest:
		case ChatFetchResponseType.Failed:
			details = fetchResult.serverRequestId
				? { message: l10n.t(`Sorry, your request failed. Please try again.\n\nCopilot Request id: {0}\n\nGH Request Id: {1}\n\nReason: {2}`, fetchResult.requestId, fetchResult.serverRequestId, fetchResult.reason) }
				: { message: l10n.t(`Sorry, your request failed. Please try again.\n\nCopilot Request id: {0}\n\nReason: {1}`, fetchResult.requestId, fetchResult.reason) };
			break;
		case ChatFetchResponseType.NetworkError:
			details = { message: l10n.t(`Sorry, there was a network error. Please try again later. Request id: {0}\n\nReason: {1}`, fetchResult.requestId, fetchResult.reason) };
			break;
		case ChatFetchResponseType.Filtered:
		case ChatFetchResponseType.PromptFiltered:
			details = {
				message: getFilteredMessage(fetchResult.category),
				responseIsFiltered: true,
				level: ChatErrorLevel.Info,
			};
			break;
		case ChatFetchResponseType.AgentUnauthorized:
			details = { message: l10n.t(`Sorry, something went wrong.`) };
			break;
		case ChatFetchResponseType.AgentFailedDependency:
			details = { message: fetchResult.reason };
			break;
		case ChatFetchResponseType.Length:
			details = { message: l10n.t(`Sorry, the response hit the length limit. Please rephrase your prompt.`) };
			break;
		case ChatFetchResponseType.NotFound:
			details = { message: l10n.t('Sorry, the resource was not found.') };
			break;
		case ChatFetchResponseType.Unknown:
			details = { message: l10n.t(`Sorry, no response was returned.`) };
			break;
		case ChatFetchResponseType.ExtensionBlocked:
			details = { message: l10n.t(`Sorry, something went wrong.`) };
			break;
		case ChatFetchResponseType.InvalidStatefulMarker:
			// should be unreachable, retried within the endpoint
			details = { message: l10n.t(`Your chat session state is invalid, please start a new chat.`) };
			break;
	}

	if (gitHubOutageStatus !== GitHubOutageStatus.None) {
		const outageMsg = l10n.t({
			message: 'Note: GitHub is currently experiencing a service disruption. This may be affecting Copilot. Check [GitHub Status]({0}) for details.',
			args: ['https://www.githubstatus.com'],
			comment: [`{Locked=']({'}`]
		});

		details = { ...details, message: `${details.message}\n\n${outageMsg}` };
	}

	return details;
}

export function getFilteredMessage(category: FilterReason, supportsMarkdown: boolean = true): string {
	switch (category) {
		case FilterReason.Copyright:
			if (supportsMarkdown) {
				return l10n.t({
					message:
						`Sorry, the response matched public code so it was blocked. Please rephrase your prompt. [Learn more](https://aka.ms/copilot-chat-filtered-docs).`,
					comment: [`{Locked='](https://aka.ms/copilot-chat-filtered-docs)'}`]
				});
			} else {
				return l10n.t(`Sorry, the response matched public code so it was blocked. Please rephrase your prompt.`);
			}
		case FilterReason.Prompt:
			if (supportsMarkdown) {
				return l10n.t({
					message:
						`Sorry, your prompt was filtered by the Responsible AI Service. Please rephrase your prompt and try again. [Learn more](https://aka.ms/copilot-chat-filtered-docs).`,
					comment: [`{Locked='](https://aka.ms/copilot-chat-filtered-docs)'}`]
				});
			} else {
				return l10n.t(`Sorry, your prompt was filtered by the Responsible AI Service. Please rephrase your prompt and try again.`);
			}
		default:
			if (supportsMarkdown) {
				return l10n.t({
					message:
						`Sorry, the response was filtered by the Responsible AI Service. Please rephrase your prompt and try again. [Learn more](https://aka.ms/copilot-chat-filtered-docs).`,
					comment: [`{Locked='](https://aka.ms/copilot-chat-filtered-docs)'}`]
				});
			} else {
				return l10n.t(`Sorry, the response was filtered by the Responsible AI Service. Please rephrase your prompt and try again.`);
			}
	}
}

/**
 * Not localized because it's used in the same way that the CancellationError name is used.
 */
export const CanceledMessage = { message: 'Canceled' };

export const CanceledResult: ChatResult = { errorDetails: CanceledMessage, };
