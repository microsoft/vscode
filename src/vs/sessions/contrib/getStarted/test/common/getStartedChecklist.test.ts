/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { GET_STARTED_STATE_STORAGE_KEY, getCompletedGetStartedItems, GetStartedChecklistModel, GetStartedItemId, IGetStartedSignals, readGetStartedState, toGetStartedChecklistMode } from '../../common/getStartedChecklist.js';

const noSignals: IGetStartedSignals = { createdSessionCount: 0, runningSessionCount: 0, projectCount: 0, keepingChanges: false, automationCount: 0 };

suite('GetStartedChecklist', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createModel(storage = disposables.add(new InMemoryStorageService()), automationsAvailable = true) {
		const signals = observableValue<IGetStartedSignals>('signals', noSignals);
		const automations = observableValue('automationsAvailable', automationsAvailable);
		const model = disposables.add(new GetStartedChecklistModel(signals, automations, storage));
		const update = (patch: Partial<IGetStartedSignals>) => signals.set({ ...signals.get(), ...patch }, undefined);
		const done = () => model.items.get().filter(item => item.done).map(item => item.id);
		return { model, storage, update, automations, done };
	}

	test('completion rules', () => {
		assert.deepStrictEqual({
			none: getCompletedGetStartedItems(noSignals),
			oneSessionRunning: getCompletedGetStartedItems({ ...noSignals, createdSessionCount: 1, runningSessionCount: 1, projectCount: 1 }),
			twoRunning: getCompletedGetStartedItems({ ...noSignals, createdSessionCount: 2, runningSessionCount: 2 }),
			twoProjects: getCompletedGetStartedItems({ ...noSignals, projectCount: 2 }),
			keeping: getCompletedGetStartedItems({ ...noSignals, keepingChanges: true }),
			automation: getCompletedGetStartedItems({ ...noSignals, automationCount: 1 }),
		}, {
			none: [],
			oneSessionRunning: [GetStartedItemId.StartSession],
			twoRunning: [GetStartedItemId.StartSession, GetStartedItemId.RunInParallel],
			twoProjects: [GetStartedItemId.SecondProject],
			keeping: [GetStartedItemId.KeepChanges],
			automation: [GetStartedItemId.Automation],
		});
	});

	test('eligibility is decided once, at first sight, for users with fewer than two sessions', () => {
		const newUser = createModel();
		const existingUser = createModel();
		assert.deepStrictEqual({
			newUserFirst: newUser.model.decideEligibility(1),
			newUserLater: newUser.model.decideEligibility(10),
			existingUserFirst: existingUser.model.decideEligibility(2),
			existingUserLater: existingUser.model.decideEligibility(0),
			persisted: readGetStartedState(newUser.storage).eligible,
		}, {
			newUserFirst: true,
			newUserLater: true,
			existingUserFirst: false,
			existingUserLater: false,
			persisted: true,
		});
	});

	test('completed items stay done, persist per machine, and survive a restart', () => {
		const { model, storage, update, done } = createModel();
		model.decideEligibility(0);
		update({ createdSessionCount: 1, runningSessionCount: 2 });
		update({ runningSessionCount: 0 });
		update({ projectCount: 2, keepingChanges: true });
		update({ keepingChanges: false });
		const afterSignals = done();
		const restarted = createModel(storage);
		assert.deepStrictEqual({
			afterSignals,
			allDone: model.allDone.get(),
			afterRestart: restarted.done(),
		}, {
			afterSignals: [GetStartedItemId.StartSession, GetStartedItemId.RunInParallel, GetStartedItemId.SecondProject, GetStartedItemId.KeepChanges],
			allDone: false,
			afterRestart: [GetStartedItemId.StartSession, GetStartedItemId.RunInParallel, GetStartedItemId.SecondProject, GetStartedItemId.KeepChanges],
		});
	});

	test('reports the items that signals complete, once each', () => {
		const { model, update } = createModel();
		const reported: (readonly GetStartedItemId[])[] = [];
		disposables.add(model.onDidCompleteItems(items => reported.push(items)));
		model.decideEligibility(0);
		update({ createdSessionCount: 1 });
		update({ createdSessionCount: 2, runningSessionCount: 2, projectCount: 2 });
		update({ runningSessionCount: 0 });
		update({ runningSessionCount: 2 });
		assert.deepStrictEqual(reported, [
			[GetStartedItemId.StartSession],
			[GetStartedItemId.RunInParallel, GetStartedItemId.SecondProject],
		]);
	});

	test('nothing is tracked or stored before eligibility is decided, or for ineligible users', () => {
		const { model, storage, update, done } = createModel();
		update({ createdSessionCount: 5, runningSessionCount: 2, automationCount: 1 });
		const undecided = { done: done(), stored: storage.get(GET_STARTED_STATE_STORAGE_KEY, StorageScope.APPLICATION) };
		model.decideEligibility(5);
		update({ createdSessionCount: 6, projectCount: 2 });
		assert.deepStrictEqual({ undecided, ineligible: done(), stored: readGetStartedState(storage) }, {
			undecided: { done: [], stored: undefined },
			ineligible: [],
			stored: { eligible: false, completed: [], collapsed: undefined, dismissed: undefined },
		});
	});

	test('what an eligible user did before seeing the checklist counts as done, and only later progress is reported', () => {
		const { model, update, done } = createModel();
		const reported: (readonly GetStartedItemId[])[] = [];
		disposables.add(model.onDidCompleteItems(items => reported.push(items)));
		update({ createdSessionCount: 1, runningSessionCount: 2 });
		model.decideEligibility(1);
		const atDecision = done();
		update({ projectCount: 2 });
		assert.deepStrictEqual({ atDecision, afterwards: done(), reported }, {
			atDecision: [GetStartedItemId.StartSession, GetStartedItemId.RunInParallel],
			afterwards: [GetStartedItemId.StartSession, GetStartedItemId.RunInParallel, GetStartedItemId.SecondProject],
			reported: [[GetStartedItemId.SecondProject]],
		});
	});

	test('the automation item only shows when automations are available, unless it is already done', () => {
		const { model, update, automations } = createModel(undefined, false);
		model.decideEligibility(0);
		const ids = () => model.items.get().map(item => item.id);
		const unavailable = ids();
		automations.set(true, undefined);
		update({ automationCount: 1 });
		automations.set(false, undefined);
		assert.deepStrictEqual({ unavailable, doneButUnavailable: ids(), allDone: model.allDone.get() }, {
			unavailable: [GetStartedItemId.StartSession, GetStartedItemId.RunInParallel, GetStartedItemId.SecondProject, GetStartedItemId.KeepChanges],
			doneButUnavailable: [GetStartedItemId.StartSession, GetStartedItemId.RunInParallel, GetStartedItemId.SecondProject, GetStartedItemId.KeepChanges, GetStartedItemId.Automation],
			allDone: false,
		});
	});

	test('collapse, dismiss and restore persist, and other windows pick them up', () => {
		const first = createModel();
		const second = createModel(first.storage);
		first.model.setCollapsed(true);
		first.model.dismiss();
		const dismissed = second.model.state.get();
		second.model.restore();
		assert.deepStrictEqual({ dismissed, restored: first.model.state.get() }, {
			dismissed: { eligible: undefined, completed: [], collapsed: true, dismissed: true },
			restored: { eligible: undefined, completed: [], collapsed: false, dismissed: undefined },
		});
	});

	test('tolerates invalid stored state and unknown setting values', () => {
		const storage = disposables.add(new InMemoryStorageService());
		storage.store(GET_STARTED_STATE_STORAGE_KEY, '{"eligible":"yes","completed":["startSession","bogus"],"dismissed":1}', StorageScope.APPLICATION, StorageTarget.MACHINE);
		const partial = readGetStartedState(storage);
		storage.store(GET_STARTED_STATE_STORAGE_KEY, 'not json', StorageScope.APPLICATION, StorageTarget.MACHINE);
		assert.deepStrictEqual({
			partial,
			invalid: readGetStartedState(storage),
			modes: ['none', 'aboveSessions', 'belowSessions', 'checklist', 'bogus', undefined].map(toGetStartedChecklistMode),
		}, {
			partial: { eligible: undefined, completed: [GetStartedItemId.StartSession], collapsed: undefined, dismissed: undefined },
			invalid: { eligible: undefined, completed: [], collapsed: undefined, dismissed: undefined },
			modes: ['none', 'aboveSessions', 'belowSessions', 'none', 'none', 'none'],
		});
	});
});
