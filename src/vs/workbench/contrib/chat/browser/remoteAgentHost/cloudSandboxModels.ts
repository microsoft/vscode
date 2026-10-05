/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { cancelOnDispose, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { isCancellationError, onUnexpectedError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { ICloudSandboxApiService, ICloudSandboxModelCatalog } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../common/languageModels.js';
import { AgentHostLanguageModelProvider } from '../agentSessions/agentHost/agentHostLanguageModelProvider.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { createDecorator, IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';

export const ICloudSandboxModelCatalogService = createDecorator<ICloudSandboxModelCatalogService>('cloudSandboxModelCatalogService');

export interface ICloudSandboxModelCatalogService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	readonly catalog: ICloudSandboxModelCatalog | undefined;
	load(retry?: boolean): void;
}

/** Shares account-scoped discovery and retry notifications across all sandbox model providers. */
export class CloudSandboxModelCatalogService extends Disposable implements ICloudSandboxModelCatalogService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;
	private readonly _token = cancelOnDispose(this._store);
	private readonly _requestCancellation = this._register(new MutableDisposable<CancellationTokenSource>());
	private readonly _notification = this._register(new MutableDisposable<IDisposable>());
	private _request: Promise<void> | undefined;
	private _requested = false;
	private _generation = 0;
	private _catalog: ICloudSandboxModelCatalog | undefined;
	get catalog(): ICloudSandboxModelCatalog | undefined { return this._catalog; }

	constructor(
		@ICloudSandboxApiService private readonly _api: ICloudSandboxApiService,
		@ILogService private readonly _logService: ILogService,
		@INotificationService private readonly _notificationService: INotificationService,
	) {
		super();
		this._register(this._api.onDidChangeAccount(() => {
			this._generation++;
			this._requestCancellation.value?.cancel();
			this._requestCancellation.clear();
			this._notification.clear();
			this._request = undefined;
			this._catalog = undefined;
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
		this._notification.clear();
		const generation = this._generation;
		const cancellation = new CancellationTokenSource(this._token);
		this._requestCancellation.value = cancellation;
		this._request = (async () => {
			try {
				const catalog = await this._api.listModels(cancellation.token);
				if (this._store.isDisposed || generation !== this._generation) {
					return;
				}
				this._catalog = catalog;
				this._onDidChange.fire();
			} catch (error) {
				if (isCancellationError(error) || this._store.isDisposed || generation !== this._generation) {
					return;
				}
				this._logService.error('[CloudSandboxModels] Failed to load cloud models', error);
				const notification = this._notificationService.prompt(Severity.Error, localize('cloudSandbox.modelsFailed', "Could not load models for GitHub sandboxes."), [{
					label: localize('cloudSandbox.retryModels', "Retry"),
					run: () => this.load(true),
				}]);
				this._notification.value = toDisposable(() => notification.close());
			} finally {
				if (generation === this._generation) {
					this._request = undefined;
					this._requestCancellation.clear();
				}
			}
		})();
	}
}

/** Adapts the shared cloud catalog to one draft or connected host's model identifier space. */
export class CloudSandboxModels extends Disposable {
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;
	private readonly _token = cancelOnDispose(this._store);
	private readonly _provider: AgentHostLanguageModelProvider;
	private _generation = 0;
	models: readonly ILanguageModelChatMetadataAndIdentifier[] = [];
	ready = false;

	constructor(
		sessionType: string,
		vendor: string,
		modelProvider: AgentHostLanguageModelProvider | undefined,
		@ICloudSandboxModelCatalogService private readonly _catalogService: ICloudSandboxModelCatalogService,
		@ILanguageModelsService languageModelsService: ILanguageModelsService,
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
		this._register(this._catalogService.onDidChange(() => {
			void this._updateCatalog().catch(onUnexpectedError);
		}));
		void this._updateCatalog().catch(onUnexpectedError);
	}

	load(retry = false): void {
		this._catalogService.load(retry);
	}

	private async _updateCatalog(): Promise<void> {
		const generation = ++this._generation;
		const catalog = this._catalogService.catalog;
		if (!catalog) {
			this.models = [];
			this.ready = false;
			this._provider.updateAdditionalModels([]);
			this._onDidChange.fire();
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
	}
}
