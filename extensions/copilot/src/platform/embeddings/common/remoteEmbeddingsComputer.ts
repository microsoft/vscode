/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RequestType } from '@vscode/copilot-api';
import type { CancellationToken } from 'vscode';
import { CallTracker, TelemetryCorrelationId } from '../../../util/common/telemetryCorrelationId';
import { Limiter } from '../../../util/vs/base/common/async';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { IAuthenticationService } from '../../authentication/common/authentication';
import { IEndpointProvider } from '../../endpoint/common/endpointProvider';
import { IEnvService } from '../../env/common/envService';
import { getGithubMetadataHeaders } from '../../github/common/githubApiFetcherService';
import { logExecTime } from '../../log/common/logExecTime';
import { ILogService } from '../../log/common/logService';
import { IEmbeddingsEndpoint, postRequest } from '../../networking/common/networking';
import { GenAiAttr, GenAiOperationName, GenAiProviderName } from '../../otel/common/genAiAttributes';
import { IOTelService, SpanKind, SpanStatusCode } from '../../otel/common/otelService';
import { ITelemetryService } from '../../telemetry/common/telemetry';
import { ComputeEmbeddingsOptions, Embedding, EmbeddingType, EmbeddingTypeInfo, EmbeddingVector, Embeddings, IEmbeddingsComputer, getWellKnownEmbeddingTypeInfo } from './embeddingsComputer';

interface CAPIEmbeddingResults {
	readonly type: 'success';
	readonly embeddings: EmbeddingVector[];
}
interface CAPIEmbeddingError {
	readonly type: 'failed';
	readonly reason: string;
}

export class RemoteEmbeddingsComputer implements IEmbeddingsComputer {

	declare readonly _serviceBrand: undefined;

	private readonly batchSize = 100;

	constructor(
		@IAuthenticationService private readonly _authService: IAuthenticationService,
		@IEnvService private readonly _envService: IEnvService,
		@ILogService private readonly _logService: ILogService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IEndpointProvider private readonly _endpointProvider: IEndpointProvider,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IOTelService private readonly _otelService: IOTelService,
	) { }

	public async computeEmbeddings(
		embeddingType: EmbeddingType,
		inputs: readonly string[],
		options?: ComputeEmbeddingsOptions,
		telemetryInfo?: TelemetryCorrelationId,
		cancellationToken?: CancellationToken,
	): Promise<Embeddings> {
		const otelSpan = this._otelService.startSpan(`embeddings ${embeddingType.id}`, {
			kind: SpanKind.CLIENT,
			attributes: {
				[GenAiAttr.OPERATION_NAME]: GenAiOperationName.EMBEDDINGS,
				[GenAiAttr.PROVIDER_NAME]: GenAiProviderName.OPENAI,
				[GenAiAttr.REQUEST_MODEL]: embeddingType.id,
				'gen_ai.embeddings.input_count': inputs.length,
			},
		});
		try {
			return await logExecTime(this._logService, 'RemoteEmbeddingsComputer::computeEmbeddings', async () => {

				// Determine endpoint type: use CAPI for no-auth users, otherwise use GitHub
				const copilotToken = await this._authService.getCopilotToken();
				if (copilotToken.isNoAuthUser) {
					const embeddings = await this.computeCAPIEmbeddings(inputs, options, cancellationToken);
					return embeddings ?? { type: embeddingType, values: [] };
				}

				const token = (await this._authService.getGitHubSession('any', { silent: true }))?.accessToken;
				if (!token) {
					throw new Error('No authentication token available');
				}

				const embeddingsOut: Embedding[] = [];
				for (let i = 0; i < inputs.length; i += this.batchSize) {
					const batch = inputs.slice(i, i + this.batchSize);
					if (!batch.length) {
						break;
					}

					const body: {
						inputs: readonly string[];
						input_type: 'document' | 'query';
						embedding_model: string;
					} = {
						inputs: batch,
						input_type: options?.inputType ?? 'document',
						embedding_model: embeddingType.id,
					};
					const response = await this._instantiationService.invokeFunction(postRequest, {
						endpointOrUrl: { type: RequestType.DotcomEmbeddings },
						secretKey: token,
						intent: 'copilot-panel',
						requestId: generateUuid(),
						body: body as any,
						additionalHeaders: getGithubMetadataHeaders(telemetryInfo?.callTracker ?? new CallTracker(), this._envService),
						cancelToken: cancellationToken,
					});
					if (!response.ok) {
						/* __GDPR__
							"remoteEmbeddingsComputer.computeEmbeddings.error" : {
								"owner": "mjbvz",
								"comment": "Total time for searchFileChunks to complete",
								"source": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Caller" },
								"correlationId": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Correlation id" },
								"embeddingType": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Embedding type" },
								"totalInputLength": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Total length of the input" },
								"batchInputLength": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Total length of the batch" },
								"statusCode": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Status code of the response" }
							}
						*/
						this._telemetryService.sendMSFTTelemetryEvent('remoteEmbeddingsComputer.computeEmbeddings.error', {
							source: telemetryInfo?.callTracker.toString(),
							correlationId: telemetryInfo?.correlationId,
							embeddingType: embeddingType.id,
						}, {
							totalInputLength: inputs.length,
							batchInputLength: batch.length,
							statusCode: response.status,
						});
						throw new Error(`Error fetching embeddings: ${response.status}`);
					}

					type EmbeddingResponse = {
						embedding_model: string;
						embeddings: Array<{ embedding: number[] }>;
					};
					const jsonResponse: EmbeddingResponse = await response.json();

					const resolvedType = new EmbeddingType(jsonResponse.embedding_model);
					if (!resolvedType.equals(embeddingType)) {
						throw new Error(`Unexpected embedding model. Got: ${resolvedType}. Expected: ${embeddingType}`);
					}

					if (batch.length !== jsonResponse.embeddings.length) {
						throw new Error(`Mismatched embedding result count. Expected: ${batch.length}. Got: ${jsonResponse.embeddings.length}`);
					}

					embeddingsOut.push(...jsonResponse.embeddings.map(embedding => ({
						type: resolvedType,
						value: embedding.embedding,
					})));
				}

				return { type: embeddingType, values: embeddingsOut };
			});
		} catch (err) {
			otelSpan.setStatus(SpanStatusCode.ERROR, err instanceof Error ? err.message : String(err));
			otelSpan.setAttribute('error.type', err instanceof Error ? err.constructor.name : 'Error');
			otelSpan.recordException(err);
			throw err;
		} finally {
			otelSpan.end();
		}
	}

	private async computeCAPIEmbeddings(
		inputs: readonly string[],
		options?: ComputeEmbeddingsOptions,
		cancellationToken?: CancellationToken,
	) {
		const typeInfo = getWellKnownEmbeddingTypeInfo(EmbeddingType.text3small_512);
		if (!typeInfo) {
			throw new Error(`Embeddings type info not found: ${EmbeddingType.text3small_512}`);
		}
		const endpoint = await this._endpointProvider.getEmbeddingsEndpoint('text3small');
		const batchSize = endpoint.maxBatchSize;
		// Open AI seems to allow 1 less than max tokens for the model requests. So if the max tokens is 8192, we can only send 8191 tokens.
		const maxTokens = endpoint.modelMaxPromptTokens - 1;
		return this.fetchResponseWithBatches(typeInfo, endpoint, inputs, cancellationToken, maxTokens, batchSize);
	}

	/**
	 * A recursive helper that drives the public `fetchResponse` function. This allows accepting a batch and supports backing off the endpoint.
	 * @param inputs The inputs to get embeddings for
	 * @param cancellationToken A cancellation token to allow cancelling the requests
	 * @param batchSize The batch size to calculate
	 * @returns The embeddings
	 */
	private async fetchResponseWithBatches(
		type: EmbeddingTypeInfo,
		endpoint: IEmbeddingsEndpoint,
		inputs: readonly string[],
		cancellationToken: CancellationToken | undefined,
		maxTokens: number,
		batchSize: number,
		parallelism = 1,
	): Promise<Embeddings | undefined> {
		// First we loop through all inputs and count their token length, if one exceeds max tokens then we fail
		for (const input of inputs) {
			const inputTokenLength = await endpoint.acquireTokenizer().tokenLength(input);
			if (inputTokenLength > maxTokens) {
				return undefined;
			}
		}

		let embeddings: EmbeddingVector[] = [];
		const promises: Promise<CAPIEmbeddingResults | undefined>[] = [];
		const limiter = new Limiter<CAPIEmbeddingResults | undefined>(parallelism);
		try {
			for (let i = 0; i < inputs.length; i += batchSize) {
				const currentBatch = inputs.slice(i, i + batchSize);
				promises.push(limiter.queue(async () => {
					if (cancellationToken?.isCancellationRequested) {
						return;
					}

					const r = await this.rawEmbeddingsFetchWithTelemetry(type, endpoint, generateUuid(), currentBatch, cancellationToken);
					if (r.type === 'failed') {
						throw new Error('Embeddings request failed ' + r.reason);
					}
					return r;
				}));
			}

			embeddings = (await Promise.all(promises)).flatMap(response => response?.embeddings ?? []);
		} catch (e) {
			return undefined;
		} finally {
			limiter.dispose();
		}

		if (cancellationToken?.isCancellationRequested) {
			return undefined;
		}

		// If there are no embeddings, return undefined
		if (embeddings.length === 0) {
			return undefined;
		}
		return { type: EmbeddingType.text3small_512, values: embeddings.map((value): Embedding => ({ type: EmbeddingType.text3small_512, value })) };
	}

	private async rawEmbeddingsFetchWithTelemetry(
		type: EmbeddingTypeInfo,
		endpoint: IEmbeddingsEndpoint,
		requestId: string,
		inputs: readonly string[],
		cancellationToken: CancellationToken | undefined
	) {
		const startTime = Date.now();
		const rawRequest = await this.rawEmbeddingsFetch(type, endpoint, requestId, inputs, cancellationToken);
		if (rawRequest.type === 'failed') {
			this._telemetryService.sendMSFTTelemetryErrorEvent('embedding.error', {
				type: rawRequest.type,
				reason: rawRequest.reason
			});
			return rawRequest;
		}

		const tokenizer = endpoint.acquireTokenizer();
		const tokenCounts = await Promise.all(inputs.map(input => tokenizer.tokenLength(input)));
		const inputTokenCount = tokenCounts.reduce((acc, count) => acc + count, 0);
		this._telemetryService.sendMSFTTelemetryEvent('embedding.success', {}, {
			batchSize: inputs.length,
			inputTokenCount,
			timeToComplete: Date.now() - startTime
		});
		return rawRequest;
	}

	/**
	 * The function which actually makes the request to the API and handles failures.
	 * This is separated out from fetchResponse as fetchResponse does some manipulation to the input and handles errors differently
	 */
	public async rawEmbeddingsFetch(
		type: EmbeddingTypeInfo,
		endpoint: IEmbeddingsEndpoint,
		requestId: string,
		inputs: readonly string[],
		cancellationToken: CancellationToken | undefined
	): Promise<CAPIEmbeddingResults | CAPIEmbeddingError> {
		try {
			const token = await this._authService.getCopilotToken();

			const body = { input: inputs, model: type.model, dimensions: type.dimensions };
			endpoint.interceptBody?.(body);
			const response = await this._instantiationService.invokeFunction(postRequest, {
				endpointOrUrl: endpoint,
				secretKey: token.token,
				intent: 'copilot-panel',
				requestId,
				body,
				cancelToken: cancellationToken,
			});
			const jsonResponse = response.status === 200 ? await response.json() : await response.text();

			type EmbeddingResponse = {
				object: string;
				index: number;
				embedding: number[];
			};
			if (response.status === 200 && jsonResponse.data) {
				return { type: 'success', embeddings: jsonResponse.data.map((d: EmbeddingResponse) => d.embedding) };
			} else {
				return { type: 'failed', reason: jsonResponse.error };
			}
		} catch (e) {
			let errorMessage = (e as Error)?.message ?? 'Unknown error';
			// Timeouts = JSON parse errors because the response is incomplete
			if (errorMessage.match(/Unexpected.*JSON/i)) {
				errorMessage = 'timeout';
			}
			return { type: 'failed', reason: errorMessage };

		}
	}
}
