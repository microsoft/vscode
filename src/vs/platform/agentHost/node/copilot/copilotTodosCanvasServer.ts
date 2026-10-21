/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomBytes } from 'crypto';
import type * as http from 'http';
import { getErrorMessage } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../log/common/log.js';
import type { IAgentSessionPlan } from '../../common/agent.js';
import { ILoopbackProxyRuntime, LoopbackProxyServer } from '../shared/loopbackProxyServer.js';
import { renderCopilotTodosCanvasPage } from './copilotTodosCanvasPage.js';

export const ICopilotTodosCanvasServer = createDecorator<ICopilotTodosCanvasServer>('copilotTodosCanvasServer');

/** The plan and todo state one todos canvas presents, read from its owning Copilot session on demand. */
export interface ICopilotTodosCanvasDataSource {
	/** Reads the current plan document, todo rows and dependency edges. */
	readPlan(): Promise<IAgentSessionPlan>;
	/** Fires when the plan or the todo tables may have changed; the page re-reads on every emission. */
	readonly onDidChange: Event<void>;
}

/** One served todos canvas page. Disposing it stops serving the page and ends its change streams. */
export interface ICopilotTodosCanvasPresentation extends IDisposable {
	/** Absolute loopback URL of the page, ending in `/`. Unguessable, so treat it like a credential. */
	readonly url: string;
}

/**
 * Serves the built-in todos canvas pages for live Copilot sessions over a shared loopback HTTP server.
 * The server binds lazily on the first presentation and closes when the last one is disposed.
 */
export interface ICopilotTodosCanvasServer {
	readonly _serviceBrand: undefined;
	present(source: ICopilotTodosCanvasDataSource): Promise<ICopilotTodosCanvasPresentation>;
}

interface IPresentationEntry {
	readonly source: ICopilotTodosCanvasDataSource;
	readonly streams: Set<http.ServerResponse>;
}

type CopilotTodosCanvasState = Map<string, IPresentationEntry>;

const SERVER_NAME = 'Copilot Todos Canvas';
const SSE_HEARTBEAT_INTERVAL_MS = 25_000;

function generateToken(): string {
	return randomBytes(16).toString('hex');
}

export class CopilotTodosCanvasServer extends LoopbackProxyServer<CopilotTodosCanvasState> implements ICopilotTodosCanvasServer {

	declare readonly _serviceBrand: undefined;

	constructor(@ILogService logService: ILogService) {
		super(SERVER_NAME, logService);
	}

	protected createState(): CopilotTodosCanvasState {
		return new Map();
	}

	async present(source: ICopilotTodosCanvasDataSource): Promise<ICopilotTodosCanvasPresentation> {
		const { runtime, release } = await this.acquire();
		const token = generateToken();
		const streams = new Set<http.ServerResponse>();
		runtime.state.set(token, { source, streams });
		const changeListener = source.onDidChange(() => {
			for (const stream of streams) {
				if (!writeSse(stream, 'event: change\ndata: {}\n\n')) {
					streams.delete(stream);
				}
			}
		});

		let disposed = false;
		return {
			url: `${runtime.baseUrl}/${token}/`,
			dispose: () => {
				if (disposed) {
					return;
				}
				disposed = true;
				changeListener.dispose();
				runtime.state.delete(token);
				for (const stream of streams) {
					if (!stream.destroyed && !stream.writableEnded) {
						stream.end();
					}
				}
				streams.clear();
				release();
			},
		};
	}

	protected override writeInternalError(res: http.ServerResponse): void {
		writeJson(res, 500, { error: 'Internal server error' });
	}

	protected override async handleRequest(req: http.IncomingMessage, res: http.ServerResponse, runtime: ILoopbackProxyRuntime<CopilotTodosCanvasState>): Promise<void> {
		if (req.method !== 'GET') {
			res.writeHead(405, { 'Allow': 'GET', ...securityHeaders });
			res.end();
			return;
		}
		let pathname: string;
		try {
			({ pathname } = new URL(req.url ?? '/', 'http://127.0.0.1'));
		} catch {
			writeJson(res, 404, { error: 'Not found' });
			return;
		}
		const [, token, route, ...rest] = pathname.split('/');
		const entry = token ? runtime.state.get(token) : undefined;
		// Unknown tokens, malformed paths and unparsable URLs look alike, so a probe learns nothing about live tokens.
		if (!entry || rest.length > 0) {
			writeJson(res, 404, { error: 'Not found' });
			return;
		}
		switch (route) {
			case '':
				this._servePage(res);
				return;
			case 'plan.json':
				await this._servePlan(res, entry);
				return;
			case 'events':
				this._serveEvents(req, res, entry);
				return;
			default:
				writeJson(res, 404, { error: 'Not found' });
		}
	}

	private _servePage(res: http.ServerResponse): void {
		const body = renderCopilotTodosCanvasPage(randomBytes(16).toString('base64'));
		res.writeHead(200, {
			'Content-Type': 'text/html; charset=utf-8',
			'Content-Length': Buffer.byteLength(body),
			...securityHeaders,
		});
		res.end(body);
	}

	private async _servePlan(res: http.ServerResponse, entry: IPresentationEntry): Promise<void> {
		let plan: IAgentSessionPlan;
		try {
			plan = await entry.source.readPlan();
		} catch (error) {
			this._logService.warn(`[${SERVER_NAME}] Failed to read the session plan: ${getErrorMessage(error)}`);
			writeJson(res, 503, { error: getErrorMessage(error) });
			return;
		}
		writeJson(res, 200, plan);
	}

	private _serveEvents(req: http.IncomingMessage, res: http.ServerResponse, entry: IPresentationEntry): void {
		res.writeHead(200, {
			'Content-Type': 'text/event-stream',
			'Connection': 'keep-alive',
			...securityHeaders,
		});
		// A dropped peer surfaces as a stream error; it is cleaned up through the close event below.
		res.on('error', () => { });
		writeSse(res, ': connected\n\n');
		entry.streams.add(res);
		const heartbeat = setInterval(() => writeSse(res, ': heartbeat\n\n'), SSE_HEARTBEAT_INTERVAL_MS);
		const cleanup = () => {
			clearInterval(heartbeat);
			entry.streams.delete(res);
		};
		req.on('close', cleanup);
		res.on('close', cleanup);
	}
}

/** Writes to a live SSE stream; returns `false` once the peer is gone so callers can forget the stream. */
function writeSse(stream: http.ServerResponse, chunk: string): boolean {
	if (stream.destroyed || stream.writableEnded) {
		return false;
	}
	try {
		stream.write(chunk);
		return true;
	} catch {
		return false;
	}
}

const securityHeaders = {
	'Cache-Control': 'no-store',
	'X-Content-Type-Options': 'nosniff',
	'Referrer-Policy': 'no-referrer',
} as const;

function writeJson(res: http.ServerResponse, status: number, body: unknown): void {
	const payload = JSON.stringify(body);
	res.writeHead(status, {
		'Content-Type': 'application/json; charset=utf-8',
		'Content-Length': Buffer.byteLength(payload),
		...securityHeaders,
	});
	res.end(payload);
}
