/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatPlanAwareness.css';
import * as dom from '../../../../../base/browser/dom.js';
import { HoverPosition } from '../../../../../base/browser/ui/hover/hoverWidget.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, observableSignal } from '../../../../../base/common/observable.js';
import { language } from '../../../../../base/common/platform.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IWorkbenchAssignmentService } from '../../../../services/assignment/common/assignmentService.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { CHAT_WELCOME_ACTIVE_REQUESTS, CHAT_WELCOME_SETTING_ID, ChatWelcomeTreatment, getPlanFacts, getPlanListParts, IPlanFact, IPlanSummary, PlanNudgeId, PlanNudgeSurface, shouldShowPlanInChatWelcome } from '../../common/planAwareness/chatPlanAwareness.js';
import { AgentSessionProviders, AgentSessionTarget } from '../agentSessions/agentSessions.js';
import { IChatWidget } from '../chat.js';
import { SHOW_CHAT_STATUS_DASHBOARD_COMMAND_ID } from '../chatStatus/chatStatus.js';
import { ChatStatusDashboard } from '../chatStatus/chatStatusDashboard.js';
import { chatWelcomeContentRegistry, IChatWelcomeContentContext, IChatWelcomeContentContribution } from '../viewsWelcome/chatWelcomeContent.js';
import { IChatPlanAwarenessService, PlanNudgeAction } from './chatPlanAwarenessService.js';

const $ = dom.$;

/** The session types of the harnesses that the plan lists by name. */
const HARNESS_SESSION_TYPES: { readonly [name: string]: AgentSessionTarget } = {
	Copilot: AgentSessionProviders.AgentHostCopilot,
	Claude: AgentSessionProviders.AgentHostClaude,
	Codex: AgentSessionProviders.AgentHostCodex,
};

let welcomeCount = 0;

/**
 * Tells Business and Enterprise users who hardly used Copilot for a while what
 * their plan includes, in the center of the empty Chat view, as part of the view
 * rather than a notice. Also shows to any paid user who opened Chat from a
 * suggestion, so they find out more where they landed. The models and harnesses
 * it names open their picker, and the credits open the Copilot dashboard.
 */
export class ChatPlanWelcome extends Disposable implements IWorkbenchContribution, IChatWelcomeContentContribution {

	static readonly ID = 'workbench.contrib.chatPlanWelcome';

	private inactiveDays: unknown;
	private treatmentRequest = 0;
	private readonly treatmentChanged = observableSignal(this);
	private shownRecorded = false;
	private readonly dashboard = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		@IChatPlanAwarenessService private readonly planAwarenessService: IChatPlanAwarenessService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkbenchAssignmentService private readonly assignmentService: IWorkbenchAssignmentService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IHoverService private readonly hoverService: IHoverService,
		@ICommandService private readonly commandService: ICommandService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this.updateTreatment();
		this._register(assignmentService.onDidRefetchAssignments(() => this.updateTreatment()));
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('experiments.override')) {
				this.updateTreatment();
			}
		}));
		this._register(chatWelcomeContentRegistry.register(this));
	}

	private async updateTreatment(): Promise<void> {
		const request = ++this.treatmentRequest;
		const inactiveDays = await this.assignmentService.getTreatment<number>(ChatWelcomeTreatment.InactiveDays);
		if (request === this.treatmentRequest && !this._store.isDisposed) {
			this.inactiveDays = inactiveDays;
			this.treatmentChanged.trigger(undefined);
		}
	}

	render(container: HTMLElement, context: IChatWelcomeContentContext): IDisposable {
		const store = new DisposableStore();
		if (context.widget.location !== ChatAgentLocation.Chat) {
			return store;
		}

		const enabled = observableConfigValue<boolean>(CHAT_WELCOME_SETTING_ID, false, this.configurationService);
		const plan = derived(reader => {
			// Decided while the empty Chat shows, which is when the experiment arms start to differ
			if (!context.visible.read(reader)) {
				return undefined;
			}
			const plan = this.planAwarenessService.plan.read(reader);
			if (!plan) {
				return undefined;
			}
			this.treatmentChanged.read(reader);
			// Developer mode and suggestions show it in every experiment arm, so they do not log the experiment triggers.
			// Developer mode still hides it once the user sent enough requests in the window, like it would for them.
			const show = this.planAwarenessService.openedFromSuggestion.read(reader)
				|| (this.planAwarenessService.developerMode.read(reader).has(PlanNudgeId.ChatWelcome)
					? this.planAwarenessService.windowChatRequests.read(reader) < CHAT_WELCOME_ACTIVE_REQUESTS
					: shouldShowPlanInChatWelcome({
						enabled: enabled.read(reader),
						paidByOrganization: plan.paidByOrganization,
						recentChatRequests: this.planAwarenessService.recentChatRequests.read(reader),
						inactiveDays: this.inactiveDays,
						now: Date.now(),
					}, this.telemetryService));
			return show ? plan : undefined;
		});

		store.add(autorun(reader => {
			dom.clearNode(container);
			const summary = plan.read(reader);
			if (summary) {
				this.renderPlan(container, summary, context.widget, reader.store);
			}
		}));
		store.add(toDisposable(() => dom.clearNode(container)));
		return store;
	}

	private renderPlan(container: HTMLElement, summary: IPlanSummary, widget: IChatWidget, store: DisposableStore): void {
		const titleId = `chat-plan-welcome-title-${++welcomeCount}`;
		const element = dom.append(container, $('.chat-plan-welcome', { role: 'region', 'aria-labelledby': titleId }));
		dom.append(element, $('.chat-plan-welcome-icon', { 'aria-hidden': 'true' })).classList.add(...ThemeIcon.asClassNameArray(Codicon.copilot));
		dom.append(element, $('.chat-plan-welcome-title', { id: titleId }, localize('planAwareness.welcome.title', "Included in your {0} plan", summary.planName)));

		const list = dom.append(element, $('ul.chat-plan-welcome-facts'));
		for (const fact of getPlanFacts(summary, language)) {
			const item = dom.append(list, $('li'));
			// One line of text tall, so the check mark centers on the first line of a fact that wraps
			dom.append(dom.append(item, $('span.chat-plan-welcome-check', { 'aria-hidden': 'true' })), $('span')).classList.add(...ThemeIcon.asClassNameArray(Codicon.check));
			this.appendFact(dom.append(item, $('span')), fact, widget, store);
		}

		if (!this.shownRecorded) {
			this.shownRecorded = true;
			this.planAwarenessService.recordAction(PlanNudgeId.ChatWelcome, PlanNudgeSurface.ChatWelcome, PlanNudgeAction.Shown);
		}
	}

	private appendFact(container: HTMLElement, fact: IPlanFact, widget: IChatWidget, store: DisposableStore): void {
		dom.append(container, document.createTextNode(fact.before));
		const emphasis = dom.append(container, $('strong'));
		const choices = fact.choices;
		if (!choices) {
			if (fact.emphasis) {
				// The fact about credits and usage, which the Copilot dashboard tells more about
				const button = dom.append(emphasis, $('button.chat-plan-welcome-choice', {
					type: 'button',
					'aria-label': localize('planAwareness.welcome.usage', "{0}. Show Copilot Usage", fact.emphasis),
				}, fact.emphasis));
				store.add(dom.addDisposableListener(button, dom.EventType.CLICK, () => this.showCopilotDashboard(button)));
			}
		} else {
			// Each name opens its picker, and the separators between them stay text
			for (const part of getPlanListParts(choices.names, language, choices.listType)) {
				if (!part.isItem) {
					dom.append(emphasis, document.createTextNode(part.value));
					continue;
				}
				const name = part.value;
				const button = dom.append(emphasis, $('button.chat-plan-welcome-choice', {
					type: 'button',
					'aria-label': choices.kind === 'model'
						? localize('planAwareness.welcome.model', "Use {0}", name)
						: localize('planAwareness.welcome.harness', "Use the {0} harness", name),
				}, name));
				store.add(dom.addDisposableListener(button, dom.EventType.CLICK, () => choices.kind === 'model' ? this.useModel(widget, name) : this.useHarness(widget, name)));
			}
		}
		dom.append(container, document.createTextNode(fact.after));
	}

	/**
	 * Shows the Copilot dashboard of the status bar, which tells how much of the
	 * plan the user used. Next to the clicked text when the status bar does not
	 * show the Copilot entry.
	 */
	private async showCopilotDashboard(target: HTMLElement): Promise<void> {
		this.planAwarenessService.recordAction(PlanNudgeId.ChatWelcome, PlanNudgeSurface.ChatWelcome, PlanNudgeAction.Usage);
		if (await this.commandService.executeCommand<boolean>(SHOW_CHAT_STATUS_DASHBOARD_COMMAND_ID)) {
			return;
		}
		const store = this.dashboard.value = new DisposableStore();
		const content = ChatStatusDashboard.instantiateInContents(this.instantiationService, store, undefined);
		this.hoverService.showInstantHover({
			content,
			target,
			persistence: { sticky: true },
			appearance: { showPointer: true, maxHeightRatio: 0.9 },
			position: { hoverPosition: HoverPosition.BELOW },
		}, true);
		// The dashboard lives as long as its hover
		store.add(dom.disposableWindowInterval(dom.getWindow(target), () => {
			if (!content.isConnected) {
				store.dispose();
			}
		}, 2000));
	}

	/**
	 * Selects the model and opens the model picker on it, so the user sees where
	 * models are picked.
	 */
	private useModel(widget: IChatWidget, name: string): void {
		this.planAwarenessService.recordAction(PlanNudgeId.ChatWelcome, PlanNudgeSurface.ChatWelcome, PlanNudgeAction.Primary);
		const control = widget.input.getModelPickerControl();
		if (!control) {
			widget.input.openModelPicker();
			return;
		}
		// A model family, such as Claude, names no model to select, so the picker opens on the current one
		const model = widget.input.availableLanguageModels.find(model => model.metadata.name === name && model.metadata.isUserSelectable !== false);
		if (model) {
			control.select(model.identifier);
		}
		control.open({ initialFocusItemId: model?.identifier });
	}

	/**
	 * Switches to the harness and opens the harness picker, so the user sees where
	 * harnesses are picked.
	 */
	private useHarness(widget: IChatWidget, name: string): void {
		this.planAwarenessService.recordAction(PlanNudgeId.ChatWelcome, PlanNudgeSurface.ChatWelcome, PlanNudgeAction.Secondary);
		const type = HARNESS_SESSION_TYPES[name];
		if (type) {
			widget.input.selectSessionTarget(type, { openPicker: true });
		} else {
			widget.input.openSessionTargetPicker();
		}
	}
}
