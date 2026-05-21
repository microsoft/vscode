/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { Embedding, EmbeddingType, IEmbeddingsComputer } from '../../../../../platform/embeddings/common/embeddingsComputer';
import { ILogService } from '../../../../../platform/log/common/logService';
import { ITestingServicesAccessor } from '../../../../../platform/test/node/services';
import { CancellationToken } from '../../../../../util/vs/base/common/cancellation';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { IToolEmbeddingsCache, ToolEmbeddingsComputer } from '../../../common/virtualTools/toolEmbeddingsComputer';

class TestToolEmbeddingsComputer extends ToolEmbeddingsComputer {
	constructor(
		private readonly _testCache: Map<string, Embedding>,
		@IEmbeddingsComputer embeddingsComputer: IEmbeddingsComputer,
		@ILogService logService: ILogService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(embeddingsComputer, logService, instantiationService);
	}
	protected override getCaches(instantiationService: IInstantiationService) {
		return {
			embeddingType: EmbeddingType.text3small_512,
			caches: [{
				initialize: () => Promise.resolve(),
				get: t => this._testCache.get(t.name),
				set: () => { /* no-op */ }
			} satisfies IToolEmbeddingsCache]
		};
	}
}


describe('ToolEmbeddingsComputer', () => {
	const token = CancellationToken.None;
	let accessor: ITestingServicesAccessor;
	let embeddingsComputerMock: { _serviceBrand: undefined; computeEmbeddings: Mock };

	function createToolEmbeddingComputer(embeddings: Map<string, Embedding>) {
		const computer = accessor.get(IInstantiationService).createInstance(TestToolEmbeddingsComputer, embeddings);
		return computer;
	}

	function createMockEmbedding(value: number[]): Embedding {
		return {
			type: EmbeddingType.text3small_512,
			value
		};
	}

	beforeEach(() => {
		vi.resetAllMocks();
		const testingServiceCollection = createExtensionUnitTestingServices();
		embeddingsComputerMock = { _serviceBrand: undefined, computeEmbeddings: vi.fn() };
		testingServiceCollection.define(IEmbeddingsComputer, embeddingsComputerMock as any);
		accessor = testingServiceCollection.createTestingAccessor();
	});

	afterEach(() => {
		accessor.dispose();
	});

	it('should return empty array when no tools are available', async () => {
		const availableTools = [] as any;
		const queryEmbedding = createMockEmbedding([1, 0, 0]);

		const computer = createToolEmbeddingComputer(new Map());
		vi.spyOn(computer as any, 'rankEmbeddings').mockReturnValue([]);

		const result = await computer.retrieveSimilarEmbeddingsForAvailableTools(
			queryEmbedding,
			availableTools,
			10,
			token
		);

		expect(result).toEqual([]);
	});

	it('should return tool names for available tools', async () => {
		const availableTools = [{ name: 'tool1' }, { name: 'tool2' }] as any;
		const queryEmbedding = createMockEmbedding([1, 0, 0]);

		const computer = createToolEmbeddingComputer(new Map([
			['tool1', createMockEmbedding([0.9, 0.1, 0])],
			['tool2', createMockEmbedding([0.8, 0.2, 0])],
			['tool3', createMockEmbedding([0, 1, 0])]
		]));

		// Mock rankEmbeddings to return results in order
		vi.spyOn(computer as any, 'rankEmbeddings').mockReturnValue([
			{ value: 'tool1', distance: { value: 0.5, embeddingType: EmbeddingType.text3small_512 } },
			{ value: 'tool2', distance: { value: 0.8, embeddingType: EmbeddingType.text3small_512 } }
		]);

		const result = await computer.retrieveSimilarEmbeddingsForAvailableTools(
			queryEmbedding,
			availableTools,
			10,
			token
		);

		expect(result).toHaveLength(2);
		expect(result[0]).toBe('tool1');
		expect(result[1]).toBe('tool2');
	});

	it('should respect count parameter', async () => {
		const availableTools = [{ name: 'tool1' }, { name: 'tool2' }, { name: 'tool3' }] as any;
		const queryEmbedding = createMockEmbedding([1, 0, 0]);

		const computer = createToolEmbeddingComputer(new Map([
			['tool1', createMockEmbedding([0.9, 0.1, 0])],
			['tool2', createMockEmbedding([0.8, 0.2, 0])],
			['tool3', createMockEmbedding([0, 1, 0])]
		]));

		// Mock rankEmbeddings to return limited results based on count
		vi.spyOn(computer as any, 'rankEmbeddings').mockReturnValue([
			{ value: 'tool1', distance: { value: 0.3, embeddingType: EmbeddingType.text3small_512 } },
			{ value: 'tool2', distance: { value: 0.6, embeddingType: EmbeddingType.text3small_512 } }
		]);

		const result = await computer.retrieveSimilarEmbeddingsForAvailableTools(
			queryEmbedding,
			availableTools,
			2, // Limit to 2 results
			token
		);

		expect(result).toHaveLength(2);
		expect(result[0]).toBe('tool1');
		expect(result[1]).toBe('tool2');
	});

	it('should maintain order from ranking function', async () => {
		const availableTools = [{ name: 'tool1' }, { name: 'tool2' }, { name: 'tool3' }] as any;
		const queryEmbedding = createMockEmbedding([1, 0, 0]);

		const computer = createToolEmbeddingComputer(new Map([
			['tool1', createMockEmbedding([0.9, 0.1, 0])],
			['tool2', createMockEmbedding([0.8, 0.2, 0])],
			['tool3', createMockEmbedding([0, 1, 0])]
		]));
		// Mock rankEmbeddings to return specific order (tool3, tool1, tool2)
		vi.spyOn(computer as any, 'rankEmbeddings').mockReturnValue([
			{ value: 'tool3', distance: { value: 0.1, embeddingType: EmbeddingType.text3small_512 } },
			{ value: 'tool1', distance: { value: 0.5, embeddingType: EmbeddingType.text3small_512 } },
			{ value: 'tool2', distance: { value: 0.9, embeddingType: EmbeddingType.text3small_512 } }
		]);


		const result = await computer.retrieveSimilarEmbeddingsForAvailableTools(
			queryEmbedding,
			availableTools,
			10,
			token
		);

		expect(result).toHaveLength(3);
		expect(result[0]).toBe('tool3');
		expect(result[1]).toBe('tool1');
		expect(result[2]).toBe('tool2');
	});

	it('should handle partial cache hits and compute missing embeddings', async () => {
		const availableTools = [{ name: 'tool1' }, { name: 'tool2' }, { name: 'tool3' }, { name: 'tool4' }] as any;
		const queryEmbedding = createMockEmbedding([1, 0, 0]);


		// Create mock embeddings computer that returns embeddings for missing tools
		embeddingsComputerMock.computeEmbeddings.mockResolvedValue({
			values: [
				createMockEmbedding([0.7, 0.3, 0]), // tool3
				createMockEmbedding([0.5, 0.5, 0])  // tool4
			]
		});

		const computer = createToolEmbeddingComputer(new Map([
			['tool1', createMockEmbedding([0.9, 0.1, 0])],
			['tool2', createMockEmbedding([0.8, 0.2, 0])]
		]));

		vi.spyOn(computer as any, 'rankEmbeddings').mockReturnValue([
			{ value: 'tool1', distance: { value: 0.4, embeddingType: EmbeddingType.text3small_512 } },
			{ value: 'tool4', distance: { value: 0.7, embeddingType: EmbeddingType.text3small_512 } }
		]);

		const result = await computer.retrieveSimilarEmbeddingsForAvailableTools(
			queryEmbedding,
			availableTools,
			10,
			token
		);
		expect(result).toHaveLength(2);
		expect(result[0]).toBe('tool1');
		expect(result[1]).toBe('tool4');
		expect(embeddingsComputerMock.computeEmbeddings).toHaveBeenCalledTimes(1);
		expect(embeddingsComputerMock.computeEmbeddings.mock.calls[0][1]).toEqual(['tool3\n\nundefined', 'tool4\n\nundefined']);
	});

	it('shoulds cache computed embeddings for future use', async () => {
		const availableTools = [{ name: 'tool1' }, { name: 'tool2' }, { name: 'tool3' }] as any;
		const queryEmbedding = createMockEmbedding([1, 0, 0]);

		const computer = createToolEmbeddingComputer(new Map([
			['tool1', createMockEmbedding([0.9, 0.1, 0])]
		]));


		vi.spyOn(computer as any, 'rankEmbeddings').mockReturnValue([
			{ value: 'tool1', distance: { value: 0.2, embeddingType: EmbeddingType.text3small_512 } },
			{ value: 'tool3', distance: { value: 0.5, embeddingType: EmbeddingType.text3small_512 } }
		]);

		embeddingsComputerMock.computeEmbeddings.mockResolvedValue({
			values: [
				createMockEmbedding([0.8, 0.2, 0]), // tool2
				createMockEmbedding([0, 0, 1]) // tool3
			]
		});

		let result = await computer.retrieveSimilarEmbeddingsForAvailableTools(
			queryEmbedding,
			availableTools,
			10,
			token
		);

		expect(result).toHaveLength(2);
		expect(result[0]).toBe('tool1');
		expect(result[1]).toBe('tool3');
		expect(embeddingsComputerMock.computeEmbeddings).toHaveBeenCalledTimes(1);
		expect(embeddingsComputerMock.computeEmbeddings.mock.calls[0][1]).toEqual(['tool2\n\nundefined', 'tool3\n\nundefined']);

		result = await computer.retrieveSimilarEmbeddingsForAvailableTools(
			queryEmbedding,
			availableTools,
			10,
			token
		);

		expect(result).toHaveLength(2);
		expect(result[0]).toBe('tool1');
		expect(result[1]).toBe('tool3');
		expect(embeddingsComputerMock.computeEmbeddings).toHaveBeenCalledTimes(1);
	});
});
