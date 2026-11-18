/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isDeepStrictEqual } from 'util';
import { ErrorUtils } from '../../../util/common/errors';
import { TaskSingler } from '../../../util/common/taskSingler';
import { raceCancellationError } from '../../../util/vs/base/common/async';
import { cancelOnDispose, type CancellationToken, CancellationTokenSource } from '../../../util/vs/base/common/cancellation';
import { Emitter } from '../../../util/vs/base/common/event';
import { CancellationError, isCancellationError } from '../../../util/vs/base/common/errors';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { autorun, observableFromEvent } from '../../../util/vs/base/common/observable';
import { IAuthenticationService } from '../../authentication/common/authentication';
import { CopilotToken } from '../../authentication/common/copilotToken';
import { ICopilotTokenStore } from '../../authentication/common/copilotTokenStore';
import { ICAPIClientService } from '../../endpoint/common/capiClient';
import { getEditorVersionHeaders, IEnvService } from '../../env/common/envService';
import { WireTypes } from '../../inlineEdits/common/dataTypes/inlineEditsModelsTypes';
import { ILogService } from '../../log/common/logService';
import { IFetcherService, Response } from '../../networking/common/fetcherService';
import { IProxyModelsService } from '../common/proxyModelsService';

const MODEL_LOAD_MAX_ATTEMPTS = 3;

export class ProxyModelsService extends Disposable implements IProxyModelsService {
	readonly _serviceBrand: undefined;

	private readonly _onModelListUpdated = this._register(new Emitter<void>());
	public readonly onModelListUpdated = this._onModelListUpdated.event;

	private _models: WireTypes.ModelList.t | undefined;
	/** Token whose account-specific `/models` response is stored in {@link _models}. */
	private _modelsToken: string | undefined;
	private readonly _refreshTaskSingler = new TaskSingler<WireTypes.ModelList.t>();
	private readonly _disposeToken = cancelOnDispose(this._store);

	constructor(
		@ICopilotTokenStore private readonly _tokenStore: ICopilotTokenStore,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@ICAPIClientService private readonly _capiClient: ICAPIClientService,
		@IFetcherService private readonly _fetchService: IFetcherService,
		@ILogService private readonly _logService: ILogService,
		@IEnvService private readonly _envService: IEnvService,
	) {
		super();

		const copilotTokenObs = observableFromEvent(this, this._tokenStore.onDidStoreUpdate, () => this._tokenStore.copilotToken);

		this._register(autorun(reader => {
			const copilotToken = copilotTokenObs.read(reader);
			this._modelsToken = undefined;
			if (!copilotToken) {
				return;
			}
			const cts = new CancellationTokenSource();
			void this._loadModelsForToken(copilotToken, cts.token).catch((e: unknown) => {
				if (!isCancellationError(e)) {
					const err = ErrorUtils.fromUnknown(e);
					this._logService.error(err, 'Failed to fetch models in autorun');
				}
			});
			reader.store.add({ dispose: () => cts.dispose(true) });
		}));
	}

	get models(): WireTypes.ModelList.t | undefined {
		return this._models;
	}

	get nesModels(): WireTypes.Model.t[] | undefined {
		return this._models?.models.filter(model => model.serviceType === 'NESChat');
	}

	get cursorJumpModels(): WireTypes.Model.t[] | undefined {
		return this._models?.models.filter(model => model.serviceType === 'CursorJumpChat');
	}

	get instantApplyModels(): WireTypes.Model.t[] | undefined {
		return this._models?.models.filter(model => model.serviceType === 'InstantApplyChat');
	}

	get modelsLoaded(): boolean {
		const copilotToken = this._tokenStore.copilotToken;
		return copilotToken !== undefined && this._modelsToken === copilotToken.token && this._models !== undefined;
	}

	async ensureModelsLoaded(cancellationToken: CancellationToken): Promise<void> {
		for (let attempt = 0; attempt < MODEL_LOAD_MAX_ATTEMPTS; attempt++) {
			if (cancellationToken.isCancellationRequested || this._disposeToken.isCancellationRequested) {
				throw new CancellationError();
			}
			if (this.modelsLoaded) {
				return;
			}

			const copilotToken = await this._raceCancellation(this._authenticationService.getCopilotToken(), cancellationToken);
			if (await this._loadModelsForToken(copilotToken, cancellationToken)) {
				return;
			}
		}
		throw new Error(`Copilot token changed during ${MODEL_LOAD_MAX_ATTEMPTS} consecutive model load attempts`);
	}

	private async _loadModelsForToken(copilotToken: CopilotToken, cancellationToken: CancellationToken): Promise<boolean> {
		if (cancellationToken.isCancellationRequested || this._disposeToken.isCancellationRequested) {
			throw new CancellationError();
		}
		if (this._tokenStore.copilotToken?.token !== copilotToken.token) {
			return false;
		}
		if (this._modelsToken === copilotToken.token && this._models !== undefined) {
			return true;
		}

		const models = await this._raceCancellation(
			this._refreshTaskSingler.getOrCreate(copilotToken.token, () => this._fetchLatestModels(copilotToken, this._disposeToken)),
			cancellationToken
		);
		if (this._tokenStore.copilotToken?.token !== copilotToken.token) {
			return false;
		}

		this._modelsToken = copilotToken.token;
		if (isDeepStrictEqual(this._models, models)) {
			return true;
		}
		this._models = models;
		this._onModelListUpdated.fire();
		return true;
	}

	private _raceCancellation<T>(promise: Promise<T>, cancellationToken: CancellationToken): Promise<T> {
		return raceCancellationError(raceCancellationError(promise, cancellationToken), this._disposeToken);
	}

	private async _fetchLatestModels(copilotToken: CopilotToken, token: CancellationToken): Promise<WireTypes.ModelList.t> {
		const url = `${this._capiClient.proxyBaseURL}/models`;

		const abortController = this._fetchService.makeAbortController();
		const disposable = token.onCancellationRequested(() => abortController.abort());

		let r: Response;
		try {
			r = await this._fetchService.fetch(url, {
				headers: {
					'Authorization': `Bearer ${copilotToken.token}`,
					...getEditorVersionHeaders(this._envService),
				},
				method: 'GET',
				timeout: 10_000,
				callSite: 'proxy-models',
				signal: abortController.signal,
			});
		} finally {
			disposable.dispose();
		}

		if (!r.ok) {
			throw new Error(`Failed to fetch model list: ${r.status} ${r.statusText}`);
		}

		const jsonData: unknown = await r.json();
		const validatedData = WireTypes.ModelList.validator.validate(jsonData);
		if (validatedData.error) {
			throw new Error(`Invalid /models response data: ${validatedData.error.message}`); // TODO@ulugbekna: add telemetry
		}
		return validatedData.content;
	}

}
