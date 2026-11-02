/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { uppercaseFirstLetter } from '../../base/common/strings.js';
import { localize } from '../../nls.js';
import type { ISessionApplication } from '../services/sessions/common/session.js';

export const UNKNOWN_SESSION_APPLICATION_ID = 'unknown';

type KnownSessionApplicationId =
	| typeof UNKNOWN_SESSION_APPLICATION_ID
	| 'vscode'
	| 'github/cli'
	| 'github/autopilot'
	| 'copilot-web'
	| 'copilot-mobile'
	| 'slack'
	| 'teams'
	| 'linear'
	| 'jira'
	| 'azure-boards'
	| 'raycast'
	| 'jetbrains'
	| 'visual-studio'
	| 'github-mcp-server'
	| 'claude'
	| 'codex'
	| 'automations';

/**
 * Resolves the application that started a session from a reported client or event name.
 * Agent host clients, Mission Control creator client slugs, and free-form cloud task
 * `event_type` values chosen by each producer are grouped by the surface they represent.
 * Unknown names keep their identity and receive a readable label.
 */
export function getSessionApplication(name: string, title?: string): ISessionApplication {
	const id = getKnownSessionApplicationId(name);
	if (id) {
		return { id, label: getKnownSessionApplicationLabel(id) };
	}
	return { id: name, label: title || name.replace(/_/g, ' ').toLowerCase().split(' ').map(uppercaseFirstLetter).join(' ') };
}

function getKnownSessionApplicationId(name: string): KnownSessionApplicationId | undefined {
	switch (name) {
		// Generic task event types do not identify the creating application, including in older caches.
		case 'agent_tasks_api':
		case 'agent_tasks_public_api':
		case 'api_call_received':
		case 'unknown_graphql_event':
		case 'unknown':
			return UNKNOWN_SESSION_APPLICATION_ID;
		case 'vscode':
		case 'copilot-vscode':
		case 'vscode-editor-window':
		case 'vscode-agents-window':
			return 'vscode';
		case 'github/cli':
		case 'copilot-cli':
		case 'cli_delegate_command':
		case 'gh_cli':
			return 'github/cli';
		case 'github/autopilot':
		case 'copilot-app':
			return 'github/autopilot';
		case 'copilot-mobile-ios':
		case 'copilot-mobile-android':
			return 'copilot-mobile';
		case 'copilot-web':
		case 'agents_panel':
		case 'agents_page':
		case 'activity_panel':
		case 'new_repository_prompt':
		case 'chat':
		case 'legacy_chat':
		case 'copilot-chat-spec-task':
		case 'issues_agent_assignment':
		case 'sub_issue_added':
		case 'agent_merge':
		case 'merge_conflict':
		case 'code_review_fix_with_copilot':
		case 'fix_failed_workflow':
		case 'workflow_run_failed':
		case 'ci_check_run_failure_analysis':
		case 'code_scanning_alert':
		case 'code_scanning_alerts_assignment':
		case 'secret_scanning_alert':
		case 'dependabot_alert':
		case 'verification_platform_findings':
			return 'copilot-web';
		case 'slack':
			return 'slack';
		case 'teams':
			return 'teams';
		case 'linear_webhook':
			return 'linear';
		case 'jira_issue':
			return 'jira';
		case 'azure_boards':
			return 'azure-boards';
		case 'raycast':
			return 'raycast';
		case 'jetbrains':
			return 'jetbrains';
		case 'visual_studio':
			return 'visual-studio';
		case 'mcp_tool':
			return 'github-mcp-server';
		case 'claude':
			return 'claude';
		case 'codex':
			return 'codex';
		case 'interval_triggered':
		case 'manual_triggered':
		case 'automation_completed':
		case 'automation_failed':
			return 'automations';
	}
	if (name.startsWith('visual_studio_code')) {
		return 'vscode';
	}
	// GitHub Mobile prefixes its event types with the platform, e.g. ios_mobile_mission_control.
	if (name.startsWith('ios_') || name.startsWith('android_')) {
		return 'copilot-mobile';
	}
	if (['issue_', 'pull_request_', 'discussion_', 'repo_agents', 'new_agent_task_button'].some(prefix => name.startsWith(prefix))) {
		return 'copilot-web';
	}
	return undefined;
}

function getKnownSessionApplicationLabel(id: KnownSessionApplicationId): string {
	switch (id) {
		case UNKNOWN_SESSION_APPLICATION_ID:
			return localize('application.unknown', "Unknown");
		case 'vscode':
			return localize('application.vscode', "VS Code");
		case 'github/cli':
			return localize('application.copilotCli', "Copilot CLI");
		case 'github/autopilot':
			return localize('application.copilotApp', "Copilot App");
		case 'copilot-web':
			return localize('application.github', "GitHub");
		case 'copilot-mobile':
			return localize('application.githubMobile', "GitHub Mobile");
		case 'slack':
			return localize('application.slack', "Slack");
		case 'teams':
			return localize('application.teams', "Microsoft Teams");
		case 'linear':
			return localize('application.linear', "Linear");
		case 'jira':
			return localize('application.jira', "Jira");
		case 'azure-boards':
			return localize('application.azureBoards', "Azure Boards");
		case 'raycast':
			return localize('application.raycast', "Raycast");
		case 'jetbrains':
			return localize('application.jetbrains', "JetBrains");
		case 'visual-studio':
			return localize('application.visualStudio', "Visual Studio");
		case 'github-mcp-server':
			return localize('application.githubMcp', "GitHub MCP");
		case 'claude':
			return localize('application.claude', "Claude");
		case 'codex':
			return localize('application.codex', "Codex");
		case 'automations':
			return localize('application.automations', "Automations");
	}
}
