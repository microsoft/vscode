/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AddressInfo } from 'net';
import type * as http from 'http';
import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../log/common/log.js';
import { decodeExportTraceRequest, IDecodeResult } from './otlpJsonDecode.js';
import { IOtlpExportTraceServiceRequest, IOtlpExportTraceServiceResponse } from './otlpJsonTypes.js';

/** Path the OTLP/HTTP spec mandates for trace export. */
export const OTLP_TRACES_PATH = '/v1/traces';

/** Default request body cap, matching the collector's `confighttp` default. */
const DEFAULT_MAX_BODY_BYTES = 64 * 1024 * 1024;

/** Callbacks the receiver invokes for each accepted request. */
export interface IOtlpReceiverHandlers {
	/** Invoked with the decoded spans for every successfully-parsed request. */
	onSpans(result: IDecodeResult): void;
	/**
	 * Invoked with the raw request body and content-type so the caller can
	 * forward the bytes to an upstream collector unchanged. Called before
	 * the receiver responds, but failures here MUST NOT affect the response.
	 */
	onForward?(body: Buffer, contentType: string): void;
}

export interface IOtlpReceiverOptions {
	/**
	 * Cap on request body size. Anything larger gets HTTP 413. Defaults to
	 * 64 MiB, matching the OpenTelemetry Collector default.
	 */
	readonly maxBodyBytes?: number;
}

export interface ILocalOtlpHttpReceiver extends IDisposable {
	/** Loopback URL clients should POST to (without the trailing `/v1/traces`). */
	readonly baseUrl: string;
	/** Ephemeral port chosen by the OS. */
	readonly port: number;
}

/**
 * Loopback OTLP/HTTP receiver. Listens on `127.0.0.1` at an OS-assigned
 * ephemeral port. Accepts `POST /v1/traces` with `Content-Type: application/json`
 * and forwards the parsed result to the caller's handlers.
 *
 * Only `application/json` is supported. `application/x-protobuf` is rejected
 * with HTTP 415; we explicitly require the SDK to use OTLP/HTTP+JSON for the
 * loopback path.
 *
 * Returns `200 OK` with an empty body on full success, or with a
 * `{ partialSuccess: { rejectedSpans, errorMessage } }` body when the
 * decoder dropped some spans. Per OTLP spec, partial success is NOT a retry
 * signal — the SDK will move on.
 */
export async function startLocalOtlpHttpReceiver(
	handlers: IOtlpReceiverHandlers,
	logService: ILogService,
	options: IOtlpReceiverOptions = {},
): Promise<ILocalOtlpHttpReceiver> {
	const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
	const httpModule = await import('http');
	const server = httpModule.createServer();

	server.on('request', (req, res) => {
		handleRequest(req, res, handlers, logService, maxBodyBytes).catch(err => {
			logService.error(`[agentHost-otel] receiver: unhandled error: ${err instanceof Error ? err.message : String(err)}`);
			if (!res.headersSent) {
				writePlain(res, 500, 'internal error');
			} else if (!res.writableEnded) {
				try { res.end(); } catch { /* ignore */ }
			}
		});
	});

	await new Promise<void>((resolve, reject) => {
		const onError = (err: Error) => reject(err);
		server.once('error', onError);
		server.listen(0, '127.0.0.1', () => {
			server.removeListener('error', onError);
			resolve();
		});
	});

	const address = server.address();
	if (!address || typeof address === 'string') {
		server.close();
		throw new Error(`local OTLP receiver failed to bind: unexpected address ${String(address)}`);
	}
	const port = (address as AddressInfo).port;
	const baseUrl = `http://127.0.0.1:${port}`;
	logService.info(`[agentHost-otel] receiver listening on ${baseUrl}`);

	const disposable = toDisposable(() => {
		server.closeAllConnections();
		server.close(err => {
			if (err) {
				logService.warn(`[agentHost-otel] receiver close error: ${err.message}`);
			}
		});
	});

	return Object.assign(disposable, { baseUrl, port });
}

async function handleRequest(
	req: http.IncomingMessage,
	res: http.ServerResponse,
	handlers: IOtlpReceiverHandlers,
	logService: ILogService,
	maxBodyBytes: number,
): Promise<void> {
	// Reject anything that isn't the trace export path.
	const url = req.url ?? '';
	const pathname = url.split('?', 1)[0];
	if (pathname !== OTLP_TRACES_PATH) {
		writePlain(res, 404, 'not found');
		return;
	}
	if (req.method !== 'POST') {
		res.setHeader('allow', 'POST');
		writePlain(res, 405, 'method not allowed');
		return;
	}

	const contentType = (req.headers['content-type'] ?? '').toString().toLowerCase();
	if (!contentType.includes('application/json')) {
		writePlain(res, 415, 'unsupported content-type; this receiver only accepts application/json');
		return;
	}

	const encoding = (req.headers['content-encoding'] ?? '').toString().toLowerCase();
	if (encoding && encoding !== 'identity') {
		// Compression negotiation is out of scope for v1; let the SDK fall back to identity.
		writePlain(res, 415, `unsupported content-encoding: ${encoding}`);
		return;
	}

	let body: Buffer;
	try {
		body = await readBody(req, maxBodyBytes);
	} catch (err) {
		if (err instanceof PayloadTooLargeError) {
			writePlain(res, 413, 'payload too large');
		} else {
			writePlain(res, 400, 'failed to read body');
		}
		return;
	}

	// Best-effort forward of raw bytes BEFORE decoding so the upstream
	// collector sees an identical payload to what the SDK emitted. Failures
	// here are isolated from the local-decode path.
	if (handlers.onForward) {
		try {
			handlers.onForward(body, contentType);
		} catch (err) {
			logService.warn(`[agentHost-otel] forward callback threw: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	let parsed: IOtlpExportTraceServiceRequest;
	try {
		parsed = JSON.parse(body.toString('utf8')) as IOtlpExportTraceServiceRequest;
	} catch (err) {
		writePlain(res, 400, `invalid json: ${err instanceof Error ? err.message : String(err)}`);
		return;
	}

	const result = decodeExportTraceRequest(parsed);
	try {
		handlers.onSpans(result);
	} catch (err) {
		logService.warn(`[agentHost-otel] onSpans handler threw: ${err instanceof Error ? err.message : String(err)}`);
	}

	const responseBody: IOtlpExportTraceServiceResponse = result.rejected > 0
		? { partialSuccess: { rejectedSpans: result.rejected, errorMessage: result.errors.join('; ').slice(0, 1024) } }
		: {};
	res.statusCode = 200;
	res.setHeader('content-type', 'application/json');
	res.end(JSON.stringify(responseBody));
}

class PayloadTooLargeError extends Error { }

function readBody(req: http.IncomingMessage, maxBytes: number): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		let received = 0;
		const onData = (chunk: Buffer) => {
			received += chunk.length;
			if (received > maxBytes) {
				cleanup();
				reject(new PayloadTooLargeError(`body exceeds ${maxBytes} bytes`));
				return;
			}
			chunks.push(chunk);
		};
		const onEnd = () => {
			cleanup();
			resolve(Buffer.concat(chunks));
		};
		const onError = (err: Error) => {
			cleanup();
			reject(err);
		};
		const cleanup = () => {
			req.removeListener('data', onData);
			req.removeListener('end', onEnd);
			req.removeListener('error', onError);
		};
		req.on('data', onData);
		req.on('end', onEnd);
		req.on('error', onError);
	});
}

function writePlain(res: http.ServerResponse, status: number, message: string): void {
	res.statusCode = status;
	res.setHeader('content-type', 'text/plain; charset=utf-8');
	res.end(message);
}
