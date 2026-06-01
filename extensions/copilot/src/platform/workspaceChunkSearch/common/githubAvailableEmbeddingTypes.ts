/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RequestType } from '@vscode/copilot-api';
import * as l10n from '@vscode/l10n';
import { Result } from '../../../util/common/result';
import { createServiceIdentifier } from '../../../util/common/services';
import { CallTracker } from '../../../util/common/telemetryCorrelationId';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { IAuthenticationService } from '../../authentication/common/authentication';
import { ConfigKey, IConfigurationService } from '../../configuration/common/configurationService';
import { EmbeddingType } from '../../embeddings/common/embeddingsComputer';
import { IEnvService } from '../../env/common/envService';
import { getGithubMetadataHeaders } from '../../github/common/githubApiFetcherService';
import { ILogService } from '../../log/common/logService';
import { Response } from '../../networking/common/fetcherService';
import { getRequest } from '../../networking/common/networking';
import { IExperimentationService } from '../../telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../telemetry/common/telemetry';

export interface AvailableEmbeddingTypes {
	readonly primary: readonly EmbeddingType[];
	readonly deprecated: readonly EmbeddingType[];
}

type GetAvailableTypesError =
	| { type: 'requestFailed'; error: Error }
	| { type: 'unauthorized'; status: 401 | 404 }
	| { type: 'noSession' }
	| { type: 'badResponse'; status: number }
	;

type GetAvailableTypesResult = Result<AvailableEmbeddingTypes, GetAvailableTypesError>;

export const IGithubAvailableEmbeddingTypesService = createServiceIdentifier<IGithubAvailableEmbeddingTypesService>('IGithubAvailableEmbeddingTypesService');

export interface IGithubAvailableEmbeddingTypesService {
	readonly _serviceBrand: undefined;

	/**
	 * Gets the preferred embedding type based on available types and user configuration.
	 * @param silent Whether to silently handle authentication errors
	 * @returns The preferred embedding type or undefined if none available
	 */
	getPreferredType(silent: boolean): Promise<EmbeddingType | undefined>;
}

export class GithubAvailableEmbeddingTypesService implements IGithubAvailableEmbeddingTypesService {

	readonly _serviceBrand: undefined;

	private _cached?: Promise<GetAvailableTypesResult>;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IAuthenticationService private readonly _authService: IAuthenticationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IEnvService private readonly _envService: IEnvService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IExperimentationService private readonly _experimentationService: IExperimentationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		this._cached = this._authService.getGitHubSession('any', { silent: true }).then(session => {
			if (!session) {
				return Result.error<GetAvailableTypesError>({ type: 'noSession' });
			}

			return this.doGetAvailableTypes(session.accessToken);
		});
	}

	private async getAllAvailableTypes(silent: boolean): Promise<GetAvailableTypesResult> {
		if (this._cached) {
			const oldCached = this._cached;
			try {
				const cachedResult = await this._cached;
				if (cachedResult.isOk()) {
					return cachedResult;
				}
			} catch {
				// noop
			}

			if (this._cached === oldCached) {
				this._cached = undefined;
			}
		}

		this._cached ??= (async () => {
			const anySession = await this._authService.getGitHubSession('any', { silent });
			if (!anySession) {
				return Result.error<GetAvailableTypesError>({ type: 'noSession' });
			}

			const initialResult = await this.doGetAvailableTypes(anySession.accessToken);
			if (initialResult.isOk()) {
				return initialResult;
			}

			const permissiveSession = silent
				? await this._authService.getGitHubSession('permissive', { silent })
				: await this._authService.getGitHubSession('permissive', { createIfNone: { detail: l10n.t('Sign in to GitHub with additional permissions to use workspace embeddings.') } });
			if (!permissiveSession) {
				return initialResult;
			}
			return this.doGetAvailableTypes(permissiveSession.accessToken);
		})();

		return this._cached;
	}

	private async doGetAvailableTypes(token: string): Promise<GetAvailableTypesResult> {
		let response: Response;
		try {
			response = await this._instantiationService.invokeFunction(getRequest, {
				endpointOrUrl: { type: RequestType.EmbeddingsModels },
				secretKey: token,
				intent: 'copilot-panel',
				requestId: generateUuid(),
				additionalHeaders: getGithubMetadataHeaders(new CallTracker(), this._envService),
			});
		} catch (e) {
			this._logService.error('Error fetching available embedding types', e);
			return Result.error<GetAvailableTypesError>({
				type: 'requestFailed',
				error: e
			});
		}

		if (!response.ok) {
			/* __GDPR__
				"githubAvailableEmbeddingTypes.getAvailableTypes.error" : {
					"owner": "mjbvz",
					"comment": "Information about failed githubAvailableEmbeddingTypes calls",
					"statusCode": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The response status code" }
				}
			*/
			this._telemetryService.sendMSFTTelemetryEvent('githubAvailableEmbeddingTypes.getAvailableTypes.error', {}, {
				statusCode: response.status,
			});

			// Also treat 404s as unauthorized since this typically indicates that the user is anonymous
			if (response.status === 401 || response.status === 404) {
				return Result.error<GetAvailableTypesError>({ type: 'unauthorized', status: response.status });
			}

			return Result.error<GetAvailableTypesError>({
				type: 'badResponse',
				status: response.status
			});
		}
		type Model = {
			id: string;
			active: boolean;
		};

		type ModelsResponse = {
			models: Model[];
		};

		const jsonResponse: ModelsResponse = await response.json();

		const primary: EmbeddingType[] = [];
		const deprecated: EmbeddingType[] = [];

		for (const model of jsonResponse.models) {
			const resolvedType = new EmbeddingType(model.id);
			if (model.active === false) {
				deprecated.push(resolvedType);
			} else {
				primary.push(resolvedType);
			}
		}

		/* __GDPR__
			"githubAvailableEmbeddingTypes.getAvailableTypes.success" : {
				"owner": "mjbvz",
				"comment": "Information about successful githubAvailableEmbeddingTypes calls",
				"primaryEmbeddingTypes": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "List of primary embedding types" },
				"deprecatedEmbeddingTypes": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "List of deprecated embedding types" }
			}
		*/
		this._telemetryService.sendMSFTTelemetryEvent('githubAvailableEmbeddingTypes.getAvailableTypes.success', {
			primaryEmbeddingTypes: primary.map(type => type.id).join(','),
			deprecatedEmbeddingTypes: deprecated.map(type => type.id).join(','),
		});

		return Result.ok({ primary, deprecated });
	}

	async getPreferredType(silent: boolean): Promise<EmbeddingType | undefined> {
		const result = await this.getAllAvailableTypes(silent);
		if (!result.isOk()) {
			this._logService.info(`GithubAvailableEmbeddingTypesManager: Could not find any available embedding types. Error: ${result.err.type}`);

			/* __GDPR__
				"githubAvailableEmbeddingTypes.getPreferredType.error" : {
					"owner": "mjbvz",
					"comment": "Information about failed githubAvailableEmbeddingTypes calls",
					"error": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The reason why the request failed" }
				}
			*/
			this._telemetryService.sendMSFTTelemetryEvent('githubAvailableEmbeddingTypes.getPreferredType.error', {
				error: result.err.type,
			});

			return undefined;
		}

		const all = result.val;
		this._logService.info(`GithubAvailableEmbeddingTypesManager: Got embeddings. Primary: ${all.primary.join(',')}. Deprecated: ${all.deprecated.join(',')}`);

		const preference = this._configurationService.getExperimentBasedConfig(ConfigKey.Advanced.WorkspacePreferredEmbeddingsModel, this._experimentationService);
		if (preference) {
			const preferred = [...all.primary, ...all.deprecated].find(type => type.id === preference);
			if (preferred) {
				return preferred;
			}
		}

		return all.primary.at(0) ?? all.deprecated.at(0);
	}
}


export class MockGithubAvailableEmbeddingTypesService implements IGithubAvailableEmbeddingTypesService {
	declare readonly _serviceBrand: undefined;

	async getPreferredType(_silent: boolean): Promise<EmbeddingType | undefined> {
		return EmbeddingType.metis_1024_I16_Binary;
	}
}
