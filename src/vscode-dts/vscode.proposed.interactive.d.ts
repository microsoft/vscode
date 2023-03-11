/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// todo@API make classes
	export interface InteractiveEditorSession {
		placeholder?: string;
	}

	// todo@API make classes
	export interface InteractiveEditorRequest {
		session: InteractiveEditorSession;
		prompt: string;

		selection: Selection;
		wholeRange: Range;
	}

	// todo@API make classes
	export interface InteractiveEditorResponse {
		edits: TextEdit[];
		placeholder?: string;
	}

	export interface TextDocumentContext {
		document: TextDocument;
		selection: Selection;
		action?: string;
	}

	export interface InteractiveEditorSessionProvider {
		// Create a session. The lifetime of this session is the duration of the editing session with the input mode widget.
		prepareInteractiveEditorSession(context: TextDocumentContext, token: CancellationToken): ProviderResult<InteractiveEditorSession>;

		provideInteractiveEditorResponse(request: InteractiveEditorRequest, token: CancellationToken): ProviderResult<InteractiveEditorResponse>;

		// eslint-disable-next-line local/vscode-dts-provider-naming
		releaseInteractiveEditorSession?(session: InteractiveEditorSession): any;
	}


	export interface InteractiveSessionState { }

	export interface InteractiveSessionParticipantInformation {
		name: string;

		/**
		 * A full URI for the icon of the participant.
		 */
		icon?: Uri;
	}

	export interface InteractiveSession {
		// TODO Will be required
		requester?: InteractiveSessionParticipantInformation;
		responder?: InteractiveSessionParticipantInformation;

		saveState?(): InteractiveSessionState;
	}

	export interface InteractiveSessionRequestArgs {
		command: string;
		args: any;
	}

	export interface InteractiveRequest {
		session: InteractiveSession;
		message: string;
	}

	export interface InteractiveResponseErrorDetails {
		message: string;
		responseIsIncomplete?: boolean;
	}

	export interface InteractiveResponseForProgress {
		followups?: string[];
		commands?: InteractiveResponseCommand[];
		errorDetails?: InteractiveResponseErrorDetails;
	}

	export interface InteractiveProgressContent {
		content: string;
	}

	export interface InteractiveProgressId {
		responseId: string;
	}

	export type InteractiveProgress = InteractiveProgressContent | InteractiveProgressId;

	export interface InteractiveResponseCommand {
		commandId: string;
		args: any[];
		title: string; // supports codicon strings
	}

	export interface InteractiveSessionSlashCommand {
		command: string;
		kind: CompletionItemKind;
		detail?: string;
	}

	export interface InteractiveSessionProvider {
		provideInitialSuggestions?(token: CancellationToken): ProviderResult<string[]>;
		provideSlashCommands?(session: InteractiveSession, token: CancellationToken): ProviderResult<InteractiveSessionSlashCommand[]>;

		prepareSession(initialState: InteractiveSessionState | undefined, token: CancellationToken): ProviderResult<InteractiveSession>;
		resolveRequest(session: InteractiveSession, context: InteractiveSessionRequestArgs | string, token: CancellationToken): ProviderResult<InteractiveRequest>;
		provideResponseWithProgress(request: InteractiveRequest, progress: Progress<InteractiveProgress>, token: CancellationToken): ProviderResult<InteractiveResponseForProgress>;
	}

	export enum InteractiveSessionVoteDirection {
		Up = 1,
		Down = 2
	}

	export interface InteractiveSessionVoteAction {
		kind: 'vote';
		responseId: string;
		direction: InteractiveSessionVoteDirection;
	}

	export interface InteractiveSessionCopyAction {
		kind: 'copy';
		responseId: string;
		codeBlockIndex: number;
	}

	export interface InteractiveSessionInsertAction {
		kind: 'insert';
		responseId: string;
		codeBlockIndex: number;
	}

	export type InteractiveSessionUserAction = InteractiveSessionVoteAction | InteractiveSessionCopyAction | InteractiveSessionInsertAction;

	export interface InteractiveSessionUserActionEvent {
		action: InteractiveSessionUserAction;
		providerId: string;
	}

	export namespace interactive {
		// current version of the proposal.
		export const _version: 2 | number;

		export function registerInteractiveSessionProvider(id: string, provider: InteractiveSessionProvider): Disposable;
		export function addInteractiveRequest(context: InteractiveSessionRequestArgs): void;

		export function registerInteractiveEditorSessionProvider(provider: InteractiveEditorSessionProvider): Disposable;

		export const onDidPerformUserAction: Event<InteractiveSessionUserActionEvent>;
	}
}
