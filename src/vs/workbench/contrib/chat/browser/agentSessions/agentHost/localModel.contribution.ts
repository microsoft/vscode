/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { LocalModelEnabledSettingId } from '../../../../../../platform/agentHost/common/localModel.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../common/contributions.js';
import { ILocalModelService } from '../../../../../services/agentHost/common/localModelService.js';
import { LocalModelContextKeysContribution, registerLocalModelActions } from './localModelActions.js';
import { LocalModelReadyNotificationContribution, registerLocalModelReadyOfferCommands } from './localModelReadyNotification.js';
import { LocalModelSetupFlow } from './localModelSetupFlow.js';
import { LocalModelSetupProgress } from './localModelSetupProgress.js';

/** The on-device model flow: confirmations, progress and error notices, the ready offer and context keys. Created only while `chat.copilot.localModel.enabled` is on, so users who haven't opted in pay nothing. */
class LocalModelContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chat.localModel';

	private readonly _enabled = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILocalModelService private readonly _localModelService: ILocalModelService,
	) {
		super();
		this._update();
		this._register(this._configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(LocalModelEnabledSettingId)) {
				this._update();
			}
		}));
	}

	private _update(): void {
		if (this._configurationService.getValue<boolean>(LocalModelEnabledSettingId) !== true) {
			this._enabled.clear();
			return;
		}
		if (this._enabled.value) {
			return;
		}
		const store = new DisposableStore();
		store.add(this._localModelService.registerInteractionHandler(this._instantiationService.createInstance(LocalModelSetupFlow)));
		store.add(this._instantiationService.createInstance(LocalModelSetupProgress));
		store.add(this._instantiationService.createInstance(LocalModelReadyNotificationContribution));
		store.add(this._instantiationService.createInstance(LocalModelContextKeysContribution));
		this._enabled.value = store;
	}
}

registerWorkbenchContribution2(LocalModelContribution.ID, LocalModelContribution, WorkbenchPhase.AfterRestored);
registerLocalModelActions();
registerLocalModelReadyOfferCommands();
