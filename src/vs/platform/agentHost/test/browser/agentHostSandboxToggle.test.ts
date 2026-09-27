/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { createAgentHostSandboxToggle, equalsAgentHostSandboxTogglePresentation, getAgentHostSandboxToggleState } from '../../browser/agentHostSandboxToggle.js';

suite('AgentHostSandboxToggle', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	for (const scenario of [
		{
			name: 'mandatory policy overrides an explicit off choice',
			state: { sessionEnabled: false, globalEnabled: false, managedEnabled: true, allowsBypass: false },
			expected: { checked: true, disabled: true },
		},
		{
			name: 'mandatory policy overrides an unset choice',
			state: { sessionEnabled: undefined, globalEnabled: false, managedEnabled: true, allowsBypass: false },
			expected: { checked: true, disabled: true },
		},
		{
			name: 'explicit off overrides managed and global defaults when bypass is allowed',
			state: { sessionEnabled: false, globalEnabled: true, managedEnabled: true, allowsBypass: true },
			expected: { checked: false, disabled: false },
		},
		{
			name: 'explicit on overrides the global default',
			state: { sessionEnabled: true, globalEnabled: false, managedEnabled: false, allowsBypass: false },
			expected: { checked: true, disabled: false },
		},
		{
			name: 'explicit off overrides the global default',
			state: { sessionEnabled: false, globalEnabled: true, managedEnabled: false, allowsBypass: false },
			expected: { checked: false, disabled: false },
		},
		{
			name: 'an unset choice follows the managed default',
			state: { sessionEnabled: undefined, globalEnabled: false, managedEnabled: true, allowsBypass: true },
			expected: { checked: true, disabled: false },
		},
		{
			name: 'an unset choice follows the enabled global default',
			state: { sessionEnabled: undefined, globalEnabled: true, managedEnabled: false, allowsBypass: false },
			expected: { checked: true, disabled: false },
		},
		{
			name: 'an unset choice follows the disabled global default',
			state: { sessionEnabled: undefined, globalEnabled: false, managedEnabled: false, allowsBypass: true },
			expected: { checked: false, disabled: false },
		},
	]) {
		test(scenario.name, () => {
			assert.deepStrictEqual(getAgentHostSandboxToggleState({ provider: 'copilotcli', ...scenario.state }), scenario.expected);
		});
	}

	test('presentation reflects managed policy without writing a session choice', () => {
		const writes: boolean[] = [];
		const states = [
			{ sessionEnabled: undefined, globalEnabled: false, managedEnabled: false, allowsBypass: false },
			{ sessionEnabled: undefined, globalEnabled: false, managedEnabled: true, allowsBypass: true },
			{ sessionEnabled: false, globalEnabled: false, managedEnabled: true, allowsBypass: false },
		];
		const toggles = states.map(state => {
			const { label, title, checked, disabled } = createAgentHostSandboxToggle(() => ({ provider: 'copilotcli', ...state }), enabled => writes.push(enabled))!;
			return { label, title, checked, disabled };
		});
		assert.deepStrictEqual({ toggles, writes }, {
			toggles: [
				{
					label: 'Sandboxing for terminal',
					title: 'Run this session\'s terminal commands inside a sandbox that restricts file system and network access. This choice is saved for this session only.',
					checked: false,
					disabled: false,
				},
				{
					label: 'Sandboxing for terminal',
					title: 'Sandboxing is enabled by your organization, but you may disable it',
					checked: true,
					disabled: false,
				},
				{
					label: 'Sandboxing for terminal',
					title: 'Sandboxing is required by your organization',
					checked: true,
					disabled: true,
				},
			],
			writes: [],
		});
	});

	test('change callback rechecks policy and forwards only permitted choices', () => {
		const writes: boolean[] = [];
		const state = { provider: 'copilotcli', sessionEnabled: undefined, globalEnabled: false, managedEnabled: false, allowsBypass: false };
		const toggle = createAgentHostSandboxToggle(() => state, enabled => writes.push(enabled))!;
		toggle.onChange(true);
		state.managedEnabled = true;
		toggle.onChange(false);
		const blockedWrites = [...writes];
		state.allowsBypass = true;
		toggle.onChange(false);
		assert.deepStrictEqual({ blockedWrites, writes }, { blockedWrites: [true], writes: [true, false] });
	});

	test('same-value changes do not write or materialize a session choice', () => {
		const writes: boolean[] = [];
		const state = { provider: 'copilotcli', sessionEnabled: undefined as boolean | undefined, globalEnabled: false, managedEnabled: false, allowsBypass: true };
		const toggle = createAgentHostSandboxToggle(() => state, enabled => {
			writes.push(enabled);
			state.sessionEnabled = enabled;
		})!;
		toggle.onChange(false);
		const initialSelection = state.sessionEnabled;
		toggle.onChange(true);
		toggle.onChange(true);
		toggle.onChange(false);
		toggle.onChange(false);
		assert.deepStrictEqual({ initialSelection, writes }, { initialSelection: undefined, writes: [true, false] });
	});

	test('matching session updates do not change the clicked toggle presentation', () => {
		const state = { provider: 'copilotcli', sessionEnabled: undefined as boolean | undefined, globalEnabled: true, managedEnabled: false, allowsBypass: true };
		const updates: { enabled: boolean; unchanged: boolean }[] = [];
		const toggle = createAgentHostSandboxToggle(() => state, enabled => {
			state.sessionEnabled = enabled;
			const resolvedToggle = createAgentHostSandboxToggle(() => state, () => { });
			updates.push({ enabled, unchanged: equalsAgentHostSandboxTogglePresentation(toggle, resolvedToggle) });
		})!;
		toggle.onChange(false);
		toggle.onChange(true);
		assert.deepStrictEqual(updates, [
			{ enabled: false, unchanged: true },
			{ enabled: true, unchanged: true },
		]);
	});

	test('consecutive clicks track the displayed value before session updates arrive', () => {
		const writes: boolean[] = [];
		const state = { provider: 'copilotcli', sessionEnabled: undefined, globalEnabled: true, managedEnabled: false, allowsBypass: true };
		const toggle = createAgentHostSandboxToggle(() => state, enabled => writes.push(enabled))!;
		toggle.onChange(false);
		toggle.onChange(false);
		toggle.onChange(true);
		assert.deepStrictEqual({ checked: toggle.checked, writes }, { checked: true, writes: [false, true] });
	});

	test('external session and policy changes still change the clicked toggle presentation', () => {
		const state = { provider: 'copilotcli', sessionEnabled: undefined as boolean | undefined, globalEnabled: true, managedEnabled: false, allowsBypass: true };
		const toggle = createAgentHostSandboxToggle(() => state, enabled => { state.sessionEnabled = enabled; })!;
		toggle.onChange(false);
		state.sessionEnabled = true;
		const externalToggle = createAgentHostSandboxToggle(() => state, () => { });
		state.sessionEnabled = false;
		state.managedEnabled = true;
		state.allowsBypass = false;
		const managedToggle = createAgentHostSandboxToggle(() => state, () => { });
		assert.deepStrictEqual({
			externalUnchanged: equalsAgentHostSandboxTogglePresentation(toggle, externalToggle),
			managedUnchanged: equalsAgentHostSandboxTogglePresentation(toggle, managedToggle),
		}, { externalUnchanged: false, managedUnchanged: false });
	});

	test('only the Copilot harness exposes a sandbox toggle', () => {
		const writes: boolean[] = [];
		const results = ['claude', 'codex', 'local', 'unknown', undefined].map(provider => {
			const state = { provider, sessionEnabled: true, globalEnabled: true, managedEnabled: true, allowsBypass: false };
			return {
				state: getAgentHostSandboxToggleState(state),
				toggle: createAgentHostSandboxToggle(() => state, enabled => writes.push(enabled)),
			};
		});
		assert.deepStrictEqual({ results, writes }, {
			results: Array.from({ length: 5 }, () => ({ state: undefined, toggle: undefined })),
			writes: [],
		});
	});

	test('change callback rejects a switch to another harness', () => {
		const writes: boolean[] = [];
		const state = { provider: 'copilotcli', sessionEnabled: undefined, globalEnabled: false, managedEnabled: false, allowsBypass: true };
		const toggle = createAgentHostSandboxToggle(() => state, enabled => writes.push(enabled))!;
		state.provider = 'claude';
		toggle.onChange(true);
		assert.deepStrictEqual(writes, []);
	});
});
