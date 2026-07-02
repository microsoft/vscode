/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableValue } from '../../../../base/common/observable.js';
import { localize2 } from '../../../../nls.js';
import { BaseActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IChatInputPickerOptions } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputPickerActionItem.js';
import { resolveConfiguredModel } from '../../../../workbench/contrib/chat/browser/widget/input/chatModelSelectionLogic.js';
import { IModelPickerDelegate, ModelPickerActionItem } from '../../../../workbench/contrib/chat/browser/widget/input/modelPickerActionItem.js';
import { ChatConfiguration } from '../../../../workbench/contrib/chat/common/constants.js';
import { ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { Menus } from '../../../browser/menus.js';
import { IsPhoneLayoutContext, SessionUsesCombinedConfigPickerContext } from '../../../common/contextkeys.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionModelPickerOptions } from '../../../services/sessions/common/sessionsProvider.js';
import { ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { INewChatModelPickerService } from './newChatModelPicker.js';
import { reportNewChatPickerClosed } from './newChatPickerTelemetry.js';

/**
 * Returns the core model-picker storage key for a provider/session-type pair.
 * The last used model is remembered per provider per session type so a fresh
 * untitled session restores the user's previous choice.
 */
function modelPickerStorageKey(providerId: string, sessionType: string): string {
	return `sessions.modelPicker.${providerId}.${sessionType}.selectedModelId`;
}

/**
 * Reads the available models for a session from its provider.
 */
function getModelsForSession(session: ISession | undefined, sessionsProvidersService: ISessionsProvidersService): readonly ILanguageModelChatMetadataAndIdentifier[] {
	if (!session) {
		return [];
	}
	return sessionsProvidersService.getProvider(session.providerId)?.getModels(session.sessionId) ?? [];
}

function getModelPickerOptionsForSession(session: ISession | undefined, sessionsProvidersService: ISessionsProvidersService): ISessionModelPickerOptions {
	const provider = session ? sessionsProvidersService.getProvider(session.providerId) : undefined;
	return provider?.getModelPickerOptions(session!.sessionId) ?? DEFAULT_MODEL_PICKER_OPTIONS;
}

/**
 * Whether the session cannot currently produce a request because it has no
 * selectable model and cannot fall back to Auto (its provider reports
 * {@link ISessionModelPickerOptions.showAutoModel} as `false`). Used to
 * disable sending — e.g. the Claude agent for a Copilot Free / Student user
 * shows "No models available" and must not send. Not reactive on its own;
 * callers should re-evaluate when the session provider's
 * {@link ISessionsProvider.onDidChangeModels} fires.
 */
export function sessionHasNoSelectableModel(session: ISession | undefined, sessionsProvidersService: ISessionsProvidersService): boolean {
	if (!session) {
		return false;
	}
	if (getModelsForSession(session, sessionsProvidersService).length > 0) {
		return false;
	}
	return !getModelPickerOptionsForSession(session, sessionsProvidersService).showAutoModel;
}

const DEFAULT_MODEL_PICKER_OPTIONS: ISessionModelPickerOptions = {
	useGroupedModelPicker: true,
	showFeatured: true,
	showUnavailableFeatured: false,
	showManageModelsAction: false,
};

function getVendorFromModelIdentifier(modelIdentifier: string): string | undefined {
	const firstSlash = modelIdentifier.indexOf('/');
	return firstSlash === -1 ? undefined : modelIdentifier.substring(0, firstSlash);
}

/**
 * The sessions-core model picker. Unlike the previous per-provider pickers,
 * this single widget reads the model list from the active session's provider
 * via {@link ISessionsProvider.getModels}, remembers the last used model per
 * provider per session type, and applies the selection through the existing
 * {@link ISessionsProvider.setModel} API. It reuses the shared workbench
 * {@link ModelPickerActionItem} so the dropdown looks and behaves like the
 * other chat model pickers.
 */
export class ModelPicker extends Disposable {

	private readonly _currentModel = observableValue<ILanguageModelChatMetadataAndIdentifier | undefined>('currentModel', undefined);
	private readonly _delegate: IModelPickerDelegate;
	private readonly _modelPicker: ModelPickerActionItem;
	private readonly _providerListener = this._register(new MutableDisposable());
	private _container: HTMLElement | undefined;
	private _lastSessionKey: string | undefined;
	private _lastPushedChatKey: string | undefined;
	private _settingModelInternally = false;

	constructor(
		private readonly _session: IObservable<IActiveSession | undefined>,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@IStorageService private readonly _storageService: IStorageService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@INewChatModelPickerService private readonly _newChatModelPickerService: INewChatModelPickerService,
		@IWorkspaceTrustManagementService private readonly _workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IChatEntitlementService private readonly _chatEntitlementService: IChatEntitlementService,
	) {
		super();

		this._delegate = {
			currentModel: this._currentModel,
			setModel: (model: ILanguageModelChatMetadataAndIdentifier) => {
				const previousModel = this._currentModel.get();
				this._currentModel.set(model, undefined);
				const session = this._session.get();
				if (session) {
					this._storageService.store(modelPickerStorageKey(session.providerId, session.sessionType), model.identifier, StorageScope.PROFILE, StorageTarget.MACHINE);
					this._sessionsProvidersService.getProvider(session.providerId)?.setModel(session.sessionId, model.identifier);
				}
				if (!this._settingModelInternally) {
					reportNewChatPickerClosed(this._telemetryService, {
						id: 'NewChatModelPicker',
						optionIdBefore: previousModel?.identifier,
						optionIdAfter: model.identifier,
						optionLabelBefore: previousModel?.metadata.name,
						optionLabelAfter: model.metadata.name,
						isPII: false,
					});
				}
			},
			getModels: () => [...getModelsForSession(this._session.get(), this._sessionsProvidersService)],
			useGroupedModelPicker: () => getModelPickerOptionsForSession(this._session.get(), this._sessionsProvidersService).useGroupedModelPicker,
			showManageModelsAction: () => getModelPickerOptionsForSession(this._session.get(), this._sessionsProvidersService).showManageModelsAction,
			showUnavailableFeatured: () => getModelPickerOptionsForSession(this._session.get(), this._sessionsProvidersService).showUnavailableFeatured,
			showFeatured: () => getModelPickerOptionsForSession(this._session.get(), this._sessionsProvidersService).showFeatured,
			showAutoModel: () => !!getModelPickerOptionsForSession(this._session.get(), this._sessionsProvidersService).showAutoModel,
			isCacheWarm: () => {
				const session = this._session.get();
				// The session's prompt cache is warm once its first request has
				// been sent (status leaves Untitled), matching the main-window
				// picker which warms as soon as the first request is added.
				return session ? session.status.get() !== SessionStatus.Untitled : false;
			},
		};

		const pickerOptions: IChatInputPickerOptions = {
			compact: observableValue('compact', false),
		};
		const action = { id: 'sessions.modelPicker', label: '', enabled: true, class: undefined, tooltip: '', run: () => { } };
		this._modelPicker = this._register(instantiationService.createInstance(ModelPickerActionItem, action, this._delegate, pickerOptions));
		this._register(this._newChatModelPickerService.registerModelPicker(() => this._modelPicker.openModelPicker()));

		this._initModel();
		this._register(this._languageModelsService.onDidChangeLanguageModels(() => this._initModel()));

		// Re-evaluate when workspace trust changes (or finishes initializing): an
		// untrusted workspace disables the model providers, and the shared widget
		// then renders its Restricted Mode state. Visibility is recomputed so the
		// picker stays visible to surface the "Models" placeholder + the Trust
		// action instead of hiding as an empty picker.
		this._register(this._workspaceTrustManagementService.onDidChangeTrust(() => this._initModel()));
		this._workspaceTrustManagementService.workspaceTrustInitialized.then(() => {
			if (!this._store.isDisposed) {
				this._initModel();
			}
		});

		// Re-evaluate when entitlement / sentiment / anonymous access change: when
		// Chat needs sign-in the shared widget renders a Sign In state, so the
		// picker stays visible to surface it (e.g. after the user signs out/in).
		this._register(this._chatEntitlementService.onDidChangeEntitlement(() => this._initModel()));
		this._register(this._chatEntitlementService.onDidChangeSentiment(() => this._initModel()));
		this._register(this._chatEntitlementService.onDidChangeAnonymous(() => this._initModel()));

		// When the active session changes, re-init (may switch provider or
		// session type). _initModel() calls _delegate.setModel() which already
		// forwards to the provider, so no additional provider.setModel() call is
		// needed.
		this._register(autorun(reader => {
			const session = this._session.read(reader);
			// Re-run when the provider restores model state for an existing
			// session, when an untitled session becomes established after send, or
			// when a new chat starts within the (reused) untitled session.
			session?.modelId.read(reader);
			session?.status.read(reader);
			session?.activeChat.read(reader);

			// Keep the model list fresh while this session is active.
			const provider = session ? this._sessionsProvidersService.getProvider(session.providerId) : undefined;
			this._providerListener.value = provider ? provider.onDidChangeModels(() => this._initModel()) : undefined;

			this._initModel();
		}));
	}

	private _initModel(): void {
		const session = this._session.get();
		const sessionKey = session ? `${session.providerId}/${session.sessionType}` : undefined;

		// Reset the current model when switching provider/session type so we
		// load the remembered model for the new key instead of carrying over.
		if (sessionKey !== this._lastSessionKey) {
			this._currentModel.set(undefined, undefined);
			this._lastSessionKey = sessionKey;
		}

		const models = getModelsForSession(session, this._sessionsProvidersService);
		// When a session type's Auto model is unavailable (e.g. the Claude
		// agent for a Copilot Free / Student user), keep the picker visible even
		// with no models so the shared widget can render its "No models
		// available" state (with an upgrade prompt). Otherwise fall back to the
		// historical behavior of hiding the picker when the provider offers no
		// models.
		const showPicker = this._shouldShowPicker(session);
		this._modelPicker.setEnabled(showPicker);
		this._updateVisibility(showPicker);
		if (models.length === 0) {
			// Clear any stale selection so the shared picker widget re-renders
			// its label (it refreshes on `currentModel` changes). Without this a
			// carried-over "Auto" selection would keep showing instead of the
			// "No models available" empty state.
			if (this._currentModel.get() !== undefined) {
				this._settingModelInternally = true;
				try {
					this._currentModel.set(undefined, undefined);
				} finally {
					this._settingModelInternally = false;
				}
			}
			return;
		}

		const current = this._currentModel.get();
		// Key the "already seeded this chat" check on the active chat resource, not
		// the sessionId: the untitled session is reused across "new chat" actions
		// (back button, new session) with a stable sessionId, while each new chat
		// gets a fresh resource.
		const chatKey = session?.activeChat.get().resource.toString();
		const sessionModelId = session?.modelId.get();
		const sessionModel = sessionModelId ? models.find(m => m.identifier === sessionModelId) : undefined;
		const isNewSession = session?.status.get() === SessionStatus.Untitled;
		this._settingModelInternally = true;
		try {
			if (session && !isNewSession) {
				// Missing session model ids are ambiguous for existing sessions:
				// they can be restore races, or models that were removed. Only
				// repair with a fallback after the saved model's vendor has
				// resolved and confirmed the model is gone.
				if (!sessionModelId || sessionModel || !this._hasResolvedSessionModelVendor(sessionModelId)) {
					this._currentModel.set(sessionModel, undefined);
					this._lastPushedChatKey = chatKey;
					return;
				}

				this._delegate.setModel(this._getFallbackModel(session, models));
				this._lastPushedChatKey = chatKey;
				return;
			}

			const configured = resolveConfiguredModel(this._getConfiguredDefaultModel(), [...models]);
			if (configured && session && chatKey !== this._lastPushedChatKey) {
				// The configured default (`chat.defaultModel`, possibly set by policy)
				// starts every new chat, overriding the remembered and carried-over
				// selection. A manual pick afterwards sticks for that chat.
				this._delegate.setModel(configured);
				this._lastPushedChatKey = chatKey;
			} else if (!current) {
				// No configured default: seed from the session's restored model or
				// the remembered last-used model.
				this._delegate.setModel(sessionModel ?? this._getFallbackModel(session, models));
				this._lastPushedChatKey = chatKey;
			} else if (session && isNewSession && chatKey !== this._lastPushedChatKey && models.some(m => m.identifier === current.identifier)) {
				// Active chat changed (e.g. user switched repository) but the
				// previously selected model is still available. Re-push it so the
				// new chat's provider receives setModel — otherwise the request
				// would be sent with the default model even though the picker UI
				// still shows the user's selection. See #313385.
				this._delegate.setModel(current);
				this._lastPushedChatKey = chatKey;
			}
		} finally {
			this._settingModelInternally = false;
		}
	}

	private _hasResolvedSessionModelVendor(modelIdentifier: string): boolean {
		const vendor = getVendorFromModelIdentifier(modelIdentifier);
		return !!vendor && this._languageModelsService.hasResolvedVendor(vendor);
	}

	private _getFallbackModel(session: ISession | undefined, models: readonly ILanguageModelChatMetadataAndIdentifier[]): ILanguageModelChatMetadataAndIdentifier {
		const rememberedModelId = session ? this._storageService.get(modelPickerStorageKey(session.providerId, session.sessionType), StorageScope.PROFILE) : undefined;
		const remembered = rememberedModelId ? models.find(m => m.identifier === rememberedModelId) : undefined;
		return remembered ?? models[0];
	}

	private _getConfiguredDefaultModel(): string | undefined {
		return this._configurationService.getValue<string>(ChatConfiguration.DefaultModel);
	}

	render(container: HTMLElement): void {
		this._container = container;
		this._modelPicker.render(container);
		this._updateVisibility(this._shouldShowPicker(this._session.get()));
	}

	/**
	 * Whether the model picker should be shown for the given session. Visible
	 * when the session has models, when its Auto model is unavailable (so the
	 * widget can render the "No models available" empty state), or when the
	 * workspace is untrusted / Chat still needs sign-in (so the widget can render
	 * its Restricted Mode or Sign In state). Otherwise hidden, matching the
	 * historical behavior for providers that offer no models.
	 */
	private _shouldShowPicker(session: ISession | undefined): boolean {
		if (getModelsForSession(session, this._sessionsProvidersService).length > 0) {
			return true;
		}
		if (this._modelPicker.isRestrictedMode() || this._modelPicker.isSetupRequired()) {
			return true;
		}
		return !getModelPickerOptionsForSession(session, this._sessionsProvidersService).showAutoModel;
	}

	private _updateVisibility(visible: boolean): void {
		if (this._container) {
			this._container.style.display = visible ? '' : 'none';
		}
	}
}

// -- Action --

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'sessions.modelPicker',
			title: localize2('sessionsModelPicker', "Model"),
			f1: false,
			menu: [{
				id: Menus.NewSessionConfig,
				group: 'navigation',
				order: 1,
				// Hidden on phone when the active provider supplies a combined
				// mode + model picker instead (see MobileChatInputConfigPicker).
				when: ContextKeyExpr.or(IsPhoneLayoutContext.negate(), SessionUsesCombinedConfigPickerContext.negate()),
			}],
		});
	}
	override async run(): Promise<void> { /* handled by action view item */ }
});

// -- Action View Item --

export class ModelPickerActionViewItem extends BaseActionViewItem {
	constructor(private readonly picker: ModelPicker) {
		super(undefined, { id: '', label: '', enabled: true, class: undefined, tooltip: '', run: () => { } });
	}

	override render(container: HTMLElement): void {
		this.picker.render(container);
	}

	override dispose(): void {
		this.picker.dispose();
		super.dispose();
	}
}
