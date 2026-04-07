/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export type FormattedSnippyError = { kind: 'failure'; reason: string; code: number; msg: string; meta: object };
export const ErrorReasons = {
	BadArguments: 'BadArgumentsError',
	Unauthorized: 'NotAuthorized',
	NotFound: 'NotFoundError',
	RateLimit: 'RateLimitError',
	InternalError: 'InternalError',
	ConnectionError: 'ConnectionError',
	Unknown: 'UnknownError',
} as const;

export const ErrorMessages = {
	[ErrorReasons.Unauthorized]:
		'Invalid GitHub token. Please sign out from your GitHub account using VSCode UI and try again',
	[ErrorReasons.InternalError]:
		'Internal error: matches to public code will not be detected. It is advised to disable Copilot completions until the service is reconnected.',
	[ErrorReasons.RateLimit]:
		`You've reached your quota and limit, code matching will be unavailable until the limit resets`,
};

export function getErrorType(code: number) {
	if (code === 401) {
		return ErrorReasons.Unauthorized;
	} else if (code === 400) {
		return ErrorReasons.BadArguments;
	} else if (code === 404) {
		return ErrorReasons.NotFound;
	} else if (code === 429) {
		return ErrorReasons.RateLimit;
	} else if (code >= 500 && code < 600) {
		return ErrorReasons.InternalError;
	} else if (code >= 600) {
		// internal error codes for reconnecting / fully disconnected state. open to changing.
		// Separated because a 500 indicates a server error, but a 600 indicates the client is attempting
		// to recover.
		return ErrorReasons.ConnectionError;
	}

	return ErrorReasons.Unknown;
}

/**
 * Helper method to combine a fetch response and a snippy error response into an
 * object which conforms to our other error response interfaces. As seen in, e.g., extension/src/auth.ts.
 * @param code HTTP status code
 * @param msg
 * @param meta Any additional data, typically an object
 * @returns FormattedSnippyError
 */
export function createErrorResponse(code: number | string, msg: string, meta = {}) {
	const reason = getErrorType(Number(code));
	const errorResponse: FormattedSnippyError = {
		kind: 'failure',
		reason,
		code: Number(code),
		msg,
		meta,
	};

	return errorResponse;
}
