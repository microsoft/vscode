/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseActionViewItem } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorun, observableValue } from '../../../../../base/common/observable.js';
import * as nls from '../../../../../nls.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { type ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { type IChatInputPickerOptions } from '../../../../../workbench/contrib/chat/browser/widget/input/chatInputPickerActionItem.js';
import { ModelPickerActionItem, type IModelPickerDelegate } from '../../../../../workbench/contrib/chat/browser/widget/input/modelPickerActionItem.js';
import { ActiveSessionProviderIdContext } from '../../../../common/contextkeys.js';
import { type ISession } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { Menus } from '../../../../browser/menus.js';
import { LOCAL_AGENT_HOST_PROVIDER_ID, REMOTE_AGENT_HOST_PROVIDER_RE } from '../../../../common/agentHostSessionsProvider.js';

const IsActiveSessionAgentHost = ContextKeyExpr.or(
	ContextKeyExpr.equals(ActiveSessionProviderIdContext.key, LOCAL_AGENT_HOST_PROVIDER_ID),
	ContextKeyExpr.regex(ActiveSessionProviderIdContext.key, REMOTE_AGENT_HOST_PROVIDER_RE),
);

// -- Agent Host Model Picker Action --

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'sessions.agentHost.modelPicker',
			title: nls.localize2('agentHostModelPicker', "Model"),
			f1: false,
			menu: [{
				id: Menus.NewSessionConfig,
				group: 'navigation',
				order: 1,
				when: IsActiveSessionAgentHost,
			}],
		});
	}
	override async run(): Promise<void> { /* handled by action view item */ }
});

// -- Agent Host Model Picker Contribution --

function getAgentHostModels(
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

const STORAGE_KEY = 'sessions.agentHostModelPicker.selectedModelId';

class AgentHostModelPickerContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.agentHostModelPicker';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILanguageModelsService languageModelsService: ILanguageModelsService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@IStorageService storageService: IStorageService,
	) {
		super();

		this._register(actionViewItemService.register(
			Menus.NewSessionConfig, 'sessions.agentHost.modelPicker',
			() => {
				const currentModel = observableValue<ILanguageModelChatMetadataAndIdentifier | undefined>('currentModel', undefined);
				const delegate: IModelPickerDelegate = {
					currentModel,
					setModel: (model: ILanguageModelChatMetadataAndIdentifier) => {
						currentModel.set(model, undefined);
						storageService.store(STORAGE_KEY, model.identifier, StorageScope.PROFILE, StorageTarget.MACHINE);
						const session = sessionsManagementService.activeSession.get();
						if (session) {
							const provider = sessionsProvidersService.getProviders().find(p => p.id === session.providerId);
							provider?.setModel(session.sessionId, model.identifier);
						}
					},
					getModels: () => getAgentHostModels(languageModelsService, sessionsManagementService.activeSession.get()),
					useGroupedModelPicker: () => true,
					showManageModelsAction: () => false,
					showUnavailableFeatured: () => false,
					showFeatured: () => true,
				};
				const pickerOptions: IChatInputPickerOptions = {
					hideChevrons: observableValue('hideChevrons', false),
				};
				const action = { id: 'sessions.agentHost.modelPicker', label: '', enabled: true, class: undefined, tooltip: '', run: () => { } };
				const modelPicker = instantiationService.createInstance(ModelPickerActionItem, action, delegate, pickerOptions);

				const rememberedModelId = storageService.get(STORAGE_KEY, StorageScope.PROFILE);
				const initModel = (session: ISession | undefined, sessionModelId: string | undefined) => {
					const models = getAgentHostModels(languageModelsService, session);
					modelPicker.setEnabled(models.length > 0);

					let resolvedModel = sessionModelId
						? models.find(model => model.identifier === sessionModelId)
						: undefined;

					// When no model is explicitly selected, restore the
					// remembered model or pick the first available one so
					// the picker shows a real model name instead of the
					// misleading "Auto" label (the copilot "auto"
					// pseudo-model is not available in agent host sessions).
					if (!resolvedModel && models.length > 0) {
						const remembered = rememberedModelId ? models.find(m => m.identifier === rememberedModelId) : undefined;
						resolvedModel = remembered ?? models[0];
						delegate.setModel(resolvedModel);
					}

					currentModel.set(resolvedModel, undefined);
				};
				const initModelFromActiveSession = () => {
					const session = sessionsManagementService.activeSession.get();
					initModel(session, session?.modelId.get());
				};
				initModelFromActiveSession();

				const disposableStore = new DisposableStore();
				disposableStore.add(languageModelsService.onDidChangeLanguageModels(() => initModelFromActiveSession()));

				disposableStore.add(autorun(reader => {
					const session = sessionsManagementService.activeSession.read(reader);
					const sessionModelId = session?.modelId.read(reader);
					initModel(session, sessionModelId);
				}));

				// When the active session changes, push the selected model to the new session
				disposableStore.add(autorun(reader => {
					const session = sessionsManagementService.activeSession.read(reader);
					const model = currentModel.read(reader);
					if (session && model) {
						const provider = sessionsProvidersService.getProviders().find(p => p.id === session.providerId);
						provider?.setModel(session.sessionId, model.identifier);
					}
				}));

				return new AgentHostPickerActionViewItem(modelPicker, disposableStore);
			},
		));
	}
}

class AgentHostPickerActionViewItem extends BaseActionViewItem {
	constructor(private readonly picker: { render(container: HTMLElement): void; dispose(): void }, disposable?: DisposableStore) {
		super(undefined, { id: '', label: '', enabled: true, class: undefined, tooltip: '', run: () => { } });
		if (disposable) {
			this._register(disposable);
		}
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
