/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IntervalTimer, TimeoutTimer } from '../../../base/common/async.js';
import { getErrorCode } from '../../../base/common/errors.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { packErrorForTelemetry } from '../../telemetry/common/errorTelemetry.js';

/**
 * Electron's classification of an agent host termination, or `none` when
 * Electron reported no crash or kill for the process.
 */
export type AgentHostProcessExitReason = 'none' | 'clean-exit' | 'abnormal-exit' | 'killed' | 'crashed' | 'oom' | 'launch-failed' | 'integrity-failure' | 'memory-eviction' | 'other';

/** The most specific fatal condition recognized in the agent host's final stderr output. */
export type AgentHostFatalSignature = 'none' | 'v8HeapOutOfMemory' | 'v8Fatal' | 'nativeModuleLoad' | 'startupFailure';

/**
 * How the agent host process ended: through `process.exit()`, because its
 * event loop drained, or without running Node's exit handlers, as happens for
 * native crashes and external termination.
 */
export type AgentHostExitPath = 'processExit' | 'eventLoopDrained' | 'abrupt';

/** An agent host startup failure, reported by the host before it exits. */
export interface IAgentHostStartupFailure {
	readonly name?: string;
	readonly code?: string;
	readonly msg: string;
	readonly callstack?: string;
}

/** Diagnostics collected by the parent process about an agent host exit. */
export interface IAgentHostProcessExitDiagnostics {
	readonly reason: AgentHostProcessExitReason;
	/** Milliseconds from process spawn until exit, when the spawn was observed. */
	readonly uptimeMs?: number;
	readonly fatalSignature: AgentHostFatalSignature;
	readonly exitPath: AgentHostExitPath;
	/** The package or VS Code module that called `process.exit()`. */
	readonly exitCaller?: string;
	readonly startupFailure?: IAgentHostStartupFailure;
	/** The working set from the most recent memory sample, in megabytes. */
	readonly workingSetMb?: number;
	/** The largest working set observed by memory samples, in megabytes. */
	readonly peakWorkingSetMb?: number;
	/** Milliseconds between the most recent memory sample and the exit. */
	readonly memorySampleAgeMs?: number;
}

/** An agent host process exit, with diagnostics when the starter collects them. */
export interface IAgentHostProcessExitEvent {
	readonly code: number;
	readonly signal: string;
	readonly diagnostics?: IAgentHostProcessExitDiagnostics;
}

const startupFailureMarker = '[agentHost:startupFailure] ';
const exitMarker = '[agentHost:exit] ';
const maxMessageLength = 1000;
const maxCallstackLength = 8000;
const maxCallerLength = 100;
/** A package name such as `koffi` or `@scope:name`, or a module file name. */
const exitCallerPattern = /^(?:@[\w.-]+:)?[\w.-]+$/;

/** Prefix of the stderr line an agent host writes while running Node's exit handlers. */
export const AgentHostExitMarker = exitMarker.trim();

/** Formats the stderr line an agent host writes before exiting because startup failed. */
export function formatAgentHostStartupFailure(error: unknown): string {
	const { msg, callstack } = packErrorForTelemetry(error);
	const failure: IAgentHostStartupFailure = {
		name: error instanceof Error ? error.name : undefined,
		code: getErrorCode(error),
		msg: msg.slice(0, maxMessageLength),
		callstack: callstack?.slice(0, maxCallstackLength),
	};
	return `${startupFailureMarker}${JSON.stringify(failure)}\n`;
}

/** Formats the stderr line an agent host writes while running Node's exit handlers. */
export function formatAgentHostExit(path: Exclude<AgentHostExitPath, 'abrupt'>, caller: string | undefined): string {
	return `${exitMarker}${JSON.stringify({ path, caller })}\n`;
}

/**
 * Reduces the first frame of `stack` to a bounded module identifier: the
 * containing package in `node_modules` or the packaged `node_modules.asar`, the
 * module name of a file in VS Code's installation at `appRoot`, `node` for Node
 * internals, or `external` for any other file, whose name may be user-chosen.
 * Paths never leave the process. Scoped packages are written as `@scope:name`,
 * because telemetry cleaning redacts values containing `/` as file paths.
 */
export function identifyAgentHostExitCaller(stack: string | undefined, appRoot: string): string {
	const frame = stack?.split('\n').find(line => line.trimStart().startsWith('at '));
	const location = frame ? /(?:\((?<parenthesized>[^()]+?):\d+:\d+\)|at (?<bare>[^()\s]+?):\d+:\d+)\s*$/.exec(frame)?.groups : undefined;
	const rawPath = location?.parenthesized ?? location?.bare;
	if (!rawPath) {
		return 'unknown';
	}
	if (rawPath.startsWith('node:')) {
		return 'node';
	}

	const path = normalizeCallerPath(rawPath);
	const packagePath = [...path.matchAll(/\/node_modules(?:\.asar(?:\.unpacked)?)?\//g)].at(-1);
	let caller: string;
	if (packagePath?.index !== undefined) {
		const segments = path.slice(packagePath.index + packagePath[0].length).split('/');
		caller = segments[0].startsWith('@') && segments.length > 1 ? `${segments[0]}:${segments[1]}` : segments[0];
	} else if (path.toLowerCase().startsWith(`${normalizeCallerPath(appRoot).replace(/\/$/, '').toLowerCase()}/`)) {
		caller = path.slice(path.lastIndexOf('/') + 1).replace(/\.[cm]?js$/, '');
	} else {
		return 'external';
	}
	return exitCallerPattern.test(caller) && caller.length <= maxCallerLength ? caller : 'other';
}

function normalizeCallerPath(path: string): string {
	return (path.startsWith('file:') ? URI.parse(path).fsPath : path).replace(/\\/g, '/');
}

/** Diagnostics recognized in the agent host's final stderr output. */
export interface IAgentHostStderrDiagnostics {
	readonly fatalSignature: AgentHostFatalSignature;
	readonly exitPath: AgentHostExitPath;
	readonly exitCaller?: string;
	readonly startupFailure?: IAgentHostStartupFailure;
}

/** Classifies the agent host's final stderr output without retaining it. */
export function parseAgentHostStderr(text: string): IAgentHostStderrDiagnostics {
	let startupFailure: IAgentHostStartupFailure | undefined;
	let exit: { readonly path: Exclude<AgentHostExitPath, 'abrupt'>; readonly caller?: string } | undefined;
	for (const line of text.split(/\r?\n/)) {
		const startupFailureIndex = line.indexOf(startupFailureMarker);
		if (startupFailureIndex >= 0) {
			startupFailure = parseStartupFailure(line.slice(startupFailureIndex + startupFailureMarker.length)) ?? startupFailure;
			continue;
		}
		const exitIndex = line.indexOf(exitMarker);
		if (exitIndex >= 0) {
			exit = parseExit(line.slice(exitIndex + exitMarker.length)) ?? exit;
		}
	}

	return {
		fatalSignature: classifyFatalSignature(text, startupFailure !== undefined),
		exitPath: exit?.path ?? 'abrupt',
		...(exit?.caller !== undefined ? { exitCaller: exit.caller } : {}),
		...(startupFailure ? { startupFailure } : {}),
	};
}

function classifyFatalSignature(text: string, hasStartupFailure: boolean): AgentHostFatalSignature {
	if (/JavaScript heap out of memory|OOM error in V8|Reached heap limit/.test(text)) {
		return 'v8HeapOutOfMemory';
	}
	if (/Fatal error in V8|FATAL ERROR:|Check failed:/.test(text)) {
		return 'v8Fatal';
	}
	if (/ERR_DLOPEN_FAILED|NODE_MODULE_VERSION|was compiled against a different Node\.js version|GLIBC(?:XX)?_[\d.]+'? not found|cannot open shared object file|Library not loaded|is not a valid Win32 application|The specified (?:module|procedure) could not be found/.test(text)) {
		return 'nativeModuleLoad';
	}
	return hasStartupFailure ? 'startupFailure' : 'none';
}

function parseStartupFailure(json: string): IAgentHostStartupFailure | undefined {
	const value = parseJsonObject(json);
	if (!value || typeof value.msg !== 'string') {
		return undefined;
	}
	return {
		...(typeof value.name === 'string' ? { name: value.name.slice(0, maxCallerLength) } : {}),
		...(typeof value.code === 'string' ? { code: value.code.slice(0, maxCallerLength) } : {}),
		msg: value.msg.slice(0, maxMessageLength),
		...(typeof value.callstack === 'string' ? { callstack: value.callstack.slice(0, maxCallstackLength) } : {}),
	};
}

function parseExit(json: string): { readonly path: Exclude<AgentHostExitPath, 'abrupt'>; readonly caller?: string } | undefined {
	const value = parseJsonObject(json);
	const path = value?.path;
	if (path !== 'processExit' && path !== 'eventLoopDrained') {
		return undefined;
	}
	const caller = typeof value?.caller === 'string' && exitCallerPattern.test(value.caller) && value.caller.length <= maxCallerLength ? value.caller : undefined;
	return { path, ...(caller !== undefined ? { caller } : {}) };
}

function parseJsonObject(json: string): Record<string, unknown> | undefined {
	try {
		const value: unknown = JSON.parse(json);
		return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
	} catch {
		return undefined;
	}
}

function normalizeExitReason(reason: string | undefined): AgentHostProcessExitReason {
	switch (reason) {
		case undefined:
			return 'none';
		case 'clean-exit':
		case 'abnormal-exit':
		case 'killed':
		case 'crashed':
		case 'oom':
		case 'launch-failed':
		case 'integrity-failure':
		case 'memory-eviction':
			return reason;
		default:
			return 'other';
	}
}

/** The process events {@link AgentHostProcessExitDiagnosticsCollector} observes. */
export interface IAgentHostProcessExitDiagnosticsSource {
	readonly onSpawn: Event<number | undefined>;
	readonly onStderr: Event<string>;
	readonly onCrash: Event<{ readonly reason: string }>;
	readonly onExit: Event<{ readonly code: number; readonly signal: string }>;
}

/** A process memory sample, in kilobytes. */
export interface IAgentHostProcessMemorySample {
	readonly workingSetKb: number;
	readonly peakWorkingSetKb?: number;
}

export interface IAgentHostProcessExitDiagnosticsOptions {
	/** How long to wait after exit for Electron's crash reason and final stderr. */
	readonly gracePeriodMs: number;
	readonly memorySampleIntervalMs: number;
	/** How far before exit stderr output is considered part of the exit. */
	readonly stderrWindowMs: number;
	readonly maxStderrLength: number;
}

const defaultDiagnosticsOptions: IAgentHostProcessExitDiagnosticsOptions = {
	gracePeriodMs: 500,
	memorySampleIntervalMs: 60_000,
	stderrWindowMs: 60_000,
	maxStderrLength: 64 * 1024,
};

/**
 * Collects diagnostics about one agent host process and reports its exit
 * after a short grace period, because Electron's crash reason and the
 * process's final stderr output can arrive after the exit event.
 */
export class AgentHostProcessExitDiagnosticsCollector extends Disposable {

	private readonly _onDidExit = this._register(new Emitter<IAgentHostProcessExitEvent>());
	readonly onDidExit = this._onDidExit.event;

	private readonly _memoryTimer = this._register(new IntervalTimer());
	private readonly _exitTimer = this._register(new TimeoutTimer());
	private readonly _stderr: { readonly time: number; readonly text: string }[] = [];
	private _stderrLength = 0;
	private _spawnTime: number | undefined;
	private _crashReason: string | undefined;
	private _lastMemorySample: { readonly time: number; readonly workingSetKb: number } | undefined;
	private _peakWorkingSetKb = 0;

	constructor(
		source: IAgentHostProcessExitDiagnosticsSource,
		private readonly _sampleMemory: (pid: number) => IAgentHostProcessMemorySample | undefined,
		private readonly _options: IAgentHostProcessExitDiagnosticsOptions = defaultDiagnosticsOptions,
	) {
		super();
		this._register(source.onSpawn(pid => this._handleSpawn(pid)));
		this._register(source.onStderr(text => this._recordStderr(text)));
		this._register(source.onCrash(e => this._crashReason = e.reason));
		this._register(source.onExit(e => this._handleExit(e)));
	}

	private _handleSpawn(pid: number | undefined): void {
		this._spawnTime = Date.now();
		if (pid !== undefined) {
			this._memoryTimer.cancelAndSet(() => this._recordMemory(pid), this._options.memorySampleIntervalMs);
		}
	}

	private _recordStderr(text: string): void {
		const retained = text.slice(-this._options.maxStderrLength);
		this._stderr.push({ time: Date.now(), text: retained });
		this._stderrLength += retained.length;
		while (this._stderrLength > this._options.maxStderrLength && this._stderr.length > 1) {
			this._stderrLength -= this._stderr.shift()!.text.length;
		}
	}

	private _recordMemory(pid: number): void {
		let sample: IAgentHostProcessMemorySample | undefined;
		try {
			sample = this._sampleMemory(pid);
		} catch {
			return;
		}
		if (!sample) {
			return;
		}
		this._lastMemorySample = { time: Date.now(), workingSetKb: sample.workingSetKb };
		this._peakWorkingSetKb = Math.max(this._peakWorkingSetKb, sample.workingSetKb, sample.peakWorkingSetKb ?? 0);
	}

	private _handleExit(e: { readonly code: number; readonly signal: string }): void {
		const exitTime = Date.now();
		this._memoryTimer.cancel();
		this._exitTimer.cancelAndSet(() => this._onDidExit.fire({
			code: e.code,
			signal: e.signal,
			diagnostics: this._createDiagnostics(exitTime),
		}), this._options.gracePeriodMs);
	}

	private _createDiagnostics(exitTime: number): IAgentHostProcessExitDiagnostics {
		const recentStderr = this._stderr
			.filter(chunk => chunk.time >= exitTime - this._options.stderrWindowMs)
			.map(chunk => chunk.text)
			.join('');
		const memorySample = this._lastMemorySample;
		return {
			reason: normalizeExitReason(this._crashReason),
			...(this._spawnTime !== undefined ? { uptimeMs: Math.max(0, exitTime - this._spawnTime) } : {}),
			...parseAgentHostStderr(recentStderr),
			...(memorySample ? {
				workingSetMb: Math.round(memorySample.workingSetKb / 1024),
				peakWorkingSetMb: Math.round(this._peakWorkingSetKb / 1024),
				memorySampleAgeMs: Math.max(0, exitTime - memorySample.time),
			} : {}),
		};
	}
}
