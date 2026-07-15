/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { type ISession } from '../../../../services/sessions/common/session.js';

// -- Agent Host Model Helpers --
//
// The desktop agent-host model selection now flows through the sessions-core
// model picker (`contrib/chat/browser/modelPicker.ts`) and the provider's
// `getModels`/`setModel` APIs. These helpers remain because the phone combined
// mode + model sheet (`mobileChatInputConfigPicker.ts` and
// `mobileChatPhoneInputPresenter.ts`) still resolves models directly.

/**
 * Gets the language models registered for the active agent-host session resource scheme.
 */
export function getAgentHostModels(
	languageModelsService: ILanguageModelsService,
	session: ISession | undefined,
): ILanguageModelChatMetadataAndIdentifier[] {
	if (!session) {
		return [];
	}
	// Filter models by resource scheme. For remote agent hosts the scheme is
	// a unique per-connection ID; for local agent hosts it equals the session
	// type. Both are used as the targetChatSessionType when registering
	// models via AgentHostLanguageModelProvider.
	const resourceScheme = session.resource.scheme;
	return languageModelsService.getLanguageModelIds()
		.map(id => {
			const metadata = languageModelsService.lookupLanguageModel(id);
			return metadata ? { metadata, identifier: id } : undefined;
		})
		.filter((m): m is ILanguageModelChatMetadataAndIdentifier => !!m && m.metadata.targetChatSessionType === resourceScheme);
}

export function agentHostModelPickerStorageKey(resourceScheme: string): string {
	return `workbench.agentsession.agentHostModelPicker.${resourceScheme}.selectedModelId`;
}

/**
 * Resolves the model that should be shown for a session.
 */
export function resolveAgentHostModel(
	models: readonly ILanguageModelChatMetadataAndIdentifier[],
	sessionModelId: string | undefined,
	storedModelId: string | undefined,
): ILanguageModelChatMetadataAndIdentifier | undefined {
	const sessionModel = sessionModelId ? models.find(model => model.identifier === sessionModelId) : undefined;
	if (sessionModel) {
		return sessionModel;
	}

	return storedModelId ? models.find(model => model.identifier === storedModelId) : undefined;
}

class AgentHostModelPickerContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.agentHostModelPicker';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILanguageModelsService languageModelsService: ILanguageModelsService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@IStorageService storageService: IStorageService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super();

		// Resolve extension-contributed language model providers while the new-session
		// composer is still visible. Without this, the picker can be built from only
		// the already-registered agent-host BYOK provider on startup, and extension
		// models do not appear until a chat session starts and the regular chat input
		// resolves providers.
		void languageModelsService.selectLanguageModels({}).catch(() => undefined);

		this._register(actionViewItemService.register(
			Menus.NewSessionConfig, 'sessions.agentHost.modelPicker',
			(_action, _options, scopedInstantiationService) => {
				const currentModel = observableValue<ILanguageModelChatMetadataAndIdentifier | undefined>('currentModel', undefined);
				let settingModelInternally = false;
				const delegate: IModelPickerDelegate = {
					currentModel,
					setModel: (model: ILanguageModelChatMetadataAndIdentifier) => {
						const previousModel = currentModel.get();
						currentModel.set(model, undefined);
						const session = sessionsManagementService.activeSession.get();
						if (session) {
							storageService.store(agentHostModelPickerStorageKey(session.resource.scheme), model.identifier, StorageScope.PROFILE, StorageTarget.MACHINE);
							const provider = sessionsProvidersService.getProviders().find(p => p.id === session.providerId);
							provider?.setModel(session.sessionId, model.identifier);
						}
						if (!settingModelInternally) {
							reportNewChatPickerClosed(telemetryService, {
								id: 'NewChatAgentHostModelPicker',
								optionIdBefore: previousModel?.identifier,
								optionIdAfter: model.identifier,
								optionLabelBefore: previousModel?.metadata.name,
								optionLabelAfter: model.metadata.name,
								isPII: false,
							});
						}
					},
					getModels: () => getAgentHostModels(languageModelsService, sessionsManagementService.activeSession.get()),
					useGroupedModelPicker: () => true,
					showManageModelsAction: () => false,
					showUnavailableFeatured: () => false,
					showFeatured: () => true,
				};
				const pickerOptions: IChatInputPickerOptions = {
					compact: observableValue('compact', false),
				};
				const action = { id: 'sessions.agentHost.modelPicker', label: '', enabled: true, class: undefined, tooltip: '', run: () => { } };
				const modelPicker = scopedInstantiationService.createInstance(ModelPickerActionItem, action, delegate, pickerOptions);

				const initModel = (session: ISession | undefined, sessionModelId: string | undefined, isUntitled: boolean) => {
					const models = getAgentHostModels(languageModelsService, session);
					modelPicker.setEnabled(models.length > 0);

					if (!session || models.length === 0) {
						currentModel.set(undefined, undefined);
						return;
					}

					const storedModelId = isUntitled
						? storageService.get(agentHostModelPickerStorageKey(session.resource.scheme), StorageScope.PROFILE)
						: undefined;
					const resolvedModel = resolveAgentHostModel(models, sessionModelId, storedModelId);
					currentModel.set(resolvedModel, undefined);
					if (!sessionModelId && isUntitled && resolvedModel) {
						settingModelInternally = true;
						try {
							delegate.setModel(resolvedModel);
						} finally {
							settingModelInternally = false;
						}
					}
				};
				const initModelFromActiveSession = () => {
					const session = sessionsManagementService.activeSession.get();
					initModel(session, session?.modelId.get(), session?.status.get() === SessionStatus.Untitled);
				};
				initModelFromActiveSession();

				const disposableStore = new DisposableStore();
				disposableStore.add(languageModelsService.onDidChangeLanguageModels(() => initModelFromActiveSession()));

				disposableStore.add(autorun(reader => {
					const session = sessionsManagementService.activeSession.read(reader);
					const sessionModelId = session?.modelId.read(reader);
					const isUntitled = session?.status.read(reader) === SessionStatus.Untitled;
					initModel(session, sessionModelId, isUntitled);
				}));

				return scopedInstantiationService.createInstance(AgentHostPickerActionViewItem, modelPicker, disposableStore);
			},
		));
	}
}

class AgentHostPickerActionViewItem extends BaseActionViewItem {
	constructor(
		private readonly picker: { render(container: HTMLElement): void; openModelPicker(): void; dispose(): void },
		disposable: DisposableStore,
		@INewChatModelPickerService newChatModelPickerService: INewChatModelPickerService,
	) {
		super(undefined, { id: '', label: '', enabled: true, class: undefined, tooltip: '', run: () => { } });
		this._register(newChatModelPickerService.registerModelPicker(() => this.picker.openModelPicker()));
		this._register(disposable);
	}

	override render(container: HTMLElement): void {
		this.picker.render(container);
	}

	override dispose(): void {
		this.picker.dispose();
		super.dispose();
	}
}

registerWorkbenchContribution2(AgentHostModelPickerContribution.ID, AgentHostModelPickerContribution, WorkbenchPhase.AfterRestored);
