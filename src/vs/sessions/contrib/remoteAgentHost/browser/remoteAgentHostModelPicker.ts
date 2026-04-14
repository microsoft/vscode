/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, observableValue } from '../../../../base/common/observable.js';
import * as nls from '../../../../nls.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { type ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { type IChatInputPickerOptions } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputPickerActionItem.js';
import { ModelPickerActionItem, type IModelPickerDelegate } from '../../../../workbench/contrib/chat/browser/widget/input/modelPickerActionItem.js';
import { ActiveSessionProviderIdContext } from '../../../common/contextkeys.js';
import { type ISession } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { Menus } from '../../../browser/menus.js';

const IsActiveSessionRemoteAgentHost = ContextKeyExpr.regex(ActiveSessionProviderIdContext.key, /^agenthost-/);

// -- Remote Agent Host Model Picker Action --

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'sessions.remoteAgentHost.modelPicker',
			title: nls.localize2('remoteModelPicker', "Model"),
			f1: false,
			menu: [{
				id: Menus.NewSessionConfig,
				group: 'navigation',
				order: 1,
				when: IsActiveSessionRemoteAgentHost,
			}],
		});
	}
	override async run(): Promise<void> { /* handled by action view item */ }
});

// -- Remote Agent Host Model Picker Contribution --

function getRemoteAgentHostModels(
	languageModelsService: ILanguageModelsService,
	session: ISession | undefined,
): ILanguageModelChatMetadataAndIdentifier[] {
	if (!session) {
		return [];
	}
	// Filter models by resource scheme (unique per-connection) rather than
	// sessionType, since remote copilot sessions use the platform
	// COPILOT_CLI_SESSION_TYPE but models are registered under the
	// per-connection vendor.
	const resourceScheme = session.resource.scheme;
	return languageModelsService.getLanguageModelIds()
		.map(id => {
			const metadata = languageModelsService.lookupLanguageModel(id);
			return metadata ? { metadata, identifier: id } : undefined;
		})
		.filter((m): m is ILanguageModelChatMetadataAndIdentifier => !!m && m.metadata.targetChatSessionType === resourceScheme);
}

class RemoteAgentHostModelPickerContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.remoteAgentHostModelPicker';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILanguageModelsService languageModelsService: ILanguageModelsService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
	) {
		super();

		this._register(actionViewItemService.register(
			Menus.NewSessionConfig, 'sessions.remoteAgentHost.modelPicker',
			() => {
				const currentModel = observableValue<ILanguageModelChatMetadataAndIdentifier | undefined>('currentModel', undefined);
				const delegate: IModelPickerDelegate = {
					currentModel,
					setModel: (model: ILanguageModelChatMetadataAndIdentifier) => {
						const session = sessionsManagementService.activeSession.get();
						if (session) {
							const provider = sessionsProvidersService.getProviders().find(p => p.id === session.providerId);
							provider?.setModel(session.sessionId, model.identifier);
						}
					},
					getModels: () => getRemoteAgentHostModels(languageModelsService, sessionsManagementService.activeSession.get()),
					useGroupedModelPicker: () => true,
					showManageModelsAction: () => false,
					showUnavailableFeatured: () => false,
					showFeatured: () => true,
				};
				const pickerOptions: IChatInputPickerOptions = {
					hideChevrons: observableValue('hideChevrons', false),
					hoverPosition: { hoverPosition: HoverPosition.ABOVE },
				};
				const action = { id: 'sessions.remoteAgentHost.modelPicker', label: '', enabled: true, class: undefined, tooltip: '', run: () => { } };
				const modelPicker = instantiationService.createInstance(ModelPickerActionItem, action, delegate, pickerOptions);

				const updatePickerModel = (session: ISession | undefined, sessionModelId: string | undefined) => {
					const models = getRemoteAgentHostModels(languageModelsService, session);
					modelPicker.setEnabled(models.length > 0);
					currentModel.set(sessionModelId ? models.find(model => model.identifier === sessionModelId) : undefined, undefined);
				};
				const updatePickerModelFromActiveSession = () => {
					const session = sessionsManagementService.activeSession.get();
					updatePickerModel(session, session?.modelId.get());
				};
				updatePickerModelFromActiveSession();

				const disposableStore = new DisposableStore();
				disposableStore.add(languageModelsService.onDidChangeLanguageModels(() => updatePickerModelFromActiveSession()));

				disposableStore.add(autorun(reader => {
					const session = sessionsManagementService.activeSession.read(reader);
					const sessionModelId = session?.modelId.read(reader);
					updatePickerModel(session, sessionModelId);
				}));

				return new RemoteAgentHostPickerActionViewItem(modelPicker, disposableStore);
			},
		));
	}
}

class RemoteAgentHostPickerActionViewItem extends BaseActionViewItem {
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

registerWorkbenchContribution2(RemoteAgentHostModelPickerContribution.ID, RemoteAgentHostModelPickerContribution, WorkbenchPhase.AfterRestored);
