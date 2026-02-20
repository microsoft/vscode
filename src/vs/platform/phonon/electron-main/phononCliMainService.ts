/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import {
	IPhononCliService,
	IPhononCliTextEvent,
	IPhononCliCompleteEvent,
} from '../common/phononCliService.js';

export const IPhononCliMainService = createDecorator<IPhononCliMainService>('phononCliMainService');

export interface IPhononCliMainService extends IPhononCliService { }

interface IRunningRequest {
	readonly process: cp.ChildProcess;
	buffer: string;
	completed: boolean;
}

export class PhononCliMainService extends Disposable implements IPhononCliMainService {

	declare readonly _serviceBrand: undefined;

	private readonly _requests = new Map<string, IRunningRequest>();

	private readonly _onDidReceiveText = this._register(new Emitter<IPhononCliTextEvent>());
	readonly onDidReceiveText: Event<IPhononCliTextEvent> = this._onDidReceiveText.event;

	private readonly _onDidComplete = this._register(new Emitter<IPhononCliCompleteEvent>());
	readonly onDidComplete: Event<IPhononCliCompleteEvent> = this._onDidComplete.event;

	constructor(
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	async isAvailable(): Promise<boolean> {
		try {
			const result = cp.execSync('which claude', { encoding: 'utf8', timeout: 5000 }).trim();
			return !!result;
		} catch {
			return false;
		}
	}

	async sendPrompt(
		requestId: string,
		prompt: string,
		model: string,
		systemPrompt: string,
		maxTokens: number,
	): Promise<void> {
		if (this._requests.has(requestId)) {
			throw new Error(`Request ${requestId} is already running`);
		}

		const args = [
			'-p', prompt,
			'--output-format', 'stream-json',
			'--verbose',
			'--include-partial-messages',
			'--model', model,
		];

		if (systemPrompt) {
			args.push('--append-system-prompt', systemPrompt);
		}

		// Build clean env: remove all CLAUDE_* vars to avoid nesting guard
		// and interference from parent Claude Code session
		const env = { ...process.env };
		for (const key of Object.keys(env)) {
			if (key === 'CLAUDECODE' || key.startsWith('CLAUDE_CODE_')) {
				delete env[key];
			}
		}
		delete env['ANTHROPIC_MODEL'];

		this.logService.info(`[Phonon CLI] Spawning claude with model=${model}, requestId=${requestId}`);

		const child = cp.spawn('claude', args, {
			env,
			stdio: ['pipe', 'pipe', 'pipe'],
		});

		// Close stdin immediately - claude -p reads prompt from args, not stdin.
		// Without this, the process may hang waiting for stdin EOF.
		child.stdin?.end();

		const request: IRunningRequest = { process: child, buffer: '', completed: false };
		this._requests.set(requestId, request);

		child.stdout?.on('data', (data: Buffer) => {
			const chunk = data.toString('utf8');
			this.logService.trace(`[Phonon CLI] stdout chunk (${requestId}): ${chunk.substring(0, 200)}`);
			request.buffer += chunk;
			this._processBuffer(requestId, request);
		});

		child.stderr?.on('data', (data: Buffer) => {
			this.logService.warn(`[Phonon CLI] stderr (${requestId}): ${data.toString('utf8')}`);
		});

		child.on('spawn', () => {
			this.logService.info(`[Phonon CLI] Process spawned (${requestId}), pid=${child.pid}`);
		});

		child.on('error', (err) => {
			this.logService.error(`[Phonon CLI] Process error (${requestId}):`, err);
			this._requests.delete(requestId);
			this._onDidComplete.fire({
				requestId,
				error: err.message,
			});
		});

		child.on('close', (code) => {
			this.logService.info(`[Phonon CLI] Process closed (${requestId}), code=${code}, completed=${request.completed}, remainingBuffer=${request.buffer.length} chars`);
			// Process any remaining buffer
			if (request.buffer.trim()) {
				this._processBuffer(requestId, request);
			}

			this._requests.delete(requestId);

			// Only fire complete if the result message didn't already fire it
			if (!request.completed) {
				if (code !== 0 && code !== null) {
					this._onDidComplete.fire({
						requestId,
						error: `claude process exited with code ${code}`,
					});
				} else {
					this._onDidComplete.fire({ requestId });
				}
			}
		});
	}

	async cancelRequest(requestId: string): Promise<void> {
		const request = this._requests.get(requestId);
		if (request) {
			request.process.kill('SIGTERM');
			this._requests.delete(requestId);
			this._onDidComplete.fire({
				requestId,
				error: 'Request cancelled',
			});
		}
	}

	private _processBuffer(requestId: string, request: IRunningRequest): void {
		const lines = request.buffer.split('\n');
		// Keep the last incomplete line in the buffer
		request.buffer = lines.pop() || '';

		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) {
				continue;
			}

			try {
				const msg = JSON.parse(trimmed);
				this._handleStreamMessage(requestId, msg);
			} catch {
				this.logService.trace(`[Phonon CLI] Non-JSON line (${requestId}): ${trimmed}`);
			}
		}
	}

	private _handleStreamMessage(requestId: string, msg: Record<string, unknown>): void {
		switch (msg.type) {
			case 'assistant': {
				// Complete assistant turn - text already delivered via stream_event deltas.
				// Skip to avoid duplicating text in the UI.
				break;
			}

			case 'stream_event': {
				// Token-by-token streaming (when --verbose is used)
				const event = msg.event as { type?: string; delta?: { type?: string; text?: string } } | undefined;
				if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta.text) {
					this._onDidReceiveText.fire({ requestId, text: event.delta.text });
				}
				break;
			}

			case 'result': {
				// Mark as completed so close handler doesn't double-fire
				const req = this._requests.get(requestId);
				if (req) { req.completed = true; }

				const subtype = msg.subtype as string | undefined;
				if (subtype === 'success') {
					this._onDidComplete.fire({
						requestId,
						result: msg.result as string | undefined,
						costUsd: msg.total_cost_usd as number | undefined,
						numTurns: msg.num_turns as number | undefined,
					});
				} else {
					const errors = msg.errors as string[] | undefined;
					this._onDidComplete.fire({
						requestId,
						error: errors?.join('; ') || `Request failed (${subtype})`,
						costUsd: msg.total_cost_usd as number | undefined,
					});
				}
				break;
			}

			case 'system': {
				// Init message - log useful info
				if (msg.subtype === 'init') {
					this.logService.info(`[Phonon CLI] Session ${msg.session_id}, model=${msg.model}`);
				}
				break;
			}
		}
	}

	override dispose(): void {
		// Kill all running processes
		for (const [requestId, request] of this._requests) {
			request.process.kill('SIGTERM');
			this.logService.info(`[Phonon CLI] Killed process for request ${requestId}`);
		}
		this._requests.clear();
		super.dispose();
	}
}
