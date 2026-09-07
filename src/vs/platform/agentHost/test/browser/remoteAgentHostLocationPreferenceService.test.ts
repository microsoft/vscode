/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../storage/common/storage.js';
import {
	parseRemoteAgentHostLocationPreferences,
	REMOTE_AGENT_HOST_LOCATION_PREFERENCE_STORAGE_KEY,
	RemoteAgentHostLocationPreferenceService,
} from '../../browser/remoteAgentHostLocationPreferenceService.js';

suite('RemoteAgentHostLocationPreferenceService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(): { service: RemoteAgentHostLocationPreferenceService; storageService: InMemoryStorageService } {
		const storageService = disposables.add(new InMemoryStorageService());
		const service = disposables.add(new RemoteAgentHostLocationPreferenceService(storageService));
		return { service, storageService };
	}

	test('returns undefined for a host with no stored preference', () => {
		const { service } = createService();
		assert.strictEqual(service.getPreference('ssh:myhost'), undefined);
	});

	test('round-trips a stored preference', () => {
		const { service } = createService();
		service.setPreference('ssh:myhost', 'dedicated');
		assert.strictEqual(service.getPreference('ssh:myhost'), 'dedicated');
	});

	test('isolates preferences per host key', () => {
		const { service } = createService();
		service.setPreference('ssh:host-a', 'dedicated');
		service.setPreference('tunnel:tunnel-b', 'editor');

		assert.strictEqual(service.getPreference('ssh:host-a'), 'dedicated');
		assert.strictEqual(service.getPreference('tunnel:tunnel-b'), 'editor');
		assert.strictEqual(service.getPreference('ssh:host-c'), undefined);
	});

	test('overwrites a previously stored preference for the same host', () => {
		const { service } = createService();
		service.setPreference('ssh:myhost', 'dedicated');
		service.setPreference('ssh:myhost', 'editor');
		assert.strictEqual(service.getPreference('ssh:myhost'), 'editor');
	});

	test('persists under a single component-owned storage key in APPLICATION/USER scope', () => {
		const { service, storageService } = createService();
		service.setPreference('ssh:myhost', 'dedicated');

		const raw = storageService.get(REMOTE_AGENT_HOST_LOCATION_PREFERENCE_STORAGE_KEY, StorageScope.APPLICATION);
		assert.ok(raw);
		assert.ok(storageService.keys(StorageScope.APPLICATION, StorageTarget.USER).includes(REMOTE_AGENT_HOST_LOCATION_PREFERENCE_STORAGE_KEY));
	});

	test('fires onDidChangePreference with the changed host key', () => {
		const { service } = createService();
		const changed: string[] = [];
		disposables.add(service.onDidChangePreference(key => changed.push(key)));

		service.setPreference('ssh:myhost', 'dedicated');
		assert.deepStrictEqual(changed, ['ssh:myhost']);
	});

	test('a new service instance reads back preferences persisted by a previous instance', () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const first = disposables.add(new RemoteAgentHostLocationPreferenceService(storageService));
		first.setPreference('ssh:myhost', 'dedicated');

		const second = disposables.add(new RemoteAgentHostLocationPreferenceService(storageService));
		assert.strictEqual(second.getPreference('ssh:myhost'), 'dedicated');
	});
});

suite('parseRemoteAgentHostLocationPreferences', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns an empty map for undefined input', () => {
		assert.strictEqual(parseRemoteAgentHostLocationPreferences(undefined).size, 0);
	});

	test('returns an empty map for malformed JSON rather than throwing', () => {
		assert.doesNotThrow(() => parseRemoteAgentHostLocationPreferences('{not json'));
		assert.strictEqual(parseRemoteAgentHostLocationPreferences('{not json').size, 0);
	});

	test('returns an empty map when the JSON is not a plain object (array/primitive)', () => {
		assert.strictEqual(parseRemoteAgentHostLocationPreferences('[1,2,3]').size, 0);
		assert.strictEqual(parseRemoteAgentHostLocationPreferences('"a string"').size, 0);
		assert.strictEqual(parseRemoteAgentHostLocationPreferences('null').size, 0);
	});

	test('parses valid entries', () => {
		const preferences = parseRemoteAgentHostLocationPreferences(JSON.stringify({ 'ssh:a': 'dedicated', 'tunnel:b': 'editor' }));
		assert.strictEqual(preferences.get('ssh:a'), 'dedicated');
		assert.strictEqual(preferences.get('tunnel:b'), 'editor');
		assert.strictEqual(preferences.size, 2);
	});

	test('drops individual entries with an unrecognized value, keeping the rest of the map', () => {
		const preferences = parseRemoteAgentHostLocationPreferences(JSON.stringify({
			'ssh:good': 'dedicated',
			'ssh:bad-string': 'not-a-preference',
			'ssh:bad-number': 1,
			'ssh:bad-null': null,
			'ssh:bad-object': {},
		}));
		assert.strictEqual(preferences.size, 1);
		assert.strictEqual(preferences.get('ssh:good'), 'dedicated');
	});
});
