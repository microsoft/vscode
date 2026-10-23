/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { GitHubEnvironmentsAvailabilityTreatment, GitHubEnvironmentsAvailableContext } from '../../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { NullWorkbenchAssignmentService } from '../../../../../services/assignment/test/common/nullAssignmentService.js';
import { MissionControlAvailabilityService } from '../../../browser/remoteAgentHost/missionControlAvailabilityService.js';

suite('Mission Control experiment availability', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function fixture(initial: Promise<boolean | undefined>) {
		const refetched = store.add(new Emitter<void>());
		const requests: string[] = [];
		const errors: (string | Error)[] = [];
		let treatment = initial;
		const assignments = new class extends NullWorkbenchAssignmentService {
			override readonly onDidRefetchAssignments = refetched.event;
			override async getTreatment<T extends string | number | boolean>(name: string): Promise<T | undefined> {
				requests.push(name);
				return await treatment as T | undefined;
			}
		}();
		const context = new MockContextKeyService();
		const service = store.add(new MissionControlAvailabilityService(assignments, context, new class extends NullLogService {
			override error(message: string | Error): void { errors.push(message); }
		}()));
		return {
			service, context, requests, errors,
			refetch: (value: Promise<boolean | undefined>) => { treatment = value; refetched.fire(); },
		};
	}

	for (const treatment of [undefined, true, false]) {
		test(`resolves availability without a user-setting override: ${treatment}`, async () => {
			const pending = new DeferredPromise<boolean | undefined>();
			const { service, context, requests } = fixture(pending.p);
			const initial = service.available.get();
			await pending.complete(treatment);
			await service.whenReady;
			assert.deepStrictEqual({
				initial,
				available: service.available.get(),
				context: context.getContextKeyValue(GitHubEnvironmentsAvailableContext.key),
				requests,
			}, {
				initial: false, available: treatment !== false, context: treatment !== false,
				requests: [GitHubEnvironmentsAvailabilityTreatment],
			});
		});
	}

	test('refetching assignments disables and restores availability', async () => {
		const { service, refetch } = fixture(Promise.resolve(true));
		await service.whenReady;
		const states = [service.available.get()];
		for (const value of [false, true]) {
			refetch(Promise.resolve(value));
			await service.whenReady;
			states.push(service.available.get());
		}
		assert.deepStrictEqual(states, [true, false, true]);
	});

	test('a stale initial assignment cannot override a newer disablement', async () => {
		const initial = new DeferredPromise<boolean | undefined>();
		const { service, refetch } = fixture(initial.p);
		const first = service.whenReady;
		refetch(Promise.resolve(false));
		await service.whenReady;
		await initial.complete(true);
		await first;
		assert.strictEqual(service.available.get(), false);
	});

	test('assignment errors fail closed, are logged, and recover on refetch', async () => {
		const pending = new DeferredPromise<boolean | undefined>();
		const { service, refetch, errors } = fixture(pending.p);
		const failed = assert.rejects(service.whenReady, /assignment failed/);
		await pending.error(new Error('assignment failed'));
		await failed;
		const afterFailure = service.available.get();
		refetch(Promise.resolve(true));
		await service.whenReady;
		assert.deepStrictEqual({ afterFailure, recovered: service.available.get(), errors: errors.length }, {
			afterFailure: false, recovered: true, errors: 1,
		});
	});
});
