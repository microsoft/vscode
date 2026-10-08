/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { SandboxSettingsResolutionHelper } from '../../common/sandboxSettingsResolutionHelper.js';
import { AgentSandboxEnabledValue } from '../../common/settings.js';

suite('SandboxSettingsResolutionHelper', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('only managed true forces enablement', () => {
		for (const local of [undefined, AgentSandboxEnabledValue.Off, AgentSandboxEnabledValue.On]) {
			assert.deepStrictEqual(
				[undefined, false, true].map(managed => SandboxSettingsResolutionHelper.resolveEnabled(local, managed)),
				[local, local, AgentSandboxEnabledValue.On],
			);
		}
	});

	test('managed false denies access without widening local restrictions', () => {
		for (const local of [undefined, false, true]) {
			assert.deepStrictEqual(
				[undefined, false, true].map(managed => SandboxSettingsResolutionHelper.resolveAllowAccess(local, managed)),
				[local, false, local],
			);
		}
	});

	test('network restrictions distinguish outbound blocking from host filtering', () => {
		assert.deepStrictEqual([
			SandboxSettingsResolutionHelper.getNetworkRestrictions(AgentSandboxEnabledValue.Off, true),
			SandboxSettingsResolutionHelper.getNetworkRestrictions(AgentSandboxEnabledValue.On, true),
			SandboxSettingsResolutionHelper.getNetworkRestrictions(AgentSandboxEnabledValue.On, false),
		], [
			{ sandboxEnabled: false, allowNetwork: true, applyDomainRestrictions: false },
			{ sandboxEnabled: true, allowNetwork: true, applyDomainRestrictions: true },
			{ sandboxEnabled: true, allowNetwork: false, applyDomainRestrictions: false },
		]);
	});

	test('managed allowlists override local values, including an explicitly empty managed list', () => {
		assert.deepStrictEqual([
			SandboxSettingsResolutionHelper.resolveNetworkHosts(undefined, undefined, undefined, undefined),
			SandboxSettingsResolutionHelper.resolveNetworkHosts([], [], [], []),
			SandboxSettingsResolutionHelper.resolveNetworkHosts(undefined, undefined, ['example.com'], ['malicious.com']),
			SandboxSettingsResolutionHelper.resolveNetworkHosts([], [], ['example.com'], ['malicious.com']),
			SandboxSettingsResolutionHelper.resolveNetworkHosts(['example.com'], ['malicious.com'], undefined, undefined),
			SandboxSettingsResolutionHelper.resolveNetworkHosts(['example.com'], ['malicious.com'], [], []),
		], [
			{ allowedHosts: [], blockedHosts: [] },
			{ allowedHosts: [], blockedHosts: [] },
			{ allowedHosts: ['example.com'], blockedHosts: ['malicious.com'] },
			{ allowedHosts: ['example.com'], blockedHosts: ['malicious.com'] },
			{ allowedHosts: ['example.com'], blockedHosts: ['malicious.com'] },
			{ allowedHosts: [], blockedHosts: ['malicious.com'] },
		]);
	});

	test('uses the managed allowlist and combines blocks without mutating either source', () => {
		const localAllowed = Object.freeze(['local.example', 'shared.example', 'shared.example']);
		const managedAllowed = Object.freeze(['shared.example', 'managed.example']);
		const localBlocked = Object.freeze(['local.blocked', 'shared.blocked']);
		const managedBlocked = Object.freeze(['shared.blocked', 'managed.blocked', 'shared.example']);
		assert.deepStrictEqual(SandboxSettingsResolutionHelper.resolveNetworkHosts(localAllowed, localBlocked, managedAllowed, managedBlocked), {
			allowedHosts: ['shared.example', 'managed.example'],
			blockedHosts: ['local.blocked', 'shared.blocked', 'managed.blocked', 'shared.example'],
		});
	});

	test('preserves host patterns and wildcard blocks for the runtime to interpret', () => {
		assert.deepStrictEqual(SandboxSettingsResolutionHelper.resolveNetworkHosts(
			['EXAMPLE.COM.', '*.example.com', '[::1]'], ['local.blocked'],
			['example.com', 'api.example.com'], ['*'],
		), {
			allowedHosts: ['example.com', 'api.example.com'],
			blockedHosts: ['local.blocked', '*'],
		});
	});

	test('uses managed path grants and combines denied paths without mutating either source', () => {
		const local = Object.freeze({
			readwritePaths: Object.freeze(['/local-write', '/shared-write']),
			readonlyPaths: Object.freeze(['/local-read']),
			deniedPaths: Object.freeze(['/local-denied', '/shared-denied']),
		});
		const managed = Object.freeze({
			readwritePaths: Object.freeze(['/managed-write', '/managed-write']),
			readonlyPaths: Object.freeze([]),
			deniedPaths: Object.freeze(['/shared-denied', '/managed-denied']),
		});
		assert.deepStrictEqual(SandboxSettingsResolutionHelper.resolveFileSystemPaths(local, managed), {
			readwritePaths: ['/managed-write'],
			readonlyPaths: [],
			deniedPaths: ['/local-denied', '/shared-denied', '/managed-denied'],
		});
	});

	test('only managed true forces server sandboxing', () => {
		for (const local of [undefined, false, true]) {
			assert.deepStrictEqual(
				[undefined, false, true].map(managed => SandboxSettingsResolutionHelper.resolveSandboxServers(local, managed)),
				[local, local, true],
			);
		}
	});

	test('bypass requires managed permission under a forced sandbox and never widens the local choice', () => {
		for (const local of [undefined, false, true]) {
			for (const enabled of [undefined, false, true]) {
				assert.deepStrictEqual(
					[undefined, false, true].map(managed => SandboxSettingsResolutionHelper.resolveAllowBypass(local, managed, enabled)),
					[enabled === true ? false : local, false, local],
				);
			}
		}
	});
});
