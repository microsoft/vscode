/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Result } from '../../../util/common/result';
import { createServiceIdentifier } from '../../../util/common/services';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { IHeaders } from '../../networking/common/fetcherService';
import { ResponseStream } from './responseStream';

export namespace Completions {
	interface BaseCompletionsParams {
		prompt: string;
		stop?: string[];
		top_p?: number;
		best_of?: number;
		max_tokens?: number;
		temperature?: number;
		presence_penalty?: number;
		frequency_penalty?: number;
		// required to access certain experimental models
		model?: string;
		logprobs?: number;
		n?: number;
		stream: true;
	}

	interface CodexV2Params {
		suffix?: string;
		extra?: { [key: string]: any };
		code_annotations?: boolean;
	}

	export interface ModelParams extends BaseCompletionsParams, CodexV2Params { }

	export class RequestCancelled {
		readonly kind = 'cancelled' as const;
	}
	export class UnsuccessfulResponse {
		readonly kind = 'not-200-status' as const;
		constructor(
			public readonly status: number,
			public readonly statusText: string,
			public readonly headers: IHeaders,
			public readonly text: () => Promise<string>
		) { }
	}
	export class Unexpected {
		readonly kind = 'unexpected' as const;
		constructor(
			public readonly error: Error
		) { }
	}
	export type CompletionsFetchFailure =
		| Completions.RequestCancelled
		| Completions.UnsuccessfulResponse
		| Completions.Unexpected;

	export namespace Internal {
		export type FetchOptions = {
			requestId: string;
			headers: { [name: string]: string };
			body: string;
		};
	}
}

export type CompletionsFetchErrorType = 'stop_content_filter' | 'stop_length' | 'unknown';

export class CompletionsFetchError extends Error {
	constructor(
		readonly type: CompletionsFetchErrorType,
		readonly requestId: string,
		message: string
	) {
		super(message);
	}
}

export const ICompletionsFetchService = createServiceIdentifier<ICompletionsFetchService>('ICompletionsFetchService');

/**
 * OpenAI has completions and _chat_ completions endpoints. This's (non-chat) completions endpoint fetcher.
 */
export interface ICompletionsFetchService {
	readonly _serviceBrand: undefined;

	fetch(
		url: string,
		secretKey: string,
		params: Completions.ModelParams,
		requestId: string,
		ct: CancellationToken,
		headerOverrides?: Record<string, string>
	): Promise<Result<ResponseStream, Completions.CompletionsFetchFailure>>;

	disconnectAll(): Promise<unknown>;
}
