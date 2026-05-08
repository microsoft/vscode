/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * @fileoverview postMessage protocol shared between TaskBoardPanel.ts and
 * the React webview app. Mirrors the host's existing message contracts.
 */

export type SubtaskState =
	| 'backlog'
	| 'ready'
	| 'in-progress'
	| 'review'
	| 'done'
	| 'failed';

export interface BoardTaskView {
	readonly id: string;
	readonly instruction: string;
	readonly assignee: string;
	readonly scopeFiles: ReadonlyArray<string>;
	readonly dependencies: ReadonlyArray<string>;
	readonly state: SubtaskState;
	readonly startedAt?: number;
	readonly finishedAt?: number;
	readonly summary?: string;
	readonly tokenUsage?: { input: number; output: number };
}

export interface BoardSnapshotView {
	readonly conversationId: string;
	readonly createdAt: number;
	readonly tasks: ReadonlyArray<BoardTaskView>;
}

export interface PersonaView {
	readonly id: string;
	readonly monogram: string;
	readonly accent: string;
	readonly tagline: string;
}

/** Host -> webview: snapshot push. */
export interface SnapshotMessage {
	readonly type: 'snapshot';
	readonly conversationId: string | null;
	readonly conversationTitle: string;
	readonly snapshot: BoardSnapshotView | null;
	readonly personas: ReadonlyArray<PersonaView>;
}

/** Host -> webview: a streamed chat-runtime chunk for a pending request. */
export interface ChatRuntimeChunkMessage {
	readonly type: 'chat-runtime-chunk';
	readonly requestId: string;
	readonly event:
		| { readonly type: 'token'; readonly token: string }
		| { readonly type: 'complete'; readonly fullText: string }
		| { readonly type: 'error'; readonly error: string }
		| {
			readonly type: 'tool-call';
			readonly id: string;
			readonly name: string;
			readonly input: Record<string, unknown>;
		};
}

/**
 * Loose JSON-Schema tool definition shape forwarded from the webview to
 * the host. Mirrors `LlmClient.ToolDefinition` structurally — keeping
 * the surface narrow lets us avoid pulling a core dep into the protocol
 * module.
 */
export interface ChatToolDefinition {
	readonly name: string;
	readonly description: string;
	readonly inputSchema: {
		readonly type: 'object';
		readonly properties: Record<string, unknown>;
		readonly required?: ReadonlyArray<string>;
	};
}

export type HostToWebviewMessage = SnapshotMessage | ChatRuntimeChunkMessage;

/** Webview -> host: drag-drop / button actions on the existing protocol. */
export interface DispatchMessage { readonly type: 'dispatch'; readonly taskId: string }
export interface ReassignMessage { readonly type: 'reassign'; readonly taskId: string; readonly newAssignee: string }
export interface RerunMessage { readonly type: 'rerun'; readonly taskId: string }
export interface RevealMessage { readonly type: 'reveal'; readonly taskId: string }
export interface RefreshMessage { readonly type: 'refresh' }

/** Webview -> host: agent-driven board mutations (CopilotKit actions). */
export type BoardActionName =
	| 'moveCard'
	| 'addCard'
	| 'setCardStatus'
	| 'setCardAssignee'
	| 'setCardPriority';

export interface BoardActionMessage {
	readonly type: 'board-action';
	readonly action: BoardActionName;
	readonly cardId?: string;
	readonly toColumn?: SubtaskState;
	readonly assignee?: string;
	readonly priority?: 'low' | 'medium' | 'high';
	readonly instruction?: string;
}

/** Webview -> host: chat-runtime invocation (streamed LLM call). */
export interface ChatRuntimeRequestMessage {
	readonly type: 'chat-runtime';
	readonly requestId: string;
	readonly model: string;
	readonly messages: ReadonlyArray<{ readonly role: 'system' | 'user' | 'assistant'; readonly content: string }>;
	readonly tools?: ReadonlyArray<ChatToolDefinition>;
}

export type WebviewToHostMessage =
	| DispatchMessage
	| ReassignMessage
	| RerunMessage
	| RevealMessage
	| RefreshMessage
	| BoardActionMessage
	| ChatRuntimeRequestMessage;
