/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IDisposable } from '../../../../../base/common/lifecycle.js';
import type { ILongLivedProcess, ILongLivedProcessExit, ILongLivedProcessOptions, ILongLivedProcessSpawner, IProcessControl, IProcessInfo } from '../../../node/copilot/localModelBridge/shim/processRunner.js';
import type { FakeClock } from './fakeServingAccess.js';

class Listeners {
	private readonly _listeners = new Set<(chunk: string) => void>();
	add(listener: (chunk: string) => void): IDisposable {
		this._listeners.add(listener);
		return { dispose: () => this._listeners.delete(listener) };
	}
	fire(chunk: string): void {
		this._listeners.forEach(listener => listener(chunk));
	}
}

/** A fake `llama-server` child. */
export class FakeLlamaProcess implements ILongLivedProcess {
	readonly exited: Promise<ILongLivedProcessExit>;
	readonly kills: string[] = [];
	hasExited = false;
	private _resolve!: (exit: ILongLivedProcessExit) => void;
	private readonly _stdout = new Listeners();
	private readonly _stderr = new Listeners();

	constructor(readonly pid: number | undefined, readonly file: string, readonly args: readonly string[], readonly options: ILongLivedProcessOptions, readonly spawnedAt: number) {
		this.exited = new Promise(resolve => this._resolve = resolve);
	}

	get port(): number {
		return Number(this.args[this.args.indexOf('--port') + 1]);
	}

	/** The key `--api-key` sets, or else `LLAMA_API_KEY` unless the build ignores it ({@link ignoresApiKeyEnv}); `undefined` serves without a key. */
	get apiKey(): string | undefined {
		const index = this.args.indexOf('--api-key');
		if (index >= 0) {
			return this.args[index + 1];
		}
		return this.ignoresApiKeyEnv ? undefined : this.options.env.LLAMA_API_KEY;
	}

	/** Like a build without the environment form of `--api-key`. */
	ignoresApiKeyEnv = false;

	arg(flag: string): string | undefined {
		const index = this.args.indexOf(flag);
		return index >= 0 ? this.args[index + 1] : undefined;
	}

	onStdout(listener: (chunk: string) => void): IDisposable {
		return this._stdout.add(listener);
	}

	onStderr(listener: (chunk: string) => void): IDisposable {
		return this._stderr.add(listener);
	}

	kill(signal: 'SIGTERM' | 'SIGKILL'): boolean {
		this.kills.push(signal);
		if (!this.survivesKill) {
			this.exit(undefined, signal);
		}
		return !this.survivesKill;
	}

	/** Ignores every kill (a process that termination cannot stop). */
	survivesKill = false;

	/** The termination command succeeds, but the process exits this long (real time) later, like a large model releasing its memory on Windows. */
	exitDelayMs: number | undefined;

	writeStderr(text: string): void {
		this._stderr.fire(text);
	}

	exit(exitCode: number | undefined, signal?: string, spawnErrorCode?: string): void {
		if (!this.hasExited) {
			this.hasExited = true;
			this._resolve({ exitCode, signal, ...(spawnErrorCode ? { spawnErrorCode } : {}) });
		}
	}
}

/** Records spawns; `behavior` runs after the supervisor attached its listeners. */
export class FakeLlamaSpawner implements ILongLivedProcessSpawner {
	readonly processes: FakeLlamaProcess[] = [];
	nextPid = 4000;
	/** How long each spawn takes on the clock (the process starts at its end). */
	spawnMs = 0;
	/** Spawned processes act like a build without the environment form of `--api-key`. */
	ignoresApiKeyEnv = false;
	behavior: (process: FakeLlamaProcess, index: number) => void = () => { };

	constructor(private readonly _clock: FakeClock) { }

	spawn(file: string, args: readonly string[], options: ILongLivedProcessOptions): ILongLivedProcess {
		this._clock.advance(this.spawnMs);
		const process = new FakeLlamaProcess(this.nextPid++, file, args, options, this._clock.now());
		process.ignoresApiKeyEnv = this.ignoresApiKeyEnv;
		const index = this.processes.length;
		this.processes.push(process);
		setImmediate(() => this.behavior(process, index));
		return process;
	}

	get running(): FakeLlamaProcess | undefined {
		return this.processes.find(process => !process.hasExited);
	}
}

/** Process control over the fake processes plus extra, pre-existing pids. */
export class FakeProcessControl implements IProcessControl {
	readonly terminated: number[] = [];
	/** Processes not spawned by the fake spawner (orphans, reused pids). */
	readonly others = new Map<number, IProcessInfo>();

	constructor(private readonly _spawner: FakeLlamaSpawner) { }

	async inspect(pid: number): Promise<IProcessInfo | undefined> {
		const process = this._spawner.processes.find(candidate => candidate.pid === pid && !candidate.hasExited);
		if (process) {
			return { startTime: process.spawnedAt, imagePath: process.file };
		}
		return this.others.get(pid);
	}

	async terminateTree(pid: number): Promise<boolean> {
		this.terminated.push(pid);
		const process = this._spawner.processes.find(candidate => candidate.pid === pid);
		if (this.failing.has(pid) || process?.survivesKill) {
			// The termination command fails and the process keeps running.
			return false;
		}
		this.others.delete(pid);
		if (process?.exitDelayMs !== undefined) {
			const terminated = process;
			setTimeout(() => terminated.exit(undefined, 'SIGTERM'), terminated.exitDelayMs);
			return true;
		}
		process?.exit(undefined, 'SIGTERM');
		return true;
	}

	/** Pids whose termination fails (they keep running). */
	readonly failing = new Set<number>();
}

/** How the fake server answers. */
export interface IFakeLlamaServerOptions {
	nCtx: number;
	totalSlots: number;
	decodeTps: number;
	/** Advanced on the fake clock before the warm-up's first token. */
	ttftMs: number;
	/** `/health` answers 503 while true (per process when a function). */
	loading: boolean | ((process: FakeLlamaProcess) => boolean);
	/** Runs when a chat completion (the warm-up) arrives; the process may exit here. */
	onChatCompletion?: (process: FakeLlamaProcess) => void;
	/** A `/props` request without the key fails like a dropped connection when this returns true. */
	failAnonymousProps?: (process: FakeLlamaProcess) => boolean;
}

/** A loopback fetch that emulates `llama-server` for the fake processes (`/health`, `/props`, chat completions). */
export function createFakeLlamaFetch(spawner: FakeLlamaSpawner, clock: FakeClock, options: IFakeLlamaServerOptions, requests: string[] = []): (input: string | Request, init?: RequestInit) => Promise<Response> {
	return async (input, init) => {
		const url = new URL(typeof input === 'string' ? input : input.url);
		const process = spawner.processes.find(candidate => !candidate.hasExited && candidate.port === Number(url.port));
		if (!process || url.hostname !== '127.0.0.1') {
			throw new TypeError('fetch failed');
		}
		requests.push(url.pathname);
		const headers = new Headers(init?.headers ?? (typeof input === 'string' ? undefined : input.headers));
		if (url.pathname === '/health') {
			const loading = typeof options.loading === 'function' ? options.loading(process) : options.loading;
			return new Response(JSON.stringify({ status: loading ? 'loading' : 'ok' }), { status: loading ? 503 : 200 });
		}
		if (url.pathname === '/props' && !headers.has('authorization') && options.failAnonymousProps?.(process)) {
			throw new TypeError('fetch failed');
		}
		if (process.apiKey !== undefined && headers.get('authorization') !== `Bearer ${process.apiKey}`) {
			return new Response('{"error":"unauthorized"}', { status: 401 });
		}
		if (url.pathname === '/props') {
			return new Response(JSON.stringify({ default_generation_settings: { n_ctx: options.nCtx }, total_slots: options.totalSlots }), { status: 200 });
		}
		if (url.pathname === '/v1/chat/completions') {
			options.onChatCompletion?.(process);
			if (process.hasExited) {
				throw new TypeError('fetch failed');
			}
			clock.advance(options.ttftMs);
			const events = [
				...['Hello', ' there', '!'].map(content => ({ choices: [{ delta: { content } }] })),
				{ choices: [{ delta: {}, finish_reason: 'stop' }], timings: { predicted_per_second: options.decodeTps } },
			];
			const body = events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n';
			return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
		}
		return new Response('{}', { status: 404 });
	};
}
