/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { appendFileSync, closeSync, openSync, readSync, fstatSync } from 'fs';
import { INativeCliLifecycleEvent, sanitizeNativeCliTitle } from '../common/nativeCliLifecycle.js';
import { isUUID } from '../../../base/common/uuid.js';
import { basename, isAbsolute } from '../../../base/common/path.js';

/** Hook names the shim accepts; the single source of truth for both ends of the contract. */
export const NATIVE_CLI_HOOK_EVENTS = ['start', 'prompt', 'stop', 'input', 'end', 'working', 'error', 'cwd'] as const;
export type NativeCliHookEvent = typeof NATIVE_CLI_HOOK_EVENTS[number];

export function isNativeCliHookEvent(value: string | undefined): value is NativeCliHookEvent {
	return (NATIVE_CLI_HOOK_EVENTS as readonly string[]).includes(value ?? '');
}

export function normalizeNativeCliHook(event: NativeCliHookEvent, value: unknown): INativeCliLifecycleEvent | undefined {
	if (!value || typeof value !== 'object') {
		return undefined;
	}
	const input = value as { session_id?: string; sessionId?: string; cwd?: string; prompt?: string; agent_id?: string; parent_tool_call_id?: string; new_cwd?: string; session_title?: string; source?: string; notification_type?: string; transcript_path?: string };
	const sessionId = input.session_id ?? input.sessionId;
	if (typeof sessionId !== 'string' || !isUUID(sessionId) || typeof input.cwd !== 'string' || !isAbsolute(input.cwd) || input.agent_id || input.parent_tool_call_id) {
		return undefined;
	}
	if (event === 'input' && input.notification_type && !['permission_prompt', 'elicitation_dialog', 'idle_prompt'].includes(input.notification_type)) {
		return undefined;
	}
	const rawTitle = input.session_title ?? (event === 'prompt' ? input.prompt : undefined);
	const title = typeof rawTitle === 'string' ? sanitizeNativeCliTitle(rawTitle) : undefined;
	const cwd = typeof input.new_cwd === 'string' && isAbsolute(input.new_cwd) ? input.new_cwd : input.cwd;
	return {
		event: input.notification_type === 'idle_prompt' ? 'stop' : event === 'working' || event === 'error' ? 'activity' : event === 'cwd' ? 'start' : event,
		sessionId, cwd, timestamp: Date.now(),
		...(event === 'working' || event === 'error' ? { activity: event === 'working' ? 'working' as const : 'error' as const } : {}),
		...(typeof input.source === 'string' ? { source: input.source } : {}),
		...(title ? { title } : {}),
	};
}

export function readResumeDirectory(transcript: string, sessionId: string): string | undefined {
	if (!isAbsolute(transcript) || basename(transcript) !== `${sessionId}.jsonl`) {
		return undefined;
	}
	const descriptor = openSync(transcript, 'r');
	try {
		const size = fstatSync(descriptor).size;
		const offset = Math.max(0, size - 262144);
		const buffer = Buffer.alloc(Math.min(size, 262144));
		const length = readSync(descriptor, buffer, 0, buffer.length, offset);
		const lines = buffer.subarray(0, length).toString('utf8').split('\n');
		lines.pop();
		if (offset) {
			lines.shift();
		}
		for (const line of lines.reverse()) {
			if (!line.includes('"cwd"')) {
				continue;
			}
			try {
				const record = JSON.parse(line) as { sessionId?: string; cwd?: string } | null;
				if (record && typeof record === 'object' && record.sessionId === sessionId && typeof record.cwd === 'string' && isAbsolute(record.cwd)) {
					return record.cwd;
				}
			} catch {
				// A record larger than the read window leaves a fragment; keep scanning.
				continue;
			}
		}
	} finally {
		closeSync(descriptor);
	}
	return undefined;
}

if (import.meta.main) {
	const [eventsFile, event, kind] = process.argv.slice(2);
	if (!eventsFile || !isAbsolute(eventsFile) || !isNativeCliHookEvent(event)) {
		throw new Error('Invalid native CLI lifecycle hook arguments');
	}
	let input = '';
	process.stdin.setEncoding('utf8');
	process.stdin.on('data', chunk => {
		input += chunk;
		if (input.length > 1024 * 1024) {
			process.stderr.write('Native CLI lifecycle hook input exceeded its limit.\n');
			process.exit(1);
		}
	});
	process.stdin.on('end', () => {
		try {
			const payload: unknown = JSON.parse(input);
			let normalized = normalizeNativeCliHook(event, payload);
			if (normalized) {
				if (kind === 'claude') {
					const pid = Number(process.env['CLAUDE_PID']);
					if (Number.isSafeInteger(pid) && pid > 0) {
						normalized = { ...normalized, pid };
					}
					if (normalized.source === 'resume' && normalized.event === 'start') {
						let cwd: string | undefined;
						try {
							const transcript = (payload as { transcript_path?: unknown }).transcript_path;
							cwd = typeof transcript === 'string' ? readResumeDirectory(transcript, normalized.sessionId) : undefined;
						} catch (error) {
							process.stderr.write(`Could not resolve resumed CLI directory: ${error instanceof Error ? error.message : String(error)}\n`);
						}
						normalized = { ...normalized, ...(cwd ? { cwd } : {}), cwdConfirmed: !!cwd };
					}
				}
				appendFileSync(eventsFile, `${JSON.stringify(normalized)}\n`, { mode: 0o600 });
			}
		} catch (error) {
			process.stderr.write(`Native CLI lifecycle hook failed: ${error instanceof Error ? error.message : String(error)}\n`);
			process.exitCode = 1;
		}
	});
}
