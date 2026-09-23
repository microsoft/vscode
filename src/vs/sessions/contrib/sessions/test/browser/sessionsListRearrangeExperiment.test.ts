/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IWorkbenchAssignmentService } from '../../../../../workbench/services/assignment/common/assignmentService.js';
import { SessionsListRearrangeExperimentState } from '../../browser/sessionsListRearrangeExperiment.js';

suite('SessionsListRearrangeExperimentState', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('resolves the treatment and reacts to assignment refetches', async () => {
		const refetchAssignments = disposables.add(new Emitter<void>());
		const values = [true, false];
		const treatments: string[] = [];
		const assignmentService = new class extends mock<IWorkbenchAssignmentService>() {
			override readonly onDidRefetchAssignments = refetchAssignments.event;
			override async getTreatment<T extends string | number | boolean>(name: string): Promise<T | undefined> {
				treatments.push(name);
				return values.shift() as T | undefined;
			}
		};
		const state = disposables.add(new SessionsListRearrangeExperimentState(assignmentService, new NullLogService()));

		await Promise.resolve();
		const treatment = state.rearrangeList.get();
		refetchAssignments.fire();
		await Promise.resolve();

		assert.deepStrictEqual({
			treatment,
			control: state.rearrangeList.get(),
			treatments,
		}, {
			treatment: true,
			control: false,
			treatments: [
				'sessions.list.rearrage',
				'sessions.list.rearrage',
			],
		});
	});

	test('uses control on errors and ignores stale assignment responses', async () => {
		const refetchAssignments = disposables.add(new Emitter<void>());
		const first = new DeferredPromise<boolean | undefined>();
		const second = new DeferredPromise<boolean | undefined>();
		const requests = [first, second];
		const assignmentService = new class extends mock<IWorkbenchAssignmentService>() {
			override readonly onDidRefetchAssignments = refetchAssignments.event;
			override getTreatment<T extends string | number | boolean>(): Promise<T | undefined> {
				const request = requests.shift();
				if (!request) {
					return Promise.reject(new Error('treatment unavailable'));
				}
				return request.p as Promise<T | undefined>;
			}
		};
		const state = disposables.add(new SessionsListRearrangeExperimentState(assignmentService, new NullLogService()));

		refetchAssignments.fire();
		void second.complete(true);
		await second.p;
		const afterLatest = state.rearrangeList.get();
		void first.complete(false);
		await first.p;
		const afterStale = state.rearrangeList.get();
		refetchAssignments.fire();
		await Promise.resolve();

		assert.deepStrictEqual({
			afterLatest,
			afterStale,
			afterError: state.rearrangeList.get(),
		}, {
			afterLatest: true,
			afterStale: true,
			afterError: false,
		});
	});
});
