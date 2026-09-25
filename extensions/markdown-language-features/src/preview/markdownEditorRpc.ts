/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isResponse, type IMessageTransport, type JsonRpcMessage } from '@vscode/hubrpc';
import { z } from 'zod';

interface IDisposable {
	dispose(): void;
}

const requestId = z.union([z.string(), z.number()]);
const envelope = z.object({ channel: z.literal('markdownEditor'), messageSecret: z.string(), message: z.unknown() });
const rpcMessage = z.union([
	z.object({ jsonrpc: z.literal('2.0'), id: requestId.optional(), method: z.string(), params: z.json().optional() }),
	z.object({ jsonrpc: z.literal('2.0'), id: requestId.nullable(), result: z.json() }),
	z.object({ jsonrpc: z.literal('2.0'), id: requestId.nullable(), error: z.object({ code: z.number(), message: z.string(), data: z.json().optional() }) }),
]);

/**
 * A private, authenticated channel for one generation of the Markdown webview.
 * The secret is never given to nested editors, which share the window message bus.
 */
export class MarkdownEditorRpcTransport implements IMessageTransport {
	readonly #subscription: IDisposable;
	readonly #pending: JsonRpcMessage[] = [];
	readonly #secret: string;
	readonly #sendEnvelope: (message: unknown) => void | PromiseLike<boolean>;
	#listener: ((message: JsonRpcMessage) => void) | undefined;
	#disposed = false;

	constructor(
		secret: string,
		sendEnvelope: (message: unknown) => void | PromiseLike<boolean>,
		subscribe: (listener: (message: unknown) => void) => IDisposable,
	) {
		this.#secret = secret;
		this.#sendEnvelope = sendEnvelope;
		this.#subscription = subscribe(value => {
			const received = envelope.safeParse(value);
			if (this.#disposed || !received.success || received.data.messageSecret !== this.#secret) {
				return;
			}
			const parsed = rpcMessage.safeParse(received.data.message);
			if (!parsed.success) {
				throw new Error('Invalid Markdown editor RPC envelope');
			}
			if (this.#listener && this.#pending.length === 0) {
				this.#listener(parsed.data);
			} else {
				this.#pending.push(parsed.data);
			}
		});
	}

	async send(message: JsonRpcMessage): Promise<void> {
		if (this.#disposed) {
			// HubRPC may finish an incoming handler after close has aborted its signal.
			if (isResponse(message)) {
				return;
			}
			throw new Error('Markdown editor RPC transport is disposed');
		}
		const accepted = await this.#sendEnvelope({ channel: 'markdownEditor', messageSecret: this.#secret, message });
		if (accepted === false) {
			throw new Error('Markdown editor webview rejected RPC message');
		}
	}

	setListener(listener: ((message: JsonRpcMessage) => void) | undefined): void {
		this.#listener = this.#disposed ? undefined : listener;
		if (this.#listener && this.#pending.length) {
			queueMicrotask(() => {
				while (this.#listener && this.#pending.length) {
					this.#listener(this.#pending.shift()!);
				}
			});
		}
	}

	dispose(): void {
		this.#disposed = true;
		this.#listener = undefined;
		this.#pending.length = 0;
		this.#subscription.dispose();
	}
}
