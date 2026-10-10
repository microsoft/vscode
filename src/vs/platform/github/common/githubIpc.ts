/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Event } from '../../../base/common/event.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { hasKey } from '../../../base/common/types.js';
import { IChannel, IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { IGitHubService } from './githubService.js';
import { GitHubAnonymousReadOptions, GitHubRestResponse } from './githubTransport.js';
import { GitHubAnonymousClientOptions, GitHubRequestError, GitHubRequestRateLimitError, GitHubRequestTimeoutError } from './githubTypes.js';
import { RequestErrorKind } from './types.js';

export const GITHUB_CHANNEL_NAME = 'github';
export const ISharedProcessGitHubService = createDecorator<ISharedProcessGitHubService>('sharedProcessGitHubService');

export interface GitHubAnonymousRequest extends Pick<GitHubAnonymousClientOptions, 'apiBaseUri'> {
	readonly path: string;
	readonly options?: GitHubAnonymousReadOptions;
}

/** Opt-in shared-engine access; authenticated grants and client resources remain process-local. */
export interface ISharedProcessGitHubService {
	readonly _serviceBrand: undefined;
	getAnonymous<T>(request: GitHubAnonymousRequest, token: CancellationToken): Promise<GitHubRestResponse<T>>;
}

type GitHubResponse<T> = { readonly result: GitHubRestResponse<T> } | {
	readonly error: {
		readonly message: string;
		readonly kind: RequestErrorKind;
		readonly statusCode?: number;
		readonly responseBody?: string;
		readonly statusText?: string;
		readonly requestDispatched?: boolean;
		readonly retryAfterMs?: number;
	};
};

export class GitHubChannel implements IServerChannel {

	constructor(
		@IGitHubService private readonly service: IGitHubService,
		@ILogService private readonly logService: ILogService,
	) { }

	listen(): Event<never> {
		throw new Error('Invalid GitHub subscription');
	}

	call<T>(_context: unknown, command: string, args: unknown, token: CancellationToken = CancellationToken.None): Promise<T> {
		if (command !== 'getAnonymous' || !isAnonymousRequest(args)) {
			throw new Error('Invalid shared-process GitHub request');
		}
		return this.getAnonymous(args, token) as Promise<T>;
	}

	private async getAnonymous(request: GitHubAnonymousRequest, token: CancellationToken): Promise<GitHubResponse<unknown>> {
		const lifetime = new DisposableStore();
		try {
			const client = lifetime.add(this.service.acquireAnonymousClient({ apiBaseUri: request.apiBaseUri })).object;
			return { result: await client.get(request.path, token, request.options) };
		} catch (error) {
			if (!(error instanceof GitHubRequestError)) {
				throw error;
			}
			this.logService.debug(`[GitHubService] Shared request failed (${error.kind})`);
			return {
				error: {
					message: error.message,
					kind: error.kind,
					statusCode: error.statusCode,
					responseBody: error.responseBody,
					statusText: error.statusText,
					...(error instanceof GitHubRequestTimeoutError ? { requestDispatched: error.requestDispatched } : {}),
					...(error instanceof GitHubRequestRateLimitError ? { retryAfterMs: error.retryAfterMs } : {}),
				},
			};
		} finally {
			lifetime.dispose();
		}
	}
}

export class GitHubChannelClient implements ISharedProcessGitHubService {
	declare readonly _serviceBrand: undefined;

	constructor(private readonly channel: IChannel) { }

	async getAnonymous<T>(request: GitHubAnonymousRequest, token: CancellationToken): Promise<GitHubRestResponse<T>> {
		const response = await this.channel.call<GitHubResponse<T>>('getAnonymous', request, token);
		if (hasKey(response, { result: true })) {
			return response.result;
		}
		const error = response.error;
		if (error.requestDispatched !== undefined) {
			throw new GitHubRequestTimeoutError(error.requestDispatched);
		}
		if (error.retryAfterMs !== undefined) {
			throw new GitHubRequestRateLimitError(error.retryAfterMs);
		}
		throw new GitHubRequestError(error.message, error.kind, error.statusCode, error.responseBody, undefined, error.statusText);
	}
}

function isAnonymousRequest(value: unknown): value is GitHubAnonymousRequest {
	if (!value || typeof value !== 'object'
		|| !('apiBaseUri' in value) || typeof value.apiBaseUri !== 'string'
		|| !('path' in value) || typeof value.path !== 'string'
		|| Object.keys(value).some(key => !['apiBaseUri', 'path', 'options'].includes(key))) {
		return false;
	}
	if (!('options' in value) || value.options === undefined) {
		return true;
	}
	if (!value.options || typeof value.options !== 'object' || Array.isArray(value.options)) {
		return false;
	}
	return Object.entries(value.options).every(([key, option]: [string, unknown]) => {
		if (option === undefined) {
			return true;
		}
		switch (key) {
			case 'accept':
			case 'apiVersion':
			case 'caller':
				return typeof option === 'string';
			case 'etag':
			case 'unconditional':
				return typeof option === 'boolean';
			case 'deadline':
			case 'representationVersion':
				return typeof option === 'number' && Number.isFinite(option);
			case 'priority':
				return typeof option === 'string' && ['mutationReconciliation', 'mutation', 'interactive', 'mergeGate', 'visible', 'background', 'enrichment'].includes(option);
			default:
				return false;
		}
	});
}
