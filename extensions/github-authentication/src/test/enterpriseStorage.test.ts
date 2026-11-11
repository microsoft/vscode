/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { getEnterpriseStorageKey, getEnterpriseUriKey, migrateEnterpriseStorage } from '../common/enterpriseStorage';
import { createTestExtensionContext } from './testExtensionContext';
import { TestMemento } from './testMemento';
import { TestSecretStorage } from './testSecretStorage';

suite('GitHub Enterprise storage migration', () => {
	const original = vscode.Uri.parse('https://TENANT.example/Team/');
	const canonical = vscode.Uri.parse('https://tenant.example/Team');
	const legacyKey = 'TENANT.example/Team/.ghes.auth';
	const aliasKey = 'tenant.example/Team/.ghes.auth';
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
			vscode.Uri.parse('HTTPS://TENANT.example:443/Team/'),
			vscode.Uri.parse('HTTPS://TENANT.example/'),
			vscode.Uri.parse('https://TENANT.example/Team///'),
			vscode.Uri.parse('https://TENANT.example/Team%20One%25/'),
		].map(getEnterpriseStorageKey), [
			canonicalKey, canonicalKey,
			'http://tenant.example/Team.ghes.auth',
			'https://tenant.example:8443/Team.ghes.auth',
			'https://tenant.example/team.ghes.auth',
			'https://tenant.example:443/Team.ghes.auth',
			'https://tenant.example/.ghes.auth',
			canonicalKey,
			'https://tenant.example/Team%20One%25.ghes.auth',
		]);
	});

	test('normalizing and reparsing an instance preserves case-sensitive user-info', () => {
		const uri = vscode.Uri.parse('HTTPS://MixedUser:MixedPassword@TENANT.example:443/Team/');
		const normalized = vscode.Uri.parse(getEnterpriseUriKey(uri));
		assert.deepStrictEqual({
			normalized: normalized.toString(),
			authority: normalized.authority,
			originalAuthority: uri.authority
		}, {
			normalized: 'https://MixedUser:MixedPassword@tenant.example:443/Team',
			authority: 'MixedUser:MixedPassword@tenant.example:443',
			originalAuthority: 'MixedUser:MixedPassword@TENANT.example:443'
		});
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

	test('canonical sign-out remains authoritative over ambiguous legacy aliases', async () => {
		await seed();
		await secrets.store(aliasKey, 'other-token');
		await state.update(`${aliasKey}${linksSuffix}`, links);
		await secrets.store(canonicalKey, '[]');
		await state.update(`${canonicalKey}${linksSuffix}`, []);
		await migrateEnterpriseStorage(context, canonical);
		assert.deepStrictEqual(await snapshot(), {
			secrets: { [canonicalKey]: '[]' },
			state: { [`${canonicalKey}${linksSuffix}`]: [] }
		});
	});

	test('existing canonical tokens and links make all legacy aliases redundant', async () => {
		await seed();
		await secrets.store(aliasKey, 'other-token');
		await state.update(`${aliasKey}${linksSuffix}`, links);
		const newerTokens = tokens.replace('fake-token', 'newer-token');
		const newerLinks = [{ ...links[0], microsoftAccountLabel: 'newer@example.com' }];
		await secrets.store(canonicalKey, newerTokens);
		await state.update(`${canonicalKey}${linksSuffix}`, newerLinks);
		await migrateEnterpriseStorage(context, canonical);
		assert.deepStrictEqual(await snapshot(), {
			secrets: { [canonicalKey]: newerTokens },
			state: { [`${canonicalKey}${linksSuffix}`]: newerLinks }
		});
	});

	test('canonical credentials created during legacy lookup take precedence over ambiguous aliases', async () => {
		await seed();
		await secrets.store(aliasKey, 'other-token');
		await state.update(`${aliasKey}${linksSuffix}`, links);
		const newerTokens = tokens.replace('fake-token', 'newer-token');
		const newerLinks = [{ ...links[0], microsoftAccountLabel: 'newer@example.com' }];
		sinon.stub(secrets, 'get').callThrough().withArgs(legacyKey).callsFake(async () => {
			await secrets.store(canonicalKey, newerTokens);
			await state.update(`${canonicalKey}${linksSuffix}`, newerLinks);
			return tokens;
		});
		await migrateEnterpriseStorage(context, canonical);
		assert.deepStrictEqual(await snapshot(), {
			secrets: { [canonicalKey]: newerTokens },
			state: { [`${canonicalKey}${linksSuffix}`]: newerLinks }
		});
	});

	for (const missing of ['tokens', 'links'] as const) {
		test(`migrates only missing ${missing} despite aliases for the authoritative component`, async () => {
			await seed();
			const newerTokens = tokens.replace('fake-token', 'newer-token');
			const newerLinks = [{ ...links[0], microsoftAccountLabel: 'newer@example.com' }];
			if (missing === 'links') {
				await secrets.store(canonicalKey, newerTokens);
				await secrets.store(aliasKey, 'other-token');
			} else {
				await state.update(`${canonicalKey}${linksSuffix}`, newerLinks);
				await state.update(`${aliasKey}${linksSuffix}`, links);
			}
			await migrateEnterpriseStorage(context, canonical);
			assert.deepStrictEqual(await snapshot(), {
				secrets: { [canonicalKey]: missing === 'tokens' ? tokens : newerTokens },
				state: { [`${canonicalKey}${linksSuffix}`]: missing === 'links' ? links : newerLinks }
			});
		});

		test(`still requires an alias choice when missing ${missing} have multiple sources`, async () => {
			await seed();
			if (missing === 'tokens') {
				await state.update(`${canonicalKey}${linksSuffix}`, links);
				await secrets.store(aliasKey, 'other-token');
			} else {
				await secrets.store(canonicalKey, tokens);
				await state.update(`${aliasKey}${linksSuffix}`, [{ ...links[0], microsoftAccountLabel: 'other@example.com' }]);
			}
			const before = await snapshot();
			await assert.rejects(migrateEnterpriseStorage(context, canonical), /Multiple saved authentication stores/);
			assert.deepStrictEqual(await snapshot(), before);
		});
	}

	test('unique token and link sources can migrate from different aliases', async () => {
		await secrets.store(legacyKey, tokens);
		await state.update(`${aliasKey}${linksSuffix}`, links);
		await migrateEnterpriseStorage(context, canonical);
		assert.deepStrictEqual(await snapshot(), {
			secrets: { [canonicalKey]: tokens },
			state: { [`${canonicalKey}${linksSuffix}`]: links }
		});
	});

	test('redundant alias cleanup can be retried without changing canonical credentials', async () => {
		await seed();
		await secrets.store(aliasKey, 'other-token');
		await secrets.store(canonicalKey, tokens);
		await state.update(`${canonicalKey}${linksSuffix}`, links);
		sinon.stub(secrets, 'delete').callThrough().withArgs(aliasKey).rejects(new Error('Cleanup failed'));
		await assert.rejects(migrateEnterpriseStorage(context, canonical), /Cleanup failed/);
		sinon.restore();
		await migrateEnterpriseStorage(context, canonical);
		assert.deepStrictEqual(await snapshot(), {
			secrets: { [canonicalKey]: tokens },
			state: { [`${canonicalKey}${linksSuffix}`]: links }
		});
	});

	test('a canonical token written while account links are copied is not overwritten', async () => {
		await seed();
		const newerTokens = tokens.replace('fake-token', 'newer-token');
		const update = sinon.stub(state, 'update').callThrough();
		update.withArgs(`${canonicalKey}${linksSuffix}`, links).callsFake(async () => {
			update.restore();
			await state.update(`${canonicalKey}${linksSuffix}`, links);
			await secrets.store(canonicalKey, newerTokens);
		});
		await migrateEnterpriseStorage(context, original);
		assert.deepStrictEqual(await snapshot(), {
			secrets: { [canonicalKey]: newerTokens },
			state: { [`${canonicalKey}${linksSuffix}`]: links }
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
			assert.deepStrictEqual(await snapshot(), {
				secrets: {
					...(failure === 'link cleanup' ? {} : { [legacyKey]: tokens }),
					...(failure === 'token cleanup' || failure === 'link cleanup' ? { [canonicalKey]: tokens } : {})
				},
				state: {
					[`${legacyKey}${linksSuffix}`]: links,
					...(failure === 'link write' ? {} : { [`${canonicalKey}${linksSuffix}`]: links })
				}
			});
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

	for (const reverse of [false, true]) {
		test(`an explicit legacy owner disambiguates schemes regardless of host order (${reverse})`, async () => {
			await seed();
			const http = vscode.Uri.parse('http://tenant.example/Team');
			const uris = reverse ? [canonical, http] : [http, canonical];
			for (const uri of uris) {
				await migrateEnterpriseStorage(context, uri, uris, original);
			}
			assert.deepStrictEqual(await snapshot(), {
				secrets: { [canonicalKey]: tokens },
				state: { [`${canonicalKey}${linksSuffix}`]: links }
			});
		});
	}

	test('ambiguous legacy schemes require the original instance instead of choosing the first host', async () => {
		await seed();
		const before = await snapshot();
		const http = vscode.Uri.parse('http://tenant.example/Team');
		await assert.rejects(migrateEnterpriseStorage(context, http, [http, canonical]), /Set github-enterprise.uri to the original instance/);
		assert.deepStrictEqual(await snapshot(), before);
	});

	test('canonical credentials do not require assigning scheme-ambiguous legacy data', async () => {
		await seed();
		await secrets.store(canonicalKey, tokens);
		await state.update(`${canonicalKey}${linksSuffix}`, links);
		const before = await snapshot();
		const http = vscode.Uri.parse('http://tenant.example/Team');
		await migrateEnterpriseStorage(context, canonical, [http, canonical]);
		assert.deepStrictEqual(await snapshot(), before);
	});

	for (const component of ['tokens', 'links'] as const) {
		test(`canonical ${component} do not require a scheme choice when nothing is missing`, async () => {
			if (component === 'tokens') {
				await secrets.store(legacyKey, tokens);
				await secrets.store(canonicalKey, tokens);
			} else {
				await state.update(`${legacyKey}${linksSuffix}`, links);
				await state.update(`${canonicalKey}${linksSuffix}`, links);
			}
			const before = await snapshot();
			const http = vscode.Uri.parse('http://tenant.example/Team');
			await migrateEnterpriseStorage(context, canonical, [http, canonical]);
			assert.deepStrictEqual(await snapshot(), before);
		});
	}

	test('an unconfigured legacy owner cannot donate its credentials to another scheme', async () => {
		await seed();
		const before = await snapshot();
		const http = vscode.Uri.parse('http://tenant.example/Team');
		await migrateEnterpriseStorage(context, http, [http], original);
		assert.deepStrictEqual(await snapshot(), before);
	});
});
