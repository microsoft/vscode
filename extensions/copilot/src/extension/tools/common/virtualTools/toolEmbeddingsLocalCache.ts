/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { LanguageModelToolInformation } from 'vscode';
import { Embedding, EmbeddingType } from '../../../../platform/embeddings/common/embeddingsComputer';
import { packEmbedding, unpackEmbedding } from '../../../../platform/embeddings/common/embeddingsStorage';
import { IVSCodeExtensionContext } from '../../../../platform/extContext/common/extensionContext';
import { IFileSystemService } from '../../../../platform/filesystem/common/fileSystemService';
import { readVariableLengthQuantity, writeVariableLengthQuantity } from '../../../../util/common/variableLengthQuantity';
import { RunOnceScheduler } from '../../../../util/vs/base/common/async';
import { VSBuffer, decodeHex, encodeHex } from '../../../../util/vs/base/common/buffer';
import { StringSHA1 } from '../../../../util/vs/base/common/hash';
import { Disposable } from '../../../../util/vs/base/common/lifecycle';
import { LRUCache } from '../../../../util/vs/base/common/map';
import { URI } from '../../../../util/vs/base/common/uri';
import { IToolEmbeddingsCache } from './toolEmbeddingsComputer';

const EMBEDDING_CACHE_FILE_NAME = 'toolEmbeddingsCache.bin';
const CACHE_VERSION = 1;
const SHA1_DIGEST_LENGTH = 20; // SHA-1 produces 20 bytes

/**
 * A local cache for tool embeddings that stores data in an efficient binary format.
 *
 * Binary format:
 * ```
 * [Version(VLQ)][TypeLen(VLQ)][TypeString][EntryCount(VLQ)]
 * [Entry1: Key(20bytes) + EmbedLen(VLQ) + EmbedData]
 * [Entry2: Key(20bytes) + EmbedLen(VLQ) + EmbedData]
 * ...
 * ```
 */
export class ToolEmbeddingLocalCache extends Disposable implements IToolEmbeddingsCache {
	private readonly _storageUri: URI;
	private readonly _lru = new LRUCache<string, Embedding>(1000);
	private readonly _toolHashes = new WeakMap<LanguageModelToolInformation, string>();
	private readonly _storageScheduler = this._register(new RunOnceScheduler(() => this.save(), 5000));
	private readonly _embeddingType: EmbeddingType;

	constructor(
		embeddingType: EmbeddingType,
		@IFileSystemService private readonly _fileSystemService: IFileSystemService,
		@IVSCodeExtensionContext _context: IVSCodeExtensionContext,
	) {
		super();
		this._embeddingType = embeddingType;
		this._storageUri = URI.joinPath(_context.globalStorageUri, EMBEDDING_CACHE_FILE_NAME);
	}

	public async initialize(): Promise<void> {
		try {
			const buffer = VSBuffer.wrap(await this._fileSystemService.readFile(this._storageUri, true));
			let offset = 0;

			// Read version
			const versionResult = readVariableLengthQuantity(buffer, offset);
			offset += versionResult.consumed;
			if (versionResult.value !== CACHE_VERSION) {
				return;
			}

			// Read embedding type and validate it matches
			const typeLengthResult = readVariableLengthQuantity(buffer, offset);
			offset += typeLengthResult.consumed;
			const typeLength = typeLengthResult.value;

			const typeBytes = buffer.slice(offset, offset + typeLength);
			offset += typeLength;
			const storedEmbeddingTypeId = new TextDecoder().decode(typeBytes.buffer);
			const storedEmbeddingType = new EmbeddingType(storedEmbeddingTypeId);

			// If stored type doesn't match current type, discard the cache
			if (!storedEmbeddingType.equals(this._embeddingType)) {
				return;
			}

			// Read number of entries
			const entriesCountResult = readVariableLengthQuantity(buffer, offset);
			offset += entriesCountResult.consumed;
			const entriesCount = entriesCountResult.value;

			// Read each entry
			for (let i = 0; i < entriesCount; i++) {
				// Read key (fixed length SHA-1 digest)
				const keyBytes = buffer.slice(offset, offset + SHA1_DIGEST_LENGTH);
				offset += SHA1_DIGEST_LENGTH;
				const key = encodeHex(keyBytes);

				// Read embedding data length and data
				const embeddingLengthResult = readVariableLengthQuantity(buffer, offset);
				offset += embeddingLengthResult.consumed;
				const embeddingLength = embeddingLengthResult.value;

				const embeddingBytes = buffer.slice(offset, offset + embeddingLength);
				offset += embeddingLength;

				// Unpack embedding and store in cache
				const embedding = unpackEmbedding(this._embeddingType, new Uint8Array(embeddingBytes.buffer));
				this._lru.set(key, embedding);
			}
		} catch {
			// ignored
		}
	}

	public get(tool: LanguageModelToolInformation): Embedding | undefined {
		return this._lru.get(this._getKey(tool));
	}

	public set(tool: LanguageModelToolInformation, embedding: Embedding): void {
		const key = this._getKey(tool);
		this._lru.set(key, embedding);
		this._storageScheduler.schedule();
	}

	private _getKey(tool: LanguageModelToolInformation): string {
		let hash = this._toolHashes.get(tool);
		if (!hash) {
			const sha = new StringSHA1();
			sha.update(tool.name);
			sha.update('\0');
			sha.update(tool.description);
			hash = sha.digest();
			this._toolHashes.set(tool, hash);
		}

		return hash;
	}

	public async save() {
		this._storageScheduler.cancel();

		if (!this._lru.size) {
			return;
		}

		const entries = this._lru.toJSON();
		const buffers: VSBuffer[] = [];

		// Write version
		buffers.push(writeVariableLengthQuantity(CACHE_VERSION));

		// Write embedding type at top level
		const typeBytes = new TextEncoder().encode(this._embeddingType.id);
		buffers.push(writeVariableLengthQuantity(typeBytes.length));
		buffers.push(VSBuffer.wrap(typeBytes));

		// Write number of entries
		buffers.push(writeVariableLengthQuantity(entries.length));

		// Write each entry
		for (const [key, embedding] of entries) {
			// Write key as binary (decode hex string to binary)
			const keyBinary = decodeHex(key);
			buffers.push(VSBuffer.wrap(keyBinary.buffer));

			// Pack and write embedding data (no need to store type per entry)
			const packedEmbedding = packEmbedding(embedding);
			buffers.push(writeVariableLengthQuantity(packedEmbedding.length));
			buffers.push(VSBuffer.wrap(packedEmbedding));
		}

		// Concatenate all buffers and write to file
		const totalBuffer = VSBuffer.concat(buffers);
		await this._fileSystemService.writeFile(this._storageUri, totalBuffer.buffer);
	}
}

