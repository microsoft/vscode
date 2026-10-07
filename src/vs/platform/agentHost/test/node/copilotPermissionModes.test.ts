/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { SessionEventPayload } from '@github/copilot-sdk';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getCopilotApprovalPreview, getCopilotAvailableApprovalModes, resolveCopilotApprovalConfig } from '../../node/copilot/copilotPermissionModes.js';

suite('Copilot managed permission modes', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const policy: SessionEventPayload<'session.managed_settings_resolved'>['data'] = {
		source: 'server', serverManaged: true, deviceManaged: false, failClosed: false,
		bypassPermissionsDisabled: false, managedKeys: ['permissions'],
	};

	test('keeps absent startup intent distinct from explicit Manual and resumed choices', () => {
		assert.deepStrictEqual([
			resolveCopilotApprovalConfig(undefined),
			resolveCopilotApprovalConfig({ autoApprove: 'default' }),
			resolveCopilotApprovalConfig({ autoApprove: 'assisted' }),
			resolveCopilotApprovalConfig({ autoApprove: 'autoApprove' }),
		].map(values => values.autoApprove), [undefined, 'default', 'assisted', 'autoApprove']);
	});

	test('projects independent restrictions and fail-closed state', () => {
		assert.deepStrictEqual([
			getCopilotAvailableApprovalModes(policy),
			getCopilotAvailableApprovalModes({ ...policy, bypassPermissionsDisabled: true }),
			getCopilotAvailableApprovalModes({ ...policy, settings: { permissions: { disableAssistedPermissionsMode: true } } }),
			getCopilotAvailableApprovalModes({ ...policy, bypassPermissionsDisabled: true, settings: { permissions: { disableAssistedPermissionsMode: true } } }),
			getCopilotAvailableApprovalModes({ ...policy, bypassPermissionsDisabled: true, failClosed: true }),
		], [
			['default', 'assisted', 'autoApprove'], ['default', 'assisted'],
			['default', 'autoApprove'], ['default'], ['default'],
		]);
	});

	for (const defaultMode of ['manual', 'assisted', 'allow-all'] as const) {
		test(`previews ${defaultMode} only when startup intent is absent`, () => {
			const resolved = { ...policy, settings: { permissions: { defaultMode } } };
			const expected = defaultMode === 'manual' ? 'default' : defaultMode === 'allow-all' ? 'autoApprove' : 'assisted';
			assert.deepStrictEqual([
				getCopilotApprovalPreview({}, resolved).effectiveApprovalMode,
				getCopilotApprovalPreview({ autoApprove: 'default' }, resolved).effectiveApprovalMode,
				getCopilotApprovalPreview({ autoApprove: 'assisted' }, resolved).effectiveApprovalMode,
				getCopilotApprovalPreview({ autoApprove: 'autoApprove' }, resolved).effectiveApprovalMode,
			], [expected, 'default', 'assisted', 'autoApprove']);
		});
	}

	test('restore preserves the saved runtime report instead of applying a new default', () => {
		const changedDefault = { ...policy, settings: { permissions: { defaultMode: 'allow-all' } } };
		assert.deepStrictEqual([
			getCopilotApprovalPreview({ effectiveApprovalMode: 'default' }, changedDefault, undefined, false).effectiveApprovalMode,
			getCopilotApprovalPreview({ effectiveApprovalMode: 'assisted' }, changedDefault, undefined, false).effectiveApprovalMode,
			getCopilotApprovalPreview({}, changedDefault, undefined, false).effectiveApprovalMode,
			getCopilotApprovalPreview({}, changedDefault).effectiveApprovalMode,
		], ['default', 'assisted', 'default', 'autoApprove']);
	});

	test('prohibited defaults fall back to Manual without restricting other choices', () => {
		assert.deepStrictEqual([
			getCopilotApprovalPreview({}, { ...policy, bypassPermissionsDisabled: true, settings: { permissions: { defaultMode: 'allow-all' } } }),
			getCopilotApprovalPreview({}, { ...policy, settings: { permissions: { defaultMode: 'assisted', disableAssistedPermissionsMode: true } } }),
			getCopilotApprovalPreview({}, policy),
		], [
			{ effectiveApprovalMode: 'default', availableApprovalModes: ['default', 'assisted'] },
			{ effectiveApprovalMode: 'default', availableApprovalModes: ['default', 'autoApprove'] },
			{ effectiveApprovalMode: 'default', availableApprovalModes: ['default', 'assisted', 'autoApprove'] },
		]);
	});

	test('global approval is previewed by the host without bypassing policy or changing intent', () => {
		const config = { autoApprove: 'assisted' };
		assert.deepStrictEqual([
			getCopilotApprovalPreview(config, policy, undefined, true, true),
			getCopilotApprovalPreview(config, policy, { disableBypassPermissionsMode: 'disable' }, true, true),
			getCopilotApprovalPreview(config, policy, { disableAssistedPermissionsMode: true, disableBypassPermissionsMode: 'disable' }),
			config,
		], [
			{ effectiveApprovalMode: 'autoApprove', availableApprovalModes: ['default', 'assisted', 'autoApprove'] },
			{ effectiveApprovalMode: 'default', availableApprovalModes: ['default', 'assisted'] },
			{ effectiveApprovalMode: 'default', availableApprovalModes: ['default'] },
			{ autoApprove: 'assisted' },
		]);
	});
});
