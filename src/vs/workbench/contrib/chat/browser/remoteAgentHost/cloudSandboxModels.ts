/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { cancelOnDispose } from '../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { ICloudSandboxApiService } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../common/languageModels.js';
import { AgentHostLanguageModelProvider } from '../agentSessions/agentHost/agentHostLanguageModelProvider.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';

/** Publishes the pre-provisioning cloud catalog independently of local runtimes and extensions. */
export class CloudSandboxModels extends Disposable {
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;
	private readonly _token = cancelOnDispose(this._store);
	private readonly _provider: AgentHostLanguageModelProvider;
	private _request: Promise<void> | undefined;
	private _requested = false;
	private _generation = 0;
	models: readonly ILanguageModelChatMetadataAndIdentifier[] = [];
	ready = false;

	constructor(
		sessionType: string,
		vendor: string,
		modelProvider: AgentHostLanguageModelProvider | undefined = undefined,
		@ICloudSandboxApiService private readonly _api: ICloudSandboxApiService,
		@ILanguageModelsService languageModelsService: ILanguageModelsService,
		@ILogService private readonly _logService: ILogService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		if (modelProvider) {
			this._provider = modelProvider;
			this._register(toDisposable(() => modelProvider.updateAdditionalModels([])));
		} else {
			const descriptor = { vendor, displayName: localize('cloudSandbox.modelsProvider', "GitHub Sandboxes"), configuration: undefined, managementCommand: undefined, when: undefined };
			languageModelsService.deltaLanguageModelChatProviderDescriptors([descriptor], []);
			this._register(toDisposable(() => languageModelsService.deltaLanguageModelChatProviderDescriptors([], [descriptor])));
			this._provider = this._register(instantiationService.createInstance(AgentHostLanguageModelProvider, sessionType, vendor));
			this._register(languageModelsService.registerLanguageModelProvider(vendor, this._provider));
		}
		this._register(this._api.onDidChangeAccount(() => {
			this._generation++;
			this._request = undefined;
			this.models = [];
			this.ready = false;
			this._provider.updateAdditionalModels([]);
			this._onDidChange.fire();
			if (this._requested) {
				this.load(true);
			}
		}));
	}

	load(retry = false): void {
		if (this._request || (this._requested && !retry)) {
			return;
		}
		this._requested = true;
		const generation = this._generation;
		this._request = (async () => {
			try {
				const catalog = await this._api.listModels(this._token);
				if (this._store.isDisposed || generation !== this._generation) {
					return;
				}
				this._provider.updateAdditionalModels(catalog.models);
				const models = await this._provider.provideLanguageModelChatInfo({}, this._token);
				if (this._store.isDisposed || generation !== this._generation) {
					return;
				}
				this.models = models.map(model => ({
					...model,
					metadata: { ...model.metadata, isDefaultForLocation: { [ChatAgentLocation.Chat]: model.metadata.id === catalog.defaultModel } },
				}));
				this.ready = true;
				this._onDidChange.fire();
			} catch (error) {
				if (isCancellationError(error) || this._store.isDisposed || generation !== this._generation) {
					return;
				}
				this._logService.error('[CloudSandboxModels] Failed to load cloud models', error);
				this._notificationService.prompt(Severity.Error, localize('cloudSandbox.modelsFailed', "Could not load models for GitHub sandboxes."), [{
					label: localize('cloudSandbox.retryModels', "Retry"),
					run: () => this.load(true),
				}]);
			} finally {
				if (generation === this._generation) {
					this._request = undefined;
				}
			}
		})();
	}
}
