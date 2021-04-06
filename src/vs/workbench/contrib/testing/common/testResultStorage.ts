/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { isDefined } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { StoredValue } from 'vs/workbench/contrib/testing/common/storedValue';
import { ISerializedTestResults } from 'vs/workbench/contrib/testing/common/testCollection';
import { HydratedTestResult, ITestResult } from 'vs/workbench/contrib/testing/common/testResult';

export const RETAIN_MAX_RESULTS = 128;
const RETAIN_MIN_RESULTS = 16;
const RETAIN_MAX_BYTES = 1024 * 128;

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

export abstract class BaseTestResultStorage implements ITestResultStorage {
	declare readonly _serviceBrand: undefined;

	private readonly stored = new StoredValue<ReadonlyArray<{ id: string, bytes: number }>>({
		key: 'storedTestResults',
		scope: StorageScope.WORKSPACE,
		target: StorageTarget.MACHINE
	}, this.storageService);

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
	) {
	}

	/**
	 * @override
	 */
	public async read(): Promise<HydratedTestResult[]> {
		const results = await Promise.all(this.stored.get([]).map(async ({ id }) => {
			try {
				const contents = await this.readForResultId(id);
				if (!contents) {
					return undefined;
				}

				return new HydratedTestResult(contents);
			} catch (e) {
				this.logService.warn(`Error deserializing stored test result ${id}`, e);
				return undefined;
			}
		}));

		return results.filter(isDefined);
	}

	/**
	 * @override
	 */
	public async persist(results: ReadonlyArray<ITestResult>): Promise<void> {
		const toDelete = new Map(this.stored.get([]).map(({ id, bytes }) => [id, bytes]));
		const toStore: { id: string; bytes: number }[] = [];
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
				toStore.push({ id: result.id, bytes: existingBytes });
				budget -= existingBytes;
				continue;
			}

			const obj = result.toJSON();
			if (!obj) {
				continue;
			}

			const contents = VSBuffer.fromString(JSON.stringify(obj));
			todo.push(this.storeForResultId(result.id, obj));
			toStore.push({ id: result.id, bytes: contents.byteLength });
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
	 * Deletes serialized results for the test.
	 */
	protected abstract deleteForResultId(id: string): Promise<unknown>;

	/**
	 * Stores test results by ID.
	 */
	protected abstract storeForResultId(id: string, data: ISerializedTestResults): Promise<unknown>;
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
}

export class TestResultStorage extends BaseTestResultStorage {
	private readonly directory: URI;

	constructor(
		@IStorageService storageService: IStorageService,
		@ILogService logService: ILogService,
		@IWorkspaceContextService workspaceContext: IWorkspaceContextService,
		@IFileService private readonly fileService: IFileService,
		@IEnvironmentService environmentService: IEnvironmentService,
	) {
		super(storageService, logService);
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

	private getResultJsonPath(id: string) {
		return URI.joinPath(this.directory, `${id}.json`);
	}
}
