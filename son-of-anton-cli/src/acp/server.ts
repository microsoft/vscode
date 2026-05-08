/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as readline from 'readline';
import { SECRET_KEYS } from 'son-of-anton-core/dist/credentials/credentialDetection';
import { buildCliAgentStack } from '../agentStackBuilder';
import { bootstrapCredentials } from '../auth/bootstrap';
import { buildCliHost } from '../cliHost';
import { AcpError, AcpHandlers } from './handlers';
import {
	JsonRpcErrorCode,
	type JsonRpcFailure,
	type JsonRpcId,
	type JsonRpcRequest,
	type JsonRpcSuccess,
} from './protocol';

/**
 * Send a single line to stdout. ACP frames messages as one JSON object per
 * line (newline-delimited JSON); anything else on stdout would corrupt the
 * stream, so all server diagnostics go to stderr via {@link logErr}.
 */
function writeMessage(value: unknown): void {
	process.stdout.write(JSON.stringify(value) + '\n');
}

function logErr(message: string): void {
	process.stderr.write(`[acp] ${message}\n`);
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
	return (
		isObject(value) &&
		value['jsonrpc'] === '2.0' &&
		typeof value['method'] === 'string'
	);
}

function makeSuccess(id: JsonRpcId, result: unknown): JsonRpcSuccess {
	return { jsonrpc: '2.0', id, result };
}

function makeFailure(id: JsonRpcId | null, code: number, message: string, data?: unknown): JsonRpcFailure {
	return { jsonrpc: '2.0', id, error: data === undefined ? { code, message } : { code, message, data } };
}

/**
 * Wire one of the well-known ACP env vars (mirrored into the secret store by
 * `bootstrapCredentials`) to the keys the LlmClient inspects. Used to answer
 * `authenticate` requests without touching disk on every poll.
 */
const PROVIDER_ENV_VARS = [
	'ANTHROPIC_API_KEY',
	'OPENAI_API_KEY',
	'AZURE_OPENAI_API_KEY',
	'FOUNDRY_API_KEY',
	'AWS_ACCESS_KEY_ID',
	'GOOGLE_API_KEY',
	'GEMINI_API_KEY',
] as const;

function hasAnyProviderEnv(): boolean {
	return PROVIDER_ENV_VARS.some(v => {
		const value = process.env[v];
		return typeof value === 'string' && value.trim().length > 0;
	});
}

/**
 * Reference {@link SECRET_KEYS} so the unused-import linter doesn't strip the
 * symbol — it documents the shape the env vars get mirrored into and we read
 * one of them below to keep the dependency expressed at type-check time.
 */
const _SECRET_KEYS_ANCHOR: typeof SECRET_KEYS = SECRET_KEYS;
void _SECRET_KEYS_ANCHOR;

/**
 * Entry point for `sota acp`. Bootstraps credentials, builds the agent stack
 * exactly like the chat/run/plan commands, then enters a stdin read loop.
 *
 * The function never resolves under normal operation — it only returns when
 * stdin closes, after which the agent stack is disposed and the process is
 * allowed to exit naturally so any in-flight async work can drain.
 */
export async function runAcpServer(): Promise<void> {
	const host = buildCliHost();

	const auth = await bootstrapCredentials(host);
	if (!auth.ok) {
		// Stay alive so the client can still call `initialize` and discover we
		// need authentication — but log the reason to stderr so a developer
		// running the CLI manually sees the same message they'd get from the
		// regular chat command. We DO NOT exit: the public spec lets a client
		// call `initialize` before knowing whether auth is configured.
		logErr(`startup: ${auth.message ?? 'no API key configured'}`);
	}

	const built = buildCliAgentStack(host);

	const handlers = new AcpHandlers({
		stack: built.stack,
		sendNotification: (method, params) => {
			writeMessage({ jsonrpc: '2.0', method, params });
		},
		hasAnyApiKey: hasAnyProviderEnv,
		defaultCwd: process.cwd(),
	});

	const rl = readline.createInterface({
		input: process.stdin,
		// Crucial: do NOT pass process.stdout — readline would echo lines back
		// to stdout and corrupt the protocol. We only consume input here.
		terminal: false,
		crlfDelay: Infinity,
	});

	let closing = false;

	rl.on('line', (line: string) => {
		const trimmed = line.trim();
		if (!trimmed) {
			return;
		}

		// Each line is dispatched on its own microtask so a slow handler
		// doesn't block the read loop. The spec allows the client to send
		// `cancel` while a `prompt` is still streaming, and we need that
		// notification to be delivered immediately.
		void dispatchLine(trimmed, handlers);
	});

	rl.on('close', () => {
		if (closing) {
			return;
		}
		closing = true;
		try {
			built.dispose();
		} catch (err) {
			logErr(`dispose error: ${err instanceof Error ? err.message : String(err)}`);
		}
	});

	// SIGINT shouldn't kill the process mid-prompt — translate it into stdin
	// close so the cleanup path runs uniformly.
	process.once('SIGINT', () => {
		rl.close();
	});

	// Keep the function alive until stdin closes.
	await new Promise<void>(resolve => rl.once('close', () => resolve()));
}

/**
 * Parse one line of input and dispatch it to the matching handler. Errors
 * from inside a handler are mapped to JSON-RPC error responses; parse
 * failures are reported with id `null` per the spec.
 */
async function dispatchLine(line: string, handlers: AcpHandlers): Promise<void> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(line);
	} catch (err) {
		writeMessage(makeFailure(null, JsonRpcErrorCode.ParseError, 'invalid JSON', {
			detail: err instanceof Error ? err.message : String(err),
		}));
		return;
	}

	if (!isJsonRpcRequest(parsed)) {
		writeMessage(makeFailure(null, JsonRpcErrorCode.InvalidRequest, 'message is not a JSON-RPC 2.0 request'));
		return;
	}

	const isNotification = !('id' in parsed) || (parsed as unknown as Record<string, unknown>).id === undefined;
	const id = (parsed.id ?? null) as JsonRpcId | null;

	try {
		const result = await invokeMethod(handlers, parsed.method, parsed.params);
		if (isNotification) {
			// JSON-RPC: notifications get no response.
			return;
		}
		writeMessage(makeSuccess(id as JsonRpcId, result));
	} catch (err) {
		if (isNotification) {
			logErr(`notification ${parsed.method} failed: ${err instanceof Error ? err.message : String(err)}`);
			return;
		}
		if (err instanceof AcpError) {
			writeMessage(makeFailure(id, err.code, err.message, err.data));
		} else {
			writeMessage(makeFailure(
				id,
				JsonRpcErrorCode.InternalError,
				err instanceof Error ? err.message : String(err),
			));
		}
	}
}

/**
 * Method dispatch table. Returning `void` for notifications causes the
 * caller to skip writing a response.
 */
async function invokeMethod(handlers: AcpHandlers, method: string, params: unknown): Promise<unknown> {
	switch (method) {
		case 'initialize':
			return handlers.initialize(params as Parameters<AcpHandlers['initialize']>[0]);
		case 'authenticate':
			return handlers.authenticate(params as Parameters<AcpHandlers['authenticate']>[0]);
		case 'session/new':
			return handlers.newSession(params as Parameters<AcpHandlers['newSession']>[0]);
		case 'session/prompt':
			return handlers.prompt(params as Parameters<AcpHandlers['prompt']>[0]);
		case 'session/cancel':
			handlers.cancel(params as Parameters<AcpHandlers['cancel']>[0]);
			return undefined;
		default:
			throw new AcpError(JsonRpcErrorCode.MethodNotFound, `unknown method: ${method}`);
	}
}
