/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { IMissionControlOptions } from '../../common/agentService.js';
import type { IAgentHostGitHubEnvironmentStatus } from '../../common/meta/agentHostGitHubEnvironmentMeta.js';
import { MissionControlClientRegistration } from '../../node/missionControl/missionControlClientRegistration.js';

class TestEnvironment {
	readonly calls: string[] = [];
	options: IMissionControlOptions | undefined;
	failNextRegistration = false;
	/** Runs while a registration is configured, after the environment already reports itself enabled. */
	onConfigure: (() => void) | undefined;

	get environmentId(): string | undefined { return this.options ? `environment-${this.options.accountId}` : undefined; }
	get environmentName(): string { return this.options?.name ?? 'Host'; }
	get isEnabled(): boolean { return this.options?.live === true; }

	async configure(options: IMissionControlOptions | undefined, withdrawingAccountId?: string): Promise<void> {
		if (!options) {
			this.calls.push(`withdraw ${withdrawingAccountId}`);
			this.options = undefined;
			return;
		}
		this.calls.push(`configure ${options.accountId} ${options.credential} roots=${options.roots.join(',')} live=${options.live}`);
		this.options = options;
		this.onConfigure?.();
		if (this.failNextRegistration) {
			this.failNextRegistration = false;
			throw new Error('Registration failed.');
		}
	}
}

suite('MissionControlClientRegistration', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function create(environment: TestEnvironment, name?: string) {
		const registration = disposables.add(new MissionControlClientRegistration(environment, {
			homeDirectory: '/home/user',
			getFileSystemRoots: async () => ['/', '/home/user'],
			...(name ? { name } : {}),
		}));
		const registered: boolean[] = [];
		disposables.add(registration.onDidChangeRegistered(value => registered.push(value)));
		const instanceId = registration.status.instanceId;
		const status = () => withoutInstanceId(registration.status, instanceId);
		const statuses: object[] = [];
		disposables.add(registration.onDidChangeStatus(value => statuses.push(withoutInstanceId(value, instanceId))));
		return { registration, registered, status, statuses };
	}

	function withoutInstanceId({ instanceId, ...rest }: IAgentHostGitHubEnvironmentStatus, expected: string): object {
		assert.strictEqual(instanceId, expected);
		return rest;
	}

	async function outcome<T>(promise: Promise<T>): Promise<T | string> {
		try {
			return await promise;
		} catch (error) {
			return `rejected: ${(error as Error).message}`;
		}
	}

	test('registers, refreshes and unregisters for the owning account only', async () => {
		const environment = new TestEnvironment();
		const { registration, registered, status, statuses } = create(environment, 'Ubuntu on host');
		const whileRegistering: object[] = [];
		environment.onConfigure = () => whileRegistering.push(status());
		const results = [
			await outcome(registration.register('account', 'token-1')),
			await outcome(registration.register('account', 'token-2')),
			await outcome(registration.register('other', 'token-3')),
			await outcome(registration.unregister('other')),
			registration.isRegistered,
			await outcome(registration.unregister('account')),
			registration.isRegistered,
			await outcome(registration.unregister('account')),
		];
		const registrationStatus = { registration: { accountId: 'account', environmentId: 'environment-account', name: 'Ubuntu on host' } };
		assert.deepStrictEqual({ results, registered, statuses, whileRegistering, calls: environment.calls }, {
			results: [
				{ environmentId: 'environment-account', name: 'Ubuntu on host' },
				{ environmentId: 'environment-account', name: 'Ubuntu on host' },
				'rejected: This agent host is already registered as a GitHub environment by another account.',
				'rejected: Only the account that registered this GitHub environment can unregister it.',
				true,
				undefined,
				false,
				undefined,
			],
			registered: [true, false],
			statuses: [registrationStatus, {}],
			// A client registration in progress is not mistaken for the host's own.
			whileRegistering: [{}, registrationStatus],
			calls: [
				'configure account token-1 roots=/,/home/user live=true',
				'configure account token-2 roots=/,/home/user live=true',
				'withdraw account',
			],
		});
	});

	test('withdraws a failed registration and refuses a host that is already registered by its host', async () => {
		const environment = new TestEnvironment();
		const { registration, registered, status, statuses } = create(environment);
		environment.failNextRegistration = true;
		const failed = await outcome(registration.register('account', 'token'));
		const failedState = registration.isRegistered;
		await environment.configure({ baseUrl: 'https://api.github.com', accountId: 'host', credential: 'host-token', roots: [], projects: [], live: true });
		const hostRegistered = await outcome(registration.register('account', 'token'));
		assert.deepStrictEqual({ failed, failedState, hostRegistered, registered, statuses, status: status(), calls: environment.calls }, {
			failed: 'rejected: Registration failed.',
			failedState: false,
			hostRegistered: 'rejected: This agent host is already registered as a GitHub environment by its host.',
			registered: [],
			statuses: [],
			status: { registeredByHost: true },
			calls: [
				'configure account token roots=/,/home/user live=true',
				'withdraw account',
				'configure host host-token roots= live=true',
			],
		});
	});
});
