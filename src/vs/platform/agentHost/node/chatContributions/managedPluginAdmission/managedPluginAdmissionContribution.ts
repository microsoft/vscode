/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { ILogService } from '../../../../log/common/log.js';
import { type IAgentHostChatContribution, type IAgentHostChatContributionContext, type IIncomingRequest, type IncomingRequestDisposition } from '../../../common/agentHostChatContributionsService.js';
import { isCustomizationEnabled } from '../../../common/customizationEnablement.js';
import { readClientPluginIdentity } from '../../../common/meta/clientPluginIdentityMeta.js';
import { CustomizationLoadStatus, CustomizationType } from '../../../common/state/protocol/state.js';
import { AgentHostManagedSettingsService, IAgentHostManagedSettingsService } from '../../agentHostManagedSettingsService.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';

export class ManagedPluginAdmissionContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'managedPluginAdmission';
	readonly order = 75;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@IAgentHostManagedSettingsService private readonly _managedSettingsService: AgentHostManagedSettingsService,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	onIncomingRequest(request: IIncomingRequest): IncomingRequestDisposition | undefined {
		const required = Object.entries(this._managedSettingsService.enabledPlugins)
			.filter(([, enabled]) => enabled)
			.map(([pluginId]) => pluginId);
		if (required.length === 0) {
			return undefined;
		}

		const loaded = new Set<string>();
		for (const customization of this._stateManager.getSessionState(request.session)?.customizations ?? []) {
			if (customization.type !== CustomizationType.Plugin
				|| customization.load?.kind !== CustomizationLoadStatus.Loaded
				|| !isCustomizationEnabled(customization)) {
				continue;
			}
			const pluginId = readClientPluginIdentity(customization);
			if (pluginId) {
				loaded.add(pluginId);
			}
		}

		const unavailable = required.filter(pluginId => !loaded.has(pluginId));
		if (unavailable.length === 0) {
			return undefined;
		}

		this._logService.warn(`[ManagedPluginAdmissionContribution] Rejecting turn because required plugins are unavailable: ${unavailable.join(', ')}`);
		return {
			kind: 'reject',
			error: {
				errorType: 'managedPluginUnavailable',
				message: unavailable.length === 1
					? localize('managedPluginUnavailable', "The plugin \"{0}\" is required by your organization but is not available. Install or repair the plugin before continuing.", unavailable[0])
					: localize('managedPluginsUnavailable', "The following plugins are required by your organization but are not available: {0}. Install or repair the plugins before continuing.", unavailable.join(', ')),
			},
			stage: 'validation',
		};
	}
}
