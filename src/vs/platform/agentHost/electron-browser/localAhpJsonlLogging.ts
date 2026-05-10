/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AhpJsonlLogger, getAhpLogByteLength } from '../common/ahpJsonlLogger.js';
import type { AuthenticateParams, IAgentService } from '../common/agentService.js';

const REDACTED_VALUE = '<redacted>';

/**
 * IAgentService methods that semantically correspond to JSON-RPC requests
 * (return a Promise of a result). Calls are logged as `c2s` request frames
 * with a synthetic numeric id, and resolutions/rejections are logged as
 * matching `s2c` response frames.
 */
const REQUEST_METHODS: ReadonlySet<string> = new Set<keyof IAgentService>([
	'authenticate',
	'listSessions',
	'createSession',
	'resolveSessionConfig',
	'sessionConfigCompletions',
	'completions',
	'getCompletionTriggerCharacters',
	'disposeSession',
	'createTerminal',
	'disposeTerminal',
	'shutdown',
	'subscribe',
	'resourceList',
	'resourceRead',
	'resourceWrite',
	'resourceCopy',
	'resourceDelete',
	'resourceMove',
] satisfies (keyof IAgentService)[]);

/**
 * IAgentService methods that semantically correspond to JSON-RPC notifications
 * (synchronous, no result). Calls are logged as `c2s` notification frames
 * with no id.
 */
const NOTIFICATION_METHODS: ReadonlySet<string> = new Set<keyof IAgentService>([
	'unsubscribe',
	'addSubscriber',
	'dispatchAction',
] satisfies (keyof IAgentService)[]);

/**
 * Wraps an {@link IAgentService} proxy so that every method call and every
 * resolved/rejected response is logged to the supplied {@link AhpJsonlLogger}
 * as a synthetic JSON-RPC frame. This brings the local (in-process) agent host
 * traffic into the same JSONL format used for remote agent host transports,
 * even though the underlying channel is a structured MessagePort RPC rather
 * than a JSON-RPC wire protocol.
 *
 * Event accessors (`onDidAction`, `onDidNotification`) are passed through
 * untouched; their payloads should be logged separately by the caller as
 * `s2c` `action` / `notification` frames.
 */
export function wrapAgentServiceWithAhpLogging(target: IAgentService, logger: AhpJsonlLogger): IAgentService {
	let nextId = 1;
	return new Proxy(target, {
		get(t, prop, receiver) {
			const value = Reflect.get(t, prop, receiver);
			if (typeof prop !== 'string' || typeof value !== 'function') {
				return value;
			}
			const isRequest = REQUEST_METHODS.has(prop);
			const isNotification = !isRequest && NOTIFICATION_METHODS.has(prop);
			if (!isRequest && !isNotification) {
				return value;
			}
			const method = prop;
			return function (this: unknown, ...args: unknown[]) {
				const logArgs = redactParams(method, args);
				if (isNotification) {
					const frame = { jsonrpc: '2.0' as const, method, params: logArgs };
					logger.log(frame, 'c2s', getAhpLogByteLength(safeStringify(frame)));
					return value.apply(t, args);
				}
				const id = nextId++;
				const requestFrame = { jsonrpc: '2.0' as const, id, method, params: logArgs };
				logger.log(requestFrame, 'c2s', getAhpLogByteLength(safeStringify(requestFrame)));
				const result = value.apply(t, args) as Promise<unknown> | unknown;
				if (result && typeof (result as Promise<unknown>).then === 'function') {
					return (result as Promise<unknown>).then(
						res => {
							const responseFrame = { jsonrpc: '2.0' as const, id, result: res ?? null };
							logger.log(responseFrame, 's2c', getAhpLogByteLength(safeStringify(responseFrame)));
							return res;
						},
						err => {
							const errorFrame = {
								jsonrpc: '2.0' as const,
								id,
								error: {
									code: -32603,
									message: err instanceof Error ? err.message : String(err),
								},
							};
							logger.log(errorFrame, 's2c', getAhpLogByteLength(safeStringify(errorFrame)));
							throw err;
						},
					);
				}
				return result;
			};
		},
	});
}

function redactParams(method: string, args: readonly unknown[]): readonly unknown[] {
	if (method !== 'authenticate') {
		return args;
	}
	const [params, ...rest] = args;
	if (!isAuthenticateParams(params)) {
		return args;
	}
	return [{ ...params, token: REDACTED_VALUE }, ...rest];
}

function isAuthenticateParams(value: unknown): value is AuthenticateParams {
	return typeof value === 'object'
		&& value !== null
		&& 'resource' in value
		&& 'token' in value
		&& typeof value.resource === 'string'
		&& typeof value.token === 'string';
}

function safeStringify(value: unknown): string {
	try {
		return JSON.stringify(value);
	} catch {
		return '';
	}
}
