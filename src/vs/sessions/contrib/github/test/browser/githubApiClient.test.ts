/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { IDefaultAccount } from '../../../../../base/common/defaultAccount.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IGitHubAccountClient } from '../../../../../platform/github/common/account/account.js';
import { GitHubRequestError } from '../../../../../platform/github/common/githubTypes.js';
import { IWorkbenchGitHubService } from '../../../../../workbench/services/github/common/githubService.js';
import { GitHubApiClient } from '../../browser/githubApiClient.js';

suite('GitHubApiClient', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setupClient() {
		const changed = store.add(new Emitter<IDefaultAccount | null>());
		const invalidated = store.add(new Emitter<void>());
		const provider = { id: 'github', name: 'GitHub', enterprise: false };
		let account: IDefaultAccount | null = upcastPartial<IDefaultAccount>({ sessionId: 'selected', accountName: 'octocat', authenticationProvider: provider });
		let available = true;
		let acquisition: Promise<void> | undefined;
		let signInError: Error | string | undefined;
		let signInResult = true;
		let enterpriseUrl: string | undefined = 'https://enterprise.example.com';
		const signals: AbortSignal[] = [];
		const signIns: Parameters<IDefaultAccountService['signIn']>[0][] = [];
		let releases = 0;
		const acquired = new DeferredPromise<void>();
		const facade = upcastPartial<IGitHubAccountClient>({
			onDidInvalidate: invalidated.event,
			dispose: () => { releases++; },
		});
		const workbench = new class extends mock<IWorkbenchGitHubService>() {
			override async acquireDefaultAccountApiClient(signal: AbortSignal): Promise<IGitHubAccountClient> {
				signals.push(signal);
				void acquired.complete();
				await acquisition;
				if (!available) {
					throw new GitHubRequestError('No selected repository grant', 'authentication');
				}
				return facade;
			}
		}();
		const defaults = new class extends mock<IDefaultAccountService>() {
			override readonly onDidChangeDefaultAccount = changed.event;
			override get currentDefaultAccount() { return account; }
			override getDefaultAccountAuthenticationProvider() { return provider; }
			override resolveGitHubUrl() { return enterpriseUrl; }
			override async signIn(options?: Parameters<IDefaultAccountService['signIn']>[0]) {
				signIns.push(options);
				if (signInError) {
					throw signInError;
				}
				if (!signInResult) {
					return null;
				}
				available = true;
				account = upcastPartial<IDefaultAccount>({ sessionId: 'repository', authenticationProvider: provider });
				changed.fire(account);
				return account;
			}
		}();
		const client = store.add(new GitHubApiClient(workbench, defaults));
		return {
			client, facade, signals, signIns, invalidated, acquired,
			get releases() { return releases; },
			changeAccount: () => {
				account = upcastPartial<IDefaultAccount>({ sessionId: 'other', authenticationProvider: provider });
				changed.fire(account);
			},
			repeatAccount: () => changed.fire(account),
			setAvailable: (value: boolean) => { available = value; },
			delayAcquisition: (value: Promise<void>) => { acquisition = value; },
			setSignInError: (value: Error | string) => { signInError = value; },
			setSignInResult: (value: boolean) => { signInResult = value; },
			setEnterprise: (url: string | undefined) => { provider.enterprise = true; provider.id = 'github-enterprise'; enterpriseUrl = url; },
		};
	}

	test('retains one typed account client for concurrent and subsequent operations', async () => {
		const setup = setupClient();
		const gate = new DeferredPromise<void>();
		setup.delayAcquisition(gate.p);
		const first = setup.client.withClient(async client => client === setup.facade);
		const second = setup.client.withClient(async client => client === setup.facade);
		await gate.complete();
		const results = await Promise.all([first, second, setup.client.withClient(async client => client === setup.facade)]);
		setup.repeatAccount();
		setup.client.dispose();
		assert.deepStrictEqual({ results, acquisitions: setup.signals.length, releases: setup.releases, signIns: setup.signIns }, {
			results: [true, true, true], acquisitions: 1, releases: 1, signIns: [],
		});
	});

	test('does not prompt or fall back when the selected repository grant is unavailable', async () => {
		const setup = setupClient();
		setup.setAvailable(false);
		await assert.rejects(setup.client.withClient(async () => undefined), { kind: 'authentication' });
		setup.setAvailable(true);
		await setup.client.withClient(async () => undefined);
		assert.deepStrictEqual({ acquisitions: setup.signals.length, signIns: setup.signIns }, { acquisitions: 2, signIns: [] });
	});

	test('reuses repository access without prompting', async () => {
		const setup = setupClient();
		await setup.client.authenticate(['repo'], CancellationToken.None);
		assert.deepStrictEqual(setup.signIns, []);
	});

	test('explicit authentication obtains repository access through the default account', async () => {
		const setup = setupClient();
		setup.setAvailable(false);
		await setup.client.authenticate(['repo'], CancellationToken.None);
		assert.deepStrictEqual({ acquisitions: setup.signals.length, signIns: setup.signIns }, {
			acquisitions: 2, signIns: [{ additionalScopes: ['repo'] }],
		});
	});

	test('rejects explicit sign-in without a selected account', async () => {
		const setup = setupClient();
		setup.setAvailable(false);
		setup.setSignInResult(false);
		await assert.rejects(setup.client.authenticate(['repo'], CancellationToken.None), { kind: 'authentication' });
	});

	for (const error of ['Cancelled', new Error('Cancelled')]) {
		test(`normalizes provider sign-in cancellation (${typeof error})`, async () => {
			const setup = setupClient();
			setup.setAvailable(false);
			setup.setSignInError(error);
			await assert.rejects(setup.client.authenticate(['repo'], CancellationToken.None), isCancellationError);
		});
	}

	test('does not acquire a client for an already cancelled operation', async () => {
		const setup = setupClient();
		await assert.rejects(setup.client.withClient(async () => undefined, CancellationToken.Cancelled), isCancellationError);
		assert.deepStrictEqual({ acquisitions: setup.signals.length, signIns: setup.signIns }, { acquisitions: 0, signIns: [] });
	});

	test('cancelling one caller does not cancel another caller awaiting the same acquisition', async () => {
		const setup = setupClient();
		const gate = new DeferredPromise<void>();
		setup.delayAcquisition(gate.p);
		const source = store.add(new CancellationTokenSource());
		const rejected = assert.rejects(setup.client.withClient(async () => 'cancelled', source.token), isCancellationError);
		const peer = setup.client.withClient(async () => 'peer');
		await setup.acquired.p;
		source.cancel();
		await rejected;
		await gate.complete();
		assert.deepStrictEqual({ peer: await peer, acquisitions: setup.signals.length, aborted: setup.signals[0].aborted }, {
			peer: 'peer', acquisitions: 1, aborted: false,
		});
	});

	for (const reason of ['account', 'grant'] as const) {
		test(`${reason} changes cancel work, release the lease, and reacquire`, async () => {
			const setup = setupClient();
			const gate = new DeferredPromise<void>();
			const started = new DeferredPromise<AbortSignal>();
			const operation = setup.client.withClient(async (_client, signal) => {
				void started.complete(signal);
				await gate.p;
			});
			const signal = await started.p;
			const rejected = assert.rejects(operation, isCancellationError);
			if (reason === 'account') {
				setup.changeAccount();
			} else {
				setup.invalidated.fire();
			}
			await gate.complete();
			await rejected;
			await setup.client.withClient(async () => undefined);
			assert.deepStrictEqual({ aborted: signal.aborted, acquisitions: setup.signals.length, releases: setup.releases }, {
				aborted: true, acquisitions: 2, releases: 1,
			});
		});
	}

	test('disposes a client that arrives after the account changed', async () => {
		const setup = setupClient();
		const gate = new DeferredPromise<void>();
		setup.delayAcquisition(gate.p);
		const rejected = assert.rejects(setup.client.withClient(async () => assert.fail('No old-account request expected')), isCancellationError);
		await setup.acquired.p;
		setup.changeAccount();
		await rejected;
		await gate.complete();
		await Promise.resolve();
		assert.strictEqual(setup.releases, 1);
	});

	test('reports the selected Enterprise host without substituting public endpoints', () => {
		const setup = setupClient();
		setup.setEnterprise('https://enterprise.example.com');
		const server = setup.client.enterpriseHost;
		setup.setEnterprise('https://tenant.ghe.com');
		const cloud = setup.client.enterpriseHost;
		setup.setEnterprise(undefined);
		assert.deepStrictEqual({ server, cloud, missing: setup.client.enterpriseHost }, {
			server: 'enterprise.example.com', cloud: 'tenant.ghe.com', missing: undefined,
		});
	});
});
