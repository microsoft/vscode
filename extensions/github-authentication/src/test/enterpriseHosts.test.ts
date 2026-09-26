/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { EnterpriseHostDescriptor, getEnterpriseHostConfigurations, planEnterpriseHosts } from '../common/enterpriseHosts';

suite('GitHub Enterprise host planning', () => {
	const original = vscode.Uri.parse('https://TENANT.example/Team/');
	const alias = vscode.Uri.parse('https://tenant.example/Team');
	const originalStorage = 'TENANT.example/Team/.ghes.auth';
	const aliasStorage = 'tenant.example/Team.ghes.auth';

	test('retains raw aliases while normalizing and ordering instances', () => {
		assert.deepStrictEqual(getEnterpriseHostConfigurations([alias, original, alias]).map(host => ({
			key: host.key,
			storageCandidates: host.storageCandidates
		})), [{ key: 'https://tenant.example/Team', storageCandidates: [originalStorage, aliasStorage] }]);
	});

	test('prefers populated storage regardless of alias order on first upgrade', () => {
		for (const uris of [[original, alias], [alias, original]]) {
			const plan = planEnterpriseHosts(getEnterpriseHostConfigurations(uris), [], {}, new Set([originalStorage]));
			assert.deepStrictEqual({
				storage: plan.hosts.map(host => host.storageKey),
				added: plan.added.length,
				removed: plan.removed.length,
				storageChanged: plan.storageChanged
			}, { storage: [originalStorage], added: 1, removed: 0, storageChanged: true });
		}
	});

	test('repairs an empty mapping when an original alias still contains credentials', () => {
		const current: EnterpriseHostDescriptor[] = [{ key: 'https://tenant.example/Team', uri: alias, storageKey: aliasStorage }];
		const mappings = { [current[0].key]: aliasStorage };
		const plan = planEnterpriseHosts(getEnterpriseHostConfigurations([alias, original]), current, mappings, new Set([originalStorage]));
		assert.deepStrictEqual({
			added: plan.added.map(host => host.storageKey),
			removed: plan.removed.map(host => host.storageKey),
			stored: plan.storageKeys,
			input: mappings
		}, {
			added: [originalStorage],
			removed: [aliasStorage],
			stored: { 'https://tenant.example/Team': originalStorage },
			input: { 'https://tenant.example/Team': aliasStorage }
		});
	});

	test('a populated mapping remains authoritative after normalization and reorder', () => {
		const configured = getEnterpriseHostConfigurations([original, alias]);
		const initial = planEnterpriseHosts(configured, [], {}, new Set([originalStorage]));
		const next = planEnterpriseHosts(getEnterpriseHostConfigurations([alias]), initial.hosts, initial.storageKeys, new Set([originalStorage]));
		assert.deepStrictEqual({ added: next.added, removed: next.removed, changed: next.storageChanged }, { added: [], removed: [], changed: false });
	});

	test('conflicting populated legacy stores require a choice instead of silently hiding credentials', () => {
		const configured = getEnterpriseHostConfigurations([original, alias]);
		assert.throws(() => planEnterpriseHosts(configured, [], {}, new Set([originalStorage, aliasStorage])), /Multiple saved authentication stores/);
		const selected = planEnterpriseHosts(getEnterpriseHostConfigurations([original, alias], original), [], {}, new Set([originalStorage, aliasStorage]));
		assert.strictEqual(selected.hosts[0].storageKey, originalStorage);
	});

	test('legacy namespaces cannot be shared across schemes or reassigned from a remembered instance', () => {
		const http = vscode.Uri.parse('http://tenant.example/Team');
		const configured = getEnterpriseHostConfigurations([http, alias], alias);
		const initial = planEnterpriseHosts(configured, [], {}, new Set([aliasStorage]));
		const later = planEnterpriseHosts(getEnterpriseHostConfigurations([http]), [], { 'https://tenant.example/Team': aliasStorage }, new Set([aliasStorage]));
		assert.deepStrictEqual({
			initial: initial.hosts.map(host => host.storageKey),
			later: later.hosts.map(host => host.storageKey)
		}, {
			initial: ['http%3A%2F%2Ftenant.example%2FTeam.ghes.auth', aliasStorage],
			later: ['http%3A%2F%2Ftenant.example%2FTeam.ghes.auth']
		});
	});

	test('plans additions and removals without mutating the existing descriptors', () => {
		const initial = planEnterpriseHosts(getEnterpriseHostConfigurations([original]), [], {}, new Set([originalStorage]));
		const next = planEnterpriseHosts(getEnterpriseHostConfigurations([vscode.Uri.parse('https://other.example')]), initial.hosts, initial.storageKeys, new Set());
		assert.deepStrictEqual({
			before: initial.hosts.map(host => host.uri.authority),
			added: next.added.map(host => host.uri.authority),
			removed: next.removed.map(host => host.uri.authority)
		}, { before: ['tenant.example'], added: ['other.example'], removed: ['tenant.example'] });
	});
});
