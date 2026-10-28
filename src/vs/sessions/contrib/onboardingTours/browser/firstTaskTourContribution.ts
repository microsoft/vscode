/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, IReader, observableSignalFromEvent, observableValue } from '../../../../base/common/observable.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { IGitService } from '../../../../workbench/contrib/git/common/gitService.js';
import { registerOnboardingTargetProvider } from '../../../../workbench/contrib/onboarding/browser/spotlight/onboardingTarget.js';
import { onboardingScenarioRegistry } from '../../../../workbench/contrib/onboarding/common/onboardingRegistry.js';
import { getOnboardingDeveloperModeVariation, IOnboardingScenarioService, isOnboardingDeveloperModeEnabled, ONBOARDING_DEVELOPER_MODE_CONFIG } from '../../../../workbench/contrib/onboarding/common/onboardingScenarioService.js';
import { IWorkbenchAssignmentService } from '../../../../workbench/services/assignment/common/assignmentService.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { SessionStatus, SessionTypeAuthRequirement } from '../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { INewSessionComposerService } from '../../chat/browser/newSessionComposerService.js';
import { IGitHubService } from '../../github/browser/githubService.js';
import { SessionsView, SessionsViewId } from '../../sessions/browser/views/sessionsView.js';
import { NewSessionViewTourTrigger } from './newSessionViewTourTrigger.js';
import { NewSessionViewV3PromptRunner } from './newSessionViewV3Prompt.js';
import { createFirstTaskParallelTour, createFirstTaskParallelUpgradeTour, createFirstTaskReviewTour, createFirstTaskTour, FIRST_TASK_PARALLEL_TOUR_ID, FIRST_TASK_PARALLEL_UPGRADE_TOUR_ID, FIRST_TASK_REVIEW_TOUR_ID, FIRST_TASK_SESSION_MODEL_PICKER_TARGET, FIRST_TASK_TOUR_ID, IFirstTaskReviewContext, resolveFirstTaskPlan } from './tours/firstTaskTour.js';

/** Remembers that the entry tour started, and which session became the user's first task. */
const FIRST_TASK_PROGRESS_STORAGE_KEY = 'sessions.onboarding.firstTask.progress';

interface IFirstTaskProgress {
	readonly startedAt: number;
	readonly sessionId?: string;
}

/** Lets a follow-up settle after navigation, such as the switch to a session after its first send. */
const FOLLOW_UP_SETTLE_DELAY_MS = 1_500;
/** Tolerates clock differences between the window and the provider that creates a session. */
const SESSION_CREATED_TOLERANCE_MS = 60_000;
const UPGRADE_PLAN_COMMAND_ID = 'workbench.action.chat.upgradePlan';
const OTHER_AGENT_SESSION_TYPE = /claude|codex/i;

class FirstTaskTourContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.onboardingTours.firstTaskTour';

	private readonly _progress = observableValue<IFirstTaskProgress | undefined>(this, undefined);
	/** Sessions that worked in this window, so developer mode does not follow sessions restored at startup. */
	private readonly _sessionsRunInWindow = observableValue<ReadonlySet<string>>(this, new Set());
	private readonly _configurationChanged: IObservable<void>;

	constructor(
		@IOnboardingScenarioService onboardingScenarioService: IOnboardingScenarioService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@IStorageService private readonly _storageService: IStorageService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatEntitlementService private readonly _chatEntitlementService: IChatEntitlementService,
		@INewSessionComposerService newSessionComposerService: INewSessionComposerService,
		@IWorkbenchAssignmentService assignmentService: IWorkbenchAssignmentService,
		@IGitService gitService: IGitService,
		@IFileService fileService: IFileService,
		@IGitHubService gitHubService: IGitHubService,
		@ITelemetryService telemetryService: ITelemetryService,
		@ILogService private readonly _logService: ILogService,
		@ICommandService private readonly _commandService: ICommandService,
		@IViewsService private readonly _viewsService: IViewsService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
	) {
		super();

		this._progress.set(this._readProgress(), undefined);
		this._register(this._storageService.onDidChangeValue(StorageScope.APPLICATION, FIRST_TASK_PROGRESS_STORAGE_KEY, this._store)(() => this._progress.set(this._readProgress(), undefined)));
		this._configurationChanged = observableSignalFromEvent(this, Event.filter(this._configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(ONBOARDING_DEVELOPER_MODE_CONFIG)));

		const trigger = this._register(new NewSessionViewTourTrigger(
			FIRST_TASK_TOUR_ID,
			onboardingScenarioService,
			this._sessionsService,
			this._storageService,
			this._configurationService,
			contextKeyService,
			this._chatEntitlementService,
		));
		const starterTasks = new NewSessionViewV3PromptRunner(
			assignmentService,
			this._configurationService,
			this._sessionsService,
			newSessionComposerService,
			gitService,
			fileService,
			gitHubService,
			telemetryService,
			this._logService,
			{},
			{ scenarioId: FIRST_TASK_TOUR_ID, variation: 'options' },
		);
		this._register(onboardingScenarioRegistry.register(createFirstTaskTour(trigger.signal, token => {
			this._storeProgress({ startedAt: Date.now() });
			return starterTasks.run(token);
		})));

		this._register(registerOnboardingTargetProvider(FIRST_TASK_SESSION_MODEL_PICKER_TARGET, scope => {
			const chat = scope === undefined ? this._sessionsService.activeSession.get()?.mainChat.get() : undefined;
			const element = chat && chatWidgetService.getWidgetBySessionResource(chat.resource)?.inputPart.getModelPickerControl()?.element;
			return element ? { element } : undefined;
		}));

		this._register(autorun(reader => this._recordFirstTaskSession(reader)));
		this._register(autorun(reader => {
			const session = this._sessionsService.activeSession.read(reader);
			const ran = this._sessionsRunInWindow.read(reader);
			if (session?.isCreated.read(reader) && session.status.read(reader) === SessionStatus.InProgress && !ran.has(session.sessionId)) {
				this._sessionsRunInWindow.set(new Set([...ran, session.sessionId]), undefined);
			}
		}));

		const showSessionsList = () => this._showSessionsList();
		const openPlans = () => this._openPlans();
		this._register(onboardingScenarioRegistry.register(createFirstTaskParallelTour(
			this._settled(derived(this, reader => this._getFirstTaskSession(FIRST_TASK_PARALLEL_TOUR_ID, reader)?.status.read(reader) === SessionStatus.InProgress)),
			showSessionsList,
		)));
		this._register(onboardingScenarioRegistry.register(createFirstTaskReviewTour(
			this._settled(derived(this, reader => this._getFirstTaskSession(FIRST_TASK_REVIEW_TOUR_ID, reader)?.status.read(reader) === SessionStatus.Completed)),
			async () => this._createReviewContext(showSessionsList, openPlans),
		)));
		const sessionsChanged = observableSignalFromEvent(this, this._sessionsManagementService.onDidChangeSessions);
		this._register(onboardingScenarioRegistry.register(createFirstTaskParallelUpgradeTour(
			this._settled(derived(this, reader => {
				if (!this._isDeveloperMode(FIRST_TASK_PARALLEL_UPGRADE_TOUR_ID, reader)
					&& (!this._progress.read(reader) || this._chatEntitlementService.entitlementObs.read(reader) !== ChatEntitlement.Free)) {
					return false;
				}
				sessionsChanged.read(reader);
				const running = this._sessionsManagementService.getSessions().filter(session =>
					!session.isArchived.read(reader) && !session.isAutomation?.read(reader) && session.status.read(reader) === SessionStatus.InProgress);
				return running.length >= 2;
			})),
			showSessionsList,
			openPlans,
		)));
	}

	private _isDeveloperMode(scenarioId: string, reader: IReader): boolean {
		this._configurationChanged.read(reader);
		return isOnboardingDeveloperModeEnabled(this._configurationService, scenarioId);
	}

	/** The active session when it is the user's first task, or a session that worked in this window in developer mode. */
	private _getFirstTaskSession(scenarioId: string, reader: IReader): IActiveSession | undefined {
		const session = this._sessionsService.activeSession.read(reader);
		if (!session?.isCreated.read(reader)) {
			return undefined;
		}
		if (this._isDeveloperMode(scenarioId, reader)) {
			return this._sessionsRunInWindow.read(reader).has(session.sessionId) ? session : undefined;
		}
		return this._progress.read(reader)?.sessionId === session.sessionId ? session : undefined;
	}

	/** Remembers the first session created after the entry tour started as the user's first task. */
	private _recordFirstTaskSession(reader: IReader): void {
		const progress = this._progress.read(reader);
		const session = this._sessionsService.activeSession.read(reader);
		if (!progress || progress.sessionId || !session?.isCreated.read(reader) || session.createdAt.getTime() < progress.startedAt - SESSION_CREATED_TOLERANCE_MS) {
			return;
		}
		this._storeProgress({ ...progress, sessionId: session.sessionId });
	}

	/** Holds a follow-up trigger back until its condition has held for a moment. */
	private _settled(condition: IObservable<boolean>): IObservable<boolean> {
		const settled = observableValue(this, false);
		this._register(autorun(reader => {
			if (condition.read(reader)) {
				reader.store.add(disposableTimeout(() => settled.set(true, undefined), FOLLOW_UP_SETTLE_DELAY_MS));
			} else {
				settled.set(false, undefined);
			}
		}));
		return settled;
	}

	private _createReviewContext(showSessionsList: () => Promise<void>, openPlans: () => Promise<void>): IFirstTaskReviewContext {
		const plan = resolveFirstTaskPlan(this._chatEntitlementService.entitlement, getOnboardingDeveloperModeVariation(this._configurationService, FIRST_TASK_REVIEW_TOUR_ID));
		const session = this._sessionsService.activeSession.get();
		const folder = session?.workspace.get()?.folders[0]?.root;
		const canTryOtherAgents = !!folder && this._sessionsManagementService.getSessionTypesForFolder(folder).some(({ sessionType }) =>
			sessionType.id !== session?.sessionType
			&& OTHER_AGENT_SESSION_TYPE.test(sessionType.id)
			&& sessionType.authRequirement !== SessionTypeAuthRequirement.Unusable);
		return { plan, canTryOtherAgents, showSessionsList, openPlans };
	}

	private async _showSessionsList(): Promise<void> {
		const view = await this._viewsService.openView<SessionsView>(SessionsViewId);
		view?.setExpanded(true);
	}

	private async _openPlans(): Promise<void> {
		await this._commandService.executeCommand(UPGRADE_PLAN_COMMAND_ID);
	}

	private _readProgress(): IFirstTaskProgress | undefined {
		const raw = this._storageService.get(FIRST_TASK_PROGRESS_STORAGE_KEY, StorageScope.APPLICATION);
		if (!raw) {
			return undefined;
		}
		try {
			const value = JSON.parse(raw);
			return typeof value?.startedAt === 'number' ? { startedAt: value.startedAt, sessionId: typeof value.sessionId === 'string' ? value.sessionId : undefined } : undefined;
		} catch {
			this._logService.warn('[FirstTaskTour] Ignoring unreadable progress.');
			return undefined;
		}
	}

	private _storeProgress(progress: IFirstTaskProgress): void {
		this._storageService.store(FIRST_TASK_PROGRESS_STORAGE_KEY, JSON.stringify(progress), StorageScope.APPLICATION, StorageTarget.MACHINE);
		this._progress.set(progress, undefined);
	}
}

registerWorkbenchContribution2(FirstTaskTourContribution.ID, FirstTaskTourContribution, WorkbenchPhase.AfterRestored);
