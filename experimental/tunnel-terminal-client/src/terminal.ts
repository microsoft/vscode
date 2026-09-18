/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { Readable, Writable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import { deadline, maxBufferedBytes, ProtocolClient, record, text } from './wire.js';

export interface TerminalInput extends Readable {
	readonly isTTY?: boolean;
	readonly isRaw?: boolean;
	setRawMode?(mode: boolean): this;
}

export interface TerminalOutput extends Writable {
	readonly isTTY?: boolean;
	readonly columns?: number;
	readonly rows?: number;
}

export interface TerminalOptions {
	cwd?: string;
	input?: TerminalInput;
	output?: TerminalOutput;
	signals?: EventEmitter;
}

export function requireTerminal(input: TerminalInput, output: TerminalOutput): void {
	if (!input.isTTY || !output.isTTY || !input.setRawMode) {
		throw new Error('Run this client in an interactive terminal, such as Windows Terminal. Pipes are not supported.');
	}
}

function sequence(value: unknown): number {
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
		throw new Error('Malformed terminal sequence number.');
	}
	return value;
}

function exitCode(value: unknown): number {
	if (value === undefined) {
		return 1;
	}
	if (typeof value !== 'number' || !Number.isInteger(value)) {
		throw new Error('Malformed terminal exit code.');
	}
	return value;
}

export async function runTerminal(client: ProtocolClient, options: TerminalOptions = {}): Promise<number> {
	const input = options.input ?? process.stdin;
	const output = options.output ?? process.stdout;
	const signals = options.signals ?? process;
	requireTerminal(input, output);
	const clientId = randomUUID();
	const channel = `agenthost-terminal:/${randomUUID()}`;
	const wasRaw = input.isRaw ?? false;
	const wasFlowing = input.readableFlowing === true;
	const decoder = new StringDecoder('utf8');
	let finished = false;
	let creationAttempted = false;
	let creationConfirmed = false;
	let snapshotReady = false;
	let lastSeq = -1;
	let earlyBytes = 0;
	let outputBytes = 0;
	let outputError: Error | undefined;
	const earlyActions: Record<string, unknown>[] = [];
	let drain: (() => void) | undefined;
	let complete!: (code: number) => void;
	let fail!: (error: Error) => void;
	const completion = new Promise<number>((resolve, reject) => { complete = resolve; fail = reject; });
	// Setup can fail before completion is awaited. The rejection is still observed below.
	void completion.catch(() => { });

	const finish = (error?: Error, code = 0): void => {
		if (finished) { return; }
		finished = true;
		input.pause();
		if (error) {
			fail(error);
		} else {
			complete(code);
		}
	};
	const write = (data: string): void => {
		if (outputBytes + Buffer.byteLength(data) > maxBufferedBytes) {
			throw new Error('Terminal output exceeded the buffer limit. The local terminal is too slow.');
		}
		outputBytes += Buffer.byteLength(data);
		output.write(data, error => {
			outputBytes -= Buffer.byteLength(data);
			if (error) {
				outputError = new Error('Unable to write terminal output.');
				finish(outputError);
			}
			if (outputBytes === 0 || outputError) {
				drain?.();
			}
		});
	};
	const handleAction = (envelope: Record<string, unknown>): void => {
		if (finished) { return; }
		if (envelope.rejectionReason !== undefined) {
			throw new Error(`Terminal action rejected: ${text(envelope.rejectionReason, 'action rejection')}`);
		}
		const serverSeq = sequence(envelope.serverSeq);
		if (serverSeq <= lastSeq) { return; }
		lastSeq = serverSeq;
		const action = record(envelope.action, 'terminal action');
		switch (action.type) {
			case 'terminal/data':
				write(text(action.data, 'terminal output'));
				break;
			case 'terminal/exited':
				finish(undefined, exitCode(action.exitCode));
				break;
		}
	};
	const removeNotification = client.onNotification((method, envelope) => {
		if (method !== 'action' || envelope.channel !== channel || finished) { return; }
		try {
			if (!snapshotReady) {
				earlyBytes += Buffer.byteLength(JSON.stringify(envelope));
				if (earlyBytes > maxBufferedBytes) {
					throw new Error('Terminal startup buffer overflow.');
				}
				earlyActions.push(envelope);
			} else {
				handleAction(envelope);
			}
		} catch (error) {
			finish(error instanceof Error ? error : new Error('Invalid terminal notification.'));
		}
	});
	const removeFailure = client.onFailure(error => finish(error));
	const dimensions = (): { cols: number; rows: number } => ({
		cols: Math.max(1, Math.min(65535, output.columns ?? 80)),
		rows: Math.max(1, Math.min(65535, output.rows ?? 24)),
	});
	const onData = (chunk: Buffer | string): void => {
		if (finished) { return; }
		try {
			const value = typeof chunk === 'string' ? chunk : decoder.write(chunk);
			const escape = value.indexOf('\x1d');
			const data = escape < 0 ? value : value.slice(0, escape);
			// Chunk large pastes instead of exceeding the protocol's per-action input limit.
			for (let offset = 0; offset < data.length;) {
				let end = Math.min(offset + 4096, data.length);
				if (end < data.length && /[\uD800-\uDBFF]/.test(data[end - 1])) {
					end--;
				}
				client.dispatch(channel, { type: 'terminal/input', data: data.slice(offset, end) });
				offset = end;
			}
			if (escape >= 0) { finish(); }
		} catch (error) {
			finish(error instanceof Error ? error : new Error('Unable to send terminal input.'));
		}
	};
	const onResize = (): void => {
		if (finished) { return; }
		try {
			client.dispatch(channel, { type: 'terminal/resized', ...dimensions() });
		} catch (error) {
			finish(error instanceof Error ? error : new Error('Unable to resize terminal.'));
		}
	};
	const onInputError = (): void => finish(new Error('Terminal input failed.'));
	const onInputEnd = (): void => finish(new Error('Terminal input closed.'));
	const onOutputError = (): void => {
		outputError = new Error('Terminal output failed.');
		drain?.();
		finish(outputError);
	};
	const onInterrupt = (): void => finish(undefined, 130);
	const onTerminate = (): void => finish(undefined, 143);
	const onHangup = (): void => finish(undefined, 129);
	input.on('error', onInputError);
	input.on('end', onInputEnd);
	input.on('close', onInputEnd);
	output.on('error', onOutputError);
	signals.on('SIGINT', onInterrupt);
	signals.on('SIGTERM', onTerminate);
	signals.on('SIGHUP', onHangup);

	let result = 1;
	let failure: unknown;
	try {
		const initialized = record(await client.request('initialize', {
			channel: 'ahp-root://',
			clientId,
			clientInfo: { name: 'experimental-tunnel-terminal-client', version: '0.0.1' },
			protocolVersions: ['0.9.0'],
			initialSubscriptions: [],
		}), 'initialize response');
		if (initialized.protocolVersion !== '0.9.0') {
			throw new Error('This prototype requires agent protocol 0.9.0. Update the remote agent host.');
		}
		if (!finished) {
			creationAttempted = true;
			await client.request('createTerminal', {
				channel,
				claim: { kind: 'client', clientId },
				name: 'Standalone Tunnel Terminal',
				...(options.cwd ? { cwd: options.cwd } : {}),
				...dimensions(),
			});
			creationConfirmed = true;
		}
		if (!finished) {
			const subscribed = record(await client.request('subscribe', { channel }), 'subscribe response');
			const snapshot = record(subscribed.snapshot, 'terminal snapshot');
			if (snapshot.resource !== channel) {
				throw new Error('Server returned a snapshot for a different terminal.');
			}
			lastSeq = sequence(snapshot.fromSeq);
			const state = record(snapshot.state, 'terminal state');
			if (!Array.isArray(state.content)) {
				throw new Error('Malformed terminal snapshot content.');
			}
			for (const value of state.content) {
				const part = record(value, 'terminal content');
				if (part.type !== 'command' && part.type !== 'unclassified') {
					throw new Error('Unsupported terminal content type.');
				}
				write(text(part.type === 'command' ? part.output : part.value, 'terminal content text'));
			}
			const lifecycle = record(state.lifecycle, 'terminal lifecycle');
			if (lifecycle.status === 'exited') {
				finish(undefined, exitCode(lifecycle.exitCode));
			} else if (lifecycle.status !== 'running') {
				throw new Error('Unsupported terminal lifecycle.');
			}
			snapshotReady = true;
			for (const action of earlyActions) {
				handleAction(action);
			}
			earlyActions.length = 0;
		}
		if (!finished) {
			input.setRawMode!(true);
			input.on('data', onData);
			output.on('resize', onResize);
			onResize();
			input.resume();
		}
		result = await completion;
	} catch (error) {
		failure = error;
	} finally {
		finished = true;
		input.pause();
		input.off('data', onData);
		input.off('error', onInputError);
		input.off('end', onInputEnd);
		input.off('close', onInputEnd);
		output.off('resize', onResize);
		signals.off('SIGINT', onInterrupt);
		signals.off('SIGTERM', onTerminate);
		signals.off('SIGHUP', onHangup);
		removeNotification();
		removeFailure();
		try {
			input.setRawMode!(wasRaw);
			if (wasFlowing) { input.resume(); }
		} catch {
			failure = new Error('Unable to restore local terminal input mode.');
		}
		if (creationAttempted) {
			try {
				await client.request('disposeTerminal', { channel }, 5000);
				if (!creationConfirmed) {
					failure = new Error(`${failure instanceof Error ? failure.message + ' ' : ''}Terminal creation was not acknowledged (${channel}). Cleanup was requested, but a late-created shell may still be running.`);
				}
			} catch {
				failure = new Error(`${failure instanceof Error ? failure.message + ' ' : ''}Unable to confirm remote shell cleanup (${channel}). The shell may still be running; inspect it on the remote host.`);
			}
		}
		try {
			if (outputBytes > 0 && !outputError) {
				await deadline(new Promise<void>(resolve => { drain = resolve; }), 'Terminal output flush', undefined, 5000);
			}
			if (outputError) { throw outputError; }
		} catch (error) {
			failure ??= error;
		} finally {
			output.off('error', onOutputError);
		}
	}
	if (failure) { throw failure; }
	return result;
}
