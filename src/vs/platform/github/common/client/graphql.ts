/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { GitHubGraphQLError, GitHubRequestError, GitHubResponseMetadata } from '../githubTypes.js';
import { RequestErrorKind } from '../types.js';
import { parse, SchemaError } from './schema.js';
import { JsonObject } from './types.js';

export interface GraphQLRequest {
	readonly query: string;
	readonly variables?: JsonObject;
}

export interface GraphQLResponse {
	readonly data: unknown;
	readonly errors: readonly GitHubGraphQLError[];
}

const parseRequest = parse.object<GraphQLRequest>({
	query: parse.refine(
		parse.nonEmptyString,
		query => query.trim().length > 0,
		'Expected a GraphQL document'
	),
	variables: parse.optional(parse.jsonObject),
});

/** Selectors and extensions could change the executed operation independently of the query prefix. */
export function parseGraphQLRequest(value: unknown): GraphQLRequest {
	const request = parseRequest(value);
	if (Object.keys(value as object).some(key => key !== 'query' && key !== 'variables')) {
		throw new SchemaError('GraphQL requests only support query and variables');
	}
	return request;
}

const parseError = parse.object<GitHubGraphQLError>({
	message: parse.optional(parse.string),
	type: parse.optional(parse.string),
	path: parse.optional(parse.arrayOf(value => typeof value === 'string' ? parse.string(value) : parse.nonNegativeInteger(value))),
	extensions: parse.optional(parse.object({ code: parse.optional(parse.string) })),
});

function assertGraphQLError(value: unknown): asserts value is GitHubGraphQLError {
	parseError(value);
}

const parseResponse = parse.object({
	data: (value: unknown) => value,
	errors: parse.optional(parse.arrayOf(value => {
		assertGraphQLError(value);
		return value;
	})),
});

/** Retains partial data and full error objects for legacy callers and transport quota processing. */
export function parseGraphQLResponse(value: unknown): GraphQLResponse {
	const response = parseResponse(value);
	const errors = response.errors ?? [];
	if (!Object.hasOwn(response, 'data') && errors.length === 0) {
		throw new SchemaError('Expected GraphQL data or errors');
	}
	if (response.data !== undefined && response.data !== null && (typeof response.data !== 'object' || Array.isArray(response.data))) {
		throw new SchemaError('Expected GraphQL data to be an object or null');
	}
	return { data: response.data, errors };
}

export function getGraphQLErrorKind(errors: readonly GitHubGraphQLError[]): RequestErrorKind {
	const types = errors.map(error => error.type?.toUpperCase());
	const codes = errors.map(error => error.extensions?.code?.toUpperCase());
	return types.includes('RATE_LIMIT') || types.includes('RATE_LIMITED')
		? 'rateLimit'
		: types.some(type => type === 'FORBIDDEN' || type === 'UNAUTHORIZED')
			? 'authorization'
			: types.some(type => type?.includes('NOT_FOUND'))
				? 'notFound'
				: types.some(type => type?.includes('VALIDATION'))
					? 'schema'
					: codes.some(code => code === 'UNDEFINEDFIELD' || code === 'ARGUMENTNOTACCEPTED' || code === 'VARIABLEMISMATCH')
						? 'schema'
						: 'server';
}

export function throwGraphQLErrors(errors: readonly GitHubGraphQLError[], statusCode: number, responseBody?: string, responseMetadata?: GitHubResponseMetadata): void {
	if (errors.length > 0) {
		throw new GitHubRequestError(
			`GitHub GraphQL request failed: ${errors.map(error => error.message ?? error.type ?? 'unknown error').join('; ')}`,
			getGraphQLErrorKind(errors), statusCode, responseBody, errors, undefined, responseMetadata,
		);
	}
}
