/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { getSessionApplication } from '../../common/sessionApplication.js';

suite('SessionApplication', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('groups client slugs and cloud event types by the surface that started the session', () => {
		const surfaces: Record<string, readonly string[]> = {
			'vscode: VS Code': ['vscode', 'copilot-vscode', 'vscode-editor-window', 'vscode-agents-window', 'visual_studio_code_remote_agent_tool_invoked'],
			'github/cli: Copilot CLI': ['github/cli', 'copilot-cli', 'cli_delegate_command', 'gh_cli'],
			'github/autopilot: Copilot App': ['github/autopilot', 'copilot-app'],
			'copilot-mobile: GitHub Mobile': ['copilot-mobile-ios', 'copilot-mobile-android', 'ios_mobile_mission_control', 'android_mobile_mission_control', 'ios_mobile_repo_profile', 'android_mobile_repo_profile'],
			'copilot-web: GitHub': [
				'copilot-web', 'agents_panel', 'agents_page', 'activity_panel', 'repo_agents', 'repo_agents_sidebar', 'new_agent_task_button', 'new_agent_task_button_code_view', 'new_repository_prompt', 'chat', 'legacy_chat', 'copilot-chat-spec-task',
				'issues_agent_assignment', 'issue_assignment', 'issue_assigned', 'issue_created', 'issue_comment_created', 'sub_issue_added',
				'pull_request_comment', 'pull_request_comment_non_copilot_pull_request', 'pull_request_review', 'pull_request_review_requested', 'agent_merge', 'merge_conflict', 'code_review_fix_with_copilot',
				'fix_failed_workflow', 'workflow_run_failed', 'ci_check_run_failure_analysis',
				'code_scanning_alert', 'code_scanning_alerts_assignment', 'secret_scanning_alert', 'dependabot_alert', 'verification_platform_findings',
				'discussion_opened', 'discussion_comment',
			],
			'slack: Slack': ['slack'],
			'teams: Microsoft Teams': ['teams'],
			'linear: Linear': ['linear_webhook'],
			'jira: Jira': ['jira_issue'],
			'azure-boards: Azure Boards': ['azure_boards'],
			'raycast: Raycast': ['raycast'],
			'jetbrains: JetBrains': ['jetbrains'],
			'visual-studio: Visual Studio': ['visual_studio'],
			'github-mcp-server: GitHub MCP': ['mcp_tool'],
			'claude: Claude': ['claude'],
			'codex: Codex': ['codex'],
			'automations: Automations': ['interval_triggered', 'manual_triggered', 'automation_completed', 'automation_failed'],
			'unknown: Unknown': ['agent_tasks_api', 'agent_tasks_public_api', 'api_call_received', 'unknown_graphql_event', 'unknown'],
			'some_future_surface: Some Future Surface': ['some_future_surface'],
		};
		const actual: Record<string, string[]> = {};
		for (const name of Object.values(surfaces).flat()) {
			const application = getSessionApplication(name);
			(actual[`${application.id}: ${application.label}`] ??= []).push(name);
		}
		assert.deepStrictEqual(actual, surfaces);
	});

	test('does not mistake generic task event types for creating applications', () => {
		assert.deepStrictEqual([
			'agent_tasks_api', 'agent_tasks_public_api', 'api_call_received', 'unknown_graphql_event', 'unknown',
		].map(name => getSessionApplication(name, 'Task API')), Array(5).fill({ id: 'unknown', label: 'Unknown' }));
	});

	test('preserves legacy sources and unknown future client identities', () => {
		assert.deepStrictEqual([
			'visual_studio_code_remote_agent_tool_invoked', 'slack', 'teams', 'issues_agent_assignment', 'custom_client',
		].map(name => getSessionApplication(name)), [
			{ id: 'vscode', label: 'VS Code' },
			{ id: 'slack', label: 'Slack' },
			{ id: 'teams', label: 'Microsoft Teams' },
			{ id: 'copilot-web', label: 'GitHub' },
			{ id: 'custom_client', label: 'Custom Client' },
		]);
	});
});
