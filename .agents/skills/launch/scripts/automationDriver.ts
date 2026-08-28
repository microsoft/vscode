#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { resolve as resolvePath } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { attach, type IAttachedSession } from './attach.ts';
import {
	collectVirtualized,
	safeClick,
	settleUI,
	snapshotApplication,
	type IApplicationSnapshotOptions,
	type IUISettleOptions,
	type IUISettleResult
} from './automationState.ts';

const DEFAULT_EXECUTION_TIMEOUT_MS = 30_000;
const MAX_EXECUTION_TIMEOUT_MS = 10 * 60_000;
const MAX_REQUEST_BYTES = 2 * 1024 * 1024;

export interface IAutomationRequest {
	readonly id?: string;
	/** An async or synchronous function expression receiving the automation context. */
	readonly code: string;
	/** Optional function expression receiving `(context, actionResult)`. */
	readonly verify?: string;
	readonly timeoutMs?: number;
	/** Include a bounded application snapshot after execution. Defaults to true. */
	readonly includeState?: boolean;
}

export interface IAutomationPhaseResult {
	readonly ok: boolean;
	readonly durationMs: number;
	readonly value?: unknown;
	readonly error?: {
		readonly name: string;
		readonly message: string;
		readonly stack?: string;
	};
}

export interface IAutomationResponse {
	readonly id: string;
	readonly ok: boolean;
	readonly action: IAutomationPhaseResult;
	readonly verification?: IAutomationPhaseResult;
	readonly state?: unknown;
	readonly stateError?: IAutomationPhaseResult['error'];
	readonly timings: {
		readonly queueMs: number;
		readonly actionMs: number;
		readonly verificationMs: number;
		readonly stateMs: number;
		readonly totalMs: number;
	};
}

export interface IAutomationExecutionContext {
	readonly session: IAttachedSession;
	readonly browser: IAttachedSession['browser'];
	readonly page: IAttachedSession['page'];
	readonly code: IAttachedSession['code'];
	readonly workbench: IAttachedSession['workbench'];
	readonly snapshot: (options?: IApplicationSnapshotOptions) => Promise<unknown>;
	readonly settle: (options?: IUISettleOptions) => Promise<IUISettleResult>;
	readonly collectVirtualized: typeof collectVirtualized;
	readonly safeClick: typeof safeClick;
	/** Internal recovery hook used when arbitrary code exceeds its time budget. */
	readonly onTimeout?: () => void;
}

interface IServeOptions {
	readonly cdpPort: number;
	readonly port: number;
	readonly token: string;
	readonly repoRoot: string;
	readonly window: 'workbench' | 'agents' | 'any';
	readonly logsPath?: string;
}

type AutomationFunction = (context: IAutomationExecutionContext, actionResult?: unknown) => unknown | Promise<unknown>;

class AutomationTimeoutError extends Error {
	readonly timeoutMs: number;
	readonly phase: string;

	constructor(timeoutMs: number, phase: string) {
		super(`${phase} timed out after ${timeoutMs}ms.`);
		this.name = 'AutomationTimeoutError';
		this.timeoutMs = timeoutMs;
		this.phase = phase;
	}
}

function errorDetails(error: unknown): IAutomationPhaseResult['error'] {
	if (error instanceof Error) {
		return { name: error.name, message: error.message, stack: error.stack };
	}
	return { name: 'Error', message: String(error) };
}

function compileAutomationFunction(source: string, label: string): AutomationFunction {
	if (typeof source !== 'string' || !source.trim()) {
		throw new Error(`${label} must be a non-empty function expression.`);
	}
	let value: unknown;
	try {
		value = new vm.Script(`(${source}\n)`, { filename: `${label}.js` }).runInThisContext();
	} catch (error) {
		throw new Error(`Could not compile ${label}: ${error instanceof Error ? error.message : error}`);
	}
	if (typeof value !== 'function') {
		throw new Error(`${label} must evaluate to a function, got ${typeof value}.`);
	}
	return value as AutomationFunction;
}

function executionTimeout(requested: number | undefined): number {
	const timeoutMs = requested ?? DEFAULT_EXECUTION_TIMEOUT_MS;
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_EXECUTION_TIMEOUT_MS) {
		throw new Error(`timeoutMs must be greater than 0 and at most ${MAX_EXECUTION_TIMEOUT_MS}, got ${timeoutMs}.`);
	}
	return timeoutMs;
}

async function runWithTimeout<T>(task: Promise<T>, timeoutMs: number, phase: string, onTimeout: () => void): Promise<T> {
	let timer: NodeJS.Timeout | undefined;
	try {
		return await Promise.race([
			task,
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new AutomationTimeoutError(timeoutMs, phase)), timeoutMs);
			})
		]);
	} catch (error) {
		if (error instanceof AutomationTimeoutError) {
			onTimeout();
			void task.catch(() => { });
		}
		throw error;
	} finally {
		if (timer) {
			clearTimeout(timer);
		}
	}
}

async function runPhase(fn: AutomationFunction, context: IAutomationExecutionContext, timeoutMs: number, phase: string, actionResult?: unknown): Promise<IAutomationPhaseResult> {
	const start = performance.now();
	try {
		const value = await runWithTimeout(
			Promise.resolve(fn(context, actionResult)),
			timeoutMs,
			phase,
			() => context.onTimeout?.()
		);
		return { ok: true, durationMs: Math.round(performance.now() - start), value };
	} catch (error) {
		return { ok: false, durationMs: Math.round(performance.now() - start), error: errorDetails(error) };
	}
}

function assertSerializable(value: unknown, label: string): void {
	try {
		JSON.stringify(value);
	} catch (error) {
		throw new Error(`${label} returned a value that cannot be serialized as JSON: ${error instanceof Error ? error.message : error}`);
	}
}

export async function executeAutomationRequest(request: IAutomationRequest, context: IAutomationExecutionContext, queuedAt = performance.now()): Promise<IAutomationResponse> {
	const startedAt = performance.now();
	const id = request.id ?? randomUUID();
	const timeoutMs = executionTimeout(request.timeoutMs);
	let action: IAutomationPhaseResult;
	try {
		const actionFunction = compileAutomationFunction(request.code, `automation-action-${id}`);
		action = await runPhase(actionFunction, context, timeoutMs, 'Action');
		if (action.ok) {
			assertSerializable(action.value, 'Action');
		}
	} catch (error) {
		action = { ok: false, durationMs: Math.round(performance.now() - startedAt), error: errorDetails(error) };
	}

	let verification: IAutomationPhaseResult | undefined;
	if (action.ok && request.verify !== undefined) {
		try {
			const verificationFunction = compileAutomationFunction(request.verify, `automation-verification-${id}`);
			verification = await runPhase(verificationFunction, context, timeoutMs, 'Verification', action.value);
			if (verification.ok) {
				assertSerializable(verification.value, 'Verification');
			}
		} catch (error) {
			verification = { ok: false, durationMs: 0, error: errorDetails(error) };
		}
	}

	let state: unknown;
	let stateError: IAutomationResponse['stateError'];
	let stateMs = 0;
	if (request.includeState !== false) {
		const stateStartedAt = performance.now();
		try {
			state = await runWithTimeout(
				snapshotApplication(context.page, { maxControlsPerSection: 25 }),
				timeoutMs,
				'Application snapshot',
				() => context.onTimeout?.()
			);
			assertSerializable(state, 'Application snapshot');
		} catch (error) {
			stateError = errorDetails(error);
		}
		stateMs = Math.round(performance.now() - stateStartedAt);
	}

	const completedAt = performance.now();
	const ok = action.ok && (!verification || verification.ok) && !stateError;
	return {
		id,
		ok,
		action,
		verification,
		state,
		stateError,
		timings: {
			queueMs: Math.round(startedAt - queuedAt),
			actionMs: action.durationMs,
			verificationMs: verification?.durationMs ?? 0,
			stateMs,
			totalMs: Math.round(completedAt - queuedAt)
		}
	};
}

function parsePositiveInteger(value: string | undefined, name: string): number {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		throw new Error(`${name} must be a positive integer, got ${JSON.stringify(value)}.`);
	}
	return parsed;
}

function readOption(args: string[], name: string): string | undefined {
	const index = args.indexOf(name);
	if (index < 0) {
		return undefined;
	}
	const value = args[index + 1];
	if (!value || value.startsWith('--')) {
		throw new Error(`${name} requires a value.`);
	}
	return value;
}

function hasOption(args: string[], name: string): boolean {
	return args.includes(name);
}

async function tokenFromArgs(args: string[]): Promise<string> {
	const literal = readOption(args, '--token');
	const tokenFile = readOption(args, '--token-file');
	if ((literal ? 1 : 0) + (tokenFile ? 1 : 0) !== 1) {
		throw new Error('Specify exactly one of --token or --token-file.');
	}
	const token = literal ?? (await readFile(tokenFile!, 'utf8')).trim();
	if (token.length < 32) {
		throw new Error('Automation driver tokens must contain at least 32 characters.');
	}
	return token;
}

function authorized(request: http.IncomingMessage, token: string): boolean {
	const authorization = request.headers.authorization;
	if (!authorization?.startsWith('Bearer ')) {
		return false;
	}
	const provided = Buffer.from(authorization.slice('Bearer '.length));
	const expected = Buffer.from(token);
	return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function sendJson(response: http.ServerResponse, statusCode: number, value: unknown, headers: http.OutgoingHttpHeaders = {}): void {
	const body = JSON.stringify(value);
	response.writeHead(statusCode, {
		'content-type': 'application/json; charset=utf-8',
		'content-length': Buffer.byteLength(body),
		'cache-control': 'no-store',
		...headers
	});
	response.end(body);
}

async function readJsonBody(request: http.IncomingMessage): Promise<unknown> {
	const chunks: Buffer[] = [];
	let size = 0;
	for await (const chunk of request) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		size += buffer.length;
		if (size > MAX_REQUEST_BYTES) {
			throw new Error(`Request exceeds the ${MAX_REQUEST_BYTES}-byte limit.`);
		}
		chunks.push(buffer);
	}
	const body = Buffer.concat(chunks).toString('utf8');
	return JSON.parse(body);
}

function isAutomationRequest(value: unknown): value is IAutomationRequest {
	return !!value && typeof value === 'object' && typeof (value as { code?: unknown }).code === 'string';
}

async function serve(options: IServeOptions): Promise<void> {
	let session = await attach(options.cdpPort, {
		window: options.window,
		repoRoot: options.repoRoot,
		logsPath: options.logsPath,
		timeoutMs: DEFAULT_EXECUTION_TIMEOUT_MS
	});
	let executionTail = Promise.resolve();
	let closing = false;
	let sessionStale = false;

	const closeServer = (): void => {
		server.close();
		server.closeAllConnections();
	};

	const watchSession = (watchedSession: IAttachedSession): void => {
		watchedSession.browser.once('disconnected', () => {
			if (!closing && !sessionStale && watchedSession === session) {
				closeServer();
			}
		});
	};

	const contextFor = (): IAutomationExecutionContext => ({
		session,
		browser: session.browser,
		page: session.page,
		code: session.code,
		workbench: session.workbench,
		snapshot: snapshotOptions => snapshotApplication(session.page, snapshotOptions),
		settle: settleOptions => settleUI(session.page, settleOptions),
		collectVirtualized,
		safeClick,
		onTimeout: () => {
			sessionStale = true;
			void session.detach().catch(() => { });
		}
	});

	const ensureAttached = async (): Promise<void> => {
		if (!sessionStale && !session.page.isClosed()) {
			return;
		}
		const staleSession = session;
		session = await attach(options.cdpPort, {
			window: options.window,
			repoRoot: options.repoRoot,
			logsPath: options.logsPath,
			timeoutMs: DEFAULT_EXECUTION_TIMEOUT_MS
		});
		sessionStale = false;
		watchSession(session);
		void staleSession.detach().catch(() => { });
	};

	const server = http.createServer(async (request, response) => {
		try {
			if (request.method === 'GET' && request.url === '/health') {
				sendJson(response, 200, { ok: true, pid: process.pid });
				return;
			}
			if (!authorized(request, options.token)) {
				sendJson(response, 401, { ok: false, error: 'Unauthorized' });
				return;
			}
			if (request.method === 'POST' && request.url === '/shutdown') {
				closing = true;
				sendJson(response, 200, { ok: true }, { connection: 'close' });
				await executionTail.catch(() => { });
				await session.detach();
				closeServer();
				return;
			}
			if (request.method !== 'POST' || request.url !== '/execute') {
				sendJson(response, 404, { ok: false, error: 'Not found' });
				return;
			}

			const body = await readJsonBody(request);
			if (!isAutomationRequest(body)) {
				sendJson(response, 400, { ok: false, error: 'Request must contain a string `code` function expression.' });
				return;
			}

			const queuedAt = performance.now();
			const execution = executionTail.then(async () => {
				await ensureAttached();
				return executeAutomationRequest(body, contextFor(), queuedAt);
			});
			executionTail = execution.then(() => undefined, () => undefined);
			const result = await execution;
			sendJson(response, result.ok ? 200 : 422, result);
		} catch (error) {
			sendJson(response, 500, { ok: false, error: errorDetails(error) });
		}
	});
	watchSession(session);

	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(options.port, '127.0.0.1', () => resolve());
	});
	console.error(`[automation-driver] ready at http://127.0.0.1:${options.port} (pid ${process.pid})`);

	await new Promise<void>(resolve => server.once('close', resolve));
	if (!closing) {
		await session.detach().catch(() => { });
	}
}

async function executeFromCli(args: string[]): Promise<void> {
	const port = parsePositiveInteger(readOption(args, '--port'), '--port');
	const token = await tokenFromArgs(args);
	const codeFile = readOption(args, '--file');
	const literalCode = readOption(args, '--code');
	if ((codeFile ? 1 : 0) + (literalCode ? 1 : 0) !== 1) {
		throw new Error('Specify exactly one of --file or --code.');
	}
	const verifyFile = readOption(args, '--verify-file');
	const verifyCode = readOption(args, '--verify-code');
	if (verifyFile && verifyCode) {
		throw new Error('Specify at most one of --verify-file or --verify-code.');
	}
	const request: IAutomationRequest = {
		id: readOption(args, '--id'),
		code: literalCode ?? await readFile(codeFile!, 'utf8'),
		verify: verifyCode ?? (verifyFile ? await readFile(verifyFile, 'utf8') : undefined),
		timeoutMs: readOption(args, '--timeout-ms') ? parsePositiveInteger(readOption(args, '--timeout-ms'), '--timeout-ms') : undefined,
		includeState: !hasOption(args, '--no-state')
	};
	const response = await fetch(`http://127.0.0.1:${port}/execute`, {
		method: 'POST',
		headers: {
			authorization: `Bearer ${token}`,
			'content-type': 'application/json'
		},
		body: JSON.stringify(request)
	});
	const text = await response.text();
	process.stdout.write(`${text}\n`);
	if (!response.ok) {
		process.exitCode = 1;
	}
}

function usage(): never {
	console.error(
		'Usage:\n' +
		'  automationDriver.ts serve --cdp-port <port> --port <port> --token-file <path> --repo <path> [--window workbench|agents|any] [--logs-path <path>]\n' +
		'  automationDriver.ts exec --port <port> --token-file <path> (--file <path> | --code <function>) [--verify-file <path> | --verify-code <function>] [--timeout-ms <ms>] [--no-state]'
	);
	process.exit(2);
}

async function main(): Promise<void> {
	const [command, ...args] = process.argv.slice(2);
	if (command === 'serve') {
		const windowKind = readOption(args, '--window') ?? 'any';
		if (!['workbench', 'agents', 'any'].includes(windowKind)) {
			throw new Error(`--window must be workbench, agents, or any; got ${JSON.stringify(windowKind)}.`);
		}
		await serve({
			cdpPort: parsePositiveInteger(readOption(args, '--cdp-port'), '--cdp-port'),
			port: parsePositiveInteger(readOption(args, '--port'), '--port'),
			token: await tokenFromArgs(args),
			repoRoot: readOption(args, '--repo') ?? process.cwd(),
			window: windowKind as IServeOptions['window'],
			logsPath: readOption(args, '--logs-path')
		});
		return;
	}
	if (command === 'exec') {
		await executeFromCli(args);
		return;
	}
	usage();
}

if (process.argv[1] && resolvePath(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch(error => {
		console.error(`[automation-driver] ${error instanceof Error ? error.stack ?? error.message : error}`);
		process.exit(1);
	});
}
