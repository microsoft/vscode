/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { uppercaseFirstLetter } from '../../base/common/strings.js';
import { localize } from '../../nls.js';
import type { ISessionApplication } from '../services/sessions/common/session.js';

export function getSessionApplication(name: string, title?: string): ISessionApplication {
	switch (name) {
		case 'vscode':
		case 'vscode-editor-window':
		case 'vscode-agents-window':
		case 'visual_studio_code_remote_agent_tool_invoked':
			return { id: 'vscode', label: localize('application.vscode', "VS Code") };
		case 'github/cli':
			return { id: 'github/cli', label: localize('application.copilotCli', "Copilot CLI") };
		case 'github/autopilot':
			return { id: 'github/autopilot', label: localize('application.copilotApp', "Copilot App") };
		case 'claude':
			return { id: name, label: localize('application.claude', "Claude") };
		case 'codex':
			return { id: name, label: localize('application.codex', "Codex") };
		case 'issues_agent_assignment':
			return { id: name, label: localize('application.issuesAssignment', "Issues Assignment") };
		case 'slack':
			return { id: name, label: localize('application.slack', "Slack") };
		case 'teams':
			return { id: name, label: localize('application.teams', "Teams") };
		default:
			return { id: name, label: title || name.replace(/_/g, ' ').toLowerCase().split(' ').map(uppercaseFirstLetter).join(' ') };
	}
}
