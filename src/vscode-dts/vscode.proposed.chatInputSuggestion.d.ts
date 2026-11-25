/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// Push a suggested next message for one session. Core renders it as ghost text in every
	// chat input bound to that session. For an open question it selects the suggested options,
	// marked as suggested, until the user answers otherwise, and shows the free-form part as
	// ghost text in the answer box. For a plan review it marks the suggested action. Tab accepts
	// ghost text; nothing is ever sent without the user.

	export interface ChatInputSuggestionQuestionAnswer {
		/** Option labels to select for this question, as the question labels them. */
		readonly selectedOptions?: readonly string[];
		/** Ghost text for this question's answer box. */
		readonly freeform?: string;
	}

	export interface ChatInputSuggestionAnswer {
		/** The open question (carousel) this answers. */
		readonly questionId?: string;
		/** The open plan review this answers. */
		readonly reviewId?: string;
		/** Option labels to select (an open question) or mark as suggested (a plan review). */
		readonly selectedOptions?: readonly string[];
		/** Ghost text for the free-form answer of a question carousel with one question, or the review feedback. */
		readonly freeform?: string;
		/** One answer per question of the carousel, in its order. Takes the place of `selectedOptions` and `freeform`. */
		readonly questions?: readonly ChatInputSuggestionQuestionAnswer[];
	}

	export interface ChatInputSuggestion {
		readonly id: string;
		/** The request that handed back; the suggestion is invalid once another starts. */
		readonly validForTurn?: string;
		/** Ghost text for the chat input. */
		readonly text?: string;
		readonly answer?: ChatInputSuggestionAnswer;
	}

	export enum ChatInputSuggestionState {
		Shown = 1,
		Hidden = 2,
		Accepted = 3,
		PartiallyAccepted = 4,
		Rejected = 5,
		Superseded = 6,
		Invalidated = 7
	}

	export interface ChatInputSuggestionEvent {
		readonly id: string;
		readonly session: Uri;
		readonly state: ChatInputSuggestionState;
		/** For `Accepted` / `PartiallyAccepted`: how many characters went into the input. */
		readonly acceptedChars?: number;
		/** For an answer: the options the user picked when it was accepted. */
		readonly selectedOptions?: readonly string[];
		readonly host: ChatSessionHost;
		/** For `Hidden` before it was ever shown: why (e.g. `userTypedFirst`). */
		readonly reason?: string;
	}

	export enum ChatRequestSubmissionKind {
		Send = 1,
		Steer = 2,
		Queue = 3,
		Answer = 4,
		PlanDecision = 5
	}

	export interface ChatRequestSubmission {
		readonly session: Uri;
		readonly requestId: string;
		readonly text: string;
		readonly kind: ChatRequestSubmissionKind;
		readonly host: ChatSessionHost;
		/** Set by core when the submitted text came through accepting a suggestion. */
		readonly fromSuggestion?: { readonly id: string; readonly acceptedChars: number };
		/** Set by core when the submitted text came from a draft request. */
		readonly fromDraft?: { readonly id: string };
	}

	export namespace chat {
		/**
		 * Set (or clear, with `undefined`) the suggestion for a session. Resolves `false` when the editor kept
		 * what the session's input offers instead, so as never to drop what the user typed: the new one
		 * doesn't go on from their words (case and spacing aside), or they are typing along, or editing
		 * after Tab, the one it would replace.
		 */
		export function setChatInputSuggestion(session: Uri, suggestion: ChatInputSuggestion | undefined): Thenable<boolean>;
		export const onDidChangeChatInputSuggestion: Event<ChatInputSuggestionEvent>;
		/** Every message, answer or plan decision the user sends to a session, in this window. */
		export const onDidSendChatRequest: Event<ChatRequestSubmission>;
	}
}
