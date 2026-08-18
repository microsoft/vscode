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
import { IDefaultAccountService } from '../../defaultAccount/common/defaultAccount.js';
import { INativeManagedSettingsService, isManagedSandboxEnabled, ManagedSettingsData } from '../../policy/common/copilotManagedSettings.js';
import { AGENT_HOST_ENABLED_CONTEXT_KEY, IAgentHostEnablementService } from '../common/agentHostEnablementService.js';

export class AgentHostEnablementService extends Disposable implements IAgentHostEnablementService {

	declare readonly _serviceBrand: undefined;

	readonly enabled: IObservable<boolean>;
	readonly managedSandboxEnforced: IObservable<boolean>;

	constructor(
		private readonly _isAgentHostRuntimeAvailable: boolean,
		configurationService: IConfigurationService,
		contextKeyService: IContextKeyService,
		nativeManagedSettingsService: INativeManagedSettingsService,
		defaultAccountService: IDefaultAccountService,
		/**
		 * File-delivered managed settings. Desktop-only: the file channel is not registered in
		 * web, so this is supplied by the concrete services rather than injected here.
		 */
		fileManagedSettings?: IObservable<ManagedSettingsData | undefined>,
	) {
		super();
		const aiFeaturesDisabled = observableConfigValue(ChatAIDisabledSettingId, false, configurationService);
		this.enabled = derived(this, reader => this._isAgentHostRuntimeAvailable && !aiFeaturesDisabled.read(reader));
		this._register(bindContextKey(AGENT_HOST_ENABLED_CONTEXT_KEY, contextKeyService, reader => this.enabled.read(reader)));

		// `sandbox.enabled` is runtime-owned and has no VS Code configuration policy, so it is read
		// straight from the managed-settings channels rather than through `IConfigurationService`.
		const nativeManagedSettings = observableFromEvent(this,
			nativeManagedSettingsService.onDidChangeManagedSettings,
			() => nativeManagedSettingsService.managedSettings);
		const serverManagedSettings = observableFromEvent(this,
			defaultAccountService.onDidChangePolicyData,
			() => defaultAccountService.policyData?.managedSettings);
		this.managedSandboxEnforced = derived(this, reader => isManagedSandboxEnabled(
			nativeManagedSettings.read(reader),
			serverManagedSettings.read(reader),
			fileManagedSettings?.read(reader)));
	}
}

class BrowserAgentHostEnablementService extends AgentHostEnablementService {
	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@INativeManagedSettingsService nativeManagedSettingsService: INativeManagedSettingsService,
		@IDefaultAccountService defaultAccountService: IDefaultAccountService,
	) {
		super(!isWeb, configurationService, contextKeyService, nativeManagedSettingsService, defaultAccountService);
	}
}

registerSingleton(IAgentHostEnablementService, BrowserAgentHostEnablementService, InstantiationType.Eager);
