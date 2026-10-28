/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableFromEvent, observableSignalFromEvent, observableValue } from '../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { logSettingExperimentTrigger } from '../../../../platform/telemetry/common/experimentTrigger.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { AgentsWindowUsage } from '../../../../workbench/contrib/chat/common/agentsWindowUsage.js';
import { IAutomationService } from '../../../../workbench/contrib/chat/common/automations/automationService.js';
import { ChatAutomationsEnabledContext } from '../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { IOnboardingScenarioService, isOnboardingDeveloperModeEnabled, ONBOARDING_DEVELOPER_MODE_CONFIG } from '../../../../workbench/contrib/onboarding/common/onboardingScenarioService.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IsPhoneLayoutContext, SessionsWelcomeVisibleContext } from '../../../common/contextkeys.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { SessionChangesetOperationStatus, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { IChangesViewService } from '../../changes/common/changesViewService.js';
import { GET_STARTED_CHECKLIST_SETTING, GET_STARTED_DEVELOPER_MODE_ID, GetStartedChecklistMode, GetStartedChecklistModel, GetStartedItemId, IGetStartedItemState, IGetStartedSignals, toGetStartedChecklistMode } from '../common/getStartedChecklist.js';
import { GetStartedTourRunner } from './getStartedTourRunner.js';

export const IGetStartedChecklistService = createDecorator<IGetStartedChecklistService>('getStartedChecklistService');

export interface IGetStartedChecklistService {
	readonly _serviceBrand: undefined;

	/** Where the checklist shows, from the experiment-controlled setting. */
	readonly mode: IObservable<GetStartedChecklistMode>;
	readonly items: IObservable<readonly IGetStartedItemState[]>;
	readonly collapsed: IObservable<boolean>;
	/** Whether the card should render in the place that {@link mode} selects. */
	readonly visible: IObservable<boolean>;
	/** Briefly `true` after the last item completes, before the card goes away. */
	readonly finished: IObservable<boolean>;
	/** Whether the "Show Getting Started Checklist" command can bring the card back. */
	readonly canShow: IObservable<boolean>;

	/** Reports whether the sessions view, where the checklist appears, is on screen. */
	setSlotVisible(owner: object, visible: boolean): void;
	setCollapsed(collapsed: boolean): void;
	/** Hides the card in this window until the next start. */
	hide(): void;
	/** Hides the card for good ("Don't Show Again"). */
	dismiss(): void;
	/** Brings back a hidden or dismissed card. */
	show(): void;
	/** Runs the item's Show Me tour, and resolves when it ends. */
	showMe(item: GetStartedItemId): Promise<void>;
}

/** Changeset operations that do not keep a session's changes. */
const NON_KEEPING_OPERATION_IDS: ReadonlySet<string> = new Set(['sync', 'discard-changes']);

/** How long the checklist waits for an onboarding tour to claim the first turn. */
const SETTLE_DELAY_MS = 1_500;
/** How long the finished state stays on screen. */
const FINISHED_DURATION_MS = 6_000;

type GetStartedChecklistAction = 'shown' | 'showMe' | 'collapse' | 'expand' | 'hide' | 'dismiss' | 'restore';

type GetStartedChecklistActionEvent = {
	action: GetStartedChecklistAction;
	item: string;
	variant: string;
	completedCount: number;
	itemCount: number;
};

type GetStartedChecklistActionClassification = {
	owner: 'benibenj';
	comment: 'Reports how new users interact with the Get Started checklist of the Agents window, to evaluate the checklist experiment.';
	action: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The interaction: the checklist was shown in a window, or the user ran Show Me, collapsed, expanded, hid, dismissed or restored it.' };
	item: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The checklist item whose Show Me tour ran, or none for other interactions.' };
	variant: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Where the checklist shows: aboveSessions or belowSessions.' };
	completedCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'How many checklist items were done at the time of the interaction.' };
	itemCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'How many items the checklist offers.' };
};

type GetStartedChecklistItemCompletedEvent = {
	item: string;
	variant: string;
	completedCount: number;
	itemCount: number;
};

type GetStartedChecklistItemCompletedClassification = {
	owner: 'benibenj';
	comment: 'Reports when a new user of the Agents window does one of the things the Get Started checklist teaches. Logged in every experiment arm, so the arms can be compared.';
	item: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The checklist item that was done, for example runInParallel or automation.' };
	variant: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The experiment arm: none, aboveSessions or belowSessions.' };
	completedCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'How many checklist items are done, including this one.' };
	itemCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'How many items the checklist offers.' };
};

export class GetStartedChecklistService extends Disposable implements IGetStartedChecklistService {

	declare readonly _serviceBrand: undefined;

	private readonly _model: GetStartedChecklistModel;
	private readonly _usage: AgentsWindowUsage;

	readonly mode: IObservable<GetStartedChecklistMode>;
	readonly items: IObservable<readonly IGetStartedItemState[]>;
	readonly collapsed: IObservable<boolean>;
	readonly visible: IObservable<boolean>;
	readonly canShow: IObservable<boolean>;

	private readonly _finished = observableValue(this, false);
	readonly finished: IObservable<boolean> = this._finished;

	private readonly _slotOwners = new Set<object>();
	private readonly _slotVisible = observableValue(this, false);
	/** Latched once the checklist was first shown in this window, so a later tour never moves it away. */
	private readonly _revealed = observableValue(this, false);
	private readonly _hidden = observableValue(this, false);
	private readonly _finishedTimer = this._register(new MutableDisposable());
	private readonly _developerMode: IObservable<boolean>;
	private _tourRunner: GetStartedTourRunner | undefined;
	/** The item whose Show Me tour runs, so a repeated request that joins it is not reported again. */
	private _showMeItem: GetStartedItemId | undefined;

	constructor(
		@IStorageService storageService: IStorageService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@ISessionsService sessionsService: ISessionsService,
		@IChangesViewService changesViewService: IChangesViewService,
		@IAutomationService automationService: IAutomationService,
		@IOnboardingScenarioService onboardingService: IOnboardingScenarioService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
		this._usage = new AgentsWindowUsage(storageService);

		this.mode = observableFromEvent(this, Event.filter(configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(GET_STARTED_CHECKLIST_SETTING)), () => toGetStartedChecklistMode(configurationService.getValue(GET_STARTED_CHECKLIST_SETTING)));

		const contextChanged = observableSignalFromEvent(this, contextKeyService.onDidChangeContext);
		// The checklist needs AI features, and the desktop layout whose controls its tours show.
		const available = derived(this, reader => {
			contextChanged.read(reader);
			return contextKeyService.contextMatchesRules(ChatContextKeys.enabled)
				&& contextKeyService.getContextKeyValue<boolean>(IsPhoneLayoutContext.key) !== true
				&& !chatEntitlementService.sentimentObs.read(reader).hidden;
		});
		const automationsAvailable = derived(this, reader => {
			contextChanged.read(reader);
			return contextKeyService.getContextKeyValue<boolean>(ChatAutomationsEnabledContext.key) === true;
		});

		const usageListeners = this._register(new DisposableStore());
		const createdSessionCount = observableFromEvent(this, this._usage.onDidChangeCreatedSessionCount(usageListeners), () => this._usage.createdSessionCount);
		const sessions = observableFromEvent(this, sessionsManagementService.onDidChangeSessions, () => sessionsManagementService.getSessions());
		const signals = derived<IGetStartedSignals>(this, reader => {
			let runningSessionCount = 0;
			// Projects by label, like the sessions list groups them: the sessions of one
			// repository share its label, even when each works in its own worktree.
			const projects = new Set<string>();
			for (const session of sessions.read(reader)) {
				if (session.isAutomation?.read(reader)) {
					continue;
				}
				const status = session.status.read(reader);
				if (!session.isArchived.read(reader) && (status === SessionStatus.InProgress || status === SessionStatus.NeedsInput)) {
					runningSessionCount++;
				}
				const project = session.workspace.read(reader)?.label;
				if (project && status !== SessionStatus.Untitled && !session.isQuickChat?.read(reader)) {
					projects.add(project);
				}
			}
			const keepingChanges = changesViewService.activeSessionChangesetOperationsObs.read(reader)
				.some(operation => operation.status === SessionChangesetOperationStatus.Running && !NON_KEEPING_OPERATION_IDS.has(operation.id));
			return {
				createdSessionCount: createdSessionCount.read(reader),
				runningSessionCount,
				projectCount: projects.size,
				keepingChanges,
				automationCount: automationService.automations.read(reader).length,
			};
		});

		// Developer mode previews the checklist for any user, and never logs experiment telemetry.
		const developerMode = this._developerMode = observableFromEvent(this, Event.filter(configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(ONBOARDING_DEVELOPER_MODE_CONFIG)), () => isOnboardingDeveloperModeEnabled(configurationService, GET_STARTED_DEVELOPER_MODE_ID));

		this._model = this._register(new GetStartedChecklistModel(signals, automationsAvailable, storageService, developerMode));
		this.items = this._model.items;
		this.collapsed = derived(this, reader => this._model.state.read(reader).collapsed ?? false);

		// Ready once restore and sign-in are done and the sessions view is on screen with
		// the checklist available, and no onboarding tour has been queued or shown for a moment.
		// The pause gives the new-session tour the first turn, so the two never show together.
		const readyConditions = derived(this, reader => {
			contextChanged.read(reader);
			return sessionsService.initialRestoreComplete.read(reader)
				&& chatEntitlementService.entitlementObs.read(reader) !== ChatEntitlement.Unknown
				&& contextKeyService.getContextKeyValue<boolean>(SessionsWelcomeVisibleContext.key) !== true
				&& this._slotVisible.read(reader)
				&& available.read(reader)
				&& !onboardingService.isPresenting.read(reader);
		});
		const ready = observableValue(this, false);
		this._register(autorun(reader => {
			if (readyConditions.read(reader)) {
				reader.store.add(disposableTimeout(() => ready.set(true, undefined), SETTLE_DELAY_MS));
			} else {
				ready.set(false, undefined);
			}
		}));

		// Decides eligibility and logs the experiment trigger in every arm, when an eligible
		// user first sees the place where the checklist appears. Developer-mode previews don't log it.
		this._register(autorun(reader => {
			if (ready.read(reader) && !developerMode.read(reader) && this._model.decideEligibility(this._usage.createdSessionCount)) {
				logSettingExperimentTrigger(this._telemetryService, GET_STARTED_CHECKLIST_SETTING);
			}
		}));

		// Every arm reports what eligible users do, so the arms can be compared.
		this._register(this._model.onDidCompleteItems(completed => {
			if (this._model.state.get().eligible === true && !developerMode.get()) {
				const items = this.items.get();
				for (const item of completed) {
					this._telemetryService.publicLog2<GetStartedChecklistItemCompletedEvent, GetStartedChecklistItemCompletedClassification>('onboarding.getStartedChecklistItemCompleted', {
						item,
						variant: this.mode.get(),
						completedCount: items.filter(candidate => candidate.done).length,
						itemCount: items.length,
					});
				}
			}
		}));

		const eligibleAndEnabled = derived(this, reader => this.mode.read(reader) !== GetStartedChecklistMode.None
			&& (this._model.state.read(reader).eligible === true || developerMode.read(reader))
			&& available.read(reader));

		// The treatment shows the checklist only while ready, which also covers a variant that
		// is assigned later. Once shown, it stays, so a later tour (like Show Me) never moves it.
		this._register(autorun(reader => {
			if (ready.read(reader) && eligibleAndEnabled.read(reader)) {
				this._revealed.set(true, undefined);
			}
		}));

		// Keep the finished state on screen for a moment, only when the last item completes in this window.
		let wasAllDone = this._model.allDone.get();
		this._register(autorun(reader => {
			const allDone = this._model.allDone.read(reader);
			if (allDone && !wasAllDone && this._revealed.read(reader)) {
				this._finished.set(true, undefined);
				this._finishedTimer.value = disposableTimeout(() => this._finished.set(false, undefined), FINISHED_DURATION_MS);
			}
			wasAllDone = allDone;
		}));

		this.visible = derived(this, reader => eligibleAndEnabled.read(reader)
			&& this._revealed.read(reader)
			&& !this._model.state.read(reader).dismissed
			&& !this._hidden.read(reader)
			&& (!this._model.allDone.read(reader) || this._finished.read(reader)));
		this.canShow = derived(this, reader => eligibleAndEnabled.read(reader) && !this._model.allDone.read(reader));

		let reportedShown = false;
		this._register(autorun(reader => {
			if (!reportedShown && this.visible.read(reader)) {
				reportedShown = true;
				this._logAction('shown');
			}
		}));
	}

	setSlotVisible(owner: object, visible: boolean): void {
		if (visible) {
			this._slotOwners.add(owner);
		} else {
			this._slotOwners.delete(owner);
		}
		this._slotVisible.set(this._slotOwners.size > 0, undefined);
	}

	setCollapsed(collapsed: boolean): void {
		if (collapsed !== this.collapsed.get()) {
			this._model.setCollapsed(collapsed);
			this._logAction(collapsed ? 'collapse' : 'expand');
		}
	}

	hide(): void {
		this._hidden.set(true, undefined);
		this._logAction('hide');
	}

	dismiss(): void {
		this._model.dismiss();
		this._logAction('dismiss');
	}

	show(): void {
		this._hidden.set(false, undefined);
		this._revealed.set(true, undefined);
		this._model.restore();
		this._logAction('restore');
	}

	async showMe(item: GetStartedItemId): Promise<void> {
		if (this._showMeItem !== item) {
			this._showMeItem = item;
			this._logAction('showMe', item);
		}
		this._tourRunner ??= this._register(this._instantiationService.createInstance(GetStartedTourRunner));
		try {
			await this._tourRunner.run(item);
		} finally {
			if (this._showMeItem === item) {
				this._showMeItem = undefined;
			}
		}
	}

	private _logAction(action: GetStartedChecklistAction, item: GetStartedItemId | 'none' = 'none'): void {
		if (this._developerMode.get()) {
			return;
		}
		const items = this.items.get();
		this._telemetryService.publicLog2<GetStartedChecklistActionEvent, GetStartedChecklistActionClassification>('onboarding.getStartedChecklistAction', {
			action,
			item,
			variant: this.mode.get(),
			completedCount: items.filter(candidate => candidate.done).length,
			itemCount: items.length,
		});
	}
}
