/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatRequest, LanguageModelChat, lm } from 'vscode';
import { ConfigKey } from '../../../platform/configuration/common/configurationService';
import { ChatEndpointFamily } from '../../../platform/endpoint/common/endpointProvider';
import { ExtensionContributedChatEndpoint } from '../../../platform/endpoint/vscode-node/extChatEndpoint';
import { IChatEndpoint } from '../../../platform/networking/common/networking';
import { Delayer } from '../../../util/vs/base/common/async';
import { MicrotaskDelay } from '../../../util/vs/base/common/symbols';
import { ProductionEndpointProvider } from './endpointProviderImpl';

export class ScenarioAutomationEndpointProviderImpl extends ProductionEndpointProvider {
	/**
	 * Cached first-non-copilot model. Resolved lazily on first use and invalidated when the
	 * registered chat-model set changes. Without this cache, `getChatEndpoint` would call
	 * `lm.selectChatModels()` (empty selector) on every invocation — which fans out across
	 * all registered vendors and re-resolves each one. In long automation runs that run at
	 * several Hz for the entire turn, this can dominate renderer/CDP traffic.
	 */
	private _firstNonCopilotModelPromise: Promise<LanguageModelChat | undefined> | undefined;
	private _invalidateDelayer: Delayer<void> | undefined;
	private _changeListenerInstalled = false;

	override async getChatEndpoint(requestOrFamilyOrModel: LanguageModelChat | ChatRequest | ChatEndpointFamily): Promise<IChatEndpoint> {
		const isProxyingCAPI = !!this._configService.getConfig(ConfigKey.Shared.DebugOverrideCAPIUrl) || !!this._configService.getConfig(ConfigKey.Shared.DebugOverrideProxyUrl);
		if (this._authService.copilotToken?.isNoAuthUser && !isProxyingCAPI) {
			// When using no auth in scenario automation, we want to force using a custom model / non-copilot for all requests
			const getFirstNonCopilotModel = async () => {
				const firstNonCopilotModel = await this._resolveFirstNonCopilotModel();
				if (firstNonCopilotModel) {
					this._logService.trace(`ScenarioAutomation: using BYOK model ${firstNonCopilotModel.vendor}/${firstNonCopilotModel.id}`);
					return this._instantiationService.createInstance(ExtensionContributedChatEndpoint, firstNonCopilotModel);
				} else {
					this._logService.error(`ScenarioAutomation: no non-copilot models registered`);
					throw new Error('No custom contributed chat models found.');
				}
			};

			// Check if we have a hard-coded family which indicates a copilot model
			if (typeof requestOrFamilyOrModel === 'string') {
				this._logService.trace(`ScenarioAutomation: redirecting family '${requestOrFamilyOrModel}' to BYOK`);
				return getFirstNonCopilotModel();
			}

			// Check if a copilot model was explicitly requested in the picker
			const model = 'model' in requestOrFamilyOrModel ? requestOrFamilyOrModel.model : requestOrFamilyOrModel;
			if (model.vendor === 'copilot') {
				this._logService.trace(`ScenarioAutomation: redirecting copilot model '${model.id}' to BYOK`);
				return getFirstNonCopilotModel();
			}
		}

		try {
			return await super.getChatEndpoint(requestOrFamilyOrModel);
		} catch (error) {
			// In scenario automation, some model families (e.g. copilot-utility-small → gpt-4o-mini) may
			// not be available via the capi proxy. Fall back to copilot-utility.
			if (typeof requestOrFamilyOrModel === 'string') {
				this._logService.warn(`ScenarioAutomation: failed to resolve model family '${requestOrFamilyOrModel}', falling back to copilot-utility: ${error}`);
				return super.getChatEndpoint('copilot-utility');
			}
			throw error;
		}
	}

	private _resolveFirstNonCopilotModel(): Promise<LanguageModelChat | undefined> {
		this._ensureChangeListener();
		if (!this._firstNonCopilotModelPromise) {
			this._firstNonCopilotModelPromise = (async () => {
				try {
					const allModels = await lm.selectChatModels();
					const found = allModels.find(m => m.vendor !== 'copilot');
					this._logService.info(`ScenarioAutomation: resolved BYOK model ${found ? `${found.vendor}/${found.id}` : '<none>'} from ${allModels.length} registered model(s)`);
					return found;
				} catch (err) {
					this._logService.warn(`ScenarioAutomation: selectChatModels failed; clearing cache: ${err}`);
					this._firstNonCopilotModelPromise = undefined;
					throw err;
				}
			})();
		}
		return this._firstNonCopilotModelPromise;
	}

	private _ensureChangeListener(): void {
		if (this._changeListenerInstalled) {
			return;
		}
		this._changeListenerInstalled = true;
		// Coalesce bursts of model-set changes (e.g. when a BYOK provider activates and
		// publishes several utility-alias models in quick succession) into a single
		// invalidation so we don't churn the cache.
		this._invalidateDelayer = this._register(new Delayer<void>(MicrotaskDelay));
		this._register(lm.onDidChangeChatModels(() => {
			this._invalidateDelayer!.trigger(() => {
				this._logService.info(`ScenarioAutomation: chat model set changed; invalidating cached BYOK model`);
				this._firstNonCopilotModelPromise = undefined;
			}).catch(() => { /* cancelled on dispose */ });
		}));
	}
}