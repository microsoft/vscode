/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { IRequestService, asJson } from '../../request/common/request.js';
import { ILogService } from '../../log/common/log.js';

/**
 * Options for making GitHub API requests
 */
export interface IGitHubAPIRequestOptions {
	/**
	 * The GitHub API URL to request
	 */
	url: string;
	/**
	 * The authentication token to use
	 */
	token: string;
	/**
	 * HTTP method to use (default: GET)
	 */
	method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
	/**
	 * Request body for POST/PUT/PATCH requests
	 */
	body?: any;
	/**
	 * Additional headers to include in the request
	 */
	headers?: Record<string, string>;
}

/**
 * Options for making GitHub GraphQL requests
 */
export interface IGitHubGraphQLRequestOptions {
	/**
	 * The GraphQL query string
	 */
	query: string;
	/**
	 * Variables for the GraphQL query
	 */
	variables?: Record<string, any>;
	/**
	 * The authentication token to use
	 */
	token: string;
	/**
	 * The GitHub GraphQL API endpoint (default: https://api.github.com/graphql)
	 */
	endpoint?: string;
}

/**
 * Make a request to the GitHub REST API with proper typing
 *
 * @param requestService The request service to use for making HTTP requests
 * @param logService The log service for logging errors
 * @param options Request options including URL, token, method, etc.
 * @param token Cancellation token
 * @returns Promise that resolves to the typed response data
 */
export async function makeGitHubAPIRequest<T = any>(
	requestService: IRequestService,
	logService: ILogService,
	options: IGitHubAPIRequestOptions,
	token: CancellationToken
): Promise<T> {
	const { url, token: authToken, method = 'GET', body, headers = {} } = options;

	try {
		const requestOptions = {
			type: method,
			url,
			headers: {
				'Authorization': `Bearer ${authToken}`,
				'Accept': 'application/vnd.github.v3+json',
				'User-Agent': 'VSCode',
				...headers
			},
			data: body ? JSON.stringify(body) : undefined
		};

		const context = await requestService.request(requestOptions, token);
		const result = await asJson<T>(context);

		if (result === null) {
			throw new Error('GitHub API returned null response');
		}

		return result;
	} catch (error) {
		logService.error('GitHub API request failed', error);
		throw error;
	}
}

/**
 * Make a request to the GitHub GraphQL API with proper typing
 *
 * @param requestService The request service to use for making HTTP requests
 * @param logService The log service for logging errors
 * @param options GraphQL request options including query, variables, and token
 * @param token Cancellation token
 * @returns Promise that resolves to the typed GraphQL response
 */
export async function makeGitHubGraphQLRequest<T = any>(
	requestService: IRequestService,
	logService: ILogService,
	options: IGitHubGraphQLRequestOptions,
	token: CancellationToken
): Promise<T> {
	const { query, variables, token: authToken, endpoint = 'https://api.github.com/graphql' } = options;

	try {
		const requestOptions = {
			type: 'POST' as const,
			url: endpoint,
			headers: {
				'Authorization': `Bearer ${authToken}`,
				'Content-Type': 'application/json',
				'User-Agent': 'VSCode'
			},
			data: JSON.stringify({ query, variables })
		};

		const context = await requestService.request(requestOptions, token);
		const result = await asJson<{ data: T; errors?: any[] }>(context);

		if (result === null) {
			throw new Error('GitHub GraphQL API returned null response');
		}

		if (result.errors && result.errors.length > 0) {
			const errorMessage = result.errors.map((e: any) => e.message).join(', ');
			throw new Error(`GitHub GraphQL API returned errors: ${errorMessage}`);
		}

		return result.data;
	} catch (error) {
		logService.error('GitHub GraphQL request failed', error);
		throw error;
	}
}
