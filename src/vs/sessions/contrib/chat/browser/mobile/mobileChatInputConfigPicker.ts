/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Gesture, EventType as TouchEventType } from '../../../../../base/browser/touch.js';
import { BaseActionViewItem } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../../nls.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { SessionConfigKey } from '../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { type ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { IChatPhoneInputPresenter } from '../../../../../workbench/contrib/chat/browser/widget/input/chatPhoneInputPresenter.js';
import { Menus } from '../../../../browser/menus.js';
import { ActiveSessionProviderIdContext, IsPhoneLayoutContext } from '../../../../common/contextkeys.js';
import { type IAgentHostSessionsProvider, isAgentHostProvider, LOCAL_AGENT_HOST_PROVIDER_ID, REMOTE_AGENT_HOST_PROVIDER_RE } from '../../../../common/agentHostSessionsProvider.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { type ISession } from '../../../../services/sessions/common/session.js';
import { isWellKnownModeSchema } from '../agentHost/agentHostPermissionPickerDelegate.js';
import { agentHostModelPickerStorageKey } from '../agentHost/agentHostModelPicker.js';

const IsActiveSessionAgentHost = ContextKeyExpr.or(
	ContextKeyExpr.equals(ActiveSessionProviderIdContext.key, LOCAL_AGENT_HOST_PROVIDER_ID),
	ContextKeyExpr.regex(ActiveSessionProviderIdContext.key, REMOTE_AGENT_HOST_PROVIDER_RE),
);

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
	private _slotElement: HTMLElement | undefined;
	private _triggerElement: HTMLElement | undefined;

	constructor(
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@IStorageService private readonly _storageService: IStorageService,
		@IChatPhoneInputPresenter private readonly _phonePresenter: IChatPhoneInputPresenter,
	) {
		super();

		// Re-render the trigger whenever the active session, its config,
		// its model, or the available language models change. The
		// `_resolveAndPushModel` call inside `_updateTrigger` also
		// auto-selects a remembered/first model on session switch so
		// the next send goes out with the correct model — mirroring
		// the desktop {@link AgentHostModelPickerContribution} init
		// flow, which the gated-off desktop picker no longer runs on
		// phone.
		this._register(autorun(reader => {
			const session = this._sessionsManagementService.activeSession.read(reader);
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
		const session = this._sessionsManagementService.activeSession.get();
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
				value,
				label: modeSchema.enumLabels?.[index] ?? value,
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
		if (!this._slotElement || !this._triggerElement) {
			return;
		}

		const ctx = this._getContext();
		// Hide the chip when there's nothing to pick (no mode AND no
		// models). In that state the toolbar is more compact rather than
		// showing a no-op trigger.
		if (!ctx || (ctx.modeItems.length === 0 && ctx.modelItems.length === 0)) {
			this._slotElement.style.display = 'none';
			return;
		}
		this._slotElement.style.display = '';

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
		const labelText = currentModel?.metadata.name
			?? localize('mobileChatInputConfigPicker.autoLabel', "Auto");
		const labelSpan = dom.append(this._triggerElement, dom.$('span.chat-input-picker-label'));
		labelSpan.textContent = labelText;

		dom.append(this._triggerElement, renderIcon(Codicon.chevronDown));

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

	private async _showSheet(): Promise<void> {
		if (!this._triggerElement) {
			return;
		}
		// Delegate sheet construction to the shared phone presenter so
		// the new-session chip and the opened-chat chip render the exact
		// same Mode + Model rows. The presenter's agent-host branch
		// reads the active session's config + filtered models and
		// handles the writes (provider mode/model + shared storage key).
		const trigger = this._triggerElement;
		trigger.setAttribute('aria-expanded', 'true');
		try {
			await this._phonePresenter.showCombinedModeAndModelSheet(trigger, undefined, undefined);
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
				when: ContextKeyExpr.and(IsActiveSessionAgentHost, IsPhoneLayoutContext),
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
	) {
		super();

		this._register(actionViewItemService.register(
			Menus.NewSessionConfig,
			MOBILE_CHAT_INPUT_CONFIG_PICKER_ID,
			() => {
				const picker = instantiationService.createInstance(MobileChatInputConfigPicker);
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
