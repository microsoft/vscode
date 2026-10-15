/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout, raceCancellationError } from '../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { CancellationError } from '../../../base/common/errors.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { IRequestContext, IRequestOptions } from '../../../base/parts/request/common/request.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { IRequestService, readBoundedResponse } from '../../request/common/request.js';

const endpoint = 'https://agentfinder.github.com/internal/v1/feeds';
const requestTimeout = 30_000;
const maxResponseBytes = 5 * 1024 * 1024;
export const maxAgentFinderFeedIdLength = 4096;

export type AgentFinderRequestResult =
	| { readonly kind: 'response'; readonly statusCode: number | undefined; readonly body: string }
	| { readonly kind: 'error'; readonly error: 'timeout' | 'transport' | 'responseTooLarge' };

export const IAgentFinderRequestService = createDecorator<IAgentFinderRequestService>('agentFinderRequestService');

export interface IAgentFinderRequestService {
	readonly _serviceBrand: undefined;
	request(feedId: string, accessToken: string, token: CancellationToken): Promise<AgentFinderRequestResult>;
}

class ResponseTooLargeError extends Error { }

export class AgentFinderRequestService implements IAgentFinderRequestService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IRequestService private readonly requestService: IRequestService,
		@ILogService private readonly logService: ILogService,
	) { }

	async request(feedId: string, accessToken: string, token: CancellationToken): Promise<AgentFinderRequestResult> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		if (!isValidAgentFinderFeedId(feedId) || !accessToken) {
			throw new Error('Invalid Agent Finder request');
		}

		const store = new DisposableStore();
		const cancellation = store.add(new CancellationTokenSource(token));
		let timedOut = false;
		store.add(disposableTimeout(() => {
			timedOut = true;
			cancellation.cancel();
		}, requestTimeout));

		let context: IRequestContext | undefined;
		try {
			const options: IRequestOptions = {
				url: `${endpoint}/${encodeURIComponent(feedId)}`,
				type: 'GET',
				headers: { Accept: 'application/json', Authorization: ['Bearer', accessToken].join(' ') },
				disableCache: true,
				timeout: requestTimeout,
				followRedirects: 0,
				callSite: 'agentFinder.savedResourceFeed',
			};
			context = await this.requestService.request(options, cancellation.token);
			const body = await raceCancellationError(
				readBoundedResponse(context, maxResponseBytes, () => new ResponseTooLargeError()),
				cancellation.token,
			);
			return { kind: 'response', statusCode: context.res.statusCode, body };
		} catch (error) {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			if (timedOut) {
				return { kind: 'error', error: 'timeout' };
			}
			this.logService.error('[AgentFinderRequestService] Request failed', error);
			return { kind: 'error', error: error instanceof ResponseTooLargeError ? 'responseTooLarge' : 'transport' };
		} finally {
			context?.stream.destroy();
			store.dispose();
		}
	}
}

export function isValidAgentFinderFeedId(feedId: unknown): feedId is string {
	return typeof feedId === 'string' && feedId.length > 0 && feedId.length <= maxAgentFinderFeedIdLength && !!feedId.trim();
}
