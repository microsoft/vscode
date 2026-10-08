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
			name: 'managed enablement overrides an unconfirmed off choice even when bypass is allowed',
			state: { sessionEnabled: false, globalEnabled: true, managedEnabled: true, allowsBypass: true },
			expected: { checked: true, disabled: true },
		},
		{
			name: 'confirmed session bypass permits re-enablement',
			state: { sessionEnabled: false, confirmedEnabled: false, globalEnabled: true, managedEnabled: true, allowsBypass: true },
			expected: { checked: false, disabled: false },
		},
		{
			name: 'revoking bypass overrides a previously confirmed off choice',
			state: { sessionEnabled: false, confirmedEnabled: false, globalEnabled: true, managedEnabled: true, allowsBypass: false },
			expected: { checked: true, disabled: true },
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
			name: 'an unset choice follows and locks the managed requirement',
			state: { sessionEnabled: undefined, globalEnabled: false, managedEnabled: true, allowsBypass: true },
			expected: { checked: true, disabled: true },
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
					title: 'Run this session\'s terminal commands inside a sandbox that restricts file system and network access. The applied setting is saved for this session and checked against current organization policy when restored.',
					checked: false,
					disabled: false,
				},
				{
					label: 'Sandboxing for terminal',
					title: 'Sandboxing is required by your organization',
					checked: true,
					disabled: true,
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

	test('preserves a requested On choice for unsupported containers and allows only an explicit opt-out', () => {
		const writes: boolean[] = [];
		const state = {
			provider: 'copilotcli', sessionEnabled: undefined, globalEnabled: true, managedEnabled: false, allowsBypass: false,
			devContainerSandboxSupported: false,
		};
		const toggle = createAgentHostSandboxToggle(() => state, enabled => writes.push(enabled))!;
		const before = { checked: toggle.checked, disabled: toggle.disabled };
		toggle.onChange(false);
		toggle.onChange(true);
		assert.deepStrictEqual({ before, after: { checked: toggle.checked, disabled: toggle.disabled }, writes }, {
			before: { checked: true, disabled: false },
			after: { checked: false, disabled: true },
			writes: [false],
		});
	});

	test('an unsupported container does not permit opting out of a managed requirement', () => {
		const writes: boolean[] = [];
		const toggle = createAgentHostSandboxToggle(() => ({
			provider: 'copilotcli', sessionEnabled: true, globalEnabled: true, managedEnabled: true, allowsBypass: false,
			devContainerSandboxSupported: false,
		}), enabled => writes.push(enabled))!;
		toggle.onChange(false);
		assert.deepStrictEqual({ checked: toggle.checked, disabled: toggle.disabled, writes }, { checked: true, disabled: true, writes: [] });
	});

	test('explains relaxed Docker isolation before starting a sandboxed Dev Container', () => {
		const toggle = createAgentHostSandboxToggle(() => ({
			provider: 'copilotcli', sessionEnabled: true, globalEnabled: false, managedEnabled: false, allowsBypass: false,
			devContainer: true,
		}), () => { })!;
		assert.deepStrictEqual({
			label: toggle.label, checked: toggle.checked, disabled: toggle.disabled,
			explainsIsolation: toggle.title?.includes('relaxes the outer container\'s isolation'),
			explainsTun: toggle.title?.includes('/dev/net/tun'),
		}, { label: 'Sandboxing in Dev Container', checked: true, disabled: false, explainsIsolation: true, explainsTun: true });
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
		assert.deepStrictEqual({ blockedWrites, writes }, { blockedWrites: [true], writes: [true] });
	});

	test('confirmed bypass allows turning on once and immediately locks direct disabling', () => {
		const writes: boolean[] = [];
		const state = { provider: 'copilotcli', sessionEnabled: false, confirmedEnabled: false, globalEnabled: true, managedEnabled: true, allowsBypass: true };
		const toggle = createAgentHostSandboxToggle(() => state, enabled => writes.push(enabled))!;
		const before = { checked: toggle.checked, disabled: toggle.disabled, title: toggle.title };
		toggle.onChange(true);
		toggle.onChange(false);
		assert.deepStrictEqual({ before, checked: toggle.checked, disabled: toggle.disabled, writes }, {
			before: { checked: false, disabled: false, title: 'Sandboxing was disabled for this session through an approved bypass. You can enable it again.' },
			checked: true, disabled: true, writes: [true],
		});
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
