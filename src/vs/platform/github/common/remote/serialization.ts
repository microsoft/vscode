/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationError, isCancellationError } from '../../../../base/common/errors.js';
import { parse, SchemaError } from '../client/schema.js';
import { GitHubGraphQLError, GitHubRequestError, GitHubRequestRateLimitError, GitHubRequestTimeoutError, GitHubResponseMetadata } from '../githubTypes.js';
import { ApiRequestError, MutationUncertainError, parseApiError } from '../missionControl/missionControlClient.js';
import { parseMissionControlErrorCode } from '../missionControl/missionControlError.js';
import { parseGitHubRequestId } from '../client/headers.js';
import { RequestErrorKind } from '../types.js';
import { ApiResponseMessage, GitHubErrorResponse, parseBodyText, SerializedGitHubError, SerializedMissionControlError, SerializedRequestError } from './ipc.js';

const parseErrorKind = parse.oneOf<RequestErrorKind>(
	'authentication', 'authorization', 'notFound', 'validation', 'schema', 'rateLimit',
	'network', 'server', 'overloaded', 'timeout', 'responseTooLarge', 'malformedResponse', 'unknown',
);

const parseGraphQLError = parse.object<GitHubGraphQLError>({
	message: parse.optional(parse.string),
	type: parse.optional(parse.string),
	path: parse.optional(parse.arrayOf(value => typeof value === 'string' ? parse.string(value) : parse.nonNegativeInteger(value))),
	extensions: parse.optional(parse.object({ code: parse.optional(parse.string) })),
});

const parseError = {
	request: parse.object<SerializedRequestError>({
		type: parse.exact('request'),
		message: parse.string,
		kind: parseErrorKind,
		statusCode: parse.optional(parse.range(100, 599)),
		statusText: parse.optional(parse.string),
		graphQLErrors: parse.optional(parse.arrayOf(parseGraphQLError)),
		responseMetadata: parse.optional(parse.object<GitHubResponseMetadata>({
			serverDate: parse.optional(parse.string),
			requestId: parse.optional(parse.string),
			retryAfterSeconds: parse.optional(parse.nonNegativeNumber),
		})),
	}),
	timeout: parse.object({ type: parse.exact('timeout'), requestDispatched: parse.boolean }),
	rateLimit: parse.object({ type: parse.exact('rateLimit'), retryAfterMs: parse.nonNegativeNumber }),
	cancelled: parse.object({ type: parse.exact('cancelled') }),
	missionControl: parse.object({
		type: parse.exact('missionControl'), statusCode: parse.range(100, 599), kind: parseErrorKind,
		response: parse.optional(parseApiError), requestId: value => parseGitHubRequestId(typeof value === 'string' ? value : undefined),
		code: value => parseMissionControlErrorCode(value), limitedResource: value => parseMissionControlErrorCode(value),
		retryAfterSeconds: parse.optional(parse.nonNegativeNumber), outcome: parse.optional(parse.exact('indeterminate')),
	}),
	mutationUncertain: parse.object({ type: parse.exact('mutationUncertain'), kind: parseErrorKind, statusCode: parse.optional(parse.range(100, 599)) }),
};

const parseErrorType = parse.object({ type: parse.oneOf('request', 'timeout', 'rateLimit', 'cancelled', 'missionControl', 'mutationUncertain') });
const parseResponseType = parse.object({ type: parse.oneOf('success', 'error') });
const parseSuccess = parse.object({
	type: parse.exact('success'), status: parse.range(100, 599),
	metadata: parse.optional(parse.object({
		nextPath: parse.optional(parse.nullable(parse.string)),
		nextLink: parse.optional(parse.string), serverDate: parse.optional(parse.string), retryAfterSeconds: parse.optional(parse.nonNegativeNumber),
	})),
});
const parseFailure = parse.object({
	type: parse.exact('error'),
	error: (value: unknown) => parseError[parseErrorType(value).type](value),
});

export function parseApiResponse(value: unknown): ApiResponseMessage {
	if (!Array.isArray(value) || value.length !== 2) {
		throw new SchemaError('Expected an API response tuple');
	}
	const metadata = parseResponseType(value[0]).type === 'success' ? parseSuccess(value[0]) : parseFailure(value[0]);
	return [metadata, parseBodyText(value[1])];
}

export function parseClientResponse<T>(value: unknown, parser: parse.Parser<T>): T {
	if (!Array.isArray(value) || value.length !== 2) {
		throw new SchemaError('Expected a GitHub client response tuple');
	}
	if (parseResponseType(value[0]).type === 'error') {
		throw deserializeGitHubError(parseFailure(value[0]).error, parseBodyText(value[1]));
	}
	if (value[1] !== undefined) {
		throw new SchemaError('Unexpected GitHub client response body');
	}
	return parse.object({ value: parser })(value[0]).value;
}

export function deserializeGitHubError(error: SerializedGitHubError | SerializedMissionControlError, bodyText: string | undefined): GitHubRequestError | CancellationError {
	switch (error.type) {
		case 'missionControl':
			return new ApiRequestError(error.statusCode, error.kind, error.response, error.requestId, error.retryAfterSeconds, error.outcome,
				{ code: error.code, limitedResource: error.limitedResource, requestId: error.requestId });
		case 'mutationUncertain':
			return new MutationUncertainError(error.kind, error.statusCode);
		case 'cancelled':
			return new CancellationError();
		case 'timeout':
			return new GitHubRequestTimeoutError(error.requestDispatched);
		case 'rateLimit':
			return new GitHubRequestRateLimitError(error.retryAfterMs);
		case 'request':
			return new GitHubRequestError(error.message, error.kind, error.statusCode, bodyText, error.graphQLErrors, error.statusText, error.responseMetadata);
	}
}

/** Preserves known failures in either IPC direction; unexpected failures use ordinary IPC errors. */
export function serializeGitHubError(error: unknown): GitHubErrorResponse {
	if (error instanceof ApiRequestError) {
		return [{
			type: 'error', error: {
				type: 'missionControl', statusCode: error.statusCode, kind: error.kind, response: error.response,
				requestId: error.requestId, retryAfterSeconds: error.retryAfterSeconds, outcome: error.outcome,
				code: error.code, limitedResource: error.limitedResource,
			}
		}, undefined];
	}
	if (error instanceof MutationUncertainError) {
		return [{ type: 'error', error: { type: 'mutationUncertain', kind: error.kind, statusCode: error.statusCode } }, undefined];
	}
	if (isCancellationError(error)) {
		return [{ type: 'error', error: { type: 'cancelled' } }, undefined];
	}
	if (error instanceof GitHubRequestTimeoutError) {
		return [{ type: 'error', error: { type: 'timeout', requestDispatched: error.requestDispatched } }, undefined];
	}
	if (error instanceof GitHubRequestRateLimitError) {
		return [{ type: 'error', error: { type: 'rateLimit', retryAfterMs: error.retryAfterMs } }, undefined];
	}
	if (error instanceof GitHubRequestError) {
		return [{
			type: 'error',
			error: {
				type: 'request',
				message: error.message,
				kind: error.kind,
				statusCode: error.statusCode,
				statusText: error.statusText,
				graphQLErrors: error.graphQLErrors,
				responseMetadata: error.responseMetadata,
			},
		}, error.responseBody];
	}
	throw error;
}
