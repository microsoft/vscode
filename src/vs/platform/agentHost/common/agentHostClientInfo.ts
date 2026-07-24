/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Implementation } from './state/protocol/common/commands.js';

const EDITOR_WINDOW_CLIENT_NAME = 'visual-studio-code-editor-window';
const AGENTS_WINDOW_CLIENT_NAME = 'visual-studio-code-agents-window';

export const enum AgentHostClientType {
	EditorWindow = 'editor_window',
	AgentsWindow = 'agents_window',
	Unknown = 'unknown',
}

export const editorWindowAgentHostClientInfo: Readonly<Implementation> = Object.freeze({
	name: EDITOR_WINDOW_CLIENT_NAME,
	title: 'Visual Studio Code',
});

export const agentsWindowAgentHostClientInfo: Readonly<Implementation> = Object.freeze({
	name: AGENTS_WINDOW_CLIENT_NAME,
	title: 'Visual Studio Code Agents Window',
});

export function getAgentHostClientType(clientInfo: Implementation | undefined): AgentHostClientType {
	switch (clientInfo?.name) {
		case EDITOR_WINDOW_CLIENT_NAME:
			return AgentHostClientType.EditorWindow;
		case AGENTS_WINDOW_CLIENT_NAME:
			return AgentHostClientType.AgentsWindow;
		default:
			return AgentHostClientType.Unknown;
	}
}
