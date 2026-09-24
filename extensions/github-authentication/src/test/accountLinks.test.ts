/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { AccountLinks } from '../common/accountLinks';
import { AuthProviderType } from '../github';
import { Log } from '../common/logger';
import { TestMemento } from './testMemento';

const STORAGE_KEY = 'github.auth.microsoftAccountLinks';

function account(id: string, label: string): vscode.AuthenticationSessionAccountInformation {
	return { id, label };
}

suite('AccountLinks', () => {

	let logger: Log;
	let memento: TestMemento;
	let links: AccountLinks;

	setup(() => {
		logger = new Log(AuthProviderType.github);
		memento = new TestMemento();
		links = new AccountLinks(memento, STORAGE_KEY, logger);
	});

	test('remembers one Microsoft account per GitHub account, and rewrites rather than duplicating', async () => {
		await links.link('mona@contoso.com', account('1', 'mona_contoso'));
		await links.link('hubot@contoso.com', account('2', 'hubot_contoso'));
		const beforeDisagreement = links.microsoftAccountFor('mona_contoso');

		// Discovery is the authority: if it resolves a different GitHub account for a Microsoft one
		// we already have a row for, the row moves rather than the sign in failing.
		await links.link('mona@contoso.com', account('3', 'octocat_contoso'));

		assert.deepStrictEqual({
			beforeDisagreement,
			mona: links.microsoftAccountFor('mona_contoso'),
			hubot: links.microsoftAccountFor('hubot_contoso'),
			octocat: links.microsoftAccountFor('octocat_contoso'),
			unknown: links.microsoftAccountFor('nobody'),
			rows: memento.get<unknown[]>(STORAGE_KEY, []).length,
		}, {
			beforeDisagreement: 'mona@contoso.com',
			mona: undefined,
			hubot: 'hubot@contoso.com',
			octocat: 'mona@contoso.com',
			unknown: undefined,
			rows: 2,
		});
	});

	test('signing out of the GitHub account clears the row', async () => {
		await links.link('mona@contoso.com', account('1', 'mona_contoso'));
		await links.link('hubot@contoso.com', account('2', 'hubot_contoso'));

		await links.unlinkGitHubAccount('mona_contoso');

		assert.deepStrictEqual({
			mona: links.microsoftAccountFor('mona_contoso'),
			hubot: links.microsoftAccountFor('hubot_contoso'),
			rows: memento.get<unknown[]>(STORAGE_KEY, []).length,
		}, {
			mona: undefined,
			hubot: 'hubot@contoso.com',
			rows: 1,
		});
	});

	test('a row is keyed by GitHub label, so the same account under a new id rewrites it', async () => {
		await links.link('mona@contoso.com', account('1', 'mona_contoso'));

		// A session read back from the Keychain can carry a placeholder id, an old numeric one, or
		// one from a lookup that failed, so the id is no way to tell one account from another.
		await links.link('mona@contoso.com', account('<unknown>', 'mona_contoso'));

		assert.deepStrictEqual(links.linkedAccounts(), [
			{ microsoftAccountLabel: 'mona@contoso.com', gitHubAccountId: '<unknown>', gitHubAccountLabel: 'mona_contoso' }
		]);
	});

	test('hands back every mapping, which is what a fresh window rebuilds its sessions from', async () => {
		await links.link('mona@contoso.com', account('1', 'mona_contoso'));
		await links.link('hubot@contoso.com', account('2', 'hubot_contoso'));
		await links.unlinkGitHubAccount('mona_contoso');

		assert.deepStrictEqual(links.linkedAccounts(), [
			{ microsoftAccountLabel: 'hubot@contoso.com', gitHubAccountId: '2', gitHubAccountLabel: 'hubot_contoso' }
		]);
	});

	test('a sign out that could not be written still holds, and the next write finishes it', async () => {
		await links.link('mona@contoso.com', account('1', 'mona_contoso'));
		await links.link('hubot@contoso.com', account('2', 'hubot_contoso'));

		// A row is what authorizes minting a token for an account with nothing shown to the user, so
		// a sign out that only half landed would sign them straight back in on the next read.
		memento.updateError = new Error('storage is full');
		await links.unlinkGitHubAccount('mona_contoso');
		const whileFailing = links.linkedAccounts().map(link => link.gitHubAccountLabel);
		const stillStored = memento.get<{ gitHubAccountLabel: string }[]>(STORAGE_KEY, []).map(link => link.gitHubAccountLabel);

		memento.updateError = undefined;
		await links.link('hubot@contoso.com', account('2', 'hubot_contoso'));

		assert.deepStrictEqual({
			whileFailing,
			stillStored,
			// Any later write takes the row with it, so the deletion stops depending on memory.
			afterAWriteSucceeds: memento.get<{ gitHubAccountLabel: string }[]>(STORAGE_KEY, []).map(link => link.gitHubAccountLabel)
		}, {
			whileFailing: ['hubot_contoso'],
			stillStored: ['mona_contoso', 'hubot_contoso'],
			afterAWriteSucceeds: ['hubot_contoso']
		});
	});

	test('signing back in to an account undoes a sign out that never reached storage', async () => {
		await links.link('mona@contoso.com', account('1', 'mona_contoso'));
		memento.updateError = new Error('storage is full');
		await links.unlinkGitHubAccount('mona_contoso');

		// The user agreeing to the account again is the one thing that outranks having signed out
		// of it, whether or not the sign out was ever written down.
		memento.updateError = undefined;
		await links.link('mona@contoso.com', account('1', 'mona_contoso'));

		assert.deepStrictEqual(links.linkedAccounts(), [
			{ microsoftAccountLabel: 'mona@contoso.com', gitHubAccountId: '1', gitHubAccountLabel: 'mona_contoso' }
		]);
	});
});
