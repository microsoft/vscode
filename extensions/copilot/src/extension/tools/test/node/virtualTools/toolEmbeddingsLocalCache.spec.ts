/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LanguageModelToolInformation } from 'vscode';
import { Embedding, EmbeddingType } from '../../../../../platform/embeddings/common/embeddingsComputer';
import { IVSCodeExtensionContext } from '../../../../../platform/extContext/common/extensionContext';
import { IFileSystemService } from '../../../../../platform/filesystem/common/fileSystemService';
import { MockFileSystemService } from '../../../../../platform/filesystem/node/test/mockFileSystemService';
import { ITestingServicesAccessor } from '../../../../../platform/test/node/services';
import { DisposableStore } from '../../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../../util/vs/base/common/uri';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { ToolEmbeddingLocalCache } from '../../../common/virtualTools/toolEmbeddingsLocalCache';

// Enhanced MockFileSystemService that supports writeFile for testing
class TestableFileSystemService extends MockFileSystemService {
	private writtenFiles = new Map<string, Uint8Array>();

	override async writeFile(uri: URI, content: Uint8Array): Promise<void> {
		const uriString = uri.toString();
		this.writtenFiles.set(uriString, content);

		// Make the file available for reading
		const contentString = Buffer.from(content).toString('base64');
		this.mockFile(uri, contentString);
	}

	override async readFile(uri: URI): Promise<Uint8Array> {
		const uriString = uri.toString();

		// Check if file was written in this test session
		if (this.writtenFiles.has(uriString)) {
			return this.writtenFiles.get(uriString)!;
		}

		// Fall back to mocked files (return as base64 decoded)
		try {
			const base64Content = await super.readFile(uri);
			return Buffer.from(new TextDecoder().decode(base64Content), 'base64');
		} catch {
			throw new Error('ENOENT');
		}
	}

	getWrittenContent(uri: URI): Uint8Array | undefined {
		return this.writtenFiles.get(uri.toString());
	}
}

describe('ToolEmbeddingLocalCache', () => {
	let disposables: DisposableStore;
	let accessor: ITestingServicesAccessor;
	let mockFileSystem: TestableFileSystemService;
	let cache: ToolEmbeddingLocalCache;
	let mockContext: IVSCodeExtensionContext;
	let embeddingType: EmbeddingType;

	// Sample test data
	const createSampleTool = (name: string, description: string = `Description for ${name}`): LanguageModelToolInformation => ({
		name,
		description
	} as LanguageModelToolInformation);

	const createSampleEmbedding = (type: EmbeddingType, values: number[] = [0.1, 0.2, 0.3, 0.4]): Embedding => ({
		type,
		value: values
	});

	// Helper to create embeddings with Float32 precision for accurate testing
	const createFloat32Embedding = (type: EmbeddingType, values: number[]): Embedding => ({
		type,
		value: Array.from(Float32Array.from(values))
	});

	// Helper to compare embeddings with Float32 tolerance
	const expectEmbeddingToEqual = (actual: Embedding | undefined, expected: Embedding) => {
		expect(actual).toBeDefined();
		expect(actual!.type).toEqual(expected.type);
		expect(actual!.value.length).toBe(expected.value.length);
		// Compare with Float32 precision
		actual!.value.forEach((actualVal, i) => {
			const expectedVal = expected.value[i];
			expect(Math.abs(actualVal - expectedVal)).toBeLessThan(1e-5);
		});
	};

	beforeEach(() => {
		disposables = new DisposableStore();
		const testingServiceCollection = disposables.add(createExtensionUnitTestingServices());
		mockFileSystem = new TestableFileSystemService();
		testingServiceCollection.set(IFileSystemService, mockFileSystem);
		testingServiceCollection.set(IVSCodeExtensionContext, { globalStorageUri: URI.file('/tmp') } as any);
		accessor = testingServiceCollection.createTestingAccessor();
		mockContext = accessor.get(IVSCodeExtensionContext);
		embeddingType = EmbeddingType.text3small_512;

		// Create cache instance
		cache = disposables.add(new ToolEmbeddingLocalCache(
			embeddingType,
			mockFileSystem,
			mockContext
		));
	});

	afterEach(() => {
		disposables.dispose();
	});

	describe('Basic Operations', () => {
		it('should initialize without error when no cache file exists', async () => {
			await expect(cache.initialize()).resolves.not.toThrow();
		});

		it('should get undefined for non-existent tool', () => {
			const tool = createSampleTool('nonexistent');
			expect(cache.get(tool)).toBeUndefined();
		});

		it('should store and retrieve embeddings', () => {
			const tool = createSampleTool('test-tool');
			const embedding = createSampleEmbedding(embeddingType);

			cache.set(tool, embedding);
			const retrieved = cache.get(tool);

			expect(retrieved).toEqual(embedding);
		});

		it('should generate consistent keys for same tool', () => {
			const tool1 = createSampleTool('same-tool', 'description');
			const tool2 = createSampleTool('same-tool', 'description');
			const embedding = createSampleEmbedding(embeddingType);

			cache.set(tool1, embedding);
			const retrieved = cache.get(tool2);

			expect(retrieved).toEqual(embedding);
		});

		it('should generate different keys for different tools', () => {
			const tool1 = createSampleTool('tool1');
			const tool2 = createSampleTool('tool2');
			const embedding1 = createSampleEmbedding(embeddingType, [0.1, 0.2]);
			const embedding2 = createSampleEmbedding(embeddingType, [0.3, 0.4]);

			cache.set(tool1, embedding1);
			cache.set(tool2, embedding2);

			expect(cache.get(tool1)).toEqual(embedding1);
			expect(cache.get(tool2)).toEqual(embedding2);
		});
	});

	describe('Persistence', () => {
		it('should save and load cache to/from binary format', async () => {
			const tool1 = createSampleTool('persistent-tool-1');
			const tool2 = createSampleTool('persistent-tool-2');
			const embedding1 = createFloat32Embedding(embeddingType, [0.1, 0.2, 0.3, 0.4]);
			const embedding2 = createFloat32Embedding(embeddingType, [0.5, 0.6, 0.7, 0.8]);

			// Store embeddings
			cache.set(tool1, embedding1);
			cache.set(tool2, embedding2);

			// Manually save
			cache.save();

			// Verify file was written
			const cacheUri = URI.joinPath(mockContext.globalStorageUri, 'toolEmbeddingsCache.bin');
			const writtenContent = mockFileSystem.getWrittenContent(cacheUri);
			expect(writtenContent).toBeDefined();
			expect(writtenContent!.length).toBeGreaterThan(0);

			// Create new cache and load
			const newCache = disposables.add(new ToolEmbeddingLocalCache(
				embeddingType,
				mockFileSystem,
				mockContext
			));

			await newCache.initialize();

			// Verify loaded data with Float32 precision
			expectEmbeddingToEqual(newCache.get(tool1), embedding1);
			expectEmbeddingToEqual(newCache.get(tool2), embedding2);
		});

		it('should discard cache when embedding type does not match', async () => {
			const tool = createSampleTool('type-mismatch-tool');
			const embedding = createSampleEmbedding(embeddingType);

			// Store with current type
			cache.set(tool, embedding);
			cache.save();

			// Create cache with different embedding type
			const differentType = EmbeddingType.metis_1024_I16_Binary;
			const newCache = disposables.add(new ToolEmbeddingLocalCache(
				differentType,
				mockFileSystem,
				mockContext
			));

			await newCache.initialize();

			// Should not find the embedding due to type mismatch
			expect(newCache.get(tool)).toBeUndefined();
		});

		it('should handle corrupted cache file gracefully', async () => {
			const cacheUri = URI.joinPath(mockContext.globalStorageUri, 'toolEmbeddingsCache.bin');

			// Write corrupted data
			const corruptedData = new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF]);
			await mockFileSystem.writeFile(cacheUri, corruptedData);

			// Should not throw and should start with empty cache
			await expect(cache.initialize()).resolves.not.toThrow();

			const tool = createSampleTool('test-after-corruption');
			expect(cache.get(tool)).toBeUndefined();
		});

		it('should handle version mismatch gracefully', async () => {
			const tool = createSampleTool('version-test-tool');
			const embedding = createSampleEmbedding(embeddingType);

			// Store with current implementation
			cache.set(tool, embedding);
			cache.save();

			// Modify the saved file to have wrong version (overwrite first bytes)
			const cacheUri = URI.joinPath(mockContext.globalStorageUri, 'toolEmbeddingsCache.bin');
			const currentContent = mockFileSystem.getWrittenContent(cacheUri)!;
			const modifiedContent = new Uint8Array(currentContent);
			modifiedContent[0] = 99; // Invalid version
			await mockFileSystem.writeFile(cacheUri, modifiedContent);

			// Create new cache
			const newCache = disposables.add(new ToolEmbeddingLocalCache(
				embeddingType,
				mockFileSystem,
				mockContext
			));

			await newCache.initialize();

			// Should start with empty cache due to version mismatch
			expect(newCache.get(tool)).toBeUndefined();
		});
	});

	describe('Binary Format Efficiency', () => {
		it('should use binary format with fixed-length keys', async () => {
			const tool = createSampleTool('efficiency-test');
			const embedding = createSampleEmbedding(embeddingType, new Array(512).fill(0).map((_, i) => i / 512));

			cache.set(tool, embedding);
			cache.save();

			const cacheUri = URI.joinPath(mockContext.globalStorageUri, 'toolEmbeddingsCache.bin');
			const content = mockFileSystem.getWrittenContent(cacheUri)!;

			// Should be much smaller than JSON would be
			// A JSON representation would be several KB, binary should be much less
			expect(content.length).toBeLessThan(3000); // Reasonable upper bound
			expect(content.length).toBeGreaterThan(100); // Has actual content
		});
	});

	describe('Multiple Tool Scenarios', () => {
		it('should handle many tools efficiently', async () => {
			const tools: LanguageModelToolInformation[] = [];
			const embeddings: Embedding[] = [];

			// Create 50 tools with different embeddings
			for (let i = 0; i < 50; i++) {
				const tool = createSampleTool(`bulk-tool-${i}`, `Description ${i}`);
				const embedding = createSampleEmbedding(embeddingType, [i, i + 0.1, i + 0.2, i + 0.3]);

				tools.push(tool);
				embeddings.push(embedding);
				cache.set(tool, embedding);
			}

			await cache.save();

			const newCache = disposables.add(new ToolEmbeddingLocalCache(
				embeddingType,
				mockFileSystem,
				mockContext
			));

			await newCache.initialize();

			// Verify all can be retrieved
			tools.forEach((tool, i) => {
				expect(cache.get(tool)).toEqual(embeddings[i]);
				expectEmbeddingToEqual(newCache.get(tool), embeddings[i]);
			});
		});
	});
});
