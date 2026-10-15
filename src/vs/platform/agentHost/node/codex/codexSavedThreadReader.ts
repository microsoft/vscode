/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';
import { constants, promises as fs } from 'fs';
import { tmpdir } from 'os';
import { raceCancellationError } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { join } from '../../../../base/common/path.js';
import { localize } from '../../../../nls.js';
import type { ILogService } from '../../../log/common/log.js';
import { CodexAppServerClient, type ICodexAppServerClient, transportFromChildProcess } from './codexAppServerClient.js';
import { CodexSavedHistoryStore, resolveCodexSavedHistoryStorage } from './codexSavedHistoryStore.js';
import type { InitializeResponse } from './protocol/generated/InitializeResponse.js';
import type { Thread } from './protocol/generated/v2/Thread.js';
import type { ThreadReadResponse } from './protocol/generated/v2/ThreadReadResponse.js';
import type { ThreadTurnsListResponse } from './protocol/generated/v2/ThreadTurnsListResponse.js';

/** One-shot native decoding; source providers, credentials and executable sessions are never installed. */
export async function readCodexSavedThreadFromDisk(binary: string, threadId: string, userHome: string, logService: ILogService, token: CancellationToken): Promise<Thread> {
	throwIfCancelled(token);
	await fs.access(binary, constants.X_OK);
	const scratch = await fs.mkdtemp(join(tmpdir(), 'vscode-codex-history-'));
	const disposables = new DisposableStore();
	const cancellation = disposables.add(new CancellationTokenSource(token));
	let timedOut = false;
	const timeout = setTimeout(() => { timedOut = true; cancellation.cancel(); }, 30_000);
	try {
		const roots = await resolveCodexSavedHistoryStorage(userHome, cancellation.token);
		const store = await CodexSavedHistoryStore.snapshot(scratch, roots, cancellation.token);
		throwIfCancelled(cancellation.token);
		const args = codexSavedHistoryArguments(scratch);
		const child = spawn(binary, args, { cwd: scratch, env: codexSavedHistoryEnvironment(scratch), stdio: ['pipe', 'pipe', 'pipe'] });
		const closed = new Promise<void>(resolve => child.once('close', () => resolve()));
		const failed = new Promise<never>((_resolve, reject) => child.once('error', reject));
		child.stderr.resume();
		const client = disposables.add(new CodexAppServerClient(transportFromChildProcess(child)));
		try {
			const read = async () => {
				await client.request<'initialize', InitializeResponse>('initialize', {
					clientInfo: { name: 'vscode_saved_history', version: '1', title: 'VS Code saved history' },
					capabilities: { experimentalApi: true, requestAttestation: false, explicitGatewayOauth: true },
				});
				throwIfCancelled(cancellation.token);
				client.notify('initialized', undefined as never);
				const thread = await readCodexSavedThread(client, threadId, cancellation.token, thread => store.validate(thread, cancellation.token));
				await store.validateUnchanged(thread, cancellation.token);
				return { ...thread, path: thread.path ? await fs.realpath(thread.path) : null };
			};
			return await raceCancellationError(Promise.race([read(), failed]), cancellation.token);
		} finally {
			client.dispose();
			await closed;
		}
	} catch (error) {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		if (timedOut && !token.isCancellationRequested) {
			throw new Error(localize('codex.savedChat.timedOut', "Reading the saved Codex transcript timed out."));
		}
		throw error;
	} finally {
		clearTimeout(timeout);
		disposables.dispose();
		try {
			await fs.rm(scratch, { recursive: true, force: true });
		} catch (error) {
			logService.warn('[Codex saved history] Failed to remove temporary reader data', error);
		}
	}
}

/** Reads only passive native history methods and requires complete, forward-progressing pages. */
export async function readCodexSavedThread(
	client: Pick<ICodexAppServerClient, 'request'>,
	threadId: string,
	token: CancellationToken,
	validate: (thread: Thread) => Promise<void>,
): Promise<Thread> {
	throwIfCancelled(token);
	let { thread } = await raceCancellationError(client.request<'thread/read', ThreadReadResponse>('thread/read', { threadId, includeTurns: false }), token);
	if (thread.id !== threadId || thread.ephemeral || thread.status.type !== 'notLoaded') {
		throw new Error(localize('codex.savedChat.unexpectedThread', "The Codex history reader returned an unexpected thread."));
	}
	await validate(thread);
	throwIfCancelled(token);
	if (thread.historyMode === 'legacy') {
		const history = await raceCancellationError(client.request<'thread/read', ThreadReadResponse>('thread/read', { threadId, includeTurns: true }), token);
		if (history.thread.id !== threadId || history.thread.path !== thread.path || history.thread.historyMode !== 'legacy') {
			throw new Error(localize('codex.savedChat.changedThread', "The saved Codex transcript changed while it was being read. Try again."));
		}
		thread = history.thread;
	} else {
		const turns: Thread['turns'] = [];
		const seenCursors = new Set<string>();
		const seenTurns = new Set<string>();
		let cursor: string | null = null;
		do {
			throwIfCancelled(token);
			const page: ThreadTurnsListResponse = await raceCancellationError(client.request<'thread/turns/list', ThreadTurnsListResponse>('thread/turns/list', {
				threadId, cursor, sortDirection: 'asc', itemsView: 'full', limit: 100,
			}), token);
			for (const turn of page.data) {
				if (turn.itemsView !== 'full' || seenTurns.has(turn.id)) {
					throw incompleteHistory();
				}
				seenTurns.add(turn.id);
				turns.push(turn);
			}
			if (page.nextCursor !== null) {
				if (page.data.length === 0 || seenCursors.has(page.nextCursor)) {
					throw incompleteHistory();
				}
				seenCursors.add(page.nextCursor);
			}
			cursor = page.nextCursor;
		} while (cursor !== null);
		thread = { ...thread, turns };
	}
	throwIfCancelled(token);
	return thread;
}

export function codexSavedHistoryArguments(scratch: string): string[] {
	const config = [
		`sqlite_home=${JSON.stringify(scratch)}`,
		'cli_auth_credentials_store="ephemeral"',
		'analytics.enabled=false', 'feedback.enabled=false',
		'otel.exporter="none"', 'otel.trace_exporter="none"', 'otel.metrics_exporter="none"',
		'model_provider="vscode-saved-history"',
		'model_providers.vscode-saved-history={name="Saved history",base_url="http://127.0.0.1:1",wire_api="responses",requires_openai_auth=false}',
		...['plugins', 'api_key_model_discovery', 'background_paginated_rollout_migration', 'local_thread_store_compression', 'hooks', 'shell_snapshot'].map(feature => `features.${feature}=false`),
	];
	return ['app-server', ...config.flatMap(value => ['-c', value])];
}

export function codexSavedHistoryEnvironment(scratch: string): NodeJS.ProcessEnv {
	return {
		CODEX_HOME: scratch, CODEX_SQLITE_HOME: scratch, CODEX_INTERNAL_APP_SERVER_REMOTE_CONTROL_DISABLED: '1',
		HOME: scratch, USERPROFILE: scratch, TMPDIR: scratch, TMP: scratch, TEMP: scratch,
		...(process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot, ProgramData: process.env.ProgramData } : {}),
	};
}

function incompleteHistory(): Error {
	return new Error(localize('codex.savedChat.incompleteHistory', "The saved Codex transcript is incomplete and could not be read."));
}

function throwIfCancelled(token: CancellationToken): void {
	if (token.isCancellationRequested) {
		throw new CancellationError();
	}
}
