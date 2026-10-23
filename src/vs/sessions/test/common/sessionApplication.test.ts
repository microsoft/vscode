/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { getSessionApplication } from '../../common/sessionApplication.js';

suite('SessionApplication', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('normalizes Mission Control clients to existing application identities', () => {
		assert.deepStrictEqual([
			'copilot-vscode', 'copilot-cli', 'copilot-app', 'copilot-web', 'copilot-mobile-ios', 'copilot-mobile-android',
		].map(name => getSessionApplication(name)), [
			{ id: 'vscode', label: 'VS Code' },
			{ id: 'github/cli', label: 'Copilot CLI' },
			{ id: 'github/autopilot', label: 'Copilot App' },
			{ id: 'copilot-web', label: 'GitHub' },
			{ id: 'copilot-mobile-ios', label: 'GitHub Mobile (iOS)' },
			{ id: 'copilot-mobile-android', label: 'GitHub Mobile (Android)' },
		]);
	});

	test('does not mistake generic task event types for creating applications', () => {
		assert.deepStrictEqual([
			'agent_tasks_api', 'agent_tasks_public_api', 'api_call_received', 'unknown',
		].map(name => getSessionApplication(name, 'Task API')), Array(4).fill({ id: 'unknown', label: 'Unknown' }));
	});

	test('preserves legacy sources and unknown future client identities', () => {
		assert.deepStrictEqual([
			'visual_studio_code_remote_agent_tool_invoked', 'slack', 'teams', 'issues_agent_assignment', 'custom_client',
		].map(name => getSessionApplication(name)), [
			{ id: 'vscode', label: 'VS Code' },
			{ id: 'slack', label: 'Slack' },
			{ id: 'teams', label: 'Teams' },
			{ id: 'issues_agent_assignment', label: 'Issues Assignment' },
			{ id: 'custom_client', label: 'Custom Client' },
		]);
	});
});
