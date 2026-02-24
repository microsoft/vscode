/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IDefaultAccount } from '../../../../../base/common/defaultAccount.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { GitHubSignInStep } from '../../browser/steps/gitHubSignInStep.js';

const VALID_ENTITLEMENTS: IDefaultAccount['entitlementsData'] = {
	access_type_sku: 'free',
	assigned_date: '',
	can_signup_for_limited: false,
	copilot_plan: 'free',
	organization_login_list: [],
	analytics_tracking_id: '',
};

function createAccount(entitlementsData?: IDefaultAccount['entitlementsData']): IDefaultAccount {
	return {
		authenticationProvider: { id: 'github', name: 'GitHub', enterprise: false },
		accountName: 'testuser',
		sessionId: 'session-1',
		enterprise: false,
		entitlementsData,
	};
}

suite('GitHubSignInStep', () => {

	const store = new DisposableStore();
	let onDidChange: Emitter<IDefaultAccount | null>;
	let resolveGetAccount: (account: IDefaultAccount | null) => void;

	function createStep(): GitHubSignInStep {
		onDidChange = store.add(new Emitter<IDefaultAccount | null>());
		let resolve: (account: IDefaultAccount | null) => void;
		const getAccountPromise = new Promise<IDefaultAccount | null>(r => resolve = r);
		resolveGetAccount = resolve!;

		const mockService = {
			_serviceBrand: undefined,
			onDidChangeDefaultAccount: onDidChange.event,
			onDidChangePolicyData: Event.None,
			policyData: null,
			getDefaultAccount: () => getAccountPromise,
			getDefaultAccountAuthenticationProvider: () => ({ id: 'github', name: 'GitHub', enterprise: false }),
			setDefaultAccountProvider: () => { },
			refresh: async () => null,
			signIn: async () => null,
			signOut: async () => { },
		} satisfies IDefaultAccountService;

		const step = new GitHubSignInStep(mockService);
		store.add(step);
		return step;
	}

	teardown(() => store.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('isSatisfied is true when account has valid entitlements', async () => {
		const step = createStep();
		resolveGetAccount(createAccount(VALID_ENTITLEMENTS));
		await step.initialized;
		assert.strictEqual(step.isSatisfied.get(), true);
	});

	test('isSatisfied is true when account has undefined entitlements', async () => {
		const step = createStep();
		resolveGetAccount(createAccount(undefined));
		await step.initialized;
		assert.strictEqual(step.isSatisfied.get(), true); // undefined means not configured, user is signed in
	});

	test('isSatisfied is false when account is null (signed out)', async () => {
		const step = createStep();
		resolveGetAccount(null);
		await step.initialized;
		assert.strictEqual(step.isSatisfied.get(), false);
	});

	test('isSatisfied is false when account has null entitlements (token expired)', async () => {
		const step = createStep();
		resolveGetAccount(createAccount(null));
		await step.initialized;
		assert.strictEqual(step.isSatisfied.get(), false);
	});

	test('isSatisfied reacts to sign-out event', async () => {
		const step = createStep();
		resolveGetAccount(createAccount(VALID_ENTITLEMENTS));
		await step.initialized;
		assert.strictEqual(step.isSatisfied.get(), true);

		onDidChange.fire(null);
		assert.strictEqual(step.isSatisfied.get(), false);
	});

	test('isSatisfied reacts to token expiry event', async () => {
		const step = createStep();
		resolveGetAccount(createAccount(VALID_ENTITLEMENTS));
		await step.initialized;
		assert.strictEqual(step.isSatisfied.get(), true);

		onDidChange.fire(createAccount(null)); // token expired: account exists but entitlements null
		assert.strictEqual(step.isSatisfied.get(), false);
	});

	test('isSatisfied recovers when token is refreshed', async () => {
		const step = createStep();
		resolveGetAccount(createAccount(null)); // start with expired token
		await step.initialized;
		assert.strictEqual(step.isSatisfied.get(), false);

		onDidChange.fire(createAccount(VALID_ENTITLEMENTS));
		assert.strictEqual(step.isSatisfied.get(), true);
	});
});
