/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { bufferToStream, newWriteableBufferStream, VSBuffer, VSBufferReadableStream, VSBufferWriteableStream } from '../../../../base/common/buffer.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isDefined } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { StoredValue } from './storedValue.js';
import { HydratedTestResult, ITestResult } from './testResult.js';
import { ISerializedTestResults } from './testTypes.js';

export const RETAIN_MAX_RESULTS = 128;
const RETAIN_MIN_RESULTS = 16;
const RETAIN_MAX_BYTES = 1024 * 128;
const CLEANUP_PROBABILITY = 0.2;

export interface ITestResultStorage {
	_serviceBrand: undefined;

	/**
	 * Retrieves the list of stored test results.
	 */
	read(): Promise<HydratedTestResult[]>;

	/**
	 * Persists the list of test results.
	 */
	persist(results: ReadonlyArray<ITestResult>): Promise<void>;
}

export const ITestResultStorage = createDecorator('ITestResultStorage');

/**
 * Data revision this version of VS Code deals with. Should be bumped whenever
 * a breaking change is made to the stored results, which will cause previous
 * revisions to be discarded.
 */
const currentRevision = 1;

export abstract class BaseTestResultStorage extends Disposable implements ITestResultStorage {
	declare readonly _serviceBrand: undefined;

	protected readonly stored: StoredValue<ReadonlyArray<{ rev: number; id: string; bytes: number }>>;

	constructor(
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IStorageService storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.stored = this._register(new StoredValue<ReadonlyArray<{ rev: number; id: string; bytes: number }>>({
			key: 'storedTestResults',
			scope: StorageScope.WORKSPACE,
			target: StorageTarget.MACHINE
		}, storageService));
	}

	/**
	 * @override
	 */
	public async read(): Promise<HydratedTestResult[]> {
		const results = await Promise.all(this.stored.get([]).map(async (rec) => {
			if (rec.rev !== currentRevision) {
				return undefined;
			}

			try {
				const contents = await this.readForResultId(rec.id);
				if (!contents) {
					return undefined;
				}

				return { rec, result: new HydratedTestResult(this.uriIdentityService, contents) };
			} catch (e) {
				this.logService.warn(`Error deserializing stored test result ${rec.id}`, e);
				return undefined;
			}
		}));

		const defined = results.filter(isDefined);
		if (defined.length !== results.length) {
			this.stored.store(defined.map(({ rec }) => rec));
		}

		return defined.map(({ result }) => result);
	}

	/**
	 * @override
	 */
	public getResultOutputWriter(resultId: string) {
		const stream = newWriteableBufferStream();
		this.storeOutputForResultId(resultId, stream);
		return stream;
	}

	/**
	 * @override
	 */
	public async persist(results: ReadonlyArray<ITestResult>): Promise<void> {
		const toDelete = new Map(this.stored.get([]).map(({ id, bytes }) => [id, bytes]));
		const toStore: { rev: number; id: string; bytes: number }[] = [];
		const todo: Promise<unknown>[] = [];
		let budget = RETAIN_MAX_BYTES;

		// Run until either:
		// 1. We store all results
		// 2. We store the max results
		// 3. We store the min results, and have no more byte budget
		for (
			let i = 0;
			i < results.length && i < RETAIN_MAX_RESULTS && (budget > 0 || toStore.length < RETAIN_MIN_RESULTS);
			i++
		) {
			const result = results[i];
			const existingBytes = toDelete.get(result.id);
			if (existingBytes !== undefined) {
				toDelete.delete(result.id);
				toStore.push({ id: result.id, rev: currentRevision, bytes: existingBytes });
				budget -= existingBytes;
				continue;
			}

			const obj = result.toJSON();
			if (!obj) {
				continue;
			}

			const contents = VSBuffer.fromString(JSON.stringify(obj));
			todo.push(this.storeForResultId(result.id, obj));
			toStore.push({ id: result.id, rev: currentRevision, bytes: contents.byteLength });
			budget -= contents.byteLength;
		}

		for (const id of toDelete.keys()) {
			todo.push(this.deleteForResultId(id).catch(() => undefined));
		}

		this.stored.store(toStore);
		await Promise.all(todo);
	}

	/**
	 * Reads serialized results for the test. Is allowed to throw.
	 */
	protected abstract readForResultId(id: string): Promise<ISerializedTestResults | undefined>;

	/**
	 * Reads output as a stream for the test.
	 */
	protected abstract readOutputForResultId(id: string): Promise<VSBufferReadableStream>;

	/**
	 * Reads an output range for the test.
	 */
	protected abstract readOutputRangeForResultId(id: string, offset: number, length: number): Promise<VSBuffer>;

	/**
	 * Deletes serialized results for the test.
	 */
	protected abstract deleteForResultId(id: string): Promise<unknown>;

	/**
	 * Stores test results by ID.
	 */
	protected abstract storeForResultId(id: string, data: ISerializedTestResults): Promise<unknown>;

	/**
	 * Reads serialized results for the test. Is allowed to throw.
	 */
	protected abstract storeOutputForResultId(id: string, input: VSBufferWriteableStream): Promise<void>;
}

export class InMemoryResultStorage extends BaseTestResultStorage {
	public readonly cache = new Map<string, ISerializedTestResults>();

	protected async readForResultId(id: string) {
		return Promise.resolve(this.cache.get(id));
	}

	protected storeForResultId(id: string, contents: ISerializedTestResults) {
		this.cache.set(id, contents);
		return Promise.resolve();
	}

	protected deleteForResultId(id: string) {
		this.cache.delete(id);
		return Promise.resolve();
	}

	protected readOutputForResultId(id: string): Promise<VSBufferReadableStream> {
		throw new Error('Method not implemented.');
	}

	protected storeOutputForResultId(id: string, input: VSBufferWriteableStream): Promise<void> {
		throw new Error('Method not implemented.');
	}

	protected readOutputRangeForResultId(id: string, offset: number, length: number): Promise<VSBuffer> {
		throw new Error('Method not implemented.');
	}
}

export class TestResultStorage extends BaseTestResultStorage {
	private readonly directory: URI;

	constructor(
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@IStorageService storageService: IStorageService,
		@ILogService logService: ILogService,
		@IWorkspaceContextService workspaceContext: IWorkspaceContextService,
		@IFileService private readonly fileService: IFileService,
		@IEnvironmentService environmentService: IEnvironmentService,
	) {
		super(uriIdentityService, storageService, logService);
		this.directory = URI.joinPath(environmentService.workspaceStorageHome, workspaceContext.getWorkspace().id, 'testResults');
	}

	protected async readForResultId(id: string) {
		const contents = await this.fileService.readFile(this.getResultJsonPath(id));
		return JSON.parse(contents.value.toString());
	}

	protected storeForResultId(id: string, contents: ISerializedTestResults) {
		return this.fileService.writeFile(this.getResultJsonPath(id), VSBuffer.fromString(JSON.stringify(contents)));
	}

	protected deleteForResultId(id: string) {
		return this.fileService.del(this.getResultJsonPath(id)).catch(() => undefined);
	}

	protected async readOutputRangeForResultId(id: string, offset: number, length: number): Promise<VSBuffer> {
		try {
			const { value } = await this.fileService.readFile(this.getResultOutputPath(id), { position: offset, length });
			return value;
		} catch {
			return VSBuffer.alloc(0);
		}
	}


	protected async readOutputForResultId(id: string): Promise<VSBufferReadableStream> {
		try {
			const { value } = await this.fileService.readFileStream(this.getResultOutputPath(id));
			return value;
		} catch {
			return bufferToStream(VSBuffer.alloc(0));
		}
	}

	protected async storeOutputForResultId(id: string, input: VSBufferWriteableStream) {
		await this.fileService.createFile(this.getResultOutputPath(id), input);
	}

	/**
	 * @inheritdoc
	 */
	public override async persist(results: ReadonlyArray<ITestResult>) {
		await super.persist(results);
		if (Math.random() < CLEANUP_PROBABILITY) {
			await this.cleanupDereferenced();
		}
	}

	/**
	 * Cleans up orphaned files. For instance, output can get orphaned if it's
	 * written but the editor is closed before the test run is complete.
	 */
	private async cleanupDereferenced() {
		const { children } = await this.fileService.resolve(this.directory);
		if (!children) {
			return;
		}

		const stored = new Set(this.stored.get([]).filter(s => s.rev === currentRevision).map(s => s.id));

		await Promise.all(
			children
				.filter(child => !stored.has(child.name.replace(/\.[a-z]+$/, '')))
				.map(child => this.fileService.del(child.resource).catch(() => undefined))
		);
	}

	private getResultJsonPath(id: string) {
		return URI.joinPath(this.directory, `${id}.json`);
	}

	private getResultOutputPath(id: string) {
		return URI.joinPath(this.directory, `${id}.output`);
	}
}
