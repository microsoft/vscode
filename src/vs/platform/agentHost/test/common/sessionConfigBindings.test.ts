/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { filterSessionConfigValues, getAvailableSessionApprovalChoices, getEffectiveSessionApprovalValue, getSessionApprovalBinding, getSessionConfigPresentationKey, getSessionModeBinding, getSessionWorkspaceBinding, readSessionConfigBinding, validateSessionConfigWrite, writeSessionConfigBinding } from '../../common/sessionConfigBindings.js';
import type { SessionConfigSchema } from '../../common/state/protocol/commands.js';

suite('Session config bindings', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const copilot: SessionConfigSchema = {
		type: 'object',
		properties: {
			approvalMode: { type: 'string', title: 'Approvals', enum: ['manual', 'assisted', 'allow-all'], default: 'assisted', sessionMutable: true },
			effectiveApprovalMode: { type: 'string', title: 'Effective approvals', readOnly: true },
			availableApprovalModes: { type: 'array', title: 'Available approvals', readOnly: true },
			target: { type: 'string', title: 'Target', enum: ['workspace', 'worktree'], default: 'workspace', sessionMutable: false },
			baseBranch: { type: 'string', title: 'Base branch', enum: [], enumDynamic: true, sessionMutable: false },
			branch: { type: 'string', title: 'New branch', sessionMutable: false },
			mode: { type: 'string', title: 'Mode', enum: ['interactive', 'plan', 'autopilot'], sessionMutable: true },
		},
	};

	const vscode: SessionConfigSchema = {
		type: 'object',
		properties: {
			autoApprove: { type: 'string', title: 'Approvals', enum: ['default', 'assisted', 'autoApprove'], default: 'default', sessionMutable: true },
			isolation: { type: 'string', title: 'Isolation', enum: ['folder', 'worktree'], default: 'folder', sessionMutable: false },
			branch: { type: 'string', title: 'Base branch', enum: ['main', 'release'], default: 'main', sessionMutable: false },
			mode: { type: 'string', title: 'Mode', enum: ['interactive', 'plan'], default: 'interactive', sessionMutable: true },
		},
	};

	test('VS Code bindings preserve existing choices, defaults, and the meaning of branch', () => {
		const approval = getSessionApprovalBinding(vscode);
		const workspace = getSessionWorkspaceBinding(vscode);
		assert.deepStrictEqual({
			approval: { key: approval?.key, choices: approval?.choices, default: readSessionConfigBinding(approval, approval?.schema.default) },
			workspace: { isolation: workspace.isolation?.key, folder: writeSessionConfigBinding(workspace.isolation, 'folder'), branch: workspace.baseBranch?.key },
			effective: getEffectiveSessionApprovalValue(approval!, vscode, { autoApprove: 'assisted' }),
			presentation: getSessionConfigPresentationKey('branch', vscode),
		}, {
			approval: { key: 'autoApprove', choices: ['default', 'assisted', 'autoApprove'].map(value => ({ value, configValue: value })), default: 'default' },
			workspace: { isolation: 'isolation', folder: 'folder', branch: 'branch' },
			effective: 'assisted', presentation: 'branch',
		});
	});

	for (const [name, schema, values, runtime] of [
		['VS Code', vscode, { autoApprove: 'assisted', isolation: 'worktree', branch: 'release', mode: 'plan' }, { autoApprove: 'assisted', mode: 'plan' }],
		['Copilot D', copilot, { approvalMode: 'assisted', target: 'worktree', baseBranch: 'release', mode: 'plan' }, { approvalMode: 'assisted', mode: 'plan' }],
	] as const) {
		test(`${name} schema filters stale aliases without renaming advertised keys`, () => {
			const remembered = { autoApprove: 'autoApprove', isolation: 'folder', branch: 'release', approvalMode: 'allow-all', target: 'workspace', baseBranch: 'main', mode: 'interactive' };
			assert.deepStrictEqual({
				creation: filterSessionConfigValues(schema, values),
				runtime: filterSessionConfigValues(schema, values, false),
				empty: filterSessionConfigValues(schema, {}),
				keys: Object.keys(filterSessionConfigValues(schema, remembered)).sort(),
			}, {
				creation: values, runtime, empty: {},
				keys: name === 'VS Code' ? ['autoApprove', 'branch', 'isolation', 'mode'] : ['approvalMode', 'baseBranch', 'branch', 'mode', 'target'],
			});
		});
	}

	test('maps approval choices without changing host keys or values', () => {
		const binding = getSessionApprovalBinding(copilot)!;
		assert.deepStrictEqual({
			key: binding.key,
			defaultLevel: readSessionConfigBinding(binding, binding.schema.default),
			read: binding.choices.map(choice => readSessionConfigBinding(binding, choice.configValue)),
			write: ['default', 'assisted', 'autoApprove', 'autopilot'].map(value => writeSessionConfigBinding(binding, value)),
		}, {
			key: 'approvalMode', defaultLevel: 'assisted',
			read: ['default', 'assisted', 'autoApprove'],
			write: ['manual', 'assisted', 'allow-all', undefined],
		});
	});

	test('prefers the whole VS convention independent of property order', () => {
		const schemas = [false, true].map(reverse => ({
			type: 'object' as const,
			properties: Object.fromEntries((reverse ? Object.entries(copilot.properties).reverse() : Object.entries(copilot.properties)).concat([
				['autoApprove', { type: 'string', title: 'VS approvals', enum: ['default', 'autoApprove'] }],
				['isolation', { type: 'string', title: 'VS isolation', enum: ['folder', 'worktree'] }],
			])),
		}));
		assert.deepStrictEqual(schemas.map(schema => ({
			approval: getSessionApprovalBinding(schema)?.key,
			isolation: getSessionWorkspaceBinding(schema).isolation?.key,
			branch: getSessionWorkspaceBinding(schema).baseBranch?.key,
		})), [
			{ approval: 'autoApprove', isolation: 'isolation', branch: undefined },
			{ approval: 'autoApprove', isolation: 'isolation', branch: undefined },
		]);
	});

	test('malformed VS keys never fall through to a Copilot binding or mix workspace axes', () => {
		const schema: SessionConfigSchema = {
			...copilot,
			properties: {
				...copilot.properties,
				autoApprove: { type: 'string', title: 'Custom approvals', enum: ['custom'] },
				isolation: { type: 'string', title: 'Custom isolation', enum: ['sandbox'] },
			},
		};
		assert.deepStrictEqual({
			approval: getSessionApprovalBinding(schema),
			isolation: getSessionWorkspaceBinding(schema).isolation,
			branch: getSessionWorkspaceBinding(schema).baseBranch,
			filtered: filterSessionConfigValues(schema, { autoApprove: 'custom', approvalMode: 'allow-all', isolation: 'sandbox', target: 'worktree', baseBranch: 'main' }),
		}, {
			approval: undefined, isolation: undefined, branch: undefined,
			filtered: { autoApprove: 'custom', isolation: 'sandbox' },
		});
	});

	test('distinguishes Copilot base branch from the new branch name', () => {
		const binding = getSessionWorkspaceBinding(copilot);
		assert.deepStrictEqual({
			isolationKey: binding.isolation?.key,
			workspaceValue: writeSessionConfigBinding(binding.isolation, 'folder'),
			baseBranch: binding.baseBranch?.key,
			presentation: ['target', 'baseBranch', 'branch'].map(key => getSessionConfigPresentationKey(key, copilot)),
		}, {
			isolationKey: 'target', workspaceValue: 'workspace', baseBranch: 'baseBranch',
			presentation: ['isolation', 'branch', 'newBranch'],
		});
	});

	test('native mode remains on the advertised mode axis', () => {
		const binding = getSessionModeBinding(copilot);
		assert.deepStrictEqual({
			key: binding?.key,
			choices: binding?.choices,
			write: writeSessionConfigBinding(binding, 'autopilot'),
			unadvertised: writeSessionConfigBinding(binding, 'shell'),
		}, {
			key: 'mode',
			choices: ['interactive', 'plan', 'autopilot'].map(value => ({ value, configValue: value })),
			write: 'autopilot', unadvertised: undefined,
		});
	});

	test('keeps requested approvals distinct from effective and available modes', () => {
		const binding = getSessionApprovalBinding(copilot)!;
		const values = { approvalMode: 'allow-all', effectiveApprovalMode: 'manual', availableApprovalModes: ['manual', 'assisted'] };
		assert.deepStrictEqual({
			effective: getEffectiveSessionApprovalValue(binding, copilot, values),
			requested: values.approvalMode,
			choices: getAvailableSessionApprovalChoices(binding, copilot, values).map(choice => choice.configValue),
			absent: getEffectiveSessionApprovalValue(binding, copilot, { approvalMode: 'assisted' }),
			unknown: readSessionConfigBinding(binding, getEffectiveSessionApprovalValue(binding, copilot, { effectiveApprovalMode: 'unknown' })),
			emptyChoices: getAvailableSessionApprovalChoices(binding, copilot, { availableApprovalModes: [] }),
		}, {
			effective: 'manual', requested: 'allow-all', choices: ['manual', 'assisted'],
			absent: 'assisted', unknown: undefined, emptyChoices: [],
		});
	});

	test('filters unsupported VS seeds, host reports, and immutable runtime writes', () => {
		const values = { autoApprove: 'autoApprove', isolation: 'worktree', worktreeBranchPrefix: 'user/', approvalMode: 'assisted', effectiveApprovalMode: 'manual', availableApprovalModes: ['manual', 'assisted'], target: 'worktree', baseBranch: 'main', branch: 'new-session', mode: 'plan' };
		assert.deepStrictEqual({
			creation: filterSessionConfigValues(copilot, values),
			runtime: filterSessionConfigValues(copilot, values, false),
			noDefaultInvented: filterSessionConfigValues(copilot, {}),
		}, {
			creation: { approvalMode: 'assisted', target: 'worktree', baseBranch: 'main', branch: 'new-session', mode: 'plan' },
			runtime: { approvalMode: 'assisted', mode: 'plan' },
			noDefaultInvented: {},
		});
	});

	test('rejects unavailable, readonly, unadvertised and immutable writes before dispatch', () => {
		assert.throws(() => validateSessionConfigWrite(copilot, { availableApprovalModes: ['manual'] }, 'approvalMode', 'allow-all', false), /does not offer/);
		assert.throws(() => validateSessionConfigWrite(copilot, {}, 'effectiveApprovalMode', 'allow-all', true), /not writable/);
		assert.throws(() => validateSessionConfigWrite(copilot, {}, 'autoApprove', 'autoApprove', true), /not writable/);
		assert.throws(() => validateSessionConfigWrite(copilot, {}, 'target', 'workspace', false), /not writable/);
	});
});
