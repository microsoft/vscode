/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AgentStack } from '../agents/AgentStackFactory';
import { AgentHandle } from '../agents/types';
import { AgentEvent } from './agentEvents';

/**
 * Bridges the multi-agent stack into a streaming, event-based API the WebView
 * chat consumes. Wraps the long-lived AgentStack — never instantiates agents
 * itself — so chat-participant and webview surfaces share state.
 */
export class AgentBridge {
	constructor(private readonly stack: AgentStack) { }

	/**
	 * True if the supplied specialist id maps to an agent we can drive end-to-end.
	 * Used by the chat surface to decide between the agent path and the legacy
	 * direct-LLM fallback (e.g. for specialists not yet promoted into the stack).
	 */
	hasAgent(specialistId: string): boolean {
		if (specialistId === 'anton') {
			return true;
		}
		return this.stack.specialists.has(specialistId as AgentHandle);
	}

	/**
	 * Run the orchestrator end-to-end for `userMessage`. Streams orchestrator
	 * progress as `token` events (the markdown shim) and structured
	 * plan/subtask events through the dedicated `structuredEmit` channel.
	 * Concludes with a `final` event carrying the accumulated text.
	 */
	async runOrchestrator(
		userMessage: string,
		emit: (event: AgentEvent) => void,
		cancellation: vscode.CancellationToken,
	): Promise<void> {
		const stream = createShimResponseStream(emit);
		const request = createShimChatRequest(userMessage);
		const chatContext = createShimChatContext();

		try {
			await this.stack.orchestrator.handleChatRequest(
				request,
				chatContext,
				stream,
				cancellation,
				emit,
			);
			emit({ type: 'final', text: stream.getBuffer() });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			emit({ type: 'error', message });
		}
	}

	/**
	 * Drive a single specialist agent against `userMessage`. Streams the
	 * specialist's LLM output as `token` events and finishes with `final`.
	 * Throws if the supplied handle has no registered agent.
	 */
	async runSpecialist(
		handle: AgentHandle,
		userMessage: string,
		emit: (event: AgentEvent) => void,
		cancellation: vscode.CancellationToken,
	): Promise<void> {
		const agent = this.stack.specialists.get(handle);
		if (!agent) {
			throw new Error(`No agent registered for specialist "${handle}"`);
		}

		try {
			const text = await agent.runChatTurn(userMessage, token => {
				emit({ type: 'token', token });
			}, cancellation);
			emit({ type: 'final', text });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			emit({ type: 'error', message });
		}
	}
}

/**
 * Minimal in-memory shim for `vscode.ChatResponseStream`. The orchestrator
 * was authored against the chat-participant API and calls `markdown` /
 * `progress` heavily; we route each call into a `token` event so the
 * webview gets the same prose live.
 *
 * The cast to `vscode.ChatResponseStream` is unavoidable: the real interface
 * exposes a wide surface (anchor, button, filetree, push, etc.) that the
 * orchestrator does not currently exercise. We provide enough for current
 * usage; new method calls would surface as runtime TypeError, which is
 * acceptable because compilation is the unit test for "have we covered
 * the surface" today.
 */
interface ShimResponseStream extends vscode.ChatResponseStream {
	getBuffer(): string;
}

function createShimResponseStream(emit: (event: AgentEvent) => void): ShimResponseStream {
	let buffer = '';
	const emitToken = (text: string): void => {
		if (!text) {
			return;
		}
		buffer += text;
		emit({ type: 'token', token: text });
	};

	const stream = {
		markdown(value: string | vscode.MarkdownString): void {
			const text = typeof value === 'string' ? value : value.value;
			emitToken(text);
		},
		anchor(_uri: vscode.Uri | vscode.Location, title?: string): void {
			if (title) {
				emitToken(title);
			}
		},
		button(_command: vscode.Command): void {
			// No-op: command buttons aren't wired through to the webview yet.
		},
		filetree(_value: vscode.ChatResponseFileTree[], _baseUri: vscode.Uri): void {
			// No-op for now — file trees can be surfaced via a follow-up event.
		},
		progress(value: string): void {
			emitToken(value);
		},
		reference(_value: vscode.Uri | vscode.Location): void {
			// No-op: references would attach to the message in the native chat
			// view but the webview tracks attachments separately.
		},
		push(_part: vscode.ChatResponsePart): void {
			// No-op: structured parts aren't surfaced through the webview.
		},
		getBuffer(): string {
			return buffer;
		},
	};

	// Cast widens the shim to the full vscode.ChatResponseStream interface.
	// WHY: ChatResponseStream's full surface is large and partially proposed-API;
	// providing every method would couple us to upstream churn for no benefit
	// while the orchestrator only exercises markdown/progress today.
	return stream as unknown as ShimResponseStream;
}

/**
 * Build the smallest `vscode.ChatRequest` shape the orchestrator reads.
 * The orchestrator only consults `prompt` and `command` today; `model`,
 * `references`, and `toolReferences` are placeholders.
 */
function createShimChatRequest(userMessage: string): vscode.ChatRequest {
	const request = {
		prompt: userMessage,
		command: undefined,
		references: [] as readonly vscode.ChatPromptReference[],
		toolReferences: [] as readonly vscode.ChatLanguageModelToolReference[],
		toolInvocationToken: undefined,
		// Cast model to the public type at the boundary — see WHY note above.
		model: undefined,
	};
	return request as unknown as vscode.ChatRequest;
}

function createShimChatContext(): vscode.ChatContext {
	const context = {
		history: [] as readonly (vscode.ChatRequestTurn | vscode.ChatResponseTurn)[],
	};
	return context as unknown as vscode.ChatContext;
}
