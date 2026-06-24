/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IInstantiationService, ServicesAccessor } from '../../../../../../util/vs/platform/instantiation/common/instantiation';
import { CopilotToken, ICompletionsCopilotTokenManager } from '../auth/copilotTokenManager';
import { editorVersionHeaders } from '../config';
import { ICompletionsLogTargetService } from '../logger';
import { getEndpointUrl } from '../networkConfiguration';
import { ICompletionsFetcherService, type IAbortSignal, type Response } from '../networking';
import { ConnectionState } from './connectionState';
import {
	createErrorResponse,
	ErrorMessages,
	ErrorReasons,
	FormattedSnippyError,
	getErrorType,
} from './errorCreator';
import { codeReferenceLogger } from './logger';
import { snippyTelemetry } from './telemetryHandlers';

type Config<Req> = { method: 'GET' } | { method: 'POST'; body: Req };
type SnippyResponse<Res> = ({ kind: 'success' } & Res) | FormattedSnippyError;

export async function call<Res, Req = unknown>(
	accessor: ServicesAccessor,
	endpoint: string,
	config: Config<Req>,
	signal?: IAbortSignal
): Promise<SnippyResponse<Res>> {
	let token: CopilotToken;
	const logTarget = accessor.get(ICompletionsLogTargetService);
	const instantiationService = accessor.get(IInstantiationService);
	const tokenManager = accessor.get(ICompletionsCopilotTokenManager);
	try {
		token = tokenManager.token ?? await tokenManager.getToken();
	} catch (e) {
		ConnectionState.setDisconnected();
		return createErrorResponse(401, ErrorMessages[ErrorReasons.Unauthorized]);
	}

	codeReferenceLogger.info(logTarget, `Calling ${endpoint}`);

	if (ConnectionState.isRetrying()) {
		return createErrorResponse(600, 'Attempting to reconnect to the public code matching service.');
	}

	if (ConnectionState.isDisconnected()) {
		return createErrorResponse(601, 'The public code matching service is offline.');
	}

	let res: InstanceType<typeof Response>;
	try {
		res = await instantiationService.invokeFunction(acc => acc.get(ICompletionsFetcherService).fetch(getEndpointUrl(acc, token, 'origin-tracker', endpoint), {
			callSite: 'snippy-network',
			method: config.method,
			body: config.method === 'POST' ? JSON.stringify(config.body) : undefined,
			headers: {
				'content-type': 'application/json',
				authorization: `Bearer ${token.token}`,
				...editorVersionHeaders(acc),
			},
			signal,
		}));
	} catch (e) {
		instantiationService.invokeFunction(ConnectionState.enableRetry);
		return createErrorResponse(602, 'Network error detected. Check your internet connection.');
	}

	let payload;
	try {
		payload = await res.json();
	} catch (e) {
		const message = (e as Error).message;
		snippyTelemetry.handleUnexpectedError({
			instantiationService,
			origin: 'snippyNetwork',
			reason: message,
		});
		throw e;
	}

	if (res.ok) {
		return {
			kind: 'success',
			...(payload as Res),
		};
	}
	const errorPayload = {
		...(payload as FormattedSnippyError),
		code: Number(res.status),
	};

	/**
	 * Snippy will always respond with a 200, unless:
	 *
	 * - the request is malformed
	 * - the user is not authorized.
	 * - the server is down
	 */
	const { code, msg, meta } = errorPayload;
	const formattedCode = Number(code);
	const errorTypeFromCode = getErrorType(formattedCode);
	const fallbackMsg = msg || 'unknown error';
	switch (errorTypeFromCode) {
		case ErrorReasons.Unauthorized: {
			return createErrorResponse(code, ErrorMessages[ErrorReasons.Unauthorized], meta);
		}
		case ErrorReasons.BadArguments: {
			return createErrorResponse(code, fallbackMsg, meta);
		}
		case ErrorReasons.RateLimit: {
			instantiationService.invokeFunction(acc => ConnectionState.enableRetry(acc, 60 * 1000));
			return createErrorResponse(code, ErrorMessages.RateLimitError, meta);
		}
		case ErrorReasons.InternalError: {
			instantiationService.invokeFunction(acc => ConnectionState.enableRetry(acc));
			return createErrorResponse(code, ErrorMessages[ErrorReasons.InternalError], meta);
		}
		default: {
			return createErrorResponse(code, fallbackMsg, meta);
		}
	}
}
