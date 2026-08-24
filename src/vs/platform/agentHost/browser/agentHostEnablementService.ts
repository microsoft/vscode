/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { derived, IObservable, observableFromEvent } from '../../../base/common/observable.js';
import { isWeb } from '../../../base/common/platform.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { ChatAIDisabledSettingId } from '../../chat/common/chatSettings.js';
import { IContextKeyService } from '../../contextkey/common/contextkey.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { bindContextKey, observableConfigValue } from '../../observable/common/platformObservableUtils.js';
import { COPILOT_SANDBOX_ENABLED_KEY, IManagedSettingsService } from '../../policy/common/copilotManagedSettings.js';
import { AGENT_HOST_ENABLED_CONTEXT_KEY, IAgentHostEnablementService } from '../common/agentHostEnablementService.js';

export class AgentHostEnablementService extends Disposable implements IAgentHostEnablementService {

	declare readonly _serviceBrand: undefined;

	readonly enabled: IObservable<boolean>;
	readonly managedSandboxEnforced: IObservable<boolean>;

	constructor(
		private readonly _isAgentHostRuntimeAvailable: boolean,
		configurationService: IConfigurationService,
		contextKeyService: IContextKeyService,
		managedSettingsService: IManagedSettingsService,
	) {
		super();
		const aiFeaturesDisabled = observableConfigValue(ChatAIDisabledSettingId, false, configurationService);
		this.enabled = derived(this, reader => this._isAgentHostRuntimeAvailable && !aiFeaturesDisabled.read(reader));
		this._register(bindContextKey(AGENT_HOST_ENABLED_CONTEXT_KEY, contextKeyService, reader => this.enabled.read(reader)));

		this.managedSandboxEnforced = observableFromEvent(this,
			managedSettingsService.onDidChangeManagedSettings,
			() => managedSettingsService.getManagedSettingValue(COPILOT_SANDBOX_ENABLED_KEY) === true);
	}
}

class BrowserAgentHostEnablementService extends AgentHostEnablementService {
	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IManagedSettingsService managedSettingsService: IManagedSettingsService,
	) {
		super(!isWeb, configurationService, contextKeyService, managedSettingsService);
	}
}

registerSingleton(IAgentHostEnablementService, BrowserAgentHostEnablementService, InstantiationType.Eager);
