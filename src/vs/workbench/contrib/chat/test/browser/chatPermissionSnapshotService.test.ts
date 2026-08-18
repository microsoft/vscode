/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AgentProvider } from '../../../../../platform/agentHost/common/agentService.js';
import { buildManagedSnapshot } from '../../browser/permissions/chatPermissionSnapshotService.js';
import { ChatPermissionDomainId, ChatPermissionScope, ChatPermissionUnavailableReason } from '../../common/permissions/chatPermissions.js';

suite('chatPermissionSnapshotService', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function diagnostic(settings: unknown, overrides: Partial<{ failClosed: boolean; bypassPermissionsDisabled: boolean; permissionsAllowIntersected: boolean }> = {}) {
		return {
			provider: 'copilot' as AgentProvider,
			snapshot: {
				source: 'server' as const,
				serverManaged: true,
				deviceManaged: false,
				failClosed: false,
				bypassPermissionsDisabled: false,
				managedKeys: ['permissions'],
				settings,
				...overrides,
			},
		};
	}

	test('projects managed rules and reports only the managed scope as resolved', () => {
		const snapshot = buildManagedSnapshot([diagnostic({
			permissions: {
				deny: ['Shell(rm -rf *)'],
				ask: ['Domain(*.internal.corp)'],
				allow: ['Read(src/**)'],
			},
		})]);

		assert.deepStrictEqual(snapshot, {
			state: 'available',
			rules: [
				{ id: 'managed:deny:Shell(rm -rf *)', domain: ChatPermissionDomainId.Terminal, kind: 'Shell', argument: 'rm -rf *', effect: 'deny', scope: ChatPermissionScope.Managed, editable: false },
				{ id: 'managed:ask:Domain(*.internal.corp)', domain: ChatPermissionDomainId.Network, kind: 'Domain', argument: '*.internal.corp', effect: 'ask', scope: ChatPermissionScope.Managed, editable: false },
				{ id: 'managed:allow:Read(src/**)', domain: ChatPermissionDomainId.Files, kind: 'Read', argument: 'src/**', effect: 'allow', scope: ChatPermissionScope.Managed, editable: false },
			],
			ceiling: { mode: 'manual', bypassRestriction: undefined, failClosed: false, allowIntersected: false },
			resolvedScopes: [ChatPermissionScope.Managed],
		});
	});

	test('treats the resolved verdict as a floor the raw settings cannot soften', () => {
		// `allow-auto-only` is honored only when the runtime also reports bypass as disabled, and
		// `failClosed` forces the strictest restriction regardless of what the settings name.
		const cases = [
			buildManagedSnapshot([diagnostic({ permissions: { disableBypassPermissionsMode: 'allow-auto-only' } }, { bypassPermissionsDisabled: true })]),
			buildManagedSnapshot([diagnostic({ permissions: { disableBypassPermissionsMode: 'allow-auto-only' } }, { failClosed: true })]),
			buildManagedSnapshot([diagnostic({ permissions: {} }, { bypassPermissionsDisabled: true })]),
			buildManagedSnapshot([diagnostic({ permissions: {} })]),
		];

		assert.deepStrictEqual(
			cases.map(snapshot => snapshot.state === 'available' ? snapshot.ceiling.bypassRestriction : 'n/a'),
			['allowAutoOnly', 'disable', 'disable', undefined],
		);
	});

	test('carries the ceiling flags, taking the most restrictive bypass restriction', () => {
		const snapshot = buildManagedSnapshot([
			diagnostic({ permissions: { disableBypassPermissionsMode: 'allow-auto-only' } }, { bypassPermissionsDisabled: true }),
			diagnostic({ permissions: { disableBypassPermissionsMode: 'disable' } }, { failClosed: true, permissionsAllowIntersected: true }),
		]);

		assert.deepStrictEqual(snapshot.state === 'available' && snapshot.ceiling, {
			mode: 'manual',
			bypassRestriction: 'disable',
			failClosed: true,
			allowIntersected: true,
		});
	});

	test('is unavailable rather than empty when no provider reports a snapshot', () => {
		assert.deepStrictEqual(
			buildManagedSnapshot([{ provider: 'copilot' as AgentProvider, error: 'probe failed' }]),
			{ state: 'unavailable', reason: ChatPermissionUnavailableReason.NotSupported },
		);
	});

	test('deduplicates a rule enforced by more than one provider', () => {
		const snapshot = buildManagedSnapshot([
			diagnostic({ permissions: { deny: ['Shell(curl *)'] } }),
			diagnostic({ permissions: { deny: ['Shell(curl *)'] } }),
		]);

		assert.deepStrictEqual(snapshot.state === 'available' && snapshot.rules.length, 1);
	});
});
