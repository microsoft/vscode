/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { SessionEventPayload } from '@github/copilot-sdk';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getCopilotApprovalConfig, getCopilotApprovalPolicy, resolveCopilotManagedSettings } from '../../node/copilot/copilotApprovalPolicy.js';
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
				assert.deepStrictEqual({
					choices: getAvailableSessionApprovalValues(getSessionApprovalProperty(config.schema)!, config.schema, config.values),
					selected: config.values.effectiveApprovalMode,
					fallbackInjected: policy.permissions.disableAssistedPermissionsMode === true,
				}, {
					choices: expected,
					selected: old === true && expected.includes('autoApprove') ? 'autoApprove' : 'default',
					fallbackInjected: old === false && !restriction.configured,
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
});
