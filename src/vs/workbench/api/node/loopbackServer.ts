/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { randomBytes } from 'crypto';
import * as http from 'http';
import { URL } from 'url';
import { DeferredPromise } from '../../../base/common/async.js';
import { DEFAULT_AUTH_FLOW_PORT } from '../../../base/common/oauth.js';
import { URI } from '../../../base/common/uri.js';
import { ILogger } from '../../../platform/log/common/log.js';

export interface IOAuthResult {
	code: string;
	state: string;
}

export interface ILoopbackServer {
	/**
	 * The state parameter used in the OAuth flow.
	 */
	readonly state: string;

	/**
	 * Starts the server.
	 * @throws If the server fails to start.
	 * @throws If the server is already started.
	 */
	start(): Promise<void>;

	/**
	 * Stops the server.
	 * @throws If the server is not started.
	 * @throws If the server fails to stop.
	 */
	stop(): Promise<void>;

	/**
	 * Returns a promise that resolves to the result of the OAuth flow.
	 */
	waitForOAuthResponse(): Promise<IOAuthResult>;
}

export class LoopbackAuthServer implements ILoopbackServer {
	private readonly _server: http.Server;
	private readonly _resultPromise: Promise<IOAuthResult>;

	private _state = randomBytes(16).toString('base64');
	private _port: number | undefined;

	constructor(
		private readonly _logger: ILogger,
		private readonly _appUri: URI,
		private readonly _appName: string
	) {
		const deferredPromise = new DeferredPromise<IOAuthResult>();
		this._resultPromise = deferredPromise.p;

		this._server = http.createServer((req, res) => {
			const reqUrl = new URL(req.url!, `http://${req.headers.host}`);
			switch (reqUrl.pathname) {
				case '/': {
					const code = reqUrl.searchParams.get('code') ?? undefined;
					const state = reqUrl.searchParams.get('state') ?? undefined;
					const error = reqUrl.searchParams.get('error') ?? undefined;
					if (error) {
						res.writeHead(302, { location: `/done?error=${reqUrl.searchParams.get('error_description') || error}` });
						res.end();
						deferredPromise.error(new Error(error));
						break;
					}
					if (!code || !state) {
						res.writeHead(400);
						res.end();
						break;
					}
					if (this.state !== state) {
						res.writeHead(302, { location: `/done?error=${encodeURIComponent('State does not match.')}` });
						res.end();
						deferredPromise.error(new Error('State does not match.'));
						break;
					}
					deferredPromise.complete({ code, state });
					res.writeHead(302, { location: '/done' });
					res.end();
					break;
				}
				// Serve the static files
				case '/done':
					this._sendPage(res);
					break;
				default:
					res.writeHead(404);
					res.end();
					break;
			}
		});
	}

	get state(): string { return this._state; }
	get redirectUri(): string {
		if (this._port === undefined) {
			throw new Error('Server is not started yet');
		}
		return `http://127.0.0.1:${this._port}/`;
	}

	private _sendPage(res: http.ServerResponse): void {
		const html = this.getHtml();
		res.writeHead(200, {
			'Content-Type': 'text/html',
			'Content-Length': Buffer.byteLength(html, 'utf8')
		});
		res.end(html);
	}

	start(): Promise<void> {
		const deferredPromise = new DeferredPromise<void>();
		if (this._server.listening) {
			throw new Error('Server is already started');
		}
		const portTimeout = setTimeout(() => {
			deferredPromise.error(new Error('Timeout waiting for port'));
		}, 5000);
		this._server.on('listening', () => {
			const address = this._server.address();
			if (typeof address === 'string') {
				this._port = parseInt(address);
			} else if (address instanceof Object) {
				this._port = address.port;
			} else {
				throw new Error('Unable to determine port');
			}

			clearTimeout(portTimeout);
			deferredPromise.complete();
		});
		this._server.on('error', err => {
			if ('code' in err && err.code === 'EADDRINUSE') {
				this._logger.error('Address in use, retrying with a different port...');
				// Best effort to use a specific port, but fallback to a random one if it is in use
				this._server.listen(0, '127.0.0.1');
				return;
			}
			clearTimeout(portTimeout);
			deferredPromise.error(new Error(`Error listening to server: ${err}`));
		});
		this._server.on('close', () => {
			deferredPromise.error(new Error('Closed'));
		});
		// Best effort to use a specific port, but fallback to a random one if it is in use
		this._server.listen(DEFAULT_AUTH_FLOW_PORT, '127.0.0.1');
		return deferredPromise.p;
	}

	stop(): Promise<void> {
		const deferredPromise = new DeferredPromise<void>();
		if (!this._server.listening) {
			deferredPromise.complete();
			return deferredPromise.p;
		}
		this._server.close((err) => {
			if (err) {
				deferredPromise.error(err);
			} else {
				deferredPromise.complete();
			}
		});
		// If the server is not closed within 5 seconds, reject the promise
		setTimeout(() => {
			if (!deferredPromise.isResolved) {
				deferredPromise.error(new Error('Timeout waiting for server to close'));
			}
		}, 5000);
		return deferredPromise.p;
	}

	waitForOAuthResponse(): Promise<IOAuthResult> {
		return this._resultPromise;
	}

	getHtml(): string {
		// TODO: Bring this in via mixin. Skipping exploration for now.
		let backgroundImage = 'url(\'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABAAAAAQABAMAAACNMzawAAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAAJ1BMVEUAAAD///9Qm8+ozed8tNsWer+Lvd9trNfF3u9Ck8slgsMzi8eZxeM/Qa6mAAAAAXRSTlMAQObYZgAAAAFiS0dEAf8CLd4AAAAHdElNRQfiCwYULRt0g+ZLAAAJRUlEQVR42u3SUY0CQRREUSy0hSZtBA+wfOwv4wAPYwAJSMAfAthkB6YD79HnKqikzmYjSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIk6cmKhg4AAASAABAAAkAACAABIAAEgAAQAAJAAAgAAaBvBVAjtV2wfFe1ogcA+0gdFgBoe60IAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAnAjAP/1MkWoAvBvAsUTqBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJAAgAASAABIAAEAACQAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKA7gDlbFwC6AijZagAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQDM2boA0BXAqAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIATARAAAkAAvF7N1hWArgBKthoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAfBrAlK0bAF0BjBoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4EQABIAAEwOtN2boB0BVAyVYDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgE8DqNm6AtAVwKgBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAEwEQAAJAAPzd7xypMwDvBnAskToBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAIAAkAACAABIAAEgAAQAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAkAACAABIAAEgAAQAAJAAAgAASAABIAAEAACQAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIBKBGarsAwK5qRQ8ANGYAACAABIAAEAACQAAIAAEgAASAABAAAkDfCUCSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJC3uDtO80OSql+i8AAAAJXRFWHRkYXRlOmNyZWF0ZQAyMDE4LTExLTA2VDIwOjQ1OjI3KzAwOjAwEjLurQAAACV0RVh0ZGF0ZTptb2RpZnkAMjAxOC0xMS0wNlQyMDo0NToyNyswMDowMGNvVhEAAAAZdEVYdFNvZnR3YXJlAEFkb2JlIEltYWdlUmVhZHlxyWU8AAAAAElFTkSuQmCC\')';
		if (this._appName === 'Visual Studio Code') {
			backgroundImage = 'url(\'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjU2IiBoZWlnaHQ9IjI1NiIgdmlld0JveD0iMCAwIDI1NiAyNTYiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxtYXNrIGlkPSJtYXNrMCIgbWFzay10eXBlPSJhbHBoYSIgbWFza1VuaXRzPSJ1c2VyU3BhY2VPblVzZSIgeD0iMCIgeT0iMCIgd2lkdGg9IjI1NiIgaGVpZ2h0PSIyNTYiPgo8cGF0aCBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGNsaXAtcnVsZT0iZXZlbm9kZCIgZD0iTTE4MS41MzQgMjU0LjI1MkMxODUuNTY2IDI1NS44MjMgMTkwLjE2NCAyNTUuNzIyIDE5NC4yMzQgMjUzLjc2NEwyNDYuOTQgMjI4LjQwM0MyNTIuNDc4IDIyNS43MzggMjU2IDIyMC4xMzIgMjU2IDIxMy45ODNWNDIuMDE4MUMyNTYgMzUuODY4OSAyNTIuNDc4IDMwLjI2MzggMjQ2Ljk0IDI3LjU5ODhMMTk0LjIzNCAyLjIzNjgxQzE4OC44OTMgLTAuMzMzMTMyIDE4Mi42NDIgMC4yOTYzNDQgMTc3Ljk1NSAzLjcwNDE4QzE3Ny4yODUgNC4xOTEgMTc2LjY0NyA0LjczNDU0IDE3Ni4wNDkgNS4zMzM1NEw3NS4xNDkgOTcuMzg2MkwzMS4xOTkyIDY0LjAyNDdDMjcuMTA3OSA2MC45MTkxIDIxLjM4NTMgNjEuMTczNSAxNy41ODU1IDY0LjYzTDMuNDg5MzYgNzcuNDUyNUMtMS4xNTg1MyA4MS42ODA1IC0xLjE2Mzg2IDg4Ljk5MjYgMy40Nzc4NSA5My4yMjc0TDQxLjU5MjYgMTI4TDMuNDc3ODUgMTYyLjc3M0MtMS4xNjM4NiAxNjcuMDA4IC0xLjE1ODUzIDE3NC4zMiAzLjQ4OTM2IDE3OC41NDhMMTcuNTg1NSAxOTEuMzdDMjEuMzg1MyAxOTQuODI3IDI3LjEwNzkgMTk1LjA4MSAzMS4xOTkyIDE5MS45NzZMNzUuMTQ5IDE1OC42MTRMMTc2LjA0OSAyNTAuNjY3QzE3Ny42NDUgMjUyLjI2NCAxNzkuNTE5IDI1My40NjcgMTgxLjUzNCAyNTQuMjUyWk0xOTIuMDM5IDY5Ljg4NTNMMTE1LjQ3OSAxMjhMMTkyLjAzOSAxODYuMTE1VjY5Ljg4NTNaIiBmaWxsPSJ3aGl0ZSIvPgo8L21hc2s+CjxnIG1hc2s9InVybCgjbWFzazApIj4KPHBhdGggZD0iTTI0Ni45NCAyNy42MzgzTDE5NC4xOTMgMi4yNDEzOEMxODguMDg4IC0wLjY5ODMwMiAxODAuNzkxIDAuNTQxNzIxIDE3NS45OTkgNS4zMzMzMkwzLjMyMzcxIDE2Mi43NzNDLTEuMzIwODIgMTY3LjAwOCAtMS4zMTU0OCAxNzQuMzIgMy4zMzUyMyAxNzguNTQ4TDE3LjQzOTkgMTkxLjM3QzIxLjI0MjEgMTk0LjgyNyAyNi45NjgyIDE5NS4wODEgMzEuMDYxOSAxOTEuOTc2TDIzOS4wMDMgMzQuMjI2OUMyNDUuOTc5IDI4LjkzNDcgMjU1Ljk5OSAzMy45MTAzIDI1NS45OTkgNDIuNjY2N1Y0Mi4wNTQzQzI1NS45OTkgMzUuOTA3OCAyNTIuNDc4IDMwLjMwNDcgMjQ2Ljk0IDI3LjYzODNaIiBmaWxsPSIjMDA2NUE5Ii8+CjxnIGZpbHRlcj0idXJsKCNmaWx0ZXIwX2QpIj4KPHBhdGggZD0iTTI0Ni45NCAyMjguMzYyTDE5NC4xOTMgMjUzLjc1OUMxODguMDg4IDI1Ni42OTggMTgwLjc5MSAyNTUuNDU4IDE3NS45OTkgMjUwLjY2N0wzLjMyMzcxIDkzLjIyNzJDLTEuMzIwODIgODguOTkyNSAtMS4zMTU0OCA4MS42ODAyIDMuMzM1MjMgNzcuNDUyM0wxNy40Mzk5IDY0LjYyOThDMjEuMjQyMSA2MS4xNzMzIDI2Ljk2ODIgNjAuOTE4OCAzMS4wNjE5IDY0LjAyNDVMMjM5LjAwMyAyMjEuNzczQzI0NS45NzkgMjI3LjA2NSAyNTUuOTk5IDIyMi4wOSAyNTUuOTk5IDIxMy4zMzNWMjEzLjk0NkMyNTUuOTk5IDIyMC4wOTIgMjUyLjQ3OCAyMjUuNjk1IDI0Ni45NCAyMjguMzYyWiIgZmlsbD0iIzAwN0FDQyIvPgo8L2c+CjxnIGZpbHRlcj0idXJsKCNmaWx0ZXIxX2QpIj4KPHBhdGggZD0iTTE5NC4xOTYgMjUzLjc2M0MxODguMDg5IDI1Ni43IDE4MC43OTIgMjU1LjQ1OSAxNzYgMjUwLjY2N0MxODEuOTA0IDI1Ni41NzEgMTkyIDI1Mi4zODkgMTkyIDI0NC4wMzlWMTEuOTYwNkMxOTIgMy42MTA1NyAxODEuOTA0IC0wLjU3MTE3NSAxNzYgNS4zMzMyMUMxODAuNzkyIDAuNTQxMTY2IDE4OC4wODkgLTAuNzAwNjA3IDE5NC4xOTYgMi4yMzY0OEwyNDYuOTM0IDI3LjU5ODVDMjUyLjQ3NiAzMC4yNjM1IDI1NiAzNS44Njg2IDI1NiA0Mi4wMTc4VjIxMy45ODNDMjU2IDIyMC4xMzIgMjUyLjQ3NiAyMjUuNzM3IDI0Ni45MzQgMjI4LjQwMkwxOTQuMTk2IDI1My43NjNaIiBmaWxsPSIjMUY5Q0YwIi8+CjwvZz4KPGcgc3R5bGU9Im1peC1ibGVuZC1tb2RlOm92ZXJsYXkiIG9wYWNpdHk9IjAuMjUiPgo8cGF0aCBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGNsaXAtcnVsZT0iZXZlbm9kZCIgZD0iTTE4MS4zNzggMjU0LjI1MkMxODUuNDEgMjU1LjgyMiAxOTAuMDA4IDI1NS43MjIgMTk0LjA3NyAyNTMuNzY0TDI0Ni43ODMgMjI4LjQwMkMyNTIuMzIyIDIyNS43MzcgMjU1Ljg0NCAyMjAuMTMyIDI1NS44NDQgMjEzLjk4M1Y0Mi4wMTc5QzI1NS44NDQgMzUuODY4NyAyNTIuMzIyIDMwLjI2MzYgMjQ2Ljc4NCAyNy41OTg2TDE5NC4wNzcgMi4yMzY2NUMxODguNzM3IC0wLjMzMzI5OSAxODIuNDg2IDAuMjk2MTc3IDE3Ny43OTggMy43MDQwMUMxNzcuMTI5IDQuMTkwODMgMTc2LjQ5MSA0LjczNDM3IDE3NS44OTIgNS4zMzMzN0w3NC45OTI3IDk3LjM4NkwzMS4wNDI5IDY0LjAyNDVDMjYuOTUxNyA2MC45MTg5IDIxLjIyOSA2MS4xNzM0IDE3LjQyOTIgNjQuNjI5OEwzLjMzMzExIDc3LjQ1MjNDLTEuMzE0NzggODEuNjgwMyAtMS4zMjAxMSA4OC45OTI1IDMuMzIxNiA5My4yMjczTDQxLjQzNjQgMTI4TDMuMzIxNiAxNjIuNzczQy0xLjMyMDExIDE2Ny4wMDggLTEuMzE0NzggMTc0LjMyIDMuMzMzMTEgMTc4LjU0OEwxNy40MjkyIDE5MS4zN0MyMS4yMjkgMTk0LjgyNyAyNi45NTE3IDE5NS4wODEgMzEuMDQyOSAxOTEuOTc2TDc0Ljk5MjcgMTU4LjYxNEwxNzUuODkyIDI1MC42NjdDMTc3LjQ4OCAyNTIuMjY0IDE3OS4zNjMgMjUzLjQ2NyAxODEuMzc4IDI1NC4yNTJaTTE5MS44ODMgNjkuODg1MUwxMTUuMzIzIDEyOEwxOTEuODgzIDE4Ni4xMTVWNjkuODg1MVoiIGZpbGw9InVybCgjcGFpbnQwX2xpbmVhcikiLz4KPC9nPgo8L2c+CjxkZWZzPgo8ZmlsdGVyIGlkPSJmaWx0ZXIwX2QiIHg9Ii0yMS40ODk2IiB5PSI0MC41MjI1IiB3aWR0aD0iMjk4LjgyMiIgaGVpZ2h0PSIyMzYuMTQ5IiBmaWx0ZXJVbml0cz0idXNlclNwYWNlT25Vc2UiIGNvbG9yLWludGVycG9sYXRpb24tZmlsdGVycz0ic1JHQiI+CjxmZUZsb29kIGZsb29kLW9wYWNpdHk9IjAiIHJlc3VsdD0iQmFja2dyb3VuZEltYWdlRml4Ii8+CjxmZUNvbG9yTWF0cml4IGluPSJTb3VyY2VBbHBoYSIgdHlwZT0ibWF0cml4IiB2YWx1ZXM9IjAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDEyNyAwIi8+CjxmZU9mZnNldC8+CjxmZUdhdXNzaWFuQmx1ciBzdGREZXZpYXRpb249IjEwLjY2NjciLz4KPGZlQ29sb3JNYXRyaXggdHlwZT0ibWF0cml4IiB2YWx1ZXM9IjAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAuMjUgMCIvPgo8ZmVCbGVuZCBtb2RlPSJvdmVybGF5IiBpbjI9IkJhY2tncm91bmRJbWFnZUZpeCIgcmVzdWx0PSJlZmZlY3QxX2Ryb3BTaGFkb3ciLz4KPGZlQmxlbmQgbW9kZT0ibm9ybWFsIiBpbj0iU291cmNlR3JhcGhpYyIgaW4yPSJlZmZlY3QxX2Ryb3BTaGFkb3ciIHJlc3VsdD0ic2hhcGUiLz4KPC9maWx0ZXI+CjxmaWx0ZXIgaWQ9ImZpbHRlcjFfZCIgeD0iMTU0LjY2NyIgeT0iLTIwLjY3MzUiIHdpZHRoPSIxMjIuNjY3IiBoZWlnaHQ9IjI5Ny4zNDciIGZpbHRlclVuaXRzPSJ1c2VyU3BhY2VPblVzZSIgY29sb3ItaW50ZXJwb2xhdGlvbi1maWx0ZXJzPSJzUkdCIj4KPGZlRmxvb2QgZmxvb2Qtb3BhY2l0eT0iMCIgcmVzdWx0PSJCYWNrZ3JvdW5kSW1hZ2VGaXgiLz4KPGZlQ29sb3JNYXRyaXggaW49IlNvdXJjZUFscGhhIiB0eXBlPSJtYXRyaXgiIHZhbHVlcz0iMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMTI3IDAiLz4KPGZlT2Zmc2V0Lz4KPGZlR2F1c3NpYW5CbHVyIHN0ZERldmlhdGlvbj0iMTAuNjY2NyIvPgo8ZmVDb2xvck1hdHJpeCB0eXBlPSJtYXRyaXgiIHZhbHVlcz0iMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMC4yNSAwIi8+CjxmZUJsZW5kIG1vZGU9Im92ZXJsYXkiIGluMj0iQmFja2dyb3VuZEltYWdlRml4IiByZXN1bHQ9ImVmZmVjdDFfZHJvcFNoYWRvdyIvPgo8ZmVCbGVuZCBtb2RlPSJub3JtYWwiIGluPSJTb3VyY2VHcmFwaGljIiBpbjI9ImVmZmVjdDFfZHJvcFNoYWRvdyIgcmVzdWx0PSJzaGFwZSIvPgo8L2ZpbHRlcj4KPGxpbmVhckdyYWRpZW50IGlkPSJwYWludDBfbGluZWFyIiB4MT0iMTI3Ljg0NCIgeTE9IjAuNjU5OTg4IiB4Mj0iMTI3Ljg0NCIgeTI9IjI1NS4zNCIgZ3JhZGllbnRVbml0cz0idXNlclNwYWNlT25Vc2UiPgo8c3RvcCBzdG9wLWNvbG9yPSJ3aGl0ZSIvPgo8c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IndoaXRlIiBzdG9wLW9wYWNpdHk9IjAiLz4KPC9saW5lYXJHcmFkaWVudD4KPC9kZWZzPgo8L3N2Zz4K\')';
		} else if (this._appName === 'Visual Studio Code - Insiders') {
			backgroundImage = 'url(\'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjU2IiBoZWlnaHQ9IjI1NiIgdmlld0JveD0iMCAwIDI1NiAyNTYiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxtYXNrIGlkPSJtYXNrMCIgbWFzay10eXBlPSJhbHBoYSIgbWFza1VuaXRzPSJ1c2VyU3BhY2VPblVzZSIgeD0iMCIgeT0iMCIgd2lkdGg9IjI1NiIgaGVpZ2h0PSIyNTYiPgo8cGF0aCBkPSJNMTc2LjA0OSAyNTAuNjY5QzE4MC44MzggMjU1LjQ1OSAxODguMTMgMjU2LjcgMTk0LjIzNCAyNTMuNzY0TDI0Ni45NCAyMjguNDE5QzI1Mi40NzggMjI1Ljc1NSAyNTYgMjIwLjE1NCAyNTYgMjE0LjAwOFY0Mi4xNDc5QzI1NiAzNi4wMDI1IDI1Mi40NzggMzAuNDAwOCAyNDYuOTQgMjcuNzM3NEwxOTQuMjM0IDIuMzkwODlDMTg4LjEzIC0wLjU0NDQxNiAxODAuODM4IDAuNjk2NjA3IDE3Ni4wNDkgNS40ODU3MkMxODEuOTUgLTAuNDE1MDYgMTkyLjAzOSAzLjc2NDEzIDE5Mi4wMzkgMTIuMTA5MVYyNDQuMDQ2QzE5Mi4wMzkgMjUyLjM5MSAxODEuOTUgMjU2LjU3IDE3Ni4wNDkgMjUwLjY2OVoiIGZpbGw9IndoaXRlIi8+CjxwYXRoIGQ9Ik0xODEuMzc5IDE4MC42NDZMMTE0LjMzIDEyOC42MzNMMTgxLjM3OSA3NS41MTE0VjE3Ljc5NEMxODEuMzc5IDEwLjg0NzcgMTczLjEyOCA3LjIwNjczIDE2Ny45OTYgMTEuODg2Mkw3NC42NTE0IDk3Ljg1MThMMzEuMTk5NCA2NC4xNDM4QzI3LjEwODEgNjEuMDM5IDIxLjM4NTEgNjEuMjk0IDE3LjU4NTMgNjQuNzQ3NkwzLjQ4OTc0IDc3LjU2MjdDLTEuMTU4NDcgODEuNzg5MyAtMS4xNjM2NyA4OS4wOTQ4IDMuNDc2NzIgOTMuMzI5MkwxNjcuOTggMjQ0LjE4NUMxNzMuMTA3IDI0OC44ODcgMTgxLjM3OSAyNDUuMjQ5IDE4MS4zNzkgMjM4LjI5MlYxODAuNjQ2WiIgZmlsbD0id2hpdGUiLz4KPHBhdGggZD0iTTM2LjY5MzcgMTM0LjE5NUwzLjQ3NjcyIDE2Mi44MjhDLTEuMTYzNjcgMTY3LjA2MiAtMS4xNTg0NyAxNzQuMzcgMy40ODk3NCAxNzguNTk0TDE3LjU4NTMgMTkxLjQwOUMyMS4zODUxIDE5NC44NjMgMjcuMTA4MSAxOTUuMTE4IDMxLjE5OTQgMTkyLjAxM0w2OS40NDcyIDE2NC4wNTdMMzYuNjkzNyAxMzQuMTk1WiIgZmlsbD0id2hpdGUiLz4KPC9tYXNrPgo8ZyBtYXNrPSJ1cmwoI21hc2swKSI+CjxwYXRoIGQ9Ik0xNjcuOTk2IDExLjg4NTdDMTczLjEyOCA3LjIwNjI3IDE4MS4zNzkgMTAuODQ3MyAxODEuMzc5IDE3Ljc5MzZWNzUuNTEwOUwxMDQuOTM4IDEzNi4wNzNMNjUuNTc0MiAxMDYuMjExTDE2Ny45OTYgMTEuODg1N1oiIGZpbGw9IiMwMDlBN0MiLz4KPHBhdGggZD0iTTM2LjY5MzcgMTM0LjE5NEwzLjQ3NjcyIDE2Mi44MjdDLTEuMTYzNjcgMTY3LjA2MiAtMS4xNTg0NyAxNzQuMzcgMy40ODk3NCAxNzguNTk0TDE3LjU4NTMgMTkxLjQwOUMyMS4zODUxIDE5NC44NjMgMjcuMTA4MSAxOTUuMTE4IDMxLjE5OTQgMTkyLjAxM0w2OS40NDcyIDE2NC4wNTZMMzYuNjkzNyAxMzQuMTk0WiIgZmlsbD0iIzAwOUE3QyIvPgo8ZyBmaWx0ZXI9InVybCgjZmlsdGVyMF9kKSI+CjxwYXRoIGQ9Ik0xODEuMzc5IDE4MC42NDVMMzEuMTk5NCA2NC4xNDI3QzI3LjEwODEgNjEuMDM3OSAyMS4zODUxIDYxLjI5MjkgMTcuNTg1MyA2NC43NDY1TDMuNDg5NzQgNzcuNTYxNkMtMS4xNTg0NyA4MS43ODgyIC0xLjE2MzY3IDg5LjA5MzcgMy40NzY3MiA5My4zMjgxTDE2Ny45NzIgMjQ0LjE3NkMxNzMuMTAyIDI0OC44ODEgMTgxLjM3OSAyNDUuMjQxIDE4MS4zNzkgMjM4LjI4VjE4MC42NDVaIiBmaWxsPSIjMDBCMjk0Ii8+CjwvZz4KPGcgZmlsdGVyPSJ1cmwoI2ZpbHRlcjFfZCkiPgo8cGF0aCBkPSJNMTk0LjIzMyAyNTMuNzY2QzE4OC4xMyAyNTYuNzAxIDE4MC44MzcgMjU1LjQ2IDE3Ni4wNDggMjUwLjY3MUMxODEuOTQ5IDI1Ni41NzEgMTkyLjAzOSAyNTIuMzkyIDE5Mi4wMzkgMjQ0LjA0N1YxMi4xMTAzQzE5Mi4wMzkgMy43NjUzNSAxODEuOTQ5IC0wLjQxMzgzOSAxNzYuMDQ4IDUuNDg2OTRDMTgwLjgzNyAwLjY5NzgyNCAxODguMTI5IC0wLjU0MzE5MSAxOTQuMjMzIDIuMzkyMUwyNDYuOTM5IDI3LjczODZDMjUyLjQ3OCAzMC40MDIgMjU2IDM2LjAwMzcgMjU2IDQyLjE0OTFWMjE0LjAwOUMyNTYgMjIwLjE1NSAyNTIuNDc4IDIyNS43NTcgMjQ2LjkzOSAyMjguNDJMMTk0LjIzMyAyNTMuNzY2WiIgZmlsbD0iIzI0QkZBNSIvPgo8L2c+CjwvZz4KPGRlZnM+CjxmaWx0ZXIgaWQ9ImZpbHRlcjBfZCIgeD0iLTIxLjMzMzMiIHk9IjQwLjY0MTMiIHdpZHRoPSIyMjQuMDQ1IiBoZWlnaHQ9IjIyNi45ODgiIGZpbHRlclVuaXRzPSJ1c2VyU3BhY2VPblVzZSIgY29sb3ItaW50ZXJwb2xhdGlvbi1maWx0ZXJzPSJzUkdCIj4KPGZlRmxvb2QgZmxvb2Qtb3BhY2l0eT0iMCIgcmVzdWx0PSJCYWNrZ3JvdW5kSW1hZ2VGaXgiLz4KPGZlQ29sb3JNYXRyaXggaW49IlNvdXJjZUFscGhhIiB0eXBlPSJtYXRyaXgiIHZhbHVlcz0iMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMTI3IDAiLz4KPGZlT2Zmc2V0Lz4KPGZlR2F1c3NpYW5CbHVyIHN0ZERldmlhdGlvbj0iMTAuNjY2NyIvPgo8ZmVDb2xvck1hdHJpeCB0eXBlPSJtYXRyaXgiIHZhbHVlcz0iMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMC4xNSAwIi8+CjxmZUJsZW5kIG1vZGU9Im5vcm1hbCIgaW4yPSJCYWNrZ3JvdW5kSW1hZ2VGaXgiIHJlc3VsdD0iZWZmZWN0MV9kcm9wU2hhZG93Ii8+CjxmZUJsZW5kIG1vZGU9Im5vcm1hbCIgaW49IlNvdXJjZUdyYXBoaWMiIGluMj0iZWZmZWN0MV9kcm9wU2hhZG93IiByZXN1bHQ9InNoYXBlIi8+CjwvZmlsdGVyPgo8ZmlsdGVyIGlkPSJmaWx0ZXIxX2QiIHg9IjE1NC43MTUiIHk9Ii0yMC41MTY5IiB3aWR0aD0iMTIyLjYxOCIgaGVpZ2h0PSIyOTcuMTkxIiBmaWx0ZXJVbml0cz0idXNlclNwYWNlT25Vc2UiIGNvbG9yLWludGVycG9sYXRpb24tZmlsdGVycz0ic1JHQiI+CjxmZUZsb29kIGZsb29kLW9wYWNpdHk9IjAiIHJlc3VsdD0iQmFja2dyb3VuZEltYWdlRml4Ii8+CjxmZUNvbG9yTWF0cml4IGluPSJTb3VyY2VBbHBoYSIgdHlwZT0ibWF0cml4IiB2YWx1ZXM9IjAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDEyNyAwIi8+CjxmZU9mZnNldC8+CjxmZUdhdXNzaWFuQmx1ciBzdGREZXZpYXRpb249IjEwLjY2NjciLz4KPGZlQ29sb3JNYXRyaXggdHlwZT0ibWF0cml4IiB2YWx1ZXM9IjAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAuMjUgMCIvPgo8ZmVCbGVuZCBtb2RlPSJvdmVybGF5IiBpbjI9IkJhY2tncm91bmRJbWFnZUZpeCIgcmVzdWx0PSJlZmZlY3QxX2Ryb3BTaGFkb3ciLz4KPGZlQmxlbmQgbW9kZT0ibm9ybWFsIiBpbj0iU291cmNlR3JhcGhpYyIgaW4yPSJlZmZlY3QxX2Ryb3BTaGFkb3ciIHJlc3VsdD0ic2hhcGUiLz4KPC9maWx0ZXI+CjwvZGVmcz4KPC9zdmc+Cg==\')';
		}
		return `<!DOCTYPE html>
<html lang="en">

<head>
	<meta charset="utf-8" />
	<title>GitHub Authentication - Sign In</title>
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<style>
		html {
			height: 100%;
		}

		body {
			box-sizing: border-box;
			min-height: 100%;
			margin: 0;
			padding: 15px 30px;
			display: flex;
			flex-direction: column;
			color: white;
			font-family: "Segoe UI","Helvetica Neue","Helvetica",Arial,sans-serif;
			background-color: #2C2C32;
		}

		.branding {
			background-image: ${backgroundImage};
			background-size: 24px;
			background-repeat: no-repeat;
			background-position: left center;
			padding-left: 36px;
			font-size: 20px;
			letter-spacing: -0.04rem;
			font-weight: 400;
			color: white;
			text-decoration: none;
		}

		.message-container {
			flex-grow: 1;
			display: flex;
			align-items: center;
			justify-content: center;
			margin: 0 30px;
		}

		.message {
			font-weight: 300;
			font-size: 1.4rem;
		}

		body.error .message {
			display: none;
		}

		body.error .error-message {
			display: block;
		}

		.error-message {
			display: none;
			font-weight: 300;
			font-size: 1.3rem;
		}

		.error-text {
			color: red;
			font-size: 1rem;
		}

		@font-face {
			font-family: 'Segoe UI';
			src: url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/light/latest.eot"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/light/latest.eot?#iefix") format("embedded-opentype");
			src: local("Segoe UI Light"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/light/latest.woff2") format("woff2"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/light/latest.woff") format("woff"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/light/latest.ttf") format("truetype"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/light/latest.svg#web") format("svg");
			font-weight: 200
		}

		@font-face {
			font-family: 'Segoe UI';
			src: url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/semilight/latest.eot"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/semilight/latest.eot?#iefix") format("embedded-opentype");
			src: local("Segoe UI Semilight"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/semilight/latest.woff2") format("woff2"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/semilight/latest.woff") format("woff"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/semilight/latest.ttf") format("truetype"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/semilight/latest.svg#web") format("svg");
			font-weight: 300
		}

		@font-face {
			font-family: 'Segoe UI';
			src: url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/normal/latest.eot"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/normal/latest.eot?#iefix") format("embedded-opentype");
			src: local("Segoe UI"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/normal/latest.woff2") format("woff"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/normal/latest.woff") format("woff"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/normal/latest.ttf") format("truetype"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/normal/latest.svg#web") format("svg");
			font-weight: 400
		}

		@font-face {
			font-family: 'Segoe UI';
			src: url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/semibold/latest.eot"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/semibold/latest.eot?#iefix") format("embedded-opentype");
			src: local("Segoe UI Semibold"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/semibold/latest.woff2") format("woff"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/semibold/latest.woff") format("woff"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/semibold/latest.ttf") format("truetype"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/semibold/latest.svg#web") format("svg");
			font-weight: 600
		}

		@font-face {
			font-family: 'Segoe UI';
			src: url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/bold/latest.eot"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/bold/latest.eot?#iefix") format("embedded-opentype");
			src: local("Segoe UI Bold"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/bold/latest.woff2") format("woff"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/bold/latest.woff") format("woff"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/bold/latest.ttf") format("truetype"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/bold/latest.svg#web") format("svg");
			font-weight: 700
		}
	</style>
</head>

<body>
	<a class="branding" href="https://code.visualstudio.com/">
		${this._appName}
	</a>
	<div class="message-container">
		<div class="message">
			Sign-in successful! Returning to ${this._appName}...
			<br><br>
			If you're not redirected automatically, <a href="${this._appUri.toString(true)}" style="color: #85CEFF;">click here</a> or close this page.
		</div>
		<div class="error-message">
			An error occurred while signing in:
			<div class="error-text"></div>
		</div>
	</div>
	<script>
		const search = window.location.search;
		const error = (/[?&^]error=([^&]+)/.exec(search) || [])[1];
		if (error) {
			document.querySelector('.error-text')
				.textContent = decodeURIComponent(error);
			document.querySelector('body')
				.classList.add('error');
		} else {
			// Redirect to the app URI after a 1-second delay to allow page to load
			setTimeout(function() {
				window.location.href = '${this._appUri.toString(true)}';
			}, 1000);
		}
	</script>
</body>
</html>`;
	}
}
