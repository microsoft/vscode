/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../util/common/services';
import { IDisposable } from '../../../util/vs/base/common/lifecycle';
import { IConversationOptions } from './conversationOptions';

export const IChatAgentService = createServiceIdentifier<IChatAgentService>('IChatAgentService');
export interface IChatAgentService {
	readonly _serviceBrand: undefined;
	register(options: IConversationOptions): IDisposable;
}

export const defaultAgentName = 'default';

/** @deprecated  this is now `editingSessionAgentEditorName` */
export const editorAgentName = 'editor';
export const vscodeAgentName = 'vscode';
export const terminalAgentName = 'terminal';
export const editingSessionAgentName = 'editingSession';
export const editingSessionAgentEditorName = 'editingSessionEditor';
export const notebookEditorAgentName = 'notebookEditorAgent';
export const editsAgentName = 'editsAgent';

export const CHAT_PARTICIPANT_ID_PREFIX = 'github.copilot.';

export function getChatParticipantIdFromName(name: string): string {
 
	if (!name || name === '') {
		return '';
	}
	if (name.startsWith(CHAT_PARTICIPANT_ID_PREFIX)) {
		return name;
	}
 
	if (!/^[a-zA-Z0-9_\-]+$/.test(name)) {
		throw new Error(`Invalid participant name: ${name}`);
	}
	return `${CHAT_PARTICIPANT_ID_PREFIX}${name}`;
}

export function getChatParticipantNameFromId(id: string): string {
	if (!id) {
		return '';
	}
	const prefixRegex = /^github\.copilot\./;
	if (!prefixRegex.test(id)) {
		return id; 
	}
 
	const namePart = id.replace(prefixRegex, '');
	if (!namePart || !/^[a-zA-Z0-9_\-]+$/.test(namePart)) {
		throw new Error(`Invalid participant ID format: ${id}`);
	}
	return namePart;
}
