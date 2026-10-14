/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { PermissionMode, SessionEventPayload } from '@github/copilot-sdk';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CopilotSessionApprovalPolicy, fromCopilotPermissionMode, getCopilotApprovalConfig, getCopilotApprovalPolicy, resolveCopilotManagedSettings } from '../../node/copilot/copilotApprovalPolicy.js';
import { createUnmanagedCopilotSettings } from './copilotTestEvents.js';
import { getAvailableSessionApprovalValues, getSessionApprovalProperty } from '../../common/sessionConfigProperties.js';

type Resolved = SessionEventPayload<'session.managed_settings_resolved'>['data'];
const baseline: Resolved = { source: 'none', serverManaged: false, deviceManaged: false, failClosed: false, bypassPermissionsDisabled: false, managedKeys: [] };

suite('Copilot approval policy', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const restrictions: { json: Record<string, string | boolean>; available: string[]; configured: boolean }[] = [
		{ json: {}, available: ['default', 'assisted', 'autoApprove'], configured: false },
		{ json: { disableBypassPermissionsMode: 'disable' }, available: ['default', 'assisted'], configured: true },
		{ json: { disableAssistedPermissionsMode: true }, available: ['default', 'autoApprove'], configured: true },
		{ json: { disableAssistedPermissionsMode: true, disableBypassPermissionsMode: 'disable' }, available: ['default'], configured: true },
		{ json: { disableBypassPermissionsMode: 'enable' }, available: ['default', 'assisted', 'autoApprove'], configured: true },
		{ json: { disableAssistedPermissionsMode: false }, available: ['default', 'assisted', 'autoApprove'], configured: true },
	];

	for (const old of [undefined, false, true]) {
		for (const restriction of restrictions) {
			test(`legacy=${old}, managed=${JSON.stringify(restriction.json)}`, () => {
				const resolved: Resolved = { ...baseline, settings: { permissions: restriction.json }, bypassPermissionsDisabled: restriction.json.disableBypassPermissionsMode === 'disable' };
				const policy = getCopilotApprovalPolicy(resolved, old === false);
				const expected = old === false && !restriction.configured ? ['default'] : restriction.available;
				const config = getCopilotApprovalConfig({}, policy, old === true);
				const sessionPolicy = new CopilotSessionApprovalPolicy();
				sessionPolicy.setLaunchPolicy(resolved, {});
				const selection = sessionPolicy.resolveSelection({ requested: undefined, legacyRestricted: old === false, globalAutoApprove: old === true });
				assert.deepStrictEqual({
					choices: getAvailableSessionApprovalValues(getSessionApprovalProperty(config.schema)!, config.schema, config.values),
					selected: config.values.effectiveApprovalMode,
					fallbackInjected: policy.permissions.disableAssistedPermissionsMode === true,
					sessionSelected: fromCopilotPermissionMode(selection.mode),
					sessionChoices: sessionPolicy.getAppliedConfig(selection.mode).availableApprovalModes,
				}, {
					choices: expected,
					selected: old === true && expected.includes('autoApprove') ? 'autoApprove' : 'default',
					fallbackInjected: old === false && !restriction.configured,
					sessionSelected: config.values.effectiveApprovalMode,
					sessionChoices: expected,
				});
			});
		}
	}

	test('a managed default alone does not replace the legacy restriction', () => {
		const resolved: Resolved = { ...baseline, settings: { permissions: { defaultMode: 'assisted' } } };
		assert.deepStrictEqual([
			getCopilotApprovalConfig({}, getCopilotApprovalPolicy(resolved, false), false).values.autoApprove,
			getCopilotApprovalConfig({}, getCopilotApprovalPolicy(resolved, true), false).values.autoApprove,
			getCopilotApprovalConfig({ autoApprove: 'default' }, getCopilotApprovalPolicy(resolved, false), false).values.autoApprove,
		], ['assisted', 'default', 'default']);
	});

	test('global approval changes the effective report without replacing the session choice', () => {
		const policy = getCopilotApprovalPolicy(baseline, false);
		const overridden = getCopilotApprovalConfig({ autoApprove: 'assisted' }, policy, true);
		const restored = getCopilotApprovalConfig(overridden.values, policy, false);
		assert.deepStrictEqual({
			requested: overridden.values.autoApprove, effective: overridden.values.effectiveApprovalMode,
			after: restored.values.effectiveApprovalMode,
		}, { requested: 'assisted', effective: 'autoApprove', after: 'assisted' });
	});
	test('defaults are validated against available modes without changing the caller input', () => {
		const config = { autoApprove: 'assisted' };
		const policy = getCopilotApprovalPolicy({ ...baseline, settings: { permissions: { defaultMode: 'assisted', disableAssistedPermissionsMode: true } } }, false);
		assert.deepStrictEqual({
			defaultMode: policy.defaultMode,
			effective: getCopilotApprovalConfig(config, policy, false).values.autoApprove,
			original: config,
		}, { defaultMode: 'default', effective: 'default', original: { autoApprove: 'assisted' } });
	});

	test('new mode precedence does not override per-tool bridge restrictions', () => {
		const policy = getCopilotApprovalPolicy({ ...baseline, settings: { permissions: { disableBypassPermissionsMode: 'enable' } } }, true,
			{ disableBypassPermissionsMode: 'disable', ask: ['Shell'] });
		assert.deepStrictEqual(policy, {
			available: ['default', 'assisted'], defaultMode: 'default',
			permissions: { disableBypassPermissionsMode: 'disable', ask: ['Shell'] },
		});
	});

	test('invalid or missing new restrictions do not opt out of the legacy fallback', () => {
		const settings: Resolved['settings'][] = [
			undefined, {}, { permissions: {} }, { permissions: { disableAssistedPermissionsMode: 'false' } }, { permissions: { disableBypassPermissionsMode: 'typo' } },
		];
		assert.deepStrictEqual(settings.map(settings => getCopilotApprovalPolicy({ ...baseline, settings }, true).available), Array.from({ length: 5 }, () => ['default']));
	});

	test('runtime fail-closed state remains restrictive despite explicit new settings', () => {
		assert.deepStrictEqual(getCopilotApprovalPolicy({ ...baseline, failClosed: true, settings: { permissions: { disableBypassPermissionsMode: 'enable' } } }, true).available, ['default']);
	});

	test('sessionless resolution includes account and working directory for policy helpers', async () => {
		const rpc = createUnmanagedCopilotSettings();
		const requests: Parameters<typeof rpc.resolve>[0][] = [];
		const resolve = rpc.resolve;
		rpc.resolve = async params => { requests.push(params); return resolve(params); };
		await resolveCopilotManagedSettings(rpc, 'test-token', 1000, '/test/workspace');
		assert.deepStrictEqual(requests, [{ clientName: 'vscode-agent-host', gitHubToken: 'test-token', workingDirectory: '/test/workspace' }]);
	});

	test('launch snapshots do not apply until selection and runtime observations remain immediate', () => {
		const policy = new CopilotSessionApprovalPolicy();
		const inputs = { requested: 'autoApprove' as const, legacyRestricted: false, globalAutoApprove: false };
		policy.setLaunchPolicy(baseline, { disableBypassPermissionsMode: 'disable' });
		const beforeSelection = { bypass: policy.isBypassApprovals(inputs), report: policy.getAppliedConfig('manual') };
		const selected = policy.resolveSelection(inputs);
		const afterSelection = { bypass: policy.isBypassApprovals(inputs), report: policy.getAppliedConfig(selected.mode) };
		policy.observeRuntimePolicy(baseline);
		const afterEvent = policy.isBypassApprovals(inputs);
		const nextSelection = policy.resolveSelection(inputs);
		assert.deepStrictEqual({ beforeSelection, selected, afterSelection, afterEvent, nextSelection }, {
			beforeSelection: { bypass: true, report: { effectiveApprovalMode: 'default' } },
			selected: { mode: 'manual', configuredLevel: 'default' },
			afterSelection: { bypass: false, report: { effectiveApprovalMode: 'default', availableApprovalModes: ['default', 'assisted'] } },
			afterEvent: true,
			nextSelection: { mode: 'manual', configuredLevel: 'default' },
		});
	});

	test('runtime observation before launch is intersected when selection is resolved', () => {
		const policy = new CopilotSessionApprovalPolicy();
		policy.observeRuntimePolicy({ ...baseline, bypassPermissionsDisabled: true });
		policy.setLaunchPolicy(baseline, {});
		const selection = policy.resolveSelection({ requested: 'autoApprove', legacyRestricted: false, globalAutoApprove: false });
		assert.deepStrictEqual({ selection, report: policy.getAppliedConfig(selection.mode) }, {
			selection: { mode: 'manual', configuredLevel: 'default' },
			report: { effectiveApprovalMode: 'default', availableApprovalModes: ['default', 'assisted'] },
		});
	});

	test('preserves managed defaults, explicit Manual, and global override without retaining a requested mode', () => {
		const policy = new CopilotSessionApprovalPolicy();
		policy.setLaunchPolicy({ ...baseline, settings: { permissions: { defaultMode: 'assisted' } } }, {});
		const requested = [undefined, 'default', 'assisted'] as const;
		assert.deepStrictEqual(requested.map(requested => {
			const inputs = { requested, legacyRestricted: false, globalAutoApprove: false };
			return [policy.resolveSelection(inputs), policy.resolveSelection({ ...inputs, globalAutoApprove: true }), policy.resolveSelection(inputs)];
		}), [
			[{ mode: 'assisted', configuredLevel: 'assisted' }, { mode: 'allow-all', configuredLevel: 'assisted' }, { mode: 'assisted', configuredLevel: 'assisted' }],
			[{ mode: 'manual', configuredLevel: 'default' }, { mode: 'allow-all', configuredLevel: 'default' }, { mode: 'manual', configuredLevel: 'default' }],
			[{ mode: 'assisted', configuredLevel: 'assisted' }, { mode: 'allow-all', configuredLevel: 'assisted' }, { mode: 'assisted', configuredLevel: 'assisted' }],
		]);
	});

	test('unresolved policy retains the legacy clamp without claiming a runtime availability report', () => {
		const policy = new CopilotSessionApprovalPolicy();
		assert.deepStrictEqual({
			selection: policy.resolveSelection({ requested: 'assisted', legacyRestricted: true, globalAutoApprove: true }),
			report: policy.getAppliedConfig('manual'),
			rejected: policy.canAcceptRuntimeResult('allow-all', { success: false, mode: 'manual' }),
		}, { selection: { mode: 'manual', configuredLevel: 'default' }, report: { effectiveApprovalMode: 'default' }, rejected: false });
	});

	test('runtime-result acceptance uses the latest observation rather than the selection snapshot', () => {
		const policy = new CopilotSessionApprovalPolicy();
		policy.setLaunchPolicy(baseline, {});
		const requested = policy.resolveSelection({ requested: 'autoApprove', legacyRestricted: false, globalAutoApprove: false }).mode;
		const before = policy.canAcceptRuntimeResult(requested, { success: false, mode: 'manual' });
		policy.observeRuntimePolicy({ ...baseline, bypassPermissionsDisabled: true });
		const after = policy.canAcceptRuntimeResult(requested, { success: false, mode: 'manual' });
		assert.deepStrictEqual({ before, after, report: policy.getAppliedConfig('manual') }, {
			before: false, after: true, report: { effectiveApprovalMode: 'default', availableApprovalModes: ['default', 'assisted'] },
		});
	});

	for (const success of [false, true]) {
		test(`accepts runtime results by current availability, not by mode ranking (success=${success})`, () => {
			const policy = new CopilotSessionApprovalPolicy();
			policy.observeRuntimePolicy({ ...baseline, settings: { permissions: { disableAssistedPermissionsMode: true } } });
			const modes: PermissionMode[] = ['manual', 'assisted', 'allow-all'];
			assert.deepStrictEqual(modes.map(requested => modes.map(mode => policy.canAcceptRuntimeResult(requested, { success, mode }))), success
				? [[true, true, true], [true, true, true], [true, true, true]]
				: [[false, false, false], [true, false, true], [false, false, false]]);
		});
	}
});
