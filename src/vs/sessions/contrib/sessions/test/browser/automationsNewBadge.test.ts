/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import type { IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import type { IAutomationDescriptor, IAutomationRun } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { type AutomationCatalogueState, IAutomationService } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { IWorkbenchAssignmentService } from '../../../../../workbench/services/assignment/common/assignmentService.js';
import { ILifecycleService, LifecyclePhase } from '../../../../../workbench/services/lifecycle/common/lifecycle.js';
import type { ICustomViewDescriptor } from '../../../../services/customView/browser/customView.js';
import { ICustomViewService } from '../../../../services/customView/browser/customViewService.js';
import { ISessionsWindowUsageService } from '../../../../services/sessions/browser/sessionsWindowUsageService.js';
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
		readonly hadPriorWindowOpen?: boolean;
		readonly catalogueState?: AutomationCatalogueState;
		readonly eventuallyReady?: boolean;
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
		const catalogueState = observableValue<AutomationCatalogueState>(disposables, options.catalogueState ?? 'ready');
		const automationService = new class extends mock<IAutomationService>() {
			override readonly automations = automations;
			override readonly runs = runs;
			override readonly catalogueState = catalogueState;
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
		const sessionsWindowUsageService = new class extends mock<ISessionsWindowUsageService>() {
			override readonly hadPriorWindowOpen = options.hadPriorWindowOpen ?? true;
			override readonly windowOpenCount = this.hadPriorWindowOpen ? 2 : 1;
		};
		const eventually = new DeferredPromise<void>();
		const lifecycleService = new class extends mock<ILifecycleService>() {
			override when(phase: LifecyclePhase): Promise<void> {
				assert.strictEqual(phase, LifecyclePhase.Eventually);
				return eventually.p;
			}
		};
		if (options.eventuallyReady !== false) {
			void eventually.complete();
		}
		const state = disposables.add(new AutomationsNewBadgeState(
			automationService,
			customViewService,
			storageService,
			assignmentService,
			configurationService,
			new NullLogService(),
			sessionsWindowUsageService,
			lifecycleService,
		));
		return {
			state,
			storageService,
			automations,
			runs,
			activeView,
			assignmentService,
			configurationService,
			refetchAssignments,
			catalogueState,
			completeEventually: () => eventually.complete(),
		};
	}

	test('stays hidden on the first Agents window open without reading the treatment', async () => {
		const fixture = createState({ hadPriorWindowOpen: false, style: 'accent' });

		await fixture.state.initialize();
		fixture.refetchAssignments.fire();
		await Promise.resolve();

		assert.deepStrictEqual({
			showNewBadge: fixture.state.showNewBadge.get(),
			stored: fixture.storageService.get(AUTOMATIONS_NEW_BADGE_SEEN_STORAGE_KEY, StorageScope.APPLICATION),
			treatments: fixture.assignmentService.treatments,
		}, {
			showNewBadge: false,
			stored: undefined,
			treatments: [],
		});
	});

	test('resolves accent, soft, and outline for eligible returning users', async () => {
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

	test('never reveals after initial catalogue discovery is suppressed', async () => {
		const snapshots = [];
		for (const initialState of ['loading', 'unavailable', 'error'] as const) {
			const fixture = createState({ catalogueState: initialState, style: 'accent' });

			await fixture.state.initialize();
			fixture.catalogueState.set('ready', undefined);
			await fixture.configurationService.setUserConfiguration(AUTOMATIONS_NEW_BADGE_STYLE_SETTING, 'soft');
			fixture.configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
				affectsConfiguration: key => key === AUTOMATIONS_NEW_BADGE_STYLE_SETTING,
			}));
			fixture.refetchAssignments.fire();
			await Promise.resolve();
			snapshots.push({
				initialState,
				showNewBadge: fixture.state.showNewBadge.get(),
				stored: fixture.storageService.get(AUTOMATIONS_NEW_BADGE_SEEN_STORAGE_KEY, StorageScope.APPLICATION),
				treatments: fixture.assignmentService.treatments,
			});
		}

		assert.deepStrictEqual(snapshots, [
			{ initialState: 'loading', showNewBadge: false, stored: undefined, treatments: [] },
			{ initialState: 'unavailable', showNewBadge: false, stored: undefined, treatments: [] },
			{ initialState: 'error', showNewBadge: false, stored: undefined, treatments: [] },
		]);
	});

	test('waits for the bounded startup phase before deciding eligibility', async () => {
		const fixture = createState({ eventuallyReady: false, style: 'accent' });
		const initialization = fixture.state.initialize();
		await Promise.resolve();
		const beforeEventually = fixture.state.presentation.get();

		await fixture.completeEventually();
		await initialization;

		assert.deepStrictEqual({
			beforeEventually,
			afterEventually: fixture.state.presentation.get(),
		}, {
			beforeEventually: undefined,
			afterEventually: 'accent',
		});
	});

	test('retires the badge when Automation evidence appears after presentation', async () => {
		const fixture = createState();
		await fixture.state.initialize();
		const beforeEvidence = fixture.state.presentation.get();

		fixture.automations.set([upcastPartial<IAutomationDescriptor>({ id: 'late-automation' })], undefined);
		fixture.automations.set([], undefined);

		assert.deepStrictEqual({
			beforeEvidence,
			afterEvidence: fixture.state.presentation.get(),
			stored: fixture.storageService.get(AUTOMATIONS_NEW_BADGE_SEEN_STORAGE_KEY, StorageScope.APPLICATION),
		}, {
			beforeEvidence: 'outline',
			afterEvidence: undefined,
			stored: 'true',
		});
	});

	test('suppresses for the window when the aggregate catalogue starts loading after presentation', async () => {
		const fixture = createState();
		await fixture.state.initialize();
		const beforeDiscoveryChange = fixture.state.presentation.get();

		fixture.catalogueState.set('loading', undefined);
		fixture.catalogueState.set('ready', undefined);
		fixture.refetchAssignments.fire();
		await Promise.resolve();

		assert.deepStrictEqual({
			beforeDiscoveryChange,
			afterDiscoveryChange: fixture.state.presentation.get(),
			stored: fixture.storageService.get(AUTOMATIONS_NEW_BADGE_SEEN_STORAGE_KEY, StorageScope.APPLICATION),
		}, {
			beforeDiscoveryChange: 'outline',
			afterDiscoveryChange: undefined,
			stored: undefined,
		});
	});

	test('suppresses for the window when the aggregate catalogue becomes unavailable or errors', async () => {
		const snapshots = [];
		for (const catalogueState of ['unavailable', 'error'] as const) {
			const fixture = createState();
			await fixture.state.initialize();
			const beforeDiscoveryChange = fixture.state.presentation.get();

			fixture.catalogueState.set(catalogueState, undefined);
			fixture.catalogueState.set('ready', undefined);

			snapshots.push({
				catalogueState,
				beforeDiscoveryChange,
				afterDiscoveryChange: fixture.state.presentation.get(),
				stored: fixture.storageService.get(AUTOMATIONS_NEW_BADGE_SEEN_STORAGE_KEY, StorageScope.APPLICATION),
			});
		}

		assert.deepStrictEqual(snapshots, [
			{ catalogueState: 'unavailable', beforeDiscoveryChange: 'outline', afterDiscoveryChange: undefined, stored: undefined },
			{ catalogueState: 'error', beforeDiscoveryChange: 'outline', afterDiscoveryChange: undefined, stored: undefined },
		]);
	});

	test('lets the hidden setting override and live-update the treatment', async () => {
		const fixture = createState({ style: 'outline', configuredStyle: 'soft' });
		await fixture.state.initialize();
		const initial = fixture.state.presentation.get();

		await fixture.configurationService.setUserConfiguration(AUTOMATIONS_NEW_BADGE_STYLE_SETTING, 'accent');
		fixture.configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
			affectsConfiguration: key => key === AUTOMATIONS_NEW_BADGE_STYLE_SETTING,
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

	test('force preview bypasses first-use and Automation evidence until activation', async () => {
		const fixture = createState({
			hadPriorWindowOpen: false,
			automations: [upcastPartial<IAutomationDescriptor>({ id: 'existing-automation' })],
			style: 'accent',
		});
		await fixture.state.initialize();

		await fixture.state.reset();
		fixture.runs.set([upcastPartial<IAutomationRun>({ id: 'running' })], undefined);
		const preview = {
			style: fixture.state.presentation.get(),
			stored: fixture.storageService.get(AUTOMATIONS_NEW_BADGE_SEEN_STORAGE_KEY, StorageScope.APPLICATION),
		};
		fixture.activeView.set(upcastPartial<ICustomViewDescriptor>({ id: AUTOMATIONS_CUSTOM_VIEW_ID }), undefined);

		assert.deepStrictEqual({
			preview,
			afterActivation: {
				showNewBadge: fixture.state.showNewBadge.get(),
				stored: fixture.storageService.get(AUTOMATIONS_NEW_BADGE_SEEN_STORAGE_KEY, StorageScope.APPLICATION),
			},
		}, {
			preview: {
				style: 'accent',
				stored: undefined,
			},
			afterActivation: {
				showNewBadge: false,
				stored: 'true',
			},
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
