/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, test, vi } from 'vitest';
import { createTestExtendedTokenInfo, CopilotToken } from '../../../authentication/common/copilotToken';
import { IAuthenticationService } from '../../../authentication/common/authentication';
import { IEndpointProvider } from '../../../endpoint/common/endpointProvider';
import { NullEnvService } from '../../../env/common/nullEnvService';
import { IEmbeddingsEndpoint } from '../../../networking/common/networking';
import { NoopOTelService } from '../../../otel/common/noopOtelService';
import { resolveOTelConfig } from '../../../otel/common/otelConfig';
import { NullTelemetryService } from '../../../telemetry/common/nullTelemetryService';
import { TestLogService } from '../../../testing/common/testLogService';
import { mock } from '../../../../util/common/test/simpleMock';
import { ITokenizer } from '../../../../util/common/tokenizer';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { EmbeddingType, LEGACY_EMBEDDING_MODEL_ID } from '../../common/embeddingsComputer';
import { RemoteEmbeddingsComputer } from '../../common/remoteEmbeddingsComputer';

class TestAuthenticationService extends mock<IAuthenticationService>() {
	override readonly hasCopilotTokenSource = true;

	override async getCopilotToken(): Promise<CopilotToken> {
		return new CopilotToken(createTestExtendedTokenInfo({ sku: 'no_auth_limited_copilot' }));
	}
}

class TestTokenizer extends mock<ITokenizer>() {
	override async tokenLength(): Promise<number> {
		return 1;
	}
}

class TestEmbeddingsEndpoint extends mock<IEmbeddingsEndpoint>() {
	override readonly maxBatchSize = 100;
	override readonly modelMaxPromptTokens = 8192;

	override acquireTokenizer(): ITokenizer {
		return new TestTokenizer();
	}
}

class TestEndpointProvider extends mock<IEndpointProvider>() {
	readonly requestedFamilies: Array<string | undefined> = [];

	override async getEmbeddingsEndpoint(family?: 'text3small' | 'metis'): Promise<IEmbeddingsEndpoint> {
		this.requestedFamilies.push(family);
		return new TestEmbeddingsEndpoint();
	}
}

describe('RemoteEmbeddingsComputer', () => {
	function createComputer(endpointProvider: IEndpointProvider): RemoteEmbeddingsComputer {
		return new RemoteEmbeddingsComputer(
			new TestAuthenticationService(),
			NullEnvService.Instance,
			new TestLogService(),
			new NullTelemetryService(),
			endpointProvider,
			new class extends mock<IInstantiationService>() { }(),
			new NoopOTelService(resolveOTelConfig({ env: {}, extensionVersion: '1.0.0', sessionId: 'test' })),
		);
	}

	test('returns no Metis embeddings for no-auth users without calling CAPI', async () => {
		const endpointProvider = new TestEndpointProvider();
		const computer = createComputer(endpointProvider);
		const fetch = vi.spyOn(computer, 'rawEmbeddingsFetch');

		const result = await computer.computeEmbeddings(EmbeddingType.metis_1024_I16_Binary, ['input'], { inputType: 'query' });

		expect({
			requestedFamilies: endpointProvider.requestedFamilies,
			fetchCalls: fetch.mock.calls.length,
			resultType: result.type.id,
			values: result.values,
		}).toEqual({
			requestedFamilies: [],
			fetchCalls: 0,
			resultType: EmbeddingType.metis_1024_I16_Binary.id,
			values: [],
		});
	});

	test('preserves the text3small endpoint for text3small embeddings', async () => {
		const endpointProvider = new TestEndpointProvider();
		const computer = createComputer(endpointProvider);
		const fetch = vi.spyOn(computer, 'rawEmbeddingsFetch').mockResolvedValue({
			type: 'success',
			embeddings: [[1, 0]],
		});

		const result = await computer.computeEmbeddings(EmbeddingType.text3small_512, ['input']);

		expect({
			requestedFamilies: endpointProvider.requestedFamilies,
			requestedModel: fetch.mock.calls[0][0].model,
			inputType: fetch.mock.calls[0][4],
			resultType: result.type.id,
		}).toEqual({
			requestedFamilies: ['text3small'],
			requestedModel: LEGACY_EMBEDDING_MODEL_ID.TEXT3SMALL,
			inputType: 'document',
			resultType: EmbeddingType.text3small_512.id,
		});
	});
});
