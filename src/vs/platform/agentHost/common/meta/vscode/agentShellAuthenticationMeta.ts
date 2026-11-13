/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { escapeMarkdownSyntaxTokens } from '../../../../../base/common/htmlContent.js';
import { localize } from '../../../../../nls.js';
import { ChatInputQuestionKind, type ChatInputRequest } from '../../state/protocol/channels-chat/state.js';
import { ChatInputRequestPurpose, readChatInputRequestPurpose, withChatInputRequestPurpose } from './agentChatInputRequestMeta.js';

/** `secret` for a password or passphrase, `text` for a visible answer, `confirm` for yes or no. */
export type ShellAuthenticationInputKind = 'secret' | 'text' | 'confirm';

/** What a program run by an agent shell command asks the user for. */
export interface IShellAuthenticationPrompt {
	readonly program: string;
	readonly prompt: string;
	readonly inputKind: ShellAuthenticationInputKind;
	readonly command: string;
}

const SHELL_AUTHENTICATION_META_KEY = 'vscode.shellAuthentication';
const UNSUPPORTED_CLIENT_QUESTION_ID = 'shellAuthentication';
const UNSUPPORTED_CLIENT_CANCEL_OPTION_ID = 'cancel';

/**
 * {@link ChatInputRequest} has no declared `_meta` field. The request is carried verbatim through the protocol as
 * JSON, so an extra bag survives the round-trip.
 */
type ChatInputRequestWithMeta = ChatInputRequest & { _meta?: Record<string, unknown> };

/**
 * Creates the chat input request for a shell authentication prompt. VS Code answers it from `_meta` through
 * `vscode/answerShellAuthentication`; other clients can only cancel it.
 */
export function createShellAuthenticationRequest(id: string, prompt: IShellAuthenticationPrompt): ChatInputRequest {
	const { program, prompt: text, inputKind, command } = prompt;
	const request: ChatInputRequestWithMeta = withChatInputRequestPurpose({
		id,
		message: `${escapeMarkdownSyntaxTokens(getShellAuthenticationTitle(prompt))}\n\n${escapeMarkdownSyntaxTokens(text.trim())}`,
		questions: [{
			kind: ChatInputQuestionKind.SingleSelect,
			id: UNSUPPORTED_CLIENT_QUESTION_ID,
			message: localize('shellAuthentication.unsupportedClient', "To keep the answer out of the chat, answer this prompt in the latest version of VS Code. Here you can only cancel it."),
			required: true,
			allowFreeformInput: false,
			options: [{ id: UNSUPPORTED_CLIENT_CANCEL_OPTION_ID, label: localize('shellAuthentication.cancelPrompt', "Cancel Prompt") }],
		}],
	}, ChatInputRequestPurpose.ShellAuthentication);
	const result: ChatInputRequestWithMeta = {
		...request,
		_meta: { ...request._meta, [SHELL_AUTHENTICATION_META_KEY]: { program, prompt: text, inputKind, command } satisfies IShellAuthenticationPrompt },
	};
	return result;
}

/** Reads what a shell authentication request asks for; `undefined` for any other request. */
export function readShellAuthentication(request: ChatInputRequest): IShellAuthenticationPrompt | undefined {
	if (readChatInputRequestPurpose(request) !== ChatInputRequestPurpose.ShellAuthentication) {
		return undefined;
	}
	const value = (request as ChatInputRequestWithMeta)._meta?.[SHELL_AUTHENTICATION_META_KEY];
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const { program, prompt, inputKind, command } = value as Record<string, unknown>;
	if (typeof program !== 'string' || !program || typeof prompt !== 'string' || typeof command !== 'string'
		|| (inputKind !== 'secret' && inputKind !== 'text' && inputKind !== 'confirm')) {
		return undefined;
	}
	return { program, prompt, inputKind, command };
}

/** The plain-text heading of a shell authentication prompt, such as "sudo needs a password". */
export function getShellAuthenticationTitle({ program, inputKind }: Pick<IShellAuthenticationPrompt, 'program' | 'inputKind'>): string {
	switch (inputKind) {
		case 'secret':
			return localize('shellAuthentication.title.secret', "{0} needs a password", program);
		case 'text':
			return localize('shellAuthentication.title.text', "{0} needs your input", program);
		case 'confirm':
			return localize('shellAuthentication.title.confirm', "{0} needs confirmation", program);
	}
}
