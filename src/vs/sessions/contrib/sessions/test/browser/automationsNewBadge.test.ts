/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import type { IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import type { IAutomationDescriptor, IAutomationRun } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { IAutomationService } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { IWorkbenchAssignmentService } from '../../../../../workbench/services/assignment/common/assignmentService.js';
import type { ICustomViewDescriptor } from '../../../../services/customView/browser/customView.js';
import { ICustomViewService } from '../../../../services/customView/browser/customViewService.js';
import { AUTOMATIONS_CUSTOM_VIEW_ID } from '../../browser/automationsConstants.js';
import { AUTOMATIONS_NEW_BADGE_SEEN_STORAGE_KEY, AUTOMATIONS_NEW_BADGE_STYLE_SETTING, AUTOMATIONS_NEW_BADGE_STYLE_TREATMENT, AutomationsNewBadgeState, type AutomationsNewBadgeStyle } from '../../browser/automationsNewBadge.js';

suite('AutomationsNewBadgeState', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	class TestAssignmentService extends mock<IWorkbenchAssignmentService>() {
		readonly treatments: string[] = [];
		override readonly onDidRefetchAssignments;

		constructor(
			private readonly style: AutomationsNewBadgeStyle | undefined,
			refetchAssignments: Emitter<void>,
			private readonly error?: Error,
		) {
			super();
			this.onDidRefetchAssignments = refetchAssignments.event;
		}

		override async getTreatment<T extends string | number | boolean>(name: string): Promise<T | undefined> {
			this.treatments.push(name);
			if (this.error) {
				throw this.error;
			}
			return this.style as T | undefined;
		}
	}

	function createState(options: {
		readonly automations?: readonly IAutomationDescriptor[];
		readonly runs?: readonly IAutomationRun[];
		readonly activeView?: ICustomViewDescriptor;
		readonly seen?: boolean;
		readonly style?: AutomationsNewBadgeStyle;
		readonly configuredStyle?: AutomationsNewBadgeStyle;
		readonly treatmentError?: Error;
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
		const refetchAssignments = disposables.add(new Emitter<void>());
		const assignmentService = new TestAssignmentService(options.style, refetchAssignments, options.treatmentError);
		const configurationService = new TestConfigurationService();
		if (options.configuredStyle) {
			void configurationService.setUserConfiguration(AUTOMATIONS_NEW_BADGE_STYLE_SETTING, options.configuredStyle);
		}
		const state = disposables.add(new AutomationsNewBadgeState(
			automationService,
			customViewService,
			storageService,
			assignmentService,
			configurationService,
			new NullLogService(),
		));
		return { state, storageService, automations, runs, activeView, assignmentService, configurationService, refetchAssignments };
	}

	test('keeps the resolved style stable until Automations is activated', async () => {
		const { state, storageService, automations, runs, activeView } = createState();

		await state.initialize();
		automations.set([upcastPartial<IAutomationDescriptor>({ id: 'late-automation' })], undefined);
		runs.set([upcastPartial<IAutomationRun>({ id: 'late-run' })], undefined);
		const beforeActivation = {
			showNewBadge: state.showNewBadge.get(),
			style: state.presentation.get(),
			stored: storageService.get(AUTOMATIONS_NEW_BADGE_SEEN_STORAGE_KEY, StorageScope.APPLICATION),
		};

		activeView.set(upcastPartial<ICustomViewDescriptor>({ id: AUTOMATIONS_CUSTOM_VIEW_ID }), undefined);
		const afterActivation = {
			showNewBadge: state.showNewBadge.get(),
			stored: storageService.get(AUTOMATIONS_NEW_BADGE_SEEN_STORAGE_KEY, StorageScope.APPLICATION),
		};

		assert.deepStrictEqual({ beforeActivation, afterActivation }, {
			beforeActivation: { showNewBadge: true, style: 'outline', stored: undefined },
			afterActivation: {
				showNewBadge: false,
				stored: 'true',
			},
		});
	});

	test('resolves accent, soft, and outline from the hidden treatment', async () => {
		const snapshots = [];
		for (const style of ['accent', 'soft', 'outline'] as const) {
			const fixture = createState({ style });
			await fixture.state.initialize();
			snapshots.push({
				style: fixture.state.presentation.get(),
				treatments: fixture.assignmentService.treatments,
			});
		}

		assert.deepStrictEqual(snapshots, [
			{ style: 'accent', treatments: [AUTOMATIONS_NEW_BADGE_STYLE_TREATMENT] },
			{ style: 'soft', treatments: [AUTOMATIONS_NEW_BADGE_STYLE_TREATMENT] },
			{ style: 'outline', treatments: [AUTOMATIONS_NEW_BADGE_STYLE_TREATMENT] },
		]);
	});

	test('falls back to outline when treatment resolution fails', async () => {
		const fixture = createState({ treatmentError: new Error('Unavailable') });

		await fixture.state.initialize();

		assert.deepStrictEqual({
			style: fixture.state.presentation.get(),
			treatments: fixture.assignmentService.treatments,
		}, {
			style: 'outline',
			treatments: [AUTOMATIONS_NEW_BADGE_STYLE_TREATMENT],
		});
	});

	test('lets the hidden setting override and live-update the treatment', async () => {
		const fixture = createState({ style: 'outline', configuredStyle: 'soft' });
		await fixture.state.initialize();
		const initial = fixture.state.presentation.get();

		await fixture.configurationService.setUserConfiguration(AUTOMATIONS_NEW_BADGE_STYLE_SETTING, 'accent');
		fixture.configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
			affectsConfiguration: (key: string) => key === AUTOMATIONS_NEW_BADGE_STYLE_SETTING,
		}));

		assert.deepStrictEqual({
			initial,
			updated: fixture.state.presentation.get(),
			treatments: fixture.assignmentService.treatments,
		}, {
			initial: 'soft',
			updated: 'accent',
			treatments: [],
		});
	});

	test('resets seen state for development even when prior Automation evidence exists', async () => {
		const fixture = createState({
			automations: [upcastPartial<IAutomationDescriptor>({ id: 'existing-automation' })],
			style: 'accent',
		});
		await fixture.state.initialize();

		await fixture.state.reset();

		assert.deepStrictEqual({
			showNewBadge: fixture.state.showNewBadge.get(),
			style: fixture.state.presentation.get(),
			stored: fixture.storageService.get(AUTOMATIONS_NEW_BADGE_SEEN_STORAGE_KEY, StorageScope.APPLICATION),
		}, {
			showNewBadge: true,
			style: 'accent',
			stored: undefined,
		});
	});

	test('suppresses the badge when synchronous Automation evidence exists', async () => {
		const definition = createState({
			automations: [upcastPartial<IAutomationDescriptor>({ id: 'existing-automation' })],
		});
		const run = createState({
			runs: [upcastPartial<IAutomationRun>({ id: 'existing-run' })],
		});

		await definition.state.initialize();
		await run.state.initialize();

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

	test('honors persisted and restored seen state before the row renders', async () => {
		const persisted = createState({ seen: true });
		const restored = createState({
			activeView: upcastPartial<ICustomViewDescriptor>({ id: AUTOMATIONS_CUSTOM_VIEW_ID }),
		});

		await persisted.state.initialize();
		await restored.state.initialize();

		assert.deepStrictEqual({
			persisted: {
				showNewBadge: persisted.state.showNewBadge.get(),
			},
			restored: {
				showNewBadge: restored.state.showNewBadge.get(),
				stored: restored.storageService.get(AUTOMATIONS_NEW_BADGE_SEEN_STORAGE_KEY, StorageScope.APPLICATION),
			},
		}, {
			persisted: { showNewBadge: false },
			restored: { showNewBadge: false, stored: 'true' },
		});
	});
});
