/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { disposableTimeout, raceTimeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { autorun, derived, IObservable, IReader, ISettableObservable, ITransaction, observableSignalFromEvent, observableValue, transaction } from '../../../../../base/common/observable.js';
import { language } from '../../../../../base/common/platform.js';
import { localize } from '../../../../../nls.js';
import { IAgentHostEnablementService } from '../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { CLAUDE_AGENT_PROVIDER_ID, CODEX_AGENT_PROVIDER_ID } from '../../../../../platform/agentHost/common/agent.js';
import { affectsAgentHostProviderPreference, shouldSurfaceLocalAgentHostProvider } from '../../../../../platform/agentHost/common/agentService.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { observableConfigValue, observableContextKey } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { ViewContainerLocation, IViewDescriptorService } from '../../../../common/views.js';
import { ChatEntitlement, getChatPlanName, IChatEntitlementService, isProUser } from '../../../../services/chat/common/chatEntitlementService.js';
import { IWorkbenchLayoutService, Parts } from '../../../../services/layout/browser/layoutService.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatDetail, IChatService } from '../../common/chatService/chatService.js';
import { IChatViewSessionsListService } from '../../common/chatViewSessionsListService.js';
import { ChatModeKind } from '../../common/constants.js';
import { COPILOT_VENDOR_ID, ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../common/languageModels.js';
import { addRecentChatRequests, canShowPlanNudge, DEFAULT_PLAN_NUDGE_LIMITS, findModelOfFamily, getFlagshipModels, getModelFamilies, getPlanCredits, getPlanFacts, getSeenPlanNudges, IPlanFact, IPlanNudgeState, IPlanSummary, isPlanNudgeBudgetUsed, parsePlanNudgeDeveloperMode, parsePlanNudgeState, parseRecentChatRequests, PLAN_SUGGESTIONS_SETTING_ID, PlanNudgeId, PlanNudgeSurface, recordPlanNudgeDismissed, recordPlanNudgeShown, shouldShowPlanSuggestions } from '../../common/planAwareness/chatPlanAwareness.js';
import { ACTION_ID_NEW_CHAT, CHAT_OPEN_ACTION_ID, IChatViewOpenOptions } from '../actions/chatActions.js';
import { AgentSessionProviders } from '../agentSessions/agentSessions.js';
import { IAgentSessionsService } from '../agentSessions/agentSessionsService.js';
import { ChatViewId, IChatWidget, IChatWidgetService } from '../chat.js';
import { requiresNewerVSCode } from '../widget/input/modelPicker/modelPickerItemPrimitives.js';

export const ChatPlanAwarenessDeveloperModeSettingId = 'chat.planAwareness.developerMode';

export const CLOSE_PLAN_MOMENT_COMMAND_ID = '_chat.planAwareness.closeMoment';
export const FOCUS_PLAN_MOMENT_COMMAND_ID = 'workbench.action.chat.planAwareness.focusMoment';


export namespace ChatPlanAwarenessContextKeys {
	export const targeted = new RawContextKey<boolean>('chatPlanAwarenessTargeted', false, { type: 'boolean', description: localize('chatPlanAwarenessTargeted', "True when Copilot plan suggestions may show to the user.") });
	export const momentVisible = new RawContextKey<boolean>('chatPlanMomentVisible', false, { type: 'boolean', description: localize('chatPlanMomentVisible', "True when a Copilot plan suggestion card is shown.") });
	export const momentFocused = new RawContextKey<boolean>('chatPlanMomentFocused', false, { type: 'boolean', description: localize('chatPlanMomentFocused', "True when the Copilot plan suggestion card has focus.") });
}

export const enum PlanNudgeAction {
	Shown = 'shown',
	Primary = 'primary',
	Secondary = 'secondary',
	/** The user opened their Copilot usage from the suggestion. */
	Usage = 'usage',
	Close = 'close',
	Dismiss = 'dismiss',
}

/**
 * What to prepare in the Chat view.
 */
export interface IPlanChatRequest {
	readonly mode?: ChatModeKind;
	readonly query?: string;
	/** Only prefills the prompt, so the user sends it. Defaults to `true`. */
	readonly isPartialQuery?: boolean;
	/**
	 * Selects the most capable Copilot model of this well-known family, for example
	 * `Claude`, among the models that the new chat offers.
	 */
	readonly modelFamily?: string;
	readonly attachFiles?: IChatViewOpenOptions['attachFiles'];
}

export interface IPlanMomentAction {
	/** A short label, so that the action fits on one line. */
	readonly label: string;
	readonly tooltip?: string;
	readonly run: () => Promise<unknown>;
}

/**
 * A moment where Copilot can take over what the user is doing. It is offered
 * by a card in the corner of the window until the user acts on it.
 */
export interface IPlanMoment {
	readonly id: PlanNudgeId;
	/** What happened, leading the card and announcements. */
	readonly title: string;
	readonly message: string;
	/** Lists what the plan includes below the message. */
	readonly showPlan?: boolean;
	/** The user is blocked, so the moment is offered even if another one was offered recently, but still at most once a week. */
	readonly urgent?: boolean;
	/** The one action of the card, so that the next step is clear. */
	readonly primary: IPlanMomentAction;
}

export const IChatPlanAwarenessService = createDecorator<IChatPlanAwarenessService>('chatPlanAwarenessService');

/**
 * Makes paid Copilot users who hardly use Copilot Chat aware of what their
 * plan includes, at moments that fit how they work, and leads them into Chat.
 */
export interface IChatPlanAwarenessService {
	readonly _serviceBrand: undefined;

	/**
	 * The paid plan of a user with Copilot enabled, or `undefined`.
	 */
	readonly plan: IObservable<IPlanSummary | undefined>;

	/**
	 * The plan of a user that plan suggestions apply to: suggestions are enabled
	 * and the user is known to have not used Copilot recently. Otherwise `undefined`.
	 */
	readonly summary: IObservable<IPlanSummary | undefined>;

	/**
	 * The times of the user's most recent Copilot requests on this machine,
	 * newest first, as many as tell whether the user is active. `undefined` while still unknown.
	 */
	readonly recentChatRequests: IObservable<readonly number[] | undefined>;

	/**
	 * How many Copilot requests the user sent in this window.
	 */
	readonly windowChatRequests: IObservable<number>;

	/**
	 * The suggestions that developer mode shows regardless of targeting, dismissals,
	 * frequency limits and how many suggestions the user has seen.
	 */
	readonly developerMode: IObservable<ReadonlySet<PlanNudgeId>>;

	/**
	 * Whether any suggestion outside of Chat may show: suggestions apply to the user
	 * and they have not seen enough different ones yet, or developer mode shows one.
	 */
	readonly active: IObservable<boolean>;

	/**
	 * The moment offered by the card, if any.
	 */
	readonly moment: IObservable<IPlanMoment | undefined>;

	isDeveloperMode(id: PlanNudgeId): boolean;
	/**
	 * Whether a suggestion may show now.
	 * @param reader Re-evaluates when the plan, developer mode or the suggestions
	 * the user saw change. Time-based limits do not re-evaluate.
	 */
	canShow(id: PlanNudgeId, surface: PlanNudgeSurface, reader?: IReader): boolean;
	/**
	 * Whether a nudge was not dismissed, was not shown too often and the user has
	 * not seen enough different suggestions, regardless of targeting.
	 */
	isWithinLimits(id: PlanNudgeId, surface: PlanNudgeSurface): boolean;
	/**
	 * Remembers that the user saw a suggestion, unless developer mode showed it.
	 */
	markShown(id: PlanNudgeId, surface: PlanNudgeSurface): void;
	recordAction(id: PlanNudgeId, surface: PlanNudgeSurface, action: PlanNudgeAction): void;
	/**
	 * Never shows a suggestion again, unless developer mode shows it.
	 * @param action What the user did that stops it, for telemetry.
	 */
	dismiss(id: PlanNudgeId, surface: PlanNudgeSurface, action?: PlanNudgeAction): void;

	/**
	 * Offers a moment with a card when the limits allow it.
	 * @param force Offer the moment regardless of the limits, for previews.
	 */
	showMoment(moment: IPlanMoment, force?: boolean): boolean;
	runMoment(): Promise<void>;
	/**
	 * Withdraws the offered moment.
	 * @param dismiss Never offer this moment again.
	 */
	closeMoment(dismiss: boolean): void;
	resetState(): void;

	/**
	 * What the plan includes, to show with a suggestion.
	 */
	getPlanFacts(): IPlanFact[];

	/**
	 * Whether the user opened Chat from a suggestion and has not sent a request
	 * since, so the empty Chat view shows what the plan includes.
	 */
	readonly openedFromSuggestion: IObservable<boolean>;

	/**
	 * Opens a new chat in the Chat view, prepared for a task, where the empty Chat
	 * view shows what the plan includes. Widens the Chat view when it is too narrow to read.
	 */
	openChat(request: IPlanChatRequest): Promise<void>;

}

type PlanNudgeEvent = {
	nudgeId: string;
	surface: string;
	action: string;
	preview: boolean;
	seenSuggestions: number;
};

type PlanNudgeClassification = {
	nudgeId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The Copilot plan suggestion.' };
	surface: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Where the suggestion appeared: a card in the corner of the window, an inline hint or in the empty Chat view.' };
	action: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the suggestion was shown, used, closed or dismissed for good, or the user opened their Copilot usage from it.' };
	preview: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether developer mode or a preview showed the suggestion, ignoring targeting and limits.' };
	seenSuggestions: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'How many different prominent suggestions the user has seen. No more suggestions show outside of Chat once it reaches the limit.' };
	owner: 'benibenj';
	comment: 'Tracks Copilot plan suggestions for paid users who hardly use Copilot Chat.';
};

/** Which suggestions the user has seen and dismissed. It roams with Settings Sync, so suggestions do not repeat on every machine. */
const STATE_STORAGE_KEY = 'chat.planAwareness.state';
const RECENT_CHAT_REQUESTS_STORAGE_KEY = 'chat.planAwareness.recentChatRequests';

/** How long to wait for the models of a chat that just opened. */
const CHAT_MODELS_TIMEOUT = 2000;

/**
 * The most capable model of the family among the models that a chat offers,
 * which come from the harness the chat uses and can differ from the Copilot
 * models of the plan.
 */
function findChatModelOfFamily(widget: IChatWidget, family: string): ILanguageModelChatMetadataAndIdentifier | undefined {
	const models = widget.input.availableLanguageModels;
	const best = findModelOfFamily(models.map(model => model.metadata), family);
	return best && models.find(model => model.metadata === best);
}

/** Narrower Chat views wrap the plan and the input toolbar, so opening Chat from a suggestion widens it. */
const MIN_CHAT_VIEW_WIDTH = 400;

/** The sessions whose requests use Copilot, including the agent host harnesses that the plan includes. */
const COPILOT_SESSION_TYPES: ReadonlySet<string> = new Set([
	AgentSessionProviders.Local,
	AgentSessionProviders.Background,
	AgentSessionProviders.Cloud,
	AgentSessionProviders.AgentHostCopilot,
	AgentSessionProviders.AgentHostClaude,
	AgentSessionProviders.AgentHostCodex,
]);

/** A card that the user did not act on is withdrawn after this time. */
const MOMENT_LIFETIME_MS = 2 * 60 * 1000;
/** A card about something that blocks the user stays longer. */
const URGENT_MOMENT_LIFETIME_MS = 30 * 60 * 1000;

export class ChatPlanAwarenessService extends Disposable implements IChatPlanAwarenessService {

	declare readonly _serviceBrand: undefined;

	private readonly _state: ISettableObservable<IPlanNudgeState>;
	private readonly _recentChatRequests: ISettableObservable<readonly number[] | undefined>;
	readonly recentChatRequests: IObservable<readonly number[] | undefined>;
	private readonly _windowChatRequests = observableValue<number>(this, 0);
	readonly windowChatRequests: IObservable<number> = this._windowChatRequests;
	private readonly _moment = observableValue<IPlanMoment | undefined>(this, undefined);
	private readonly _openedFromSuggestion = observableValue<boolean>(this, false);
	readonly openedFromSuggestion: IObservable<boolean> = this._openedFromSuggestion;
	readonly moment: IObservable<IPlanMoment | undefined> = this._moment;
	readonly developerMode: IObservable<ReadonlySet<PlanNudgeId>>;
	readonly active: IObservable<boolean>;

	readonly plan: IObservable<IPlanSummary | undefined>;
	readonly summary: IObservable<IPlanSummary | undefined>;

	private readonly momentExpiry = this._register(new MutableDisposable());
	private readonly momentVisibleContext: IContextKey<boolean>;

	constructor(
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@IChatService chatService: IChatService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IAgentHostEnablementService agentHostEnablementService: IAgentHostEnablementService,
		@IChatViewSessionsListService chatViewSessionsListService: IChatViewSessionsListService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IStorageService private readonly storageService: IStorageService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ICommandService private readonly commandService: ICommandService,
		@IProductService private readonly productService: IProductService,
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
	) {
		super();

		this._state = observableValue(this, parsePlanNudgeState(storageService.get(STATE_STORAGE_KEY, StorageScope.APPLICATION)));
		this._recentChatRequests = observableValue(this, parseRecentChatRequests(storageService.get(RECENT_CHAT_REQUESTS_STORAGE_KEY, StorageScope.APPLICATION)));
		this.recentChatRequests = this._recentChatRequests;

		// Other windows and Settings Sync change what the user saw and dismissed, and when they used Copilot.
		// Picking that up keeps this window from showing a dismissed suggestion and from storing an outdated copy.
		this._register(storageService.onDidChangeValue(StorageScope.APPLICATION, STATE_STORAGE_KEY, this._store)(e => {
			if (e.external) {
				this._state.set(parsePlanNudgeState(storageService.get(STATE_STORAGE_KEY, StorageScope.APPLICATION)), undefined);
			}
		}));
		this._register(storageService.onDidChangeValue(StorageScope.APPLICATION, RECENT_CHAT_REQUESTS_STORAGE_KEY, this._store)(e => {
			const stored = parseRecentChatRequests(storageService.get(RECENT_CHAT_REQUESTS_STORAGE_KEY, StorageScope.APPLICATION));
			if (e.external && stored) {
				const current = this._recentChatRequests.get() ?? [];
				this._recentChatRequests.set(addRecentChatRequests(stored, ...current.filter(time => !stored.includes(time))), undefined);
			}
		}));

		this.momentVisibleContext = ChatPlanAwarenessContextKeys.momentVisible.bindTo(contextKeyService);
		const targetedContext = ChatPlanAwarenessContextKeys.targeted.bindTo(contextKeyService);

		const enabled = observableConfigValue<boolean>(PLAN_SUGGESTIONS_SETTING_ID, false, configurationService);
		const developerModeValue = observableConfigValue<unknown>(ChatPlanAwarenessDeveloperModeSettingId, undefined, configurationService);
		this.developerMode = derived(this, reader => parsePlanNudgeDeveloperMode(developerModeValue.read(reader)));
		const harnessPreferenceChanged = observableSignalFromEvent(this, Event.filter(configurationService.onDidChangeConfiguration, e => affectsAgentHostProviderPreference(e, true)));
		const chatEnabled = observableContextKey<boolean>(ChatContextKeys.enabled.key, contextKeyService);
		const entitlementChanged = observableSignalFromEvent(this, chatEntitlementService.onDidChangeEntitlement);
		const quotasChanged = observableSignalFromEvent(this, chatEntitlementService.onDidChangeQuotaRemaining);
		const modelsChanged = observableSignalFromEvent(this, languageModelsService.onDidChangeLanguageModels);
		const modelControlsChanged = observableSignalFromEvent(this, languageModelsService.onDidChangeModelsControlManifest);

		this.plan = derived(this, reader => {
			const sentiment = chatEntitlementService.sentimentObs.read(reader);
			if (!chatEnabled.read(reader) || sentiment.hidden || sentiment.disabled) {
				return undefined;
			}

			const entitlement = chatEntitlementService.entitlementObs.read(reader);
			if (!isProUser(entitlement)) {
				return undefined;
			}

			entitlementChanged.read(reader);
			quotasChanged.read(reader);
			modelsChanged.read(reader);
			modelControlsChanged.read(reader);

			const quotas = chatEntitlementService.quotas;
			const isOrganizationPlan = entitlement === ChatEntitlement.Business || entitlement === ChatEntitlement.Enterprise;
			// The harnesses that the harness picker offers
			const harnesses: string[] = [];
			if (agentHostEnablementService.enabled.read(reader)) {
				harnessPreferenceChanged.read(reader);
				const surfacesAllAgents = chatViewSessionsListService.surfacesAllLocalAgentHostAgents.read(reader);
				if (shouldSurfaceLocalAgentHostProvider(CLAUDE_AGENT_PROVIDER_ID, configurationService, surfacesAllAgents)) {
					harnesses.push('Claude');
				}
				if (shouldSurfaceLocalAgentHostProvider(CODEX_AGENT_PROVIDER_ID, configurationService, surfacesAllAgents)) {
					harnesses.push('Codex');
				}
			}

			const models = this.getModels();
			const flagships = getFlagshipModels(models, COPILOT_VENDOR_ID);
			return {
				planName: getChatPlanName(entitlement),
				paidByOrganization: isOrganizationPlan,
				organization: isOrganizationPlan ? chatEntitlementService.organisations?.[0] : undefined,
				credits: getPlanCredits(quotas.premiumChat, quotas.usageBasedBilling, quotas.resetDate),
				modelFamilies: getModelFamilies(models, COPILOT_VENDOR_ID),
				models: flagships.names,
				hasMoreModels: flagships.hasMore,
				harnesses,
			} satisfies IPlanSummary;
		});

		this.summary = derived(this, reader => {
			const plan = this.plan.read(reader);
			return plan && shouldShowPlanSuggestions({
				enabled: enabled.read(reader),
				recentChatRequests: this._recentChatRequests.read(reader),
				now: Date.now(),
			}, this.telemetryService) ? plan : undefined;
		});

		this.active = derived(this, reader => {
			if (!this.plan.read(reader)) {
				return false;
			}
			return this.developerMode.read(reader).size > 0 || (!!this.summary.read(reader) && !isPlanNudgeBudgetUsed(this._state.read(reader)));
		});
		this._register(autorun(reader => targetedContext.set(this.active.read(reader))));

		// A moment is withdrawn when suggestions stop applying. It reads the summary in every experiment arm, which logs its trigger.
		this._register(autorun(reader => {
			if (!this.summary.read(reader)) {
				this.setMoment(undefined);
			}
		}));

		this._register(chatService.onDidSubmitRequest(() => {
			transaction(tx => {
				this._openedFromSuggestion.set(false, tx);
				this._windowChatRequests.set(this._windowChatRequests.get() + 1, tx);
				this.setRecentChatRequests(addRecentChatRequests(this._recentChatRequests.get() ?? [], Date.now()), tx);
			});
		}));

		// Seed the recent chat requests from the chat history once for paid users, whether suggestions are on or off,
		// so that targeting and the experiment triggers see the same activity in every experiment arm
		let seeded = false;
		this._register(autorun(reader => {
			if (seeded || !this.plan.read(reader) || this._recentChatRequests.read(reader) !== undefined) {
				return;
			}
			seeded = true;
			chatService.getLocalSessionHistory().then(history => {
				if (this._recentChatRequests.read(undefined) === undefined) {
					this.setRecentChatRequests(this.getRecentChatRequestsFromHistory(history), undefined);
				}
			}, () => { /* nothing is targeted until the history is read in another window, or the user sends a request */ });
		}));

		this._register(CommandsRegistry.registerCommand(CLOSE_PLAN_MOMENT_COMMAND_ID, () => this.closeMoment(false)));
	}

	/**
	 * The models the user can use. Models that need a newer VS Code are unavailable
	 * until an update, so the plan does not advertise them.
	 */
	private getModels(): ILanguageModelChatMetadata[] {
		const models: ILanguageModelChatMetadata[] = [];
		const controls = this.languageModelsService.getModelsControlManifest().paid;
		for (const identifier of this.languageModelsService.getLanguageModelIds()) {
			const metadata = this.languageModelsService.lookupLanguageModel(identifier);
			if (metadata && !requiresNewerVSCode({ identifier, metadata }, controls, this.productService.version)) {
				models.push(metadata);
			}
		}
		return models;
	}

	/**
	 * The most recent Copilot requests in the local chat history and in the agent
	 * sessions, such as those of the agent host harnesses. They only tell when each
	 * session was last used, so a session counts as one request.
	 */
	private getRecentChatRequestsFromHistory(history: readonly IChatDetail[]): number[] {
		const sessions = new ResourceMap<number>();
		for (const item of history) {
			sessions.set(item.sessionResource, item.lastMessageDate);
		}
		for (const session of this.agentSessionsService.model.sessions) {
			const time = session.timing.lastRequestStarted;
			if (time && COPILOT_SESSION_TYPES.has(session.providerType)) {
				sessions.set(session.resource, Math.max(time, sessions.get(session.resource) ?? 0));
			}
		}
		return addRecentChatRequests([], ...sessions.values());
	}

	private setRecentChatRequests(recentChatRequests: readonly number[], tx: ITransaction | undefined): void {
		this._recentChatRequests.set(recentChatRequests, tx);
		this.storageService.store(RECENT_CHAT_REQUESTS_STORAGE_KEY, JSON.stringify(recentChatRequests), StorageScope.APPLICATION, StorageTarget.MACHINE);
	}

	private updateState(state: IPlanNudgeState): void {
		this._state.set(state, undefined);
		this.storageService.store(STATE_STORAGE_KEY, JSON.stringify(state), StorageScope.APPLICATION, StorageTarget.USER);
	}

	isDeveloperMode(id: PlanNudgeId): boolean {
		return this.developerMode.get().has(id);
	}

	canShow(id: PlanNudgeId, surface: PlanNudgeSurface, reader?: IReader): boolean {
		if (!this.plan.read(reader)) {
			return false;
		}
		return this.developerMode.read(reader).has(id) || (!!this.summary.read(reader) && canShowPlanNudge(this._state.read(reader), id, surface, Date.now()));
	}

	isWithinLimits(id: PlanNudgeId, surface: PlanNudgeSurface): boolean {
		return canShowPlanNudge(this._state.get(), id, surface, Date.now());
	}

	markShown(id: PlanNudgeId, surface: PlanNudgeSurface): void {
		this.onDidShow(id, surface, this.isDeveloperMode(id));
	}

	/**
	 * @param preview Shown by developer mode or a preview, which the user does not
	 * see, so it does not count towards the limits.
	 */
	private onDidShow(id: PlanNudgeId, surface: PlanNudgeSurface, preview: boolean): void {
		if (!preview) {
			this.updateState(recordPlanNudgeShown(this._state.get(), id, surface, Date.now()));
		}
		this.log(id, surface, PlanNudgeAction.Shown, preview);
	}

	recordAction(id: PlanNudgeId, surface: PlanNudgeSurface, action: PlanNudgeAction): void {
		this.log(id, surface, action, this.isDeveloperMode(id));
	}

	private log(id: PlanNudgeId, surface: PlanNudgeSurface, action: PlanNudgeAction, preview: boolean): void {
		this.telemetryService.publicLog2<PlanNudgeEvent, PlanNudgeClassification>('chatPlanNudge', {
			nudgeId: id,
			surface,
			action,
			preview,
			seenSuggestions: getSeenPlanNudges(this._state.get()).length,
		});
	}

	dismiss(id: PlanNudgeId, surface: PlanNudgeSurface, action = PlanNudgeAction.Dismiss): void {
		// Developer mode leaves the state of the user as it was
		if (!this.isDeveloperMode(id)) {
			this.updateState(recordPlanNudgeDismissed(this._state.get(), id));
		}
		this.recordAction(id, surface, action);
	}

	private setMoment(moment: IPlanMoment | undefined): void {
		this._moment.set(moment, undefined);
		this.momentVisibleContext.set(!!moment);
		this.momentExpiry.value = moment ? disposableTimeout(() => this.setMoment(undefined), moment.urgent ? URGENT_MOMENT_LIFETIME_MS : MOMENT_LIFETIME_MS) : undefined;
	}

	showMoment(moment: IPlanMoment, force?: boolean): boolean {
		const current = this._moment.get();
		if (current?.id === moment.id) {
			if (current.title !== moment.title) {
				this.setMoment(moment);
				this.announceMoment(moment);
			}
			return true;
		}
		if (!this.plan.get()) {
			return false;
		}
		const preview = !!force || this.isDeveloperMode(moment.id);
		if (!preview) {
			const limits = moment.urgent ? { ...DEFAULT_PLAN_NUDGE_LIMITS, momentIntervalMs: 0 } : DEFAULT_PLAN_NUDGE_LIMITS;
			if (!this.summary.get() || !canShowPlanNudge(this._state.get(), moment.id, PlanNudgeSurface.Moment, Date.now(), limits)) {
				return false;
			}
		}

		this.onDidShow(moment.id, PlanNudgeSurface.Moment, preview);
		this.setMoment(moment);
		this.announceMoment(moment);
		return true;
	}

	private announceMoment(moment: IPlanMoment): void {
		// The card never takes focus, so screen reader users hear what it offers
		status(localize('planAwareness.moment.announce', "{0}. {1} Run the command Focus Copilot Plan Suggestion to act on it.", moment.title, moment.message));
	}

	async runMoment(): Promise<void> {
		const moment = this._moment.get();
		if (!moment) {
			return;
		}
		this.recordAction(moment.id, PlanNudgeSurface.Moment, PlanNudgeAction.Primary);
		this.setMoment(undefined);
		await moment.primary.run();
	}

	closeMoment(dismiss: boolean): void {
		const moment = this._moment.get();
		if (!moment) {
			return;
		}
		if (dismiss) {
			this.dismiss(moment.id, PlanNudgeSurface.Moment);
		} else {
			this.recordAction(moment.id, PlanNudgeSurface.Moment, PlanNudgeAction.Close);
		}
		this.setMoment(undefined);
		if (dismiss) {
			status(localize('planAwareness.moment.dismissed', "Suggestion dismissed"));
		}
	}

	resetState(): void {
		this.updateState(parsePlanNudgeState(undefined));
	}

	getPlanFacts(): IPlanFact[] {
		const plan = this.plan.get();
		return plan ? getPlanFacts(plan, language) : [];
	}

	async openChat(request: IPlanChatRequest): Promise<void> {
		this._openedFromSuggestion.set(true, undefined);

		// A new chat, so its empty view shows what the plan includes
		const widget = await this.chatWidgetService.revealChatView();
		if (widget?.viewModel?.getItems().length) {
			await this.commandService.executeCommand(ACTION_ID_NEW_CHAT);
		}

		const model = request.modelFamily && widget ? findChatModelOfFamily(widget, request.modelFamily) : undefined;
		const options: IChatViewOpenOptions = {
			query: request.query ?? '',
			isPartialQuery: request.isPartialQuery ?? true,
			mode: request.mode,
			modelSelector: model ? { vendor: model.metadata.vendor, id: model.metadata.id } : undefined,
			attachFiles: request.attachFiles,
		};
		try {
			await this.commandService.executeCommand(CHAT_OPEN_ACTION_ID, options);
		} catch {
			// The requested model may be unavailable
			await this.commandService.executeCommand(CHAT_OPEN_ACTION_ID, { ...options, modelSelector: undefined });
		}
		this.ensureChatViewWidth();
		if (request.modelFamily && widget) {
			await this.selectChatModelOfFamily(widget, request.modelFamily);
		}
	}

	/**
	 * Selects the most capable model of the family in a chat that just opened, in
	 * case its models were still loading when it opened.
	 */
	private async selectChatModelOfFamily(widget: IChatWidget, family: string): Promise<void> {
		let model = findChatModelOfFamily(widget, family);
		if (!model) {
			const store = new DisposableStore();
			try {
				const modelsChanged = Event.any<unknown>(this.languageModelsService.onDidChangeLanguageModels, widget.onDidChangeViewModel);
				await raceTimeout(Event.toPromise(Event.filter(modelsChanged, () => !!findChatModelOfFamily(widget, family)), store), CHAT_MODELS_TIMEOUT);
			} finally {
				store.dispose();
			}
			model = findChatModelOfFamily(widget, family);
		}
		if (model && widget.input.selectedLanguageModel.get()?.identifier !== model.identifier) {
			try {
				widget.input.setCurrentLanguageModel(model, true);
			} catch {
				// A policy of the organization does not allow the model
			}
		}
	}

	/**
	 * Widens the side bar that shows the Chat view when it is too narrow to read
	 * the plan. A wider side bar that the user chose stays as it is.
	 */
	private ensureChatViewWidth(): void {
		const location = this.viewDescriptorService.getViewLocationById(ChatViewId);
		const part = location === ViewContainerLocation.AuxiliaryBar ? Parts.AUXILIARYBAR_PART
			: location === ViewContainerLocation.Sidebar ? Parts.SIDEBAR_PART
				: undefined;
		if (!part || !this.layoutService.isVisible(part) || (part === Parts.AUXILIARYBAR_PART && this.layoutService.isAuxiliaryBarMaximized())) {
			return;
		}
		const size = this.layoutService.getSize(part);
		if (size.width < MIN_CHAT_VIEW_WIDTH) {
			this.layoutService.setSize(part, { width: MIN_CHAT_VIEW_WIDTH, height: size.height });
		}
	}

}

registerSingleton(IChatPlanAwarenessService, ChatPlanAwarenessService, InstantiationType.Delayed);
