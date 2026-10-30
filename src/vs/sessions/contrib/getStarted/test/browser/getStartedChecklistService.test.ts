/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/runWithFakedTimers.js';
import { AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY } from '../../../../../platform/chat/common/agentsWindowInvitation.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyExpression } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { TestExperimentTriggerTelemetryService } from '../../../../../platform/telemetry/test/common/experimentTriggerTestUtils.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IAutomationService } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { onboardingScenarioRegistry } from '../../../../../workbench/contrib/onboarding/common/onboardingRegistry.js';
import { OnboardingOutcome } from '../../../../../workbench/contrib/onboarding/common/onboardingScenario.js';
import { IOnboardingScenarioService, ONBOARDING_DEVELOPER_MODE_CONFIG } from '../../../../../workbench/contrib/onboarding/common/onboardingScenarioService.js';
import { ChatEntitlement, IChatEntitlementService, IChatSentiment } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { IsPhoneLayoutContext } from '../../../../common/contextkeys.js';
import { ICustomViewService } from '../../../../services/customView/browser/customViewService.js';
import { ISessionsRecentWorkspacesService } from '../../../../services/sessions/browser/sessionsRecentWorkspacesService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { IChangesViewService } from '../../../changes/common/changesViewService.js';
import { ISessionChangesService } from '../../../changes/common/sessionChangesService.js';
import { createTestSession } from '../../../sessions/test/browser/sessionsListTestUtils.js';
import { GET_STARTED_CHECKLIST_SETTING, GET_STARTED_DEVELOPER_MODE_ID, GET_STARTED_ITEM_IDS, GET_STARTED_STATE_STORAGE_KEY, GetStartedChecklistMode, GetStartedItemId, readGetStartedState } from '../../common/getStartedChecklist.js';
import { GetStartedChecklistService } from '../../browser/getStartedChecklistService.js';

class TestContextKeyService extends MockContextKeyService {
	aiEnabled = true;
	override contextMatchesRules(_rules: ContextKeyExpression): boolean {
		return this.aiEnabled;
	}
}

/** Records the experiment triggers and the other events logged through it. */
class TestTelemetryService extends TestExperimentTriggerTelemetryService {
	readonly events: Record<string, unknown>[] = [];

	override publicLog2(eventName?: string, data?: object): void {
		super.publicLog2(eventName, data);
		if (eventName && eventName !== 'experimentTrigger') {
			this.events.push({ eventName, ...data });
		}
	}
}

/** Runs no tours, and records the ones requested until the test ends them. */
class TestOnboardingScenarioService extends mock<IOnboardingScenarioService>() {
	override isPresenting = observableValue<boolean>('isPresenting', false);
	readonly runs: { readonly id: string; readonly registered: boolean; readonly token: CancellationToken; readonly outcome: DeferredPromise<OnboardingOutcome> }[] = [];

	override runScenario(id: string, token: CancellationToken = CancellationToken.None): Promise<OnboardingOutcome> {
		const outcome = new DeferredPromise<OnboardingOutcome>();
		this.runs.push({ id, registered: !!onboardingScenarioRegistry.getScenario(id), token, outcome });
		return outcome.p;
	}
}

interface IScenario {
	readonly mode: GetStartedChecklistMode;
	readonly createdSessions?: number;
	readonly aiEnabled?: boolean;
	readonly phoneLayout?: boolean;
	readonly slotVisible?: boolean;
	readonly tourPresenting?: boolean;
	readonly developerMode?: boolean;
	readonly signedOut?: boolean;
	readonly sessions?: readonly ISession[];
	/** Items an eligible user completed before this window started. */
	readonly completed?: readonly GetStartedItemId[];
}

suite('GetStartedChecklistService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(scenario: IScenario) {
		const storage = disposables.add(new InMemoryStorageService());
		storage.store(AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY, scenario.createdSessions ?? 0, StorageScope.APPLICATION, StorageTarget.MACHINE);
		if (scenario.completed) {
			storage.store(GET_STARTED_STATE_STORAGE_KEY, JSON.stringify({ eligible: true, completed: scenario.completed }), StorageScope.APPLICATION, StorageTarget.MACHINE);
		}
		const contextKeyService = new TestContextKeyService();
		contextKeyService.aiEnabled = scenario.aiEnabled ?? true;
		if (scenario.phoneLayout) {
			contextKeyService.createKey(IsPhoneLayoutContext.key, true);
		}
		const onboarding = new TestOnboardingScenarioService();
		onboarding.isPresenting.set(scenario.tourPresenting ?? false, undefined);
		const telemetry = new TestTelemetryService();
		const configuration = new TestConfigurationService({ [GET_STARTED_CHECKLIST_SETTING]: scenario.mode, [ONBOARDING_DEVELOPER_MODE_CONFIG]: { [GET_STARTED_DEVELOPER_MODE_ID]: scenario.developerMode === true } });
		const sessionsManagementService = new class extends mock<ISessionsManagementService>() {
			override onDidChangeSessions = Event.None;
			override getSessions() { return [...scenario.sessions ?? []]; }
		}();
		const sessionsService = new class extends mock<ISessionsService>() { override initialRestoreComplete = constObservable(true); }();
		const changesViewService = new class extends mock<IChangesViewService>() { override activeSessionChangesetOperationsObs = constObservable([]); }();
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IOnboardingScenarioService, onboarding);
		instantiationService.stub(ISessionsService, sessionsService);
		instantiationService.stub(ISessionsManagementService, sessionsManagementService);
		instantiationService.stub(IChangesViewService, changesViewService);
		// The tour runner only uses these once a tour starts, which these tests leave to the onboarding service.
		instantiationService.stub(IViewsService, {});
		instantiationService.stub(ISessionChangesService, {});
		instantiationService.stub(ICommandService, {});
		instantiationService.stub(IWorkbenchLayoutService, {});
		instantiationService.stub(IEditorService, {});
		instantiationService.stub(ICustomViewService, {});
		instantiationService.stub(ISessionsRecentWorkspacesService, {});
		instantiationService.stub(IUriIdentityService, {});
		const service = disposables.add(new GetStartedChecklistService(
			storage,
			configuration,
			contextKeyService,
			new class extends mock<IChatEntitlementService>() {
				override sentimentObs = constObservable<IChatSentiment>({});
				override entitlementObs = constObservable(scenario.signedOut ? ChatEntitlement.Unknown : ChatEntitlement.Free);
			}(),
			sessionsManagementService,
			sessionsService,
			changesViewService,
			new class extends mock<IAutomationService>() { override automations = constObservable([]); }(),
			onboarding,
			telemetry,
			instantiationService,
		));
		const owner = {};
		service.setSlotVisible(owner, scenario.slotVisible ?? true);
		disposables.add({ dispose: () => service.setSlotVisible(owner, false) });
		return { service, storage, telemetry, onboarding, configuration };
	}

	async function snapshot(scenario: IScenario) {
		const { service, storage, telemetry } = createService(scenario);
		await timeout(2_000);
		return { triggers: telemetry.triggers, eligible: readGetStartedState(storage).eligible, visible: service.visible.get(), mode: service.mode.get() };
	}

	function changeSetting(configuration: TestConfigurationService, value: GetStartedChecklistMode): Promise<void> {
		const done = configuration.setUserConfiguration(GET_STARTED_CHECKLIST_SETTING, value);
		configuration.onDidChangeConfigurationEmitter.fire({
			source: ConfigurationTarget.USER,
			affectedKeys: new Set([GET_STARTED_CHECKLIST_SETTING]),
			change: { keys: [GET_STARTED_CHECKLIST_SETTING], overrides: [] },
			affectsConfiguration: key => key === GET_STARTED_CHECKLIST_SETTING,
		});
		return done;
	}

	test('logs the trigger in every arm when an eligible user first sees the place of the checklist, and shows it in the place of the arm', () => runWithFakedTimers({}, async () => {
		const trigger = [`config.${GET_STARTED_CHECKLIST_SETTING}`];
		assert.deepStrictEqual({
			none: await snapshot({ mode: GetStartedChecklistMode.None }),
			aboveSessions: await snapshot({ mode: GetStartedChecklistMode.AboveSessions, createdSessions: 1 }),
			belowSessions: await snapshot({ mode: GetStartedChecklistMode.BelowSessions }),
		}, {
			none: { triggers: trigger, eligible: true, visible: false, mode: GetStartedChecklistMode.None },
			aboveSessions: { triggers: trigger, eligible: true, visible: true, mode: GetStartedChecklistMode.AboveSessions },
			belowSessions: { triggers: trigger, eligible: true, visible: true, mode: GetStartedChecklistMode.BelowSessions },
		});
	}));

	test('logs no trigger for existing users and previews, or before the user can see the place of the checklist', () => runWithFakedTimers({}, async () => {
		assert.deepStrictEqual({
			existingUser: await snapshot({ mode: GetStartedChecklistMode.AboveSessions, createdSessions: 2 }),
			developerPreview: await snapshot({ mode: GetStartedChecklistMode.AboveSessions, createdSessions: 9, developerMode: true }),
			aiDisabled: await snapshot({ mode: GetStartedChecklistMode.AboveSessions, aiEnabled: false }),
			phoneLayout: await snapshot({ mode: GetStartedChecklistMode.BelowSessions, phoneLayout: true }),
			signedOut: await snapshot({ mode: GetStartedChecklistMode.AboveSessions, signedOut: true }),
			slotHidden: await snapshot({ mode: GetStartedChecklistMode.None, slotVisible: false }),
		}, {
			existingUser: { triggers: [], eligible: false, visible: false, mode: GetStartedChecklistMode.AboveSessions },
			developerPreview: { triggers: [], eligible: undefined, visible: true, mode: GetStartedChecklistMode.AboveSessions },
			aiDisabled: { triggers: [], eligible: undefined, visible: false, mode: GetStartedChecklistMode.AboveSessions },
			phoneLayout: { triggers: [], eligible: undefined, visible: false, mode: GetStartedChecklistMode.BelowSessions },
			signedOut: { triggers: [], eligible: undefined, visible: false, mode: GetStartedChecklistMode.AboveSessions },
			slotHidden: { triggers: [], eligible: undefined, visible: false, mode: GetStartedChecklistMode.None },
		});
	}));

	test('waits until no onboarding tour has shown for a moment, and then stays during later tours', () => runWithFakedTimers({}, async () => {
		const { service, telemetry, onboarding } = createService({ mode: GetStartedChecklistMode.AboveSessions, tourPresenting: true });
		await timeout(2_000);
		const duringTour = { triggers: [...telemetry.triggers], visible: service.visible.get() };
		onboarding.isPresenting.set(false, undefined);
		await timeout(500);
		const rightAfterTour = { triggers: [...telemetry.triggers], visible: service.visible.get() };
		await timeout(1_500);
		const settled = { triggers: [...telemetry.triggers], visible: service.visible.get() };
		onboarding.isPresenting.set(true, undefined);
		assert.deepStrictEqual({ duringTour, rightAfterTour, settled, laterTour: service.visible.get() }, {
			duringTour: { triggers: [], visible: false },
			rightAfterTour: { triggers: [], visible: false },
			settled: { triggers: [`config.${GET_STARTED_CHECKLIST_SETTING}`], visible: true },
			laterTour: true,
		});
	}));

	test('a variant assigned while a tour shows waits for the tour to end, and moves with the setting', () => runWithFakedTimers({}, async () => {
		const { service, configuration, onboarding, telemetry } = createService({ mode: GetStartedChecklistMode.None });
		await timeout(2_000);
		const control = { triggers: [...telemetry.triggers], visible: service.visible.get() };
		onboarding.isPresenting.set(true, undefined);
		await changeSetting(configuration, GetStartedChecklistMode.AboveSessions);
		await timeout(2_000);
		const assignedDuringTour = service.visible.get();
		onboarding.isPresenting.set(false, undefined);
		await timeout(2_000);
		const afterTour = { mode: service.mode.get(), visible: service.visible.get() };
		await changeSetting(configuration, GetStartedChecklistMode.BelowSessions);
		assert.deepStrictEqual({ control, assignedDuringTour, afterTour, moved: { mode: service.mode.get(), visible: service.visible.get() }, triggers: telemetry.triggers.length }, {
			control: { triggers: [`config.${GET_STARTED_CHECKLIST_SETTING}`], visible: false },
			assignedDuringTour: false,
			afterTour: { mode: GetStartedChecklistMode.AboveSessions, visible: true },
			moved: { mode: GetStartedChecklistMode.BelowSessions, visible: true },
			triggers: 1,
		});
	}));

	test('counts projects like the sessions list groups them, so the worktrees of one repository are one project', () => runWithFakedTimers({}, async () => {
		const done = async (...sessions: ISession[]) => {
			const { service } = createService({ mode: GetStartedChecklistMode.AboveSessions, sessions });
			await timeout(2_000);
			return service.items.get().filter(item => item.done).map(item => item.id);
		};
		assert.deepStrictEqual({
			worktreesOfOneRepository: await done(createTestSession('Add tests', { workspaceLabel: 'todo-app' }).session, createTestSession('Fix lint', { workspaceLabel: 'todo-app' }).session),
			twoProjects: await done(createTestSession('Add tests', { workspaceLabel: 'todo-app' }).session, createTestSession('Add docs', { workspaceLabel: 'docs-site' }).session),
			unsentSessionInAnotherProject: await done(createTestSession('Add tests', { workspaceLabel: 'todo-app' }).session, createTestSession('New', { workspaceLabel: 'docs-site', status: SessionStatus.Untitled }).session),
		}, {
			worktreesOfOneRepository: [],
			twoProjects: [GetStartedItemId.SecondProject],
			unsentSessionInAnotherProject: [],
		});
	}));

	test('hide lasts until restart, dismiss persists, and the Show Getting Started Checklist command brings it back until everything is done', () => runWithFakedTimers({}, async () => {
		const { service, storage } = createService({ mode: GetStartedChecklistMode.AboveSessions });
		await timeout(2_000);
		const state = () => ({ visible: service.visible.get(), canShow: service.canShow.get() });
		service.hide();
		const hidden = state();
		service.show();
		const shown = state();
		service.dismiss();
		const dismissed = { ...state(), stored: readGetStartedState(storage).dismissed };
		service.show();
		const restored = state();
		const control = createService({ mode: GetStartedChecklistMode.None });
		const allDone = createService({ mode: GetStartedChecklistMode.AboveSessions, completed: GET_STARTED_ITEM_IDS });
		await timeout(2_000);
		assert.deepStrictEqual({ hidden, shown, dismissed, restored, control: control.service.canShow.get(), allDone: allDone.service.canShow.get() }, {
			hidden: { visible: false, canShow: true },
			shown: { visible: true, canShow: true },
			dismissed: { visible: false, canShow: true, stored: true },
			restored: { visible: true, canShow: true },
			control: false,
			allDone: false,
		});
	}));

	test('reports checklist interactions in the treatment, and completed items in every arm, for eligible users only', () => runWithFakedTimers({}, async () => {
		async function run(scenario: IScenario) {
			const { service, storage, telemetry, onboarding } = createService(scenario);
			await timeout(2_000);
			storage.store(AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY, (scenario.createdSessions ?? 0) + 1, StorageScope.APPLICATION, StorageTarget.MACHINE);
			if (service.visible.get()) {
				service.setCollapsed(true);
				service.setCollapsed(true);
				service.setCollapsed(false);
				const showMe = service.showMe(GetStartedItemId.RunInParallel);
				await timeout(0);
				onboarding.runs[0].outcome.complete(OnboardingOutcome.Completed);
				await showMe;
				service.hide();
				service.show();
				service.dismiss();
			}
			return telemetry.events;
		}
		const shared = { variant: GetStartedChecklistMode.BelowSessions, itemCount: 4 };
		assert.deepStrictEqual({
			control: await run({ mode: GetStartedChecklistMode.None }),
			treatment: await run({ mode: GetStartedChecklistMode.BelowSessions }),
			existingUser: await run({ mode: GetStartedChecklistMode.BelowSessions, createdSessions: 2 }),
			developerPreview: await run({ mode: GetStartedChecklistMode.BelowSessions, developerMode: true }),
		}, {
			control: [
				{ eventName: 'onboarding.getStartedChecklistItemCompleted', item: GetStartedItemId.StartSession, variant: GetStartedChecklistMode.None, completedCount: 1, itemCount: 4 },
			],
			treatment: [
				{ eventName: 'onboarding.getStartedChecklistAction', action: 'shown', item: 'none', completedCount: 0, ...shared },
				{ eventName: 'onboarding.getStartedChecklistItemCompleted', item: GetStartedItemId.StartSession, completedCount: 1, ...shared },
				{ eventName: 'onboarding.getStartedChecklistAction', action: 'collapse', item: 'none', completedCount: 1, ...shared },
				{ eventName: 'onboarding.getStartedChecklistAction', action: 'expand', item: 'none', completedCount: 1, ...shared },
				{ eventName: 'onboarding.getStartedChecklistAction', action: 'showMe', item: GetStartedItemId.RunInParallel, completedCount: 1, ...shared },
				{ eventName: 'onboarding.getStartedChecklistAction', action: 'hide', item: 'none', completedCount: 1, ...shared },
				{ eventName: 'onboarding.getStartedChecklistAction', action: 'restore', item: 'none', completedCount: 1, ...shared },
				{ eventName: 'onboarding.getStartedChecklistAction', action: 'dismiss', item: 'none', completedCount: 1, ...shared },
			],
			existingUser: [],
			developerPreview: [],
		});
	}));

	test('Show Me runs one tour at a time: asking again joins it, and another item ends it', () => runWithFakedTimers({}, async () => {
		const { service, onboarding, telemetry } = createService({ mode: GetStartedChecklistMode.AboveSessions });
		await timeout(2_000);
		const first = service.showMe(GetStartedItemId.Automation);
		const again = service.showMe(GetStartedItemId.Automation);
		await timeout(0);
		const firstRuns = onboarding.runs.map(run => ({ id: run.id, registered: run.registered, cancelled: run.token.isCancellationRequested }));
		const other = service.showMe(GetStartedItemId.KeepChanges);
		await timeout(0);
		const [automation, keepChanges] = onboarding.runs;
		const afterOther = { automationCancelled: automation.token.isCancellationRequested, automationRegistered: !!onboardingScenarioRegistry.getScenario(automation.id), keepChanges: { id: keepChanges.id, registered: keepChanges.registered } };
		automation.outcome.complete(OnboardingOutcome.Aborted);
		keepChanges.outcome.complete(OnboardingOutcome.Completed);
		await Promise.all([first, again, other]);
		assert.deepStrictEqual({
			firstRuns,
			afterOther,
			registeredAfterwards: !!onboardingScenarioRegistry.getScenario(keepChanges.id),
			reported: telemetry.events.filter(event => event.action === 'showMe').map(event => event.item),
		}, {
			firstRuns: [{ id: 'sessions.getStarted.showMe.automation', registered: true, cancelled: false }],
			afterOther: { automationCancelled: true, automationRegistered: false, keepChanges: { id: 'sessions.getStarted.showMe.keepChanges', registered: true } },
			registeredAfterwards: false,
			reported: [GetStartedItemId.Automation, GetStartedItemId.KeepChanges],
		});
	}));
});
