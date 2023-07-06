/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export enum InteractiveSessionVoteDirection {
		Up = 1,
		Down = 2
	}

	export interface InteractiveSessionVoteAction {
		// eslint-disable-next-line local/vscode-dts-string-type-literals
		kind: 'vote';
		responseId: string;
		direction: InteractiveSessionVoteDirection;
	}

	export enum InteractiveSessionCopyKind {
		// Keyboard shortcut or context menu
		Action = 1,
		Toolbar = 2
	}

	export interface InteractiveSessionCopyAction {
		// eslint-disable-next-line local/vscode-dts-string-type-literals
		kind: 'copy';
		responseId: string;
		codeBlockIndex: number;
		copyType: InteractiveSessionCopyKind;
		copiedCharacters: number;
		totalCharacters: number;
		copiedText: string;
	}

	export interface InteractiveSessionInsertAction {
		// eslint-disable-next-line local/vscode-dts-string-type-literals
		kind: 'insert';
		responseId: string;
		codeBlockIndex: number;
		totalCharacters: number;
		newFile?: boolean;
	}

	export interface InteractiveSessionTerminalAction {
		// eslint-disable-next-line local/vscode-dts-string-type-literals
		kind: 'runInTerminal';
		responseId: string;
		codeBlockIndex: number;
		languageId?: string;
	}

	export interface InteractiveSessionCommandAction {
		// eslint-disable-next-line local/vscode-dts-string-type-literals
		kind: 'command';
		command: InteractiveResponseCommand;
	}

	export type InteractiveSessionUserAction = InteractiveSessionVoteAction | InteractiveSessionCopyAction | InteractiveSessionInsertAction | InteractiveSessionTerminalAction | InteractiveSessionCommandAction;

	export interface InteractiveSessionUserActionEvent {
		action: InteractiveSessionUserAction;
		providerId: string;
	}

	export namespace interactive {
		export const onDidPerformUserAction: Event<InteractiveSessionUserActionEvent>;
	}
}
