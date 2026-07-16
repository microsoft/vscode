/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Gesture, EventType as TouchEventType } from '../../../../../../base/browser/touch.js';
import { BaseActionViewItem } from '../../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../../../nls.js';
import { IActionViewItemService } from '../../../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope } from '../../../../../../platform/storage/common/storage.js';
import { SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../../workbench/common/contributions.js';
import { type ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../../../../workbench/contrib/chat/common/languageModels.js';
import { IChatPhoneInputPresenter } from '../../../../../../workbench/contrib/chat/browser/widget/input/chatPhoneInputPresenter.js';
import { getModelProviderIcon } from '../../../../../../workbench/contrib/chat/browser/widget/input/modelProviderIcons.js';
import { Menus } from '../../../../../browser/menus.js';
import { SessionUsesCombinedConfigPickerContext, IsPhoneLayoutContext } from '../../../../../common/contextkeys.js';
import { type IAgentHostSessionsProvider, isAgentHostProvider, isAgentHostProviderId } from '../../../../../common/agentHostSessionsProvider.js';
import { IActiveSession } from '../../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../../services/sessions/browser/sessionsService.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { type ISession } from '../../../../../services/sessions/common/session.js';
import { ISessionContext } from '../../../../../services/sessions/browser/sessionContext.js';
import { isWellKnownModeSchema } from '../agentHostPermissionPickerDelegate.js';
import { agentHostModelPickerStorageKey, setAgentHostModelSelection } from '../agentHostModelPicker.js';
import { INewChatModelPickerService } from '../../../../chat/browser/newChatModelPicker.js';
import { reportNewChatPickerClosed } from '../../../../chat/browser/newChatPickerTelemetry.js';

const MOBILE_CHAT_INPUT_CONFIG_PICKER_ID = 'sessions.agentHost.mobileChatInputConfigPicker';

function getModeIcon(value: string | undefined): ThemeIcon | undefined {
	switch (value) {
		case 'plan': return Codicon.checklist;
		case 'autopilot': return Codicon.rocket;
		case 'interactive': return Codicon.comment;
		default: return undefined;
	}
}

/**
 * Returns the language models registered for the session's resource scheme.
 * This mirrors the logic in {@link AgentHostModelPickerContribution} so the
 * mobile picker shows the same models as the desktop picker would.
 */
function getAgentHostModels(
	languageModelsService: ILanguageModelsService,
	session: ISession | undefined,
): ILanguageModelChatMetadataAndIdentifier[] {
	if (!session) {
		return [];
	}
	const resourceScheme = session.resource.scheme;
	return languageModelsService.getLanguageModelIds()
		.map(id => {
			const metadata = languageModelsService.lookupLanguageModel(id);
			return metadata ? { metadata, identifier: id } : undefined;
		})
		.filter((m): m is ILanguageModelChatMetadataAndIdentifier => !!m && m.metadata.targetChatSessionType === resourceScheme);
}

interface IMobileConfigContext {
	readonly provider: IAgentHostSessionsProvider;
	readonly session: ISession;
	readonly modeItems: readonly { value: string; label: string; description?: string }[];
	readonly currentMode: string | undefined;
	readonly modelItems: readonly ILanguageModelChatMetadataAndIdentifier[];
	readonly currentModelId: string | undefined;
}

/**
 * Phone-only chat input config picker that combines the Mode and Model
 * pickers into a single chip trigger that opens a unified bottom sheet.
 *
 * Desktop renders Mode and Model as two separate pickers in the input
 * toolbar (see {@link AgentHostModePicker} and the model picker factory
 * in `agentHostModelPicker.ts`). On phone those two desktop pickers are
 * gated off via `when: IsPhoneLayoutContext.negate()` and this single
 * combined picker takes their slot — same data, different presentation,
 * matching the MOBILE.md core principle.
 *
 * The trigger label shows the current model name (e.g. "Auto") so the
 * user immediately sees the most relevant configuration; the mode is
 * surfaced as the chip's leading icon when one is selected. Tapping
 * opens a sheet with two sections: Agent Mode (Interactive / Plan /
 * Autopilot when applicable) and Model (the model list filtered by the
 * active session's resource scheme).
 */
class MobileChatInputConfigPicker extends Disposable {

	private readonly _renderDisposables = this._register(new DisposableStore());
	private readonly _providerListeners = this._register(new DisposableMap<string>());
	private _containerElement: HTMLElement | undefined;
	private _slotElement: HTMLElement | undefined;
	private _triggerElement: HTMLElement | undefined;

	constructor(
		private readonly _session: IObservable<IActiveSession | undefined>,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@IStorageService private readonly _storageService: IStorageService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IChatPhoneInputPresenter private readonly _phonePresenter: IChatPhoneInputPresenter,
		@INewChatModelPickerService private readonly _newChatModelPickerService: INewChatModelPickerService,
	) {
		super();
		this._register(this._newChatModelPickerService.registerModelPicker({
			open: () => { void this._showSheet(); },
			switchToModel: modelIdentifier => this._switchToModel(modelIdentifier),
		}));

		// Re-render the trigger whenever the active session, its config,
		// its model, or the available language models change. The
		// `_resolveAndPushModel` call inside `_updateTrigger` also
		// auto-selects a remembered/first model on session switch so
		// the next send goes out with the correct model — mirroring
		// the desktop {@link AgentHostModelPickerContribution} init
		// flow, which the gated-off desktop picker no longer runs on
		// phone.
		this._register(autorun(reader => {
			const session = this._session.read(reader);
			session?.modelId.read(reader);
			this._updateTrigger();
		}));
		this._register(this._languageModelsService.onDidChangeLanguageModels(() => this._updateTrigger()));
		this._register(this._sessionsProvidersService.onDidChangeProviders(e => {
			for (const provider of e.removed) {
				this._providerListeners.deleteAndDispose(provider.id);
			}
			this._watchProviders(e.added);
			this._updateTrigger();
		}));
		this._watchProviders(this._sessionsProvidersService.getProviders());
	}

	/**
	 * Subscribe to each agent-host provider's `onDidChangeSessionConfig`
	 * so the chip refreshes when the session's mode is mutated outside
	 * the sheet (e.g. by a setting reload, schema re-resolve, or
	 * another picker).
	 */
	private _watchProviders(providers: readonly { id: string }[]): void {
		for (const provider of providers) {
			if (this._providerListeners.has(provider.id)) {
				continue;
			}
			const resolved = this._sessionsProvidersService.getProvider(provider.id);
			if (!resolved || !isAgentHostProvider(resolved)) {
				continue;
			}
			this._providerListeners.set(provider.id, resolved.onDidChangeSessionConfig(() => this._updateTrigger()));
		}
	}

	render(container: HTMLElement): void {
		this._renderDisposables.clear();
		this._containerElement = container;

		const slot = dom.append(container, dom.$('.sessions-chat-picker-slot.sessions-chat-picker-slot-mobile-config'));
		this._renderDisposables.add({ dispose: () => slot.remove() });
		this._slotElement = slot;

		const trigger = dom.append(slot, dom.$('a.action-label'));
		trigger.tabIndex = 0;
		trigger.role = 'button';
		this._triggerElement = trigger;

		this._renderDisposables.add(Gesture.addTarget(trigger));
		for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
			this._renderDisposables.add(dom.addDisposableListener(trigger, eventType, e => {
				dom.EventHelper.stop(e, true);
				this._showSheet();
			}));
		}
		this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, e => {
			if (e.key === 'Enter' || e.key === ' ') {
				dom.EventHelper.stop(e, true);
				this._showSheet();
			}
		}));

		this._updateTrigger();
	}

	private _getContext(): IMobileConfigContext | undefined {
		const session = this._session.get();
		if (!session) {
			return undefined;
		}
		const provider = this._sessionsProvidersService.getProvider(session.providerId);
		if (!provider || !isAgentHostProvider(provider)) {
			return undefined;
		}

		// Mode (optional — agent may not advertise a well-known schema)
		const config = provider.getSessionConfig(session.sessionId);
		const modeSchema = config?.schema.properties[SessionConfigKey.Mode];
		const modeItems = (modeSchema && isWellKnownModeSchema(modeSchema))
			? (modeSchema.enum ?? []).map((value, index) => ({
				value: String(value),
				label: modeSchema.enumLabels?.[index] ?? String(value),
				description: modeSchema.enumDescriptions?.[index],
			}))
			: [];
		const rawCurrentMode = config?.values[SessionConfigKey.Mode] ?? modeSchema?.default;
		const currentMode = (typeof rawCurrentMode === 'string' && modeItems.some(i => i.value === rawCurrentMode))
			? rawCurrentMode
			: modeItems[0]?.value;

		// Model
		const modelItems = getAgentHostModels(this._languageModelsService, session);
		const currentModelId = session.modelId.get() ?? this._storageService.get(agentHostModelPickerStorageKey(session.resource.scheme), StorageScope.PROFILE);

		return { provider, session, modeItems, currentMode, modelItems, currentModelId };
	}

	private _updateTrigger(): void {
		if (!this._slotElement || !this._triggerElement || !this._containerElement) {
			return;
		}

		const ctx = this._getContext();
		// Hide the chip when there's nothing to pick (no mode AND no
		// models). In that state the toolbar is more compact rather than
		// showing a no-op trigger. Also collapse the wrapping
		// `.action-item` that `MenuWorkbenchToolBar` created — hiding
		// only the inner slot leaves the wrapper occupying its
		// `min-width` floor and produces a visible empty gap.
		if (!ctx || (ctx.modeItems.length === 0 && ctx.modelItems.length === 0)) {
			this._slotElement.style.display = 'none';
			this._containerElement.style.display = 'none';
			return;
		}
		this._slotElement.style.display = '';
		this._containerElement.style.display = '';

		// Auto-resolve the model: if the session has no explicit model
		// selection yet, push the remembered model (or first available)
		// into the provider so the next send goes out with that model.
		// Mirrors `AgentHostModelPickerContribution`'s `initModel` which
		// no longer runs on phone (the desktop picker is gated off).
		// Without this, a fresh session would show "Auto" but the
		// provider would still be on its built-in default — divergent
		// from desktop behavior.
		const resolvedModelId = this._resolveAndPushModel(ctx);

		dom.clearNode(this._triggerElement);

		// Leading icon: the current mode's icon if a mode is selected,
		// otherwise nothing.
		const modeIcon = ctx.currentMode ? getModeIcon(ctx.currentMode) : undefined;
		if (modeIcon) {
			dom.append(this._triggerElement, renderIcon(modeIcon));
		}

		// Label: the current model name (or "Auto" placeholder when no
		// model is available). Mode is surfaced via the icon, not
		// duplicated in the label, to keep the chip compact.
		const currentModel = resolvedModelId
			? ctx.modelItems.find(m => m.identifier === resolvedModelId)
			: undefined;
		if (currentModel) {
			dom.append(this._triggerElement, renderIcon(getModelProviderIcon(currentModel)));
		}
		const labelText = currentModel?.metadata.name
			?? localize('mobileChatInputConfigPicker.autoLabel', "Auto");
		const labelSpan = dom.append(this._triggerElement, dom.$('span.chat-input-picker-label'));
		labelSpan.textContent = labelText;

		const ariaParts: string[] = [];
		if (ctx.currentMode) {
			const modeItem = ctx.modeItems.find(i => i.value === ctx.currentMode);
			if (modeItem) {
				ariaParts.push(modeItem.label);
			}
		}
		ariaParts.push(labelText);
		this._triggerElement.ariaLabel = localize(
			'mobileChatInputConfigPicker.triggerAriaLabel',
			"Pick Mode and Model, {0}",
			ariaParts.join(', '),
		);

		// Sheet's mode row writes through `setSessionConfigValue`, so
		// disable the chip while a resolve is in flight.
		const isResolving = ctx.provider.isSessionConfigResolving(ctx.session.sessionId).get();
		this._slotElement.classList.toggle('disabled', isResolving);
		this._triggerElement.setAttribute('aria-disabled', isResolving ? 'true' : 'false');
	}

	/**
	 * If the active session has no explicit model selected yet, pick a
	 * model (remembered from profile storage, or the first available)
	 * and push it into the provider so the next send uses it. Returns
	 * the effective model id (or `undefined` when no models are
	 * available at all).
	 */
	private _resolveAndPushModel(ctx: IMobileConfigContext): string | undefined {
		// If the session already has a model set by the user, leave it
		// alone — `currentModelId` came from `session.modelId.get()`.
		if (ctx.session.modelId.get()) {
			return ctx.currentModelId;
		}
		if (ctx.modelItems.length === 0) {
			return undefined;
		}
		const remembered = this._storageService.get(agentHostModelPickerStorageKey(ctx.session.resource.scheme), StorageScope.PROFILE);
		const rememberedModel = remembered ? ctx.modelItems.find(m => m.identifier === remembered) : undefined;
		const resolved = rememberedModel ?? ctx.modelItems[0];
		ctx.provider.setModel(ctx.session.sessionId, resolved.identifier);
		return resolved.identifier;
	}

	private _switchToModel(modelIdentifier: string): boolean {
		const ctx = this._getContext();
		if (!ctx) {
			return false;
		}
		return setAgentHostModelSelection(ctx.session, ctx.modelItems, modelIdentifier, ctx.provider, this._storageService);
	}

	private async _showSheet(): Promise<void> {
		if (!this._triggerElement) {
			return;
		}
		// Sheet's mode row writes through `setSessionConfigValue`; the
		// chip retains its tap target while visually disabled, so
		// guard explicitly.
		const ctx = this._getContext();
		if (ctx && ctx.provider.isSessionConfigResolving(ctx.session.sessionId).get()) {
			return;
		}
		// Delegate sheet construction to the shared phone presenter so
		// the new-session chip and the opened-chat chip render the exact
		// same Mode + Model rows. The presenter's agent-host branch
		// reads the active session's config + filtered models and
		// handles the writes (provider mode/model + shared storage key).
		const trigger = this._triggerElement;
		const beforeCtx = ctx;
		const beforeMode = beforeCtx?.currentMode;
		const beforeModeItem = beforeCtx?.modeItems.find(i => i.value === beforeMode);
		const beforeModelId = beforeCtx?.currentModelId;
		const beforeModel = beforeModelId ? beforeCtx?.modelItems.find(m => m.identifier === beforeModelId) : undefined;
		trigger.setAttribute('aria-expanded', 'true');
		try {
			await this._phonePresenter.showCombinedModeAndModelSheet(trigger, undefined, undefined);
			const afterCtx = this._getContext();
			if (beforeCtx && afterCtx) {
				if (beforeCtx.modeItems.length > 0) {
					const afterMode = afterCtx.currentMode;
					const afterModeItem = afterCtx.modeItems.find(i => i.value === afterMode);
					reportNewChatPickerClosed(this._telemetryService, {
						id: 'NewChatMobileChatInputConfigPicker',
						name: 'NewChatMobileChatInputConfigPicker.mode',
						optionIdBefore: beforeMode,
						optionIdAfter: afterMode,
						optionLabelBefore: beforeModeItem?.label ?? beforeMode,
						optionLabelAfter: afterModeItem?.label ?? afterMode,
						isPII: false,
					});
				}
				if (beforeCtx.modelItems.length > 0) {
					const afterModelId = afterCtx.currentModelId;
					const afterModel = afterModelId ? afterCtx.modelItems.find(m => m.identifier === afterModelId) : undefined;
					reportNewChatPickerClosed(this._telemetryService, {
						id: 'NewChatMobileChatInputConfigPicker',
						name: 'NewChatMobileChatInputConfigPicker.model',
						optionIdBefore: beforeModelId,
						optionIdAfter: afterModelId,
						optionLabelBefore: beforeModel?.metadata.name,
						optionLabelAfter: afterModel?.metadata.name,
						isPII: false,
					});
				}
			}
		} finally {
			trigger.setAttribute('aria-expanded', 'false');
			trigger.focus();
		}
	}
}

/**
 * Action wrapper for the mobile chat-input config picker. Has no f1
 * surface and is gated on phone layout + an active agent-host session.
 * Order matches the existing desktop mode picker (0) so the chip lands
 * in the same toolbar slot.
 */
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: MOBILE_CHAT_INPUT_CONFIG_PICKER_ID,
			title: localize2('mobileChatInputConfigPicker', "Mode and Model"),
			f1: false,
			menu: [{
				id: Menus.NewSessionConfig,
				group: 'navigation',
				order: 0,
				when: ContextKeyExpr.and(SessionUsesCombinedConfigPickerContext, IsPhoneLayoutContext),
			}],
		});
	}
	override async run(): Promise<void> { }
});

/**
 * Workbench contribution that wires the {@link MobileChatInputConfigPicker}
 * into the new-session config toolbar. Registers an action view item
 * factory for the mobile-only command id; the action's `when` clause
 * (above) ensures the picker is only displayed on phone layouts. On
 * desktop, the existing mode + model picker registrations
 * (`agentHostSessionConfigPicker.ts` and `agentHostModelPicker.ts`)
 * provide the toolbar items as before.
 */
class MobileChatInputConfigPickerContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.mobileChatInputConfigPicker';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ISessionsService sessionsService: ISessionsService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		// The agent host owns the "combined config picker" decision: on phone
		// layouts it replaces the standalone mode + model pickers with a single
		// bottom sheet. Publish this as a neutral context key so the core model
		// picker can gate itself out without depending on agent-host identity.
		const usesCombinedPicker = SessionUsesCombinedConfigPickerContext.bindTo(contextKeyService);
		this._register(autorun(reader => {
			const session = sessionsService.activeSession.read(reader);
			usesCombinedPicker.set(!!session && isAgentHostProviderId(session.providerId));
		}));

		this._register(actionViewItemService.register(
			Menus.NewSessionConfig,
			MOBILE_CHAT_INPUT_CONFIG_PICKER_ID,
			(_action, _options, scopedInstantiationService) => {
				const { session } = scopedInstantiationService.invokeFunction(accessor => accessor.get(ISessionContext));
				const picker = scopedInstantiationService.createInstance(MobileChatInputConfigPicker, session);
				return new MobileChatInputConfigPickerActionViewItem(picker);
			},
		));
	}
}

class MobileChatInputConfigPickerActionViewItem extends BaseActionViewItem {
	constructor(private readonly _picker: MobileChatInputConfigPicker) {
		super(undefined, { id: '', label: '', enabled: true, class: undefined, tooltip: '', run: () => { } });
	}

	override render(container: HTMLElement): void {
		this._picker.render(container);
		container.classList.add('chat-input-picker-item');
	}

	override dispose(): void {
		this._picker.dispose();
		super.dispose();
	}
}

registerWorkbenchContribution2(MobileChatInputConfigPickerContribution.ID, MobileChatInputConfigPickerContribution, WorkbenchPhase.AfterRestored);
