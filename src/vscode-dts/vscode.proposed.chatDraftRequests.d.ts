/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// A third pending-request kind, `Draft`: shown in a session's pending list beside Steering
	// and Queued, never sent on its own. The user edits it, makes it a steering or queued
	// message, or discards it. In the chat input, Tab takes the draft into the input and
	// Escape discards it.

	export interface ChatDraftRequest {
		readonly id: string;
		readonly text: string;
		/** The divider label, e.g. "Suggested by NAP". */
		readonly label: string;
		/** One line under the draft: why it was suggested. */
		readonly detail?: string;
		/** Show a warning badge with this text: the draft relays someone else's instruction. */
		readonly warning?: string;
	}

	export enum ChatDraftRequestState {
		Shown = 1,
		Hidden = 2,
		Editing = 3
	}

	export enum ChatDraftRequestOutcome {
		Steered = 1,
		Queued = 2,
		Sent = 3,
		Discarded = 4,
		Expired = 5
	}

	export interface ChatDraftRequestStateChange {
		readonly state: ChatDraftRequestState;
		readonly host: ChatSessionHost;
	}

	export interface ChatDraftRequestResolution {
		readonly outcome: ChatDraftRequestOutcome;
		/** The text that was sent or queued, after any edits. */
		readonly finalText?: string;
		readonly edited: boolean;
		/** For `Discarded`: the reason chip the user picked, if any. */
		readonly reason?: string;
		/** The request the draft became, for `Steered` / `Queued` / `Sent`. */
		readonly requestId?: string;
	}

	export interface ChatDraftRequestHandle extends Disposable {
		readonly id: string;
		update(draft: { readonly text?: string; readonly label?: string; readonly detail?: string; readonly warning?: string }): void;
		readonly onDidChangeState: Event<ChatDraftRequestStateChange>;
		readonly onDidEnd: Event<ChatDraftRequestResolution>;
	}

	export namespace chat {
		/** Add a draft to a session's pending list. One per session per extension: a new one replaces the old. */
		export function addChatDraftRequest(session: Uri, draft: ChatDraftRequest): ChatDraftRequestHandle;
	}
}
