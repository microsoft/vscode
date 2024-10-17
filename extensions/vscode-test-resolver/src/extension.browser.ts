/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export function activate(_context: vscode.ExtensionContext) {
	vscode.workspace.registerRemoteAuthorityResolver('test', {
		async resolve(_authority: string): Promise<vscode.ResolverResult> {
			console.log(`Resolving ${_authority}`);
			console.log(`Activating vscode.github-authentication to simulate auth`);
			await vscode.extensions.getExtension('vscode.github-authentication')?.activate();
			return new vscode.ManagedResolvedAuthority(async () => {
				return new InitialManagedMessagePassing();
			});
		}
	});
}

/**
 * The initial message passing is a bit special because we need to
 * wait for the HTTP headers to arrive before we can create the
 * actual WebSocket.
 */
class InitialManagedMessagePassing implements vscode.ManagedMessagePassing {
	private readonly dataEmitter = new vscode.EventEmitter<Uint8Array>();
	private readonly closeEmitter = new vscode.EventEmitter<Error | undefined>();
	private readonly endEmitter = new vscode.EventEmitter<void>();

	public readonly onDidReceiveMessage = this.dataEmitter.event;
	public readonly onDidClose = this.closeEmitter.event;
	public readonly onDidEnd = this.endEmitter.event;

	private _actual: OpeningManagedMessagePassing | null = null;
	private _isDisposed = false;

	public send(d: Uint8Array): void {
		if (this._actual) {
			// we already got the HTTP headers
			this._actual.send(d);
			return;
		}

		if (this._isDisposed) {
			// got disposed in the meantime, ignore
			return;
		}

		// we now received the HTTP headers
		const decoder = new TextDecoder();
		const str = decoder.decode(d);

		// example str GET ws://localhost/oss-dev?reconnectionToken=4354a323-a45a-452c-b5d7-d8d586e1cd5c&reconnection=false&skipWebSocketFrames=true HTTP/1.1
		const match = str.match(/GET\s+(\S+)\s+HTTP/);
		if (!match) {
			console.error(`Coult not parse ${str}`);
			this.closeEmitter.fire(new Error(`Coult not parse ${str}`));
			return;
		}

		// example url ws://localhost/oss-dev?reconnectionToken=4354a323-a45a-452c-b5d7-d8d586e1cd5c&reconnection=false&skipWebSocketFrames=true
		const url = new URL(match[1]);

		// extract path and query from url using browser's URL
		const parsedUrl = new URL(url);
		this._actual = new OpeningManagedMessagePassing(parsedUrl, this.dataEmitter, this.closeEmitter, this.endEmitter);
	}

	public end(): void {
		if (this._actual) {
			this._actual.end();
			return;
		}
		this._isDisposed = true;
	}
}

class OpeningManagedMessagePassing {

	private readonly socket: WebSocket;
	private isOpen = false;
	private bufferedData: Uint8Array[] = [];

	constructor(
		url: URL,
		dataEmitter: vscode.EventEmitter<Uint8Array>,
		closeEmitter: vscode.EventEmitter<Error | undefined>,
		_endEmitter: vscode.EventEmitter<void>
	) {
		this.socket = new WebSocket(`ws://localhost:9888${url.pathname}${url.search.replace(/skipWebSocketFrames=true/, 'skipWebSocketFrames=false')}`);
		this.socket.addEventListener('close', () => closeEmitter.fire(undefined));
		this.socket.addEventListener('error', (e) => closeEmitter.fire(new Error(String(e))));
		this.socket.addEventListener('message', async (e) => {
			const arrayBuffer = await e.data.arrayBuffer();
			dataEmitter.fire(new Uint8Array(arrayBuffer));
		});
		this.socket.addEventListener('open', () => {
			while (this.bufferedData.length > 0) {
				const first = this.bufferedData.shift()!;
				this.socket.send(first);
			}
			this.isOpen = true;

			// https://tools.ietf.org/html/rfc6455#section-4
			// const requestNonce = req.headers['sec-websocket-key'];
			// const hash = crypto.createHash('sha1');
			// hash.update(requestNonce + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11');
			// const responseNonce = hash.digest('base64');
			const responseHeaders = [
				`HTTP/1.1 101 Switching Protocols`,
				`Upgrade: websocket`,
				`Connection: Upgrade`,
				`Sec-WebSocket-Accept: TODO`
			];
			const textEncoder = new TextEncoder();
			textEncoder.encode(responseHeaders.join('\r\n') + '\r\n\r\n');
			dataEmitter.fire(textEncoder.encode(responseHeaders.join('\r\n') + '\r\n\r\n'));
		});
	}

	public send(d: Uint8Array): void {
		if (!this.isOpen) {
			this.bufferedData.push(d);
			return;
		}
		this.socket.send(d);
	}

	public end(): void {
		this.socket.close();
	}
}
