/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { IComparisonTarget } from '../common/comparison.js';
import { supportsComparison } from './sessionComparisonService.js';

interface IModelItem extends IQuickPickItem {
	readonly modelId: string;
}

export class ComparisonTargetPicker {
	constructor(
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@ISessionsProvidersService private readonly providersService: ISessionsProvidersService,
		@ISessionsManagementService private readonly managementService: ISessionsManagementService,
	) { }

	async pick(folderUri: URI, token: CancellationToken): Promise<IComparisonTarget | undefined> {
		const targets = this.managementService.getSessionTypesForFolder(folderUri).flatMap(target => {
			const provider = this.providersService.getProvider(target.providerId);
			return provider && supportsComparison(provider, folderUri, target.sessionType.id)
				? [{ label: target.sessionType.label, description: provider.label, target, provider }]
				: [];
		});
		if (!targets.length) {
			throw new Error(localize('comparison.noProviders', "No available agents support isolated worktrees in this folder. Connect a compatible agent and choose a Git repository."));
		}
		const selected = await this.quickInputService.pick(targets, {
			title: localize('comparison.pickAgent', "Compare Implementations: Choose Agent"),
			placeHolder: localize('comparison.pickAgentHint', "Only agents supporting isolated worktrees are shown"),
			matchOnDescription: true,
		}, token);
		if (!selected || token.isCancellationRequested) { return undefined; }
		const { provider, target } = selected;
		const draft = provider.createNewSession(folderUri, target.sessionType.id);
		const store = new DisposableStore();
		try {
			const picker = store.add(this.quickInputService.createQuickPick<IModelItem>());
			picker.title = localize('comparison.pickModel', "Compare Implementations: Choose Model");
			picker.placeholder = localize('comparison.pickModelHint', "Choose a model; you can sample the same model more than once");
			picker.matchOnDescription = true;
			const updateState = () => {
				picker.busy = picker.items.length === 0 && draft.loading.get();
				picker.validationMessage = !picker.busy && picker.items.length === 0
					? localize('comparison.noModels', "No models are available for this agent. Check its connection and model access.")
					: undefined;
			};
			const update = () => {
				picker.items = provider.getModelsSnapshot(draft.sessionId).models
					.filter(model => model.metadata.isUserSelectable !== false)
					.map(model => ({ modelId: model.identifier, label: model.metadata.name, description: model.metadata.pricing ?? model.metadata.detail }));
				updateState();
			};
			const choice = new Promise<IModelItem | undefined>(resolve => {
				store.add(picker.onDidAccept(() => {
					if (picker.selectedItems[0]) { resolve(picker.selectedItems[0]); picker.hide(); }
				}));
				store.add(picker.onDidHide(() => resolve(undefined)));
				store.add(token.onCancellationRequested(() => { resolve(undefined); picker.hide(); }));
			});
			store.add(provider.onDidChangeModels(update));
			store.add(Event.fromObservableLight(draft.loading)(updateState));
			update();
			picker.show();
			const model = await choice;
			return model ? {
				providerId: target.providerId, sessionTypeId: target.sessionType.id,
				providerLabel: localize('comparison.providerLabel', "{0} · {1}", target.sessionType.label, provider.label),
				modelId: model.modelId, modelLabel: model.label,
			} : undefined;
		} finally {
			store.dispose();
			provider.deleteNewSession(draft.sessionId);
		}
	}
}
