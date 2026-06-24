/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	ChatFetchResponseType,
	FilterReason,
	getChatErrorDetailsFromFetchError,
	getChatErrorDetailsFromMeta,
	getCopilotPlanFromEntitlement,
	getQuotaMessageForPlan,
	IChatFetchErrorPayload,
} from '../../common/chatErrorMessages.js';
import { ChatEntitlement } from '../../../../services/chat/common/chatEntitlementService.js';
import { ChatErrorLevel } from '../../common/chatService/chatService.js';
import type { ErrorInfo } from '../../../../../platform/agentHost/common/state/protocol/state.js';

/** Wraps a `_meta` bag in a minimal {@link ErrorInfo} so the reader sees the right source type. */
function errorInfo(meta: Record<string, unknown> | undefined): ErrorInfo {
	return { errorType: 'e', message: 'm', _meta: meta };
}

suite('ChatErrorMessages', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('getChatErrorDetailsFromMeta', () => {

		test('returns undefined when no meta or no chatError', () => {
			assert.strictEqual(getChatErrorDetailsFromMeta(undefined), undefined);
			assert.strictEqual(getChatErrorDetailsFromMeta(errorInfo(undefined)), undefined);
			assert.strictEqual(getChatErrorDetailsFromMeta(errorInfo({ chatError: {} })), undefined);
			assert.strictEqual(getChatErrorDetailsFromMeta(errorInfo({ chatError: { fetchError: {} } })), undefined);
		});

		test('formats a forwarded rate-limit error', () => {
			const details = getChatErrorDetailsFromMeta(errorInfo({
				chatError: {
					fetchError: {
						type: ChatFetchResponseType.RateLimited,
						retryAfter: 60,
						capiError: { code: 'user_global_rate_limited', message: 'slow down' },
					},
					copilotPlan: 'free',
				},
			}));
			assert.deepStrictEqual(details, {
				code: ChatFetchResponseType.RateLimited,
				message: 'You\'ve hit your session rate limit. Please upgrade your plan or wait 60 seconds for your limit to reset. [Learn More](https://aka.ms/github-copilot-rate-limit-error)',
				level: ChatErrorLevel.Info,
				isRateLimited: true,
			});
		});

		test('context overrides the forwarded plan (free user)', () => {
			const details = getChatErrorDetailsFromMeta(errorInfo({
				chatError: {
					fetchError: { type: ChatFetchResponseType.QuotaExceeded, capiError: { code: 'quota_exceeded' } },
					copilotPlan: 'business',
				},
			}), { copilotPlan: 'free' });
			assert.strictEqual(details?.message, 'You\'ve reached your monthly chat messages quota. Upgrade to Copilot Pro or wait for your allowance to renew.');
		});

		// Drift guard: the node layer (platform/agentHost/node/shared/forwardedChatError.ts)
		// encodes IForwardedChatError independently of this consumer (the layers cannot
		// share types). This pins the exact payload shape the node side emits — including
		// every fetchError.type its classifiers can produce — so a shape change on either
		// side is caught here instead of silently failing to render.
		test('accepts the payload shape and every type the node layer emits', () => {
			const nodeTypes = ['quotaExceeded', 'rateLimited', 'canceled', 'badRequest', 'agent_unauthorized', 'notFound', 'failed', 'length'];
			const resolved = nodeTypes.map(type => getChatErrorDetailsFromMeta(errorInfo({
				chatError: {
					fetchError: {
						type,
						reason: 'upstream reason',
						requestId: 'req-1',
						serverRequestId: 'gh-1',
						capiError: { code: 'some_code', message: 'some message' },
					},
					copilotPlan: 'free',
					isUsageBasedBilling: false,
				},
			}))?.code);
			// Every node-emitted type resolves to a defined details object whose code is
			// the fetch type (or, for quota, the more specific capiError code).
			assert.deepStrictEqual(resolved, ['some_code', 'rateLimited', 'canceled', 'badRequest', 'agent_unauthorized', 'notFound', 'failed', 'length']);
		});
	});

	suite('getChatErrorDetailsFromFetchError', () => {

		test('off topic', () => {
			const details = getChatErrorDetailsFromFetchError({ type: ChatFetchResponseType.OffTopic }, undefined);
			assert.deepStrictEqual(details, {
				code: ChatFetchResponseType.OffTopic,
				message: 'Sorry, but I can only assist with programming related questions.',
			});
		});

		test('failed with and without server request id', () => {
			const withServer = getChatErrorDetailsFromFetchError({ type: ChatFetchResponseType.Failed, requestId: 'rid', serverRequestId: 'gh', reason: 'boom' }, undefined);
			assert.deepStrictEqual(withServer, {
				code: ChatFetchResponseType.Failed,
				message: 'Sorry, your request failed. Please try again.\n\nClient Request Id: rid\n\nGH Request Id: gh\n\nReason: boom',
			});

			const withoutServer = getChatErrorDetailsFromFetchError({ type: ChatFetchResponseType.Failed, requestId: 'rid', reason: 'boom' }, undefined);
			assert.deepStrictEqual(withoutServer, {
				code: ChatFetchResponseType.Failed,
				message: 'Sorry, your request failed. Please try again.\n\nClient Request Id: rid\n\nReason: boom',
			});
		});

		test('quota exceeded uses plan-specific message and quota code', () => {
			const fetchError: IChatFetchErrorPayload = {
				type: ChatFetchResponseType.QuotaExceeded,
				capiError: { code: 'quota_exceeded' },
			};
			const details = getChatErrorDetailsFromFetchError(fetchError, 'free');
			assert.deepStrictEqual(details, {
				code: 'quota_exceeded',
				message: 'You\'ve reached your monthly chat messages quota. Upgrade to Copilot Pro or wait for your allowance to renew.',
				isQuotaExceeded: true,
			});
		});

		test('filtered response is marked filtered', () => {
			const details = getChatErrorDetailsFromFetchError({ type: ChatFetchResponseType.Filtered, category: FilterReason.Copyright }, undefined);
			assert.deepStrictEqual(details, {
				code: ChatFetchResponseType.Filtered,
				message: 'Sorry, the response matched public code so it was blocked. Please rephrase your prompt. [Learn more](https://aka.ms/copilot-chat-filtered-docs).',
				responseIsFiltered: true,
				level: ChatErrorLevel.Info,
			});
		});

		test('simple error types produce their static messages', () => {
			const types = [
				ChatFetchResponseType.Canceled,
				ChatFetchResponseType.Length,
				ChatFetchResponseType.NotFound,
				ChatFetchResponseType.Unknown,
				ChatFetchResponseType.ExtensionBlocked,
				ChatFetchResponseType.AgentUnauthorized,
				ChatFetchResponseType.InvalidStatefulMarker,
			];
			const actual = types.map(type => getChatErrorDetailsFromFetchError({ type }, undefined));
			assert.deepStrictEqual(actual, [
				{ code: ChatFetchResponseType.Canceled, message: 'Canceled' },
				{ code: ChatFetchResponseType.Length, message: 'Sorry, the response hit the length limit. Please rephrase your prompt.' },
				{ code: ChatFetchResponseType.NotFound, message: 'Sorry, the resource was not found.' },
				{ code: ChatFetchResponseType.Unknown, message: 'Sorry, no response was returned.' },
				{ code: ChatFetchResponseType.ExtensionBlocked, message: 'Sorry, something went wrong.' },
				{ code: ChatFetchResponseType.AgentUnauthorized, message: 'Sorry, something went wrong.' },
				{ code: ChatFetchResponseType.InvalidStatefulMarker, message: 'Your chat session state is invalid, please start a new chat.' },
			]);
		});

		test('network error includes request id and reason', () => {
			const details = getChatErrorDetailsFromFetchError({ type: ChatFetchResponseType.NetworkError, requestId: 'rid', reason: 'offline' }, undefined);
			assert.deepStrictEqual(details, {
				code: ChatFetchResponseType.NetworkError,
				message: 'Sorry, there was a network error. Please try again later. Request id: rid\n\nReason: offline',
			});
		});

		test('agent failed dependency surfaces the raw reason', () => {
			const details = getChatErrorDetailsFromFetchError({ type: ChatFetchResponseType.AgentFailedDependency, reason: 'timed out' }, undefined);
			assert.deepStrictEqual(details, { code: ChatFetchResponseType.AgentFailedDependency, message: 'timed out' });
		});

		test('rate-limit messages vary by capi code and auto flag', () => {
			const messages = [
				getChatErrorDetailsFromFetchError({ type: ChatFetchResponseType.RateLimited, retryAfter: 30, capiError: { code: 'agent_mode_limit_exceeded' } }, undefined).message,
				getChatErrorDetailsFromFetchError({ type: ChatFetchResponseType.RateLimited, retryAfter: 30, isAuto: true, capiError: { code: 'model_overloaded' } }, undefined).message,
				getChatErrorDetailsFromFetchError({ type: ChatFetchResponseType.RateLimited, retryAfter: 30, capiError: { code: 'integration_rate_limited' } }, undefined).message,
				getChatErrorDetailsFromFetchError({ type: ChatFetchResponseType.RateLimited, retryAfter: 30 }, undefined).message,
			];
			assert.deepStrictEqual(messages, [
				'Sorry, you have exceeded the agent mode rate limit. Please switch to ask mode and try again in 30 seconds. [Learn More](https://aka.ms/github-copilot-rate-limit-error)',
				'Sorry, the upstream model provider is currently experiencing high demand. Please try again in 30 seconds. [Learn More](https://aka.ms/github-copilot-rate-limit-error)',
				'Sorry, GitHub Copilot Chat is currently experiencing high demand. Please try again in 30 seconds. [Learn More](https://aka.ms/github-copilot-rate-limit-error)',
				'Sorry, your request was rate-limited. Please wait 30 seconds before trying again or consider switching to Auto. [Learn More](https://aka.ms/github-copilot-rate-limit-error)',
			]);
		});

		test('quota sub-codes map to specific messages', () => {
			const messages = [
				getChatErrorDetailsFromFetchError({ type: ChatFetchResponseType.QuotaExceeded, capiError: { code: 'overage_limit_reached' } }, undefined).message,
				getChatErrorDetailsFromFetchError({ type: ChatFetchResponseType.QuotaExceeded, capiError: { code: 'additional_spend_limit_reached' } }, undefined).message,
				getChatErrorDetailsFromFetchError({ type: ChatFetchResponseType.QuotaExceeded, capiError: { code: 'billing_not_configured', message: 'set up billing' } }, undefined).message,
				getChatErrorDetailsFromFetchError({ type: ChatFetchResponseType.QuotaExceeded }, undefined).message,
			];
			assert.deepStrictEqual(messages, [
				'You cannot accrue additional premium requests at this time. Please contact [GitHub Support](https://support.github.com/contact) to continue using Copilot.',
				'You\'ve reached your additional usage limit for your plan. Upgrade your plan to keep going.',
				'set up billing',
				'Quota Exceeded',
			]);
		});
	});

	suite('getQuotaMessageForPlan', () => {

		test('usage-based billing business plan with reset date', () => {
			const message = getQuotaMessageForPlan('business', true, '2030-01-15T00:00:00.000Z');
			assert.ok(message.startsWith('You\'ve reached your credit limit. To continue working, please contact your organization\'s Copilot admin or wait until your credits reset on'));
		});

		test('default plan, no usage-based billing', () => {
			assert.strictEqual(
				getQuotaMessageForPlan(undefined),
				'You\'ve exhausted your premium model quota. For additional paid premium requests, please reach out to your organization\'s Copilot admin or wait for your allowance to renew.',
			);
		});

		test('edu plan with usage-based billing', () => {
			assert.deepStrictEqual(
				[getQuotaMessageForPlan('edu', true, '2030-01-15T00:00:00.000Z'), getQuotaMessageForPlan('edu', true)],
				[
					`You've reached your monthly credit limit. Please enable additional paid credits, upgrade to Copilot Pro, or wait until your credits reset on ${new Date('2030-01-15T00:00:00.000Z').toLocaleString(undefined, { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.`,
					'You\'ve reached your monthly credit limit. Please enable additional paid credits, upgrade to Copilot Pro, or wait for your credits to reset.',
				],
			);
		});

		test('edu plan without usage-based billing', () => {
			assert.strictEqual(
				getQuotaMessageForPlan('edu'),
				'You\'ve exhausted your premium model quota. Please enable additional paid premium requests, upgrade to Copilot Pro, or wait for your allowance to renew.',
			);
		});
	});

	suite('getCopilotPlanFromEntitlement', () => {

		test('maps entitlements to Copilot plan strings', () => {
			const actual = [
				ChatEntitlement.Free,
				ChatEntitlement.Pro,
				ChatEntitlement.ProPlus,
				ChatEntitlement.Max,
				ChatEntitlement.Business,
				ChatEntitlement.Enterprise,
				ChatEntitlement.EDU,
				ChatEntitlement.Unknown,
			].map(getCopilotPlanFromEntitlement);
			assert.deepStrictEqual(actual, ['free', 'individual', 'individual_pro', 'individual_max', 'business', 'enterprise', 'edu', undefined]);
		});
	});
});
