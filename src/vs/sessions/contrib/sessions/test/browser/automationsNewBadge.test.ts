/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { observableValue } from '../../../../../base/common/observable.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import type { IAutomationDescriptor, IAutomationRun } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { IAutomationService } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import type { ICustomViewDescriptor } from '../../../../services/customView/browser/customView.js';
import { ICustomViewService } from '../../../../services/customView/browser/customViewService.js';
import { AUTOMATIONS_CUSTOM_VIEW_ID } from '../../browser/automationsConstants.js';
import { AUTOMATIONS_NEW_BADGE_SEEN_STORAGE_KEY, AutomationsNewBadgeState } from '../../browser/automationsNewBadge.js';

suite('AutomationsNewBadgeState', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createState(options: {
		readonly automations?: readonly IAutomationDescriptor[];
		readonly runs?: readonly IAutomationRun[];
		readonly activeView?: ICustomViewDescriptor;
		readonly seen?: boolean;
	} = {}) {
		const storageService = disposables.add(new InMemoryStorageService());
		if (options.seen) {
			storageService.store(AUTOMATIONS_NEW_BADGE_SEEN_STORAGE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
		}
		const automations = observableValue<readonly IAutomationDescriptor[]>(disposables, options.automations ?? []);
		const runs = observableValue<readonly IAutomationRun[]>(disposables, options.runs ?? []);
		const activeView = observableValue<ICustomViewDescriptor | undefined>(disposables, options.activeView);
		const automationService = new class extends mock<IAutomationService>() {
			override readonly automations = automations;
			override readonly runs = runs;
		};
		const customViewService = new class extends mock<ICustomViewService>() {
			override readonly activeCustomView = activeView;
		};
		const state = disposables.add(new AutomationsNewBadgeState(automationService, customViewService, storageService));
		return { state, storageService, automations, runs, activeView };
	}

	test('keeps the first visible decision stable until Automations is activated', () => {
		const { state, storageService, automations, runs, activeView } = createState();

		state.initialize();
		automations.set([upcastPartial<IAutomationDescriptor>({ id: 'late-automation' })], undefined);
		runs.set([upcastPartial<IAutomationRun>({ id: 'late-run' })], undefined);
		const beforeActivation = {
			showNewBadge: state.showNewBadge.get(),
			stored: storageService.get(AUTOMATIONS_NEW_BADGE_SEEN_STORAGE_KEY, StorageScope.APPLICATION),
		};

		activeView.set(upcastPartial<ICustomViewDescriptor>({ id: AUTOMATIONS_CUSTOM_VIEW_ID }), undefined);
		const afterActivation = {
			showNewBadge: state.showNewBadge.get(),
			stored: storageService.get(AUTOMATIONS_NEW_BADGE_SEEN_STORAGE_KEY, StorageScope.APPLICATION),
		};

		assert.deepStrictEqual({ beforeActivation, afterActivation }, {
			beforeActivation: { showNewBadge: true, stored: undefined },
			afterActivation: { showNewBadge: false, stored: 'true' },
		});
	});

	test('suppresses the badge when synchronous Automation evidence exists', () => {
		const definition = createState({
			automations: [upcastPartial<IAutomationDescriptor>({ id: 'existing-automation' })],
		});
		const run = createState({
			runs: [upcastPartial<IAutomationRun>({ id: 'existing-run' })],
		});

		definition.state.initialize();
		run.state.initialize();

		assert.deepStrictEqual({
			definition: {
				showNewBadge: definition.state.showNewBadge.get(),
				stored: definition.storageService.get(AUTOMATIONS_NEW_BADGE_SEEN_STORAGE_KEY, StorageScope.APPLICATION),
			},
			run: {
				showNewBadge: run.state.showNewBadge.get(),
				stored: run.storageService.get(AUTOMATIONS_NEW_BADGE_SEEN_STORAGE_KEY, StorageScope.APPLICATION),
			},
		}, {
			definition: { showNewBadge: false, stored: 'true' },
			run: { showNewBadge: false, stored: 'true' },
		});
	});

	test('honors persisted and restored seen state before the row renders', () => {
		const persisted = createState({ seen: true });
		const restored = createState({
			activeView: upcastPartial<ICustomViewDescriptor>({ id: AUTOMATIONS_CUSTOM_VIEW_ID }),
		});

		persisted.state.initialize();
		restored.state.initialize();

		assert.deepStrictEqual({
			persisted: persisted.state.showNewBadge.get(),
			restored: {
				showNewBadge: restored.state.showNewBadge.get(),
				stored: restored.storageService.get(AUTOMATIONS_NEW_BADGE_SEEN_STORAGE_KEY, StorageScope.APPLICATION),
			},
		}, {
			persisted: false,
			restored: { showNewBadge: false, stored: 'true' },
		});
	});
});
