/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { getEnterpriseStorageKey, migrateEnterpriseStorage } from '../common/enterpriseStorage';
import { createTestExtensionContext } from './testExtensionContext';
import { TestMemento } from './testMemento';
import { TestSecretStorage } from './testSecretStorage';

suite('GitHub Enterprise storage migration', () => {
	const original = vscode.Uri.parse('https://TENANT.example/Team/');
	const canonical = vscode.Uri.parse('https://tenant.example/Team');
	const legacyKey = 'TENANT.example/Team/.ghes.auth';
	const canonicalKey = 'https://tenant.example/Team.ghes.auth';
	const linksSuffix = '.microsoftAccountLinks';
	const tokens = JSON.stringify([{
		id: 'saved-session',
		account: { id: '42', label: 'octocat' },
		accessToken: 'fake-token',
		scopes: ['repo']
	}]);
	const links = [{ gitHubAccountId: '42', gitHubAccountLabel: 'octocat', microsoftAccountLabel: 'mona@example.com' }];
	const disposables: vscode.Disposable[] = [];
	let secrets: TestSecretStorage;
	let state: TestMemento;
	let context: vscode.ExtensionContext;

	setup(() => {
		secrets = new TestSecretStorage();
		state = new TestMemento();
		disposables.push(secrets);
		context = createTestExtensionContext(disposables, secrets, state);
	});

	teardown(() => {
		disposables.splice(0).reverse().forEach(disposable => disposable.dispose());
		sinon.restore();
	});

	async function seed(): Promise<void> {
		await secrets.store(legacyKey, tokens);
		await state.update(`${legacyKey}${linksSuffix}`, links);
	}

	async function snapshot() {
		return {
			secrets: Object.fromEntries(await Promise.all((await secrets.keys()).sort().map(async key => [key, await secrets.get(key)]))),
			state: Object.fromEntries([...state.keys()].sort().map(key => [key, state.get(key)]))
		};
	}

	test('canonical keys normalize equivalent spellings but retain scheme, port and path case', () => {
		assert.deepStrictEqual([
			original, canonical,
			vscode.Uri.parse('http://tenant.example/Team'),
			vscode.Uri.parse('https://tenant.example:8443/Team'),
			vscode.Uri.parse('https://tenant.example/team'),
		].map(getEnterpriseStorageKey), [
			canonicalKey, canonicalKey,
			'http://tenant.example/Team.ghes.auth',
			'https://tenant.example:8443/Team.ghes.auth',
			'https://tenant.example/team.ghes.auth',
		]);
	});

	test('moves tokens and Microsoft links without changing their contents or writing bookkeeping', async () => {
		await seed();
		await migrateEnterpriseStorage(context, original);
		assert.deepStrictEqual(await snapshot(), {
			secrets: { [canonicalKey]: tokens },
			state: { [`${canonicalKey}${linksSuffix}`]: links }
		});
	});

	test('finds the old URI spelling after the setting has already been normalized', async () => {
		await seed();
		await migrateEnterpriseStorage(context, canonical);
		assert.deepStrictEqual(await snapshot(), {
			secrets: { [canonicalKey]: tokens },
			state: { [`${canonicalKey}${linksSuffix}`]: links }
		});
	});

	test('moves Microsoft-only consent without creating a token or migration marker', async () => {
		await state.update(`${legacyKey}${linksSuffix}`, links);
		await migrateEnterpriseStorage(context, canonical);
		assert.deepStrictEqual(await snapshot(), {
			secrets: {},
			state: { [`${canonicalKey}${linksSuffix}`]: links }
		});
	});

	test('does not require state writes for a new instance', async () => {
		state.updateError = new Error('State is read-only');
		await migrateEnterpriseStorage(context, canonical);
		assert.deepStrictEqual(await snapshot(), { secrets: {}, state: {} });
	});

	test('token-only migration does not depend on state writes', async () => {
		await secrets.store(legacyKey, tokens);
		state.updateError = new Error('State is read-only');
		await migrateEnterpriseStorage(context, canonical);
		assert.deepStrictEqual(await snapshot(), { secrets: { [canonicalKey]: tokens }, state: {} });
	});

	test('legacy storage paths are decoded components, not URI strings', async () => {
		const uri = vscode.Uri.parse('https://tenant.example/Team%20One%25%3F%23');
		await secrets.store('TENANT.example/Team One%?#.ghes.auth', tokens);
		await migrateEnterpriseStorage(context, uri);
		assert.deepStrictEqual(await snapshot(), { secrets: { [getEnterpriseStorageKey(uri)]: tokens }, state: {} });
	});

	test('migration is idempotent across restarts', async () => {
		await seed();
		await migrateEnterpriseStorage(context, original);
		const writes = sinon.spy(secrets, 'store');
		const updates = sinon.spy(state, 'update');
		const restarted = createTestExtensionContext(disposables, secrets, state);
		await migrateEnterpriseStorage(restarted, canonical);
		assert.deepStrictEqual({ writes: writes.callCount, updates: updates.callCount }, { writes: 0, updates: 0 });
	});

	test('canonical sign-out remains authoritative over legacy credentials', async () => {
		await seed();
		await secrets.store(canonicalKey, '[]');
		await state.update(`${canonicalKey}${linksSuffix}`, []);
		await migrateEnterpriseStorage(context, original);
		assert.deepStrictEqual(await snapshot(), {
			secrets: { [canonicalKey]: '[]' },
			state: { [`${canonicalKey}${linksSuffix}`]: [] }
		});
	});

	test('existing canonical tokens and links are not overwritten by a legacy store', async () => {
		await seed();
		const newerTokens = tokens.replace('fake-token', 'newer-token');
		const newerLinks = [{ ...links[0], microsoftAccountLabel: 'newer@example.com' }];
		await secrets.store(canonicalKey, newerTokens);
		await state.update(`${canonicalKey}${linksSuffix}`, newerLinks);
		await migrateEnterpriseStorage(context, original);
		assert.deepStrictEqual(await snapshot(), {
			secrets: { [canonicalKey]: newerTokens },
			state: { [`${canonicalKey}${linksSuffix}`]: newerLinks }
		});
	});

	for (const failure of ['link write', 'token write', 'token cleanup', 'link cleanup'] as const) {
		test(`a failed ${failure} retains credentials and can be retried`, async () => {
			await seed();
			const error = new Error('Storage is unavailable');
			switch (failure) {
				case 'link write':
					sinon.stub(state, 'update').callThrough().withArgs(`${canonicalKey}${linksSuffix}`, links).rejects(error);
					break;
				case 'token write':
					sinon.stub(secrets, 'store').callThrough().withArgs(canonicalKey, tokens).rejects(error);
					break;
				case 'token cleanup':
					sinon.stub(secrets, 'delete').callThrough().withArgs(legacyKey).rejects(error);
					break;
				case 'link cleanup':
					sinon.stub(state, 'update').callThrough().withArgs(`${legacyKey}${linksSuffix}`, undefined).rejects(error);
					break;
			}
			await assert.rejects(migrateEnterpriseStorage(context, original), /Storage is unavailable/);
			assert.deepStrictEqual({
				tokens: await secrets.get(legacyKey) ?? await secrets.get(canonicalKey),
				links: state.get(`${legacyKey}${linksSuffix}`) ?? state.get(`${canonicalKey}${linksSuffix}`)
			}, { tokens, links });
			sinon.restore();
			await migrateEnterpriseStorage(context, canonical);
			assert.deepStrictEqual(await snapshot(), {
				secrets: { [canonicalKey]: tokens },
				state: { [`${canonicalKey}${linksSuffix}`]: links }
			});
		});
	}

	test('ambiguous aliases are preserved until the original URI is selected', async () => {
		await seed();
		const secondKey = 'tenant.example/Team/.ghes.auth';
		await secrets.store(secondKey, 'other-token');
		const before = await snapshot();
		await assert.rejects(migrateEnterpriseStorage(context, canonical), /Multiple saved authentication stores/);
		assert.deepStrictEqual(await snapshot(), before);
		await migrateEnterpriseStorage(context, original);
		assert.deepStrictEqual(await snapshot(), {
			secrets: { [canonicalKey]: tokens, [secondKey]: 'other-token' },
			state: { [`${canonicalKey}${linksSuffix}`]: links }
		});
	});

	test('preserves public GitHub and other instance credentials', async () => {
		await seed();
		await secrets.store('github.auth', 'public-token');
		await secrets.store('tenant.example/team.ghes.auth', 'other-path-token');
		await migrateEnterpriseStorage(context, canonical);
		assert.deepStrictEqual(await snapshot(), {
			secrets: { [canonicalKey]: tokens, 'github.auth': 'public-token', 'tenant.example/team.ghes.auth': 'other-path-token' },
			state: { [`${canonicalKey}${linksSuffix}`]: links }
		});
	});
});
