/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { InMemoryStorageService, StorageScope } from '../../../storage/common/storage.js';
import {
	parseTrustedHostKeys,
	SSHHostKeyTrustService,
	SSH_HOST_KEY_TRUST_STORAGE_KEY,
} from '../../browser/sshHostKeyTrustService.js';

suite('SSHHostKeyTrustService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(store: Pick<DisposableStore, 'add'>) {
		const storageService = store.add(new InMemoryStorageService());
		const service = store.add(new SSHHostKeyTrustService(storageService));
		return { service, storageService };
	}

	test('stores, reads back and forgets host keys', () => {
		const { service } = createService(disposables);
		service.trustHostKey('example.com', 22, { keyType: 'ssh-ed25519', fingerprint: 'SHA256:aaa', addedAt: 1 });

		const afterTrust = service.getTrustedKeys('example.com', 22);
		// Host keys belong to a machine, so lookup must be case-insensitive in
		// the same way hostnames are.
		const mixedCase = service.getTrustedKeys('ExAmPlE.CoM', 22);
		service.forgetHost('example.com', 22);

		assert.deepStrictEqual(
			{
				afterTrust: afterTrust.map(k => `${k.keyType} ${k.fingerprint}`),
				mixedCase: mixedCase.map(k => k.fingerprint),
				afterForget: service.getTrustedKeys('example.com', 22).length,
			},
			{
				afterTrust: ['ssh-ed25519 SHA256:aaa'],
				mixedCase: ['SHA256:aaa'],
				afterForget: 0,
			});
	});

	test('keys hosts by port', () => {
		const { service } = createService(disposables);
		service.trustHostKey('example.com', 22, { keyType: 'ssh-ed25519', fingerprint: 'SHA256:aaa', addedAt: 1 });
		service.trustHostKey('example.com', 2222, { keyType: 'ssh-ed25519', fingerprint: 'SHA256:bbb', addedAt: 1 });

		assert.deepStrictEqual(
			{
				default: service.getTrustedKeys('example.com', 22).map(k => k.fingerprint),
				custom: service.getTrustedKeys('example.com', 2222).map(k => k.fingerprint),
				listed: service.listTrustedHosts().map(h => `${h.host}:${h.port}`).sort(),
			},
			{
				default: ['SHA256:aaa'],
				custom: ['SHA256:bbb'],
				listed: ['example.com:22', 'example.com:2222'],
			});
	});

	test('a rotated key replaces its predecessor for the same algorithm', () => {
		const { service } = createService(disposables);
		service.trustHostKey('example.com', 22, { keyType: 'ssh-ed25519', fingerprint: 'SHA256:old', addedAt: 1 });
		service.trustHostKey('example.com', 22, { keyType: 'ssh-rsa', fingerprint: 'SHA256:rsa', addedAt: 1 });
		service.trustHostKey('example.com', 22, { keyType: 'ssh-ed25519', fingerprint: 'SHA256:new', addedAt: 2 });

		// The superseded ed25519 key must not remain trusted, or a rotation
		// would leave the old key valid forever.
		assert.deepStrictEqual(
			service.getTrustedKeys('example.com', 22).map(k => `${k.keyType} ${k.fingerprint}`).sort(),
			['ssh-ed25519 SHA256:new', 'ssh-rsa SHA256:rsa']);
	});

	test('persists across service instances at application scope', () => {
		const store = new DisposableStore();
		const storageService = store.add(new InMemoryStorageService());
		const first = store.add(new SSHHostKeyTrustService(storageService));
		first.trustHostKey('example.com', 22, { keyType: 'ssh-ed25519', fingerprint: 'SHA256:aaa', addedAt: 1, alias: 'myhost' });

		const second = store.add(new SSHHostKeyTrustService(storageService));
		assert.deepStrictEqual(
			second.getTrustedKeys('example.com', 22).map(k => ({ keyType: k.keyType, fingerprint: k.fingerprint, alias: k.alias })),
			[{ keyType: 'ssh-ed25519', fingerprint: 'SHA256:aaa', alias: 'myhost' }]);
		store.dispose();
	});

	test('clears storage entirely when the last host is forgotten', () => {
		const { service, storageService } = createService(disposables);
		service.trustHostKey('example.com', 22, { keyType: 'ssh-ed25519', fingerprint: 'SHA256:aaa', addedAt: 1 });
		service.forgetHost('example.com', 22);
		assert.strictEqual(storageService.get(SSH_HOST_KEY_TRUST_STORAGE_KEY, StorageScope.APPLICATION), undefined);
	});

	test('fires a change event for the affected host', () => {
		const { service } = createService(disposables);
		const fired: string[] = [];
		disposables.add(service.onDidChangeTrustedHosts(key => fired.push(key)));

		service.trustHostKey('example.com', 22, { keyType: 'ssh-ed25519', fingerprint: 'SHA256:aaa', addedAt: 1 });
		service.forgetHost('example.com', 22);
		// Forgetting an unknown host is a no-op and must not fire.
		service.forgetHost('other.com', 22);

		assert.deepStrictEqual(fired, ['example.com:22', 'example.com:22']);
	});

	suite('parseTrustedHostKeys', () => {
		test('drops malformed entries without discarding the rest', () => {
			const raw = JSON.stringify({
				'good.com:22': [{ keyType: 'ssh-ed25519', fingerprint: 'SHA256:aaa', addedAt: 1 }],
				'partial.com:22': [
					{ keyType: 'ssh-ed25519', fingerprint: 'SHA256:bbb', addedAt: 2 },
					// Each of these is missing or has the wrong type for a
					// required field. Trust must never be reconstructed from a
					// partial record.
					{ keyType: 'ssh-rsa', fingerprint: 'SHA256:ccc' },
					{ keyType: '', fingerprint: 'SHA256:ddd', addedAt: 3 },
					{ keyType: 'ssh-rsa', addedAt: 4 },
					'not-an-object',
				],
				'empty.com:22': [],
				'wrong-shape.com:22': 'not-an-array',
			});

			const parsed = parseTrustedHostKeys(raw);
			assert.deepStrictEqual(
				{
					hosts: [...parsed.keys()].sort(),
					partial: parsed.get('partial.com:22')?.map(k => k.fingerprint),
				},
				{ hosts: ['good.com:22', 'partial.com:22'], partial: ['SHA256:bbb'] });
		});

		test('returns empty for absent or invalid JSON', () => {
			assert.deepStrictEqual(
				{
					undefinedRaw: parseTrustedHostKeys(undefined).size,
					invalidJson: parseTrustedHostKeys('{not json').size,
					array: parseTrustedHostKeys('[]').size,
					nullValue: parseTrustedHostKeys('null').size,
				},
				{ undefinedRaw: 0, invalidJson: 0, array: 0, nullValue: 0 });
		});
	});
});
