/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventEmitter } from 'node:events';
import { isIP } from 'node:net';
import { Readable, Writable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import WebSocket, { RawData } from 'ws';
import { ClientMessage, isDimension, maxBufferedBytes, maxInputLength, maxMessageBytes, parseServerMessage, protocolVersion, ServerMessage } from './protocol';

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

export interface TerminalClientOptions {
	url: string | URL;
	input?: TerminalInput;
	output?: TerminalOutput;
	signals?: EventEmitter;
	handshakeTimeoutMs?: number;
	pairingTimeoutMs?: number;
}

export interface TerminalClientIO {
	input?: TerminalInput;
	output?: TerminalOutput;
	error?: Writable;
	signals?: EventEmitter;
}

export function normalizeTerminalUrl(value: string): URL {
	let url: URL;
	try {
		url = new URL(value.trim());
	} catch {
		throw new Error('Enter a valid http(s) or ws(s) terminal URL.');
	}
	if (url.username || url.password || /^[a-z][a-z\d+.-]*:\/\/[^/?#]*@/i.test(value.trim()) || url.href.includes('#')) {
		throw new Error('Terminal URLs must not contain credentials or fragments.');
	}
	if (url.protocol === 'http:') {
		url.protocol = 'ws:';
	} else if (url.protocol === 'https:') {
		url.protocol = 'wss:';
	}
	if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
		throw new Error('Terminal URLs must use http(s) or ws(s).');
	}
	const hostname = url.hostname.replace(/^\[|\]$/g, '');
	const loopback = hostname === 'localhost' || hostname === '::1' || (isIP(hostname) === 4 && hostname.startsWith('127.'));
	if (url.protocol === 'ws:' && !loopback) {
		throw new Error('Remote terminal URLs must use HTTPS or WSS. Plaintext is allowed only on loopback.');
	}
	if (url.pathname === '/') {
		url.pathname = '/terminal';
	}
	return url;
}

function requireTerminal(input: TerminalInput, output: TerminalOutput): void {
	if (!input.isTTY || !output.isTTY || !input.setRawMode) {
		throw new Error('An interactive terminal is required. Run this client in Windows Terminal (not a pipe).');
	}
}

function writeOutput(output: Writable, text: string): Promise<void> {
	return new Promise((resolve, reject) => {
		if (output.destroyed || output.writableEnded) {
			reject(new Error('Terminal output is closed.'));
			return;
		}
		const onError = (error: Error): void => reject(error);
		output.once('error', onError);
		try {
			output.write(text, error => {
				if (error) {
					reject(error);
				} else {
					output.off('error', onError);
					resolve();
				}
			});
		} catch (error) {
			output.off('error', onError);
			reject(error);
		}
	});
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : 'Terminal client failed.';
}

function readTerminalUrl(input: TerminalInput, output: TerminalOutput, signals: EventEmitter): Promise<string> {
	requireTerminal(input, output);
	const wasFlowing = input.readableFlowing === true;
	const decoder = new StringDecoder('utf8');
	return new Promise((resolve, reject) => {
		let value = '';
		let escape = '';
		let finished = false;
		let outputFailed = false;

		const cleanup = (): void => {
			input.off('data', onData);
			input.off('error', onInputError);
			input.off('end', onInputEnd);
			input.off('close', onInputEnd);
			output.off('error', onOutputError);
			signals.off('SIGINT', onInterrupt);
			signals.off('SIGTERM', onTerminate);
			signals.off('SIGHUP', onHangup);
			if (wasFlowing) {
				input.resume();
			} else {
				input.pause();
			}
		};
		const finish = (error?: Error): void => {
			if (finished) {
				return;
			}
			finished = true;
			input.off('data', onData);
			input.pause();
			void (async () => {
				let failure = error;
				try {
					if (!outputFailed) {
						await writeOutput(output, '\r\n');
					}
				} catch {
					failure ??= new Error('Unable to write terminal output.');
				}
				try {
					cleanup();
				} catch {
					failure ??= new Error('Unable to restore terminal input mode.');
				}
				if (failure) {
					reject(failure);
				} else {
					resolve(value.trim());
				}
				value = '';
			})();
		};
		const onInterrupt = (): void => finish(new Error('Terminal connection cancelled.'));
		const onTerminate = (): void => finish(new Error('Terminal connection interrupted by SIGTERM.'));
		const onHangup = (): void => finish(new Error('Terminal connection interrupted by SIGHUP.'));
		const onInputError = (): void => finish(new Error('Unable to read terminal input.'));
		const onInputEnd = (): void => finish(new Error('Terminal input closed.'));
		const onOutputError = (): void => {
			outputFailed = true;
			finish(new Error('Unable to write terminal output.'));
		};
		const onData = (chunk: Buffer | string): void => {
			const text = typeof chunk === 'string' ? chunk : decoder.write(chunk);
			for (const character of text) {
				if (character === '\x03' || character === '\x04') {
					onInterrupt();
					return;
				}
				if (escape || character === '\x1b') {
					escape += character;
					if (escape === '\x1b[200~' || escape === '\x1b[201~') {
						escape = '';
					} else if (!'\x1b[200~'.startsWith(escape) && !'\x1b[201~'.startsWith(escape)) {
						finish(new Error('Unsupported control sequence in terminal prompt.'));
						return;
					}
					continue;
				}
				if (character === '\r' || character === '\n') {
					finish();
					return;
				}
				if (character === '\x7f' || character === '\b') {
					if (value.length) {
						value = value.slice(0, -1);
					}
				} else if (character === '\x15') {
					value = '';
				} else if (character >= ' ' && character <= '~') {
					value += character;
					if (value.length > 4096) {
						finish(new Error('Terminal prompt input is too long.'));
						return;
					}
				} else {
					finish(new Error('Invalid character in terminal prompt.'));
					return;
				}
			}
		};
		input.on('data', onData);
		input.on('error', onInputError);
		input.on('end', onInputEnd);
		input.on('close', onInputEnd);
		output.on('error', onOutputError);
		signals.on('SIGINT', onInterrupt);
		signals.on('SIGTERM', onTerminate);
		signals.on('SIGHUP', onHangup);
		try {
			void writeOutput(output, 'Terminal URL: ').catch(onOutputError);
			input.resume();
		} catch {
			finish(new Error('Unable to read interactive terminal input.'));
		}
	});
}

function messageText(data: RawData): string {
	if (Array.isArray(data)) {
		return Buffer.concat(data).toString('utf8');
	}
	return Buffer.from(data).toString('utf8');
}

/**
 * Connects an interactive TTY and resolves only after the remote exit, normal
 * WebSocket close, and output flush. The caller owns the streams and exit code.
 */
export async function runTerminalClient(options: TerminalClientOptions): Promise<number> {
	const url = normalizeTerminalUrl(options.url.toString());
	const input = options.input ?? process.stdin;
	const output = options.output ?? process.stdout;
	const signals = options.signals ?? process;
	requireTerminal(input, output);
	const timeoutMs = options.handshakeTimeoutMs ?? 10000;
	const pairingTimeoutMs = options.pairingTimeoutMs ?? 65000;
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
		throw new Error('The terminal handshake timeout must be positive.');
	}
	if (!Number.isFinite(pairingTimeoutMs) || pairingTimeoutMs <= 0) {
		throw new Error('The terminal pairing timeout must be positive.');
	}
	const wasRaw = input.isRaw ?? false;
	const wasFlowing = input.readableFlowing === true;
	const socket = new WebSocket(url, {
		followRedirects: false,
		perMessageDeflate: false,
		maxPayload: maxMessageBytes,
		handshakeTimeout: timeoutMs,
	});
	return new Promise((resolve, reject) => {
		let state: 'connecting' | 'starting' | 'pairing' | 'ready' | 'exiting' | 'finishing' = 'connecting';
		let exitCode: number | undefined;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let outputTail = Promise.resolve();
		let pendingOutputBytes = 0;
		let rawTouched = false;
		let outputFailed = false;
		let trailingSurrogate = '';
		const decoder = new StringDecoder('utf8');
		let markSocketClosed: () => void;
		const socketClosed = new Promise<void>(closed => { markSocketClosed = closed; });

		const clearTimer = (): void => {
			if (timer) {
				clearTimeout(timer);
				timer = undefined;
			}
		};
		const finish = (error?: Error): void => {
			if (state === 'finishing') {
				return;
			}
			state = 'finishing';
			clearTimer();
			input.off('data', onInput);
			input.pause();
			output.off('resize', onResize);
			if (socket.readyState !== WebSocket.CLOSED) {
				socket.terminate();
			}
			void (async () => {
				let failure = error;
				try {
					await outputTail;
					if (!outputFailed) {
						await writeOutput(output, '');
					}
				} catch {
					failure ??= new Error('Unable to write terminal output.');
				}
				await socketClosed;
				input.off('error', onInputError);
				input.off('end', onInputEnd);
				input.off('close', onInputEnd);
				output.off('error', onOutputError);
				output.off('close', onOutputClose);
				signals.off('SIGINT', onInterrupt);
				signals.off('SIGTERM', onTerminate);
				signals.off('SIGHUP', onHangup);
				socket.off('open', onOpen);
				socket.off('message', onMessage);
				socket.off('error', onSocketError);
				socket.off('close', onClose);
				socket.off('unexpected-response', onUnexpectedResponse);
				try {
					if (rawTouched) {
						input.setRawMode?.(wasRaw);
					}
					if (wasFlowing) {
						input.resume();
					} else {
						input.pause();
					}
				} catch {
					failure ??= new Error('Unable to restore terminal input mode.');
				}
				if (failure) {
					reject(failure);
				} else {
					resolve(exitCode!);
				}
			})();
		};
		const send = (message: ClientMessage): void => {
			if (state === 'finishing') {
				return;
			}
			if (socket.readyState !== WebSocket.OPEN) {
				finish(new Error('The terminal connection is not open.'));
				return;
			}
			const text = JSON.stringify(message);
			if (socket.bufferedAmount + Buffer.byteLength(text) > maxBufferedBytes) {
				finish(new Error('The terminal connection cannot keep up with input.'));
				return;
			}
			socket.send(text, error => {
				if (error) {
					finish(new Error('Unable to send terminal input.'));
				}
			});
		};
		const size = (): { cols: number; rows: number } => ({
			cols: isDimension(output.columns) ? output.columns : 80,
			rows: isDimension(output.rows) ? output.rows : 24,
		});
		const onResize = (): void => {
			if (state === 'ready') {
				send({ type: 'resize', ...size() });
			}
		};
		const onInput = (chunk: Buffer | string): void => {
			if (state !== 'ready') {
				return;
			}
			let text = trailingSurrogate + (typeof chunk === 'string' ? chunk : decoder.write(chunk));
			trailingSurrogate = '';
			const last = text.charCodeAt(text.length - 1);
			if (last >= 0xd800 && last <= 0xdbff) {
				trailingSurrogate = text.slice(-1);
				text = text.slice(0, -1);
			}
			for (let offset = 0; offset < text.length && state === 'ready';) {
				let end = Math.min(offset + maxInputLength, text.length);
				const lastCode = text.charCodeAt(end - 1);
				if (end < text.length && lastCode >= 0xd800 && lastCode <= 0xdbff) {
					end--;
				}
				send({ type: 'input', data: text.slice(offset, end) });
				offset = end;
			}
		};
		const onInputError = (): void => finish(new Error('Unable to read terminal input.'));
		const onInputEnd = (): void => finish(new Error('Terminal input closed before the remote terminal exited.'));
		const onOutputError = (): void => {
			outputFailed = true;
			finish(new Error('Unable to write terminal output.'));
		};
		const onOutputClose = (): void => finish(new Error('Terminal output closed.'));
		const onInterrupt = (): void => {
			if (state === 'ready') {
				send({ type: 'input', data: '\x03' });
			} else {
				finish(new Error('Terminal connection cancelled.'));
			}
		};
		const onTerminate = (): void => finish(new Error('Terminal connection interrupted by SIGTERM.'));
		const onHangup = (): void => finish(new Error('Terminal connection interrupted by SIGHUP.'));
		const onOpen = (): void => {
			if (state !== 'connecting') {
				return;
			}
			state = 'starting';
			timer = setTimeout(() => finish(new Error('Timed out waiting for the terminal pairing code.')), timeoutMs);
			send({ type: 'start', version: protocolVersion, ...size() });
		};
		const onMessage = (data: RawData, isBinary: boolean): void => {
			if (state === 'finishing') {
				return;
			}
			if (isBinary) {
				finish(new Error('Received a binary terminal message.'));
				return;
			}
			let message: ServerMessage;
			try {
				message = parseServerMessage(messageText(data));
			} catch {
				finish(new Error('Received an invalid terminal message.'));
				return;
			}
			if (message.type === 'error' && (state === 'starting' || state === 'pairing' || state === 'ready')) {
				finish(new Error(`Remote terminal error: ${message.message}`));
			} else if (message.type === 'pairing' && state === 'starting') {
				clearTimer();
				state = 'pairing';
				timer = setTimeout(() => finish(new Error('Timed out waiting for approval in VS Code. Dismiss the old dialog and reconnect using the same URL.')), pairingTimeoutMs);
				const text = `\r\nPairing code: ${message.code}\r\nCompare this code with the code shown in VS Code. Click Allow only if both codes match.\r\nWaiting for approval in VS Code. Press Ctrl+C to cancel.\r\n`;
				outputTail = outputTail.then(() => writeOutput(output, text));
				void outputTail.catch(onOutputError);
			} else if (message.type === 'ready' && state === 'pairing') {
				clearTimer();
				state = 'ready';
				try {
					rawTouched = true;
					input.setRawMode?.(true);
					input.on('data', onInput);
					output.on('resize', onResize);
					onResize();
					input.resume();
				} catch {
					finish(new Error('Unable to enable raw terminal input.'));
				}
			} else if (message.type === 'data' && state === 'ready') {
				const bytes = Buffer.byteLength(message.data);
				if (pendingOutputBytes + bytes > maxBufferedBytes) {
					finish(new Error('The remote terminal exceeded the output buffer limit.'));
					return;
				}
				pendingOutputBytes += bytes;
				const text = message.data;
				outputTail = outputTail.then(async () => {
					await writeOutput(output, text);
					pendingOutputBytes -= bytes;
					if (text.length && socket.readyState === WebSocket.OPEN && state !== 'finishing') {
						send({ type: 'ack', chars: text.length });
					}
				});
				void outputTail.catch(onOutputError);
			} else if (message.type === 'exit' && state === 'ready') {
				exitCode = message.exitCode;
				state = 'exiting';
				input.off('data', onInput);
				input.pause();
				timer = setTimeout(() => finish(new Error('The remote terminal did not close after exiting.')), timeoutMs);
			} else {
				finish(new Error('Received a terminal message in an unexpected state.'));
			}
		};
		const onSocketError = (): void => finish(new Error('Terminal connection failed. Check the URL, tunnel access, and bridge status.'));
		const onClose = (code: number): void => {
			markSocketClosed();
			if (state !== 'finishing') {
				if (state === 'exiting' && code === 1000) {
					finish();
				} else {
					finish(new Error(`Terminal connection closed unexpectedly (WebSocket ${code}).`));
				}
			}
		};
		const onUnexpectedResponse = (_request: import('node:http').ClientRequest, response: import('node:http').IncomingMessage): void => {
			const status = response.statusCode ?? 0;
			response.destroy();
			finish(new Error(status === 409 || status === 429
				? `The terminal bridge is at its connection limit (HTTP ${status}). Close a session and retry the same URL.`
				: status === 401 || status === 403
				? `Tunnel access failed (HTTP ${status}).`
				: `Terminal WebSocket upgrade rejected (HTTP ${status}); redirects are not followed. Install the local companion and copy a fresh 127.0.0.1 connection URL from Start Bridge, not a Dev Tunnels web URL.`));
		};
		input.on('error', onInputError);
		input.on('end', onInputEnd);
		input.on('close', onInputEnd);
		output.on('error', onOutputError);
		output.on('close', onOutputClose);
		signals.on('SIGINT', onInterrupt);
		signals.on('SIGTERM', onTerminate);
		signals.on('SIGHUP', onHangup);
		socket.on('open', onOpen);
		socket.on('message', onMessage);
		socket.on('error', onSocketError);
		socket.on('close', onClose);
		socket.on('unexpected-response', onUnexpectedResponse);
	});
}

export async function main(args: readonly string[] = process.argv.slice(2), io: TerminalClientIO = {}): Promise<number> {
	const input = io.input ?? process.stdin;
	const output = io.output ?? process.stdout;
	const errorOutput = io.error ?? process.stderr;
	try {
		if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
			await writeOutput(output, [
				'Experimental VS Code Tunnel Terminal',
				'Usage: node client.cjs [URL]',
				'',
				'Run in an interactive terminal. If omitted, the URL is prompted for.',
				'Compare the pairing code displayed here with the code shown in VS Code.',
				'Click Allow in VS Code only if both codes match. Ctrl+C cancels while waiting.',
				'HTTPS/WSS is required except for local loopback connections.',
				'While connected, Ctrl+C is sent to the remote shell. Use exit to disconnect.',
				'',
			].join('\n'));
			return 0;
		}
		if (args.length > 1 || args[0]?.startsWith('-')) {
			throw new Error('Usage: node client.cjs [URL]. Provide at most one terminal URL.');
		}
		requireTerminal(input, output);
		const signals = io.signals ?? process;
		const url = normalizeTerminalUrl(args[0] ?? await readTerminalUrl(input, output, signals));
		return await runTerminalClient({ url, input, output, signals });
	} catch (error) {
		try {
			const message = errorMessage(error).replace(/[\x00-\x1f\x7f-\x9f]/g, ' ');
			await writeOutput(errorOutput, `Terminal client: ${message}\n`);
		} catch {
			// A broken stderr must not prevent console restoration or a nonzero exit.
		}
		return 1;
	}
}
