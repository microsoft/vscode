/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IDefaultAccount } from '../../../../base/common/defaultAccount.js';
import { AccountsActivityActionViewItem } from '../../../browser/parts/globalCompositeBar.js';
import { AuthenticationSession, AuthenticationSessionAccount } from '../../../services/authentication/common/authentication.js';

interface IUpdateAvatarTestHarness {
	avatarImg: HTMLImageElement;
	label: HTMLElement;
	configurationService: { getValue(): boolean };
	groupedAccounts: Map<string, (AuthenticationSessionAccount & { canSignOut: boolean })[]>;
	defaultAccountService: { currentDefaultAccount: IDefaultAccount | null };
	getDefaultAccountAvatarIcon(): URI | undefined;
}

interface IAddOrUpdateAccountTestHarness {
	groupedAccounts: Map<string, (AuthenticationSessionAccount & { canSignOut: boolean })[]>;
	sessionFromEmbedder: { value: Promise<undefined> };
	authenticationService: { getSessions(): Promise<readonly AuthenticationSession[]> };
}

const updateAvatar = Reflect.get(AccountsActivityActionViewItem.prototype, 'updateAvatar') as (this: IUpdateAvatarTestHarness) => void;
const getDefaultAccountAvatarIcon = Reflect.get(AccountsActivityActionViewItem.prototype, 'getDefaultAccountAvatarIcon') as (this: IUpdateAvatarTestHarness) => URI | undefined;
const addOrUpdateAccount = Reflect.get(AccountsActivityActionViewItem.prototype, 'addOrUpdateAccount') as (this: IAddOrUpdateAccountTestHarness, providerId: string, account: AuthenticationSessionAccount) => Promise<void>;

function createDefaultAccount(providerId: string, accountName: string): IDefaultAccount {
	return {
		authenticationProvider: { id: providerId, name: providerId, enterprise: false },
		accountName,
		sessionId: 'test-session',
		enterprise: false,
	};
}

function createHarness(groupedAccounts: Map<string, (AuthenticationSessionAccount & { canSignOut: boolean })[]>, currentDefaultAccount: IDefaultAccount | null): IUpdateAvatarTestHarness {
	return {
		avatarImg: document.createElement('img'),
		label: document.createElement('div'),
		configurationService: { getValue: () => true },
		groupedAccounts,
		defaultAccountService: { currentDefaultAccount },
		getDefaultAccountAvatarIcon,
	};
}

suite('AccountsActivityActionViewItem - updateAvatar', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const firstIcon = URI.parse('https://example.com/first.png');
	const defaultIcon = URI.parse('https://example.com/default.png');

	function createGroupedAccounts(): Map<string, (AuthenticationSessionAccount & { canSignOut: boolean })[]> {
		const groupedAccounts = new Map<string, (AuthenticationSessionAccount & { canSignOut: boolean })[]>();
		groupedAccounts.set('github', [{ id: 'first-id', label: 'first-account', icon: firstIcon, canSignOut: true }]);
		groupedAccounts.set('microsoft', [{ id: 'default-id', label: 'default-account', icon: defaultIcon, canSignOut: true }]);
		return groupedAccounts;
	}

	test('prefers the current default account avatar over the first account with an icon', () => {
		const harness = createHarness(createGroupedAccounts(), createDefaultAccount('microsoft', 'default-account'));

		updateAvatar.call(harness);

		assert.deepStrictEqual(
			{ src: harness.avatarImg.src, hasAvatarClass: harness.label.classList.contains('has-avatar') },
			{ src: defaultIcon.toString(true), hasAvatarClass: true }
		);
	});

	test('falls back to the first account with an icon when there is no default account', () => {
		const harness = createHarness(createGroupedAccounts(), null);

		updateAvatar.call(harness);

		assert.deepStrictEqual(
			{ src: harness.avatarImg.src, hasAvatarClass: harness.label.classList.contains('has-avatar') },
			{ src: firstIcon.toString(true), hasAvatarClass: true }
		);
	});

	test('falls back to the first account with an icon when the matching default account has no icon', () => {
		const groupedAccounts = createGroupedAccounts();
		groupedAccounts.set('microsoft', [{ id: 'default-id', label: 'default-account', icon: undefined, canSignOut: true }]);
		const harness = createHarness(groupedAccounts, createDefaultAccount('microsoft', 'default-account'));

		updateAvatar.call(harness);

		assert.deepStrictEqual(
			{ src: harness.avatarImg.src, hasAvatarClass: harness.label.classList.contains('has-avatar') },
			{ src: firstIcon.toString(true), hasAvatarClass: true }
		);
	});
});

suite('AccountsActivityActionViewItem - addOrUpdateAccount', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function createAddOrUpdateHarness(accounts: (AuthenticationSessionAccount & { canSignOut: boolean })[]): IAddOrUpdateAccountTestHarness {
		return {
			groupedAccounts: new Map([['github', accounts]]),
			sessionFromEmbedder: { value: Promise.resolve(undefined) },
			authenticationService: { getSessions: async () => [] },
		};
	}

	test('updates the icon of an existing account, including clearing a stale one', async () => {
		const harness = createAddOrUpdateHarness([{ id: 'account-id', label: 'account', icon: URI.parse('https://example.com/stale.png'), canSignOut: true }]);

		await addOrUpdateAccount.call(harness, 'github', { id: 'account-id', label: 'account', icon: URI.parse('https://example.com/fresh.png') });
		const updated = harness.groupedAccounts.get('github')?.[0].icon;

		await addOrUpdateAccount.call(harness, 'github', { id: 'account-id', label: 'account' });
		const cleared = harness.groupedAccounts.get('github')?.[0].icon;

		assert.deepStrictEqual(
			[updated, cleared],
			[URI.parse('https://example.com/fresh.png'), undefined]
		);
	});
});
