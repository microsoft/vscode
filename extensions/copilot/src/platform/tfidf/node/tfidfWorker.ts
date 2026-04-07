/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { MessagePort, parentPort, workerData } from 'worker_threads';
import { createRpcProxy, RcpResponseHandler, RpcProxy, RpcRequest, RpcResponse } from '../../../util/node/worker';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { Iterable } from '../../../util/vs/base/common/iterator';
import { Lazy } from '../../../util/vs/base/common/lazy';
import { ResourceMap } from '../../../util/vs/base/common/map';
import { StopWatch } from '../../../util/vs/base/common/stopwatch';
import { URI, UriComponents } from '../../../util/vs/base/common/uri';
import { IRange, Range } from '../../../util/vs/editor/common/core/range';
import { FileChunk } from '../../chunking/common/chunk';
import { NaiveChunker } from '../../chunking/node/naiveChunker';
import { NullTelemetryService } from '../../telemetry/common/nullTelemetryService';
import { TokenizationEndpoint, TokenizerProvider } from '../../tokenizer/node/tokenizer';
import { PersistentTfIdf, TfIdfDoc, TfIdfSearchOptions } from './tfidf';
import { rewriteObject } from './tfidfMessaging';

export interface TfIdfWorkerData {
	readonly endpoint: TokenizationEndpoint;
	readonly dbPath: ':memory:' | UriComponents;
}

type Values<T> = T[keyof T];

type Methods<T> = {
	[K in keyof T]: T[K] extends ((...args: any[]) => any) ? T[K] : never;
};

type Message<Api> = Values<{
	[K in keyof Api]: Api[K] extends ((...args: any[]) => any) ? { id: number; fn: K; args: Parameters<Api[K]> } : never;
}>;

function isIRange(obj: any): obj is IRange {
	return obj && typeof obj.startLineNumber === 'number' && typeof obj.startColumn === 'number' && typeof obj.endLineNumber === 'number' && typeof obj.endColumn === 'number';
}

function serialize(value: any): any {
	return rewriteObject(value, obj => {
		if (URI.isUri(obj)) {
			return { $mid: 'uri', ...obj };
		}
		if (isIRange(obj)) {
			return { $mid: 'range', ...obj } as IRange;
		}
	});
}

function revive<T>(value: T): T {
	return rewriteObject(value, (obj: any) => {
		if (obj['$mid'] === 'uri') {
			return URI.from(obj as any);
		}
	});
}

export interface WorkerFileDoc {
	readonly uri: URI;
	readonly hash: string;
	readonly content: string;
}

type TfIdfOperation = 'update' | 'delete';

class Host {
	private readonly _handler = new RcpResponseHandler();

	public readonly proxy: RpcProxy<TfidfHostApi>;

	constructor(port: MessagePort, impl: TfidfWorker) {
		this.proxy = createRpcProxy((name, args) => {
			const { id, result } = this._handler.createHandler();
			port.postMessage({ id, fn: name, args } satisfies RpcRequest);
			return result;
		});

		port.on('message', async (msg: Message<TfidfWorkerApi> | RpcRequest) => {
			if ('fn' in msg) {
				try {
					const res = await ((impl as any)[msg.fn] as any)(...revive(msg.args));
					port.postMessage({ id: msg.id, res: serialize(res) } satisfies RpcResponse);
				} catch (err) {
					port.postMessage({ id: msg.id, err } satisfies RpcResponse);
				}
			} else {
				this._handler.handleResponse(msg);
			}
		});
	}
}

export interface TfidfSearchResults {
	results: readonly FileChunk[];
	telemetry: {
		readonly fileCount: number;
		readonly updatedFileCount: number;

		readonly updateTime: number;
		readonly searchTime: number;
	};
}

export interface TfIdfInitializeTelemetry {
	readonly outOfSyncFileCount: number;
	readonly newFileCount: number;
	readonly deletedFileCount: number;
}

class TfidfWorker {

	private readonly _tfIdf: PersistentTfIdf;
	private readonly _pendingChanges = new ResourceMap<TfIdfOperation>();

	private readonly _chunker: NaiveChunker;

	private readonly _host: Host;

	constructor(port: MessagePort, workerData: TfIdfWorkerData) {
		this._tfIdf = new PersistentTfIdf(workerData.dbPath === ':memory:' ? ':memory:' : URI.from(workerData.dbPath));
		this._chunker = new NaiveChunker(workerData.endpoint, new TokenizerProvider(false, new NullTelemetryService()));
		this._host = new Host(port, this);
	}

	initialize(workspaceDocsIn: ReadonlyArray<{ uri: UriComponents; contentId: string }>): TfIdfInitializeTelemetry {
		const { outOfSyncDocs, newDocs, deletedDocs } = this._tfIdf.initialize(workspaceDocsIn.map(entry => ({
			uri: URI.from(entry.uri),
			contentId: entry.contentId,
		})));

		// Defer actually updating any out of sync docs until we need to do a search
		for (const uri of Iterable.concat(outOfSyncDocs, newDocs)) {
			this._pendingChanges.set(uri, 'update');
		}

		return {
			newFileCount: newDocs.size,
			outOfSyncFileCount: outOfSyncDocs.size,
			deletedFileCount: deletedDocs.size
		};
	}

	addOrUpdate(documents: readonly UriComponents[]): void {
		for (const uri of documents) {
			const revivedUri = URI.from(uri);
			this._pendingChanges.set(revivedUri, 'update');
		}
	}

	delete(uris: readonly UriComponents[]): void {
		for (const uri of uris) {
			const revivedUri = URI.from(uri);
			this._pendingChanges.set(revivedUri, 'delete');
		}
	}

	async search(query: string, options?: TfIdfSearchOptions): Promise<TfidfSearchResults> {
		const sw = new StopWatch();

		const updatedFileCount = this._pendingChanges.size;
		await this._flushPendingChanges();
		const updateTime = sw.elapsed();

		sw.reset();
		const results = await this._tfIdf.search(query, options);
		const searchTime = sw.elapsed();

		return {
			results: results,
			telemetry: {
				fileCount: this._tfIdf.fileCount,
				updatedFileCount,
				updateTime,
				searchTime,
			}
		};
	}

	private async _flushPendingChanges(): Promise<void> {
		if (!this._pendingChanges.size) {
			return;
		}

		const toDelete = Array.from(
			Iterable.filter(this._pendingChanges.entries(), ([_uri, op]) => op === 'delete'),
			([uri]) => uri
		);
		this._tfIdf.delete(toDelete);

		const updatedDocs = Array.from(
			Iterable.filter(this._pendingChanges.entries(), ([_uri, op]) => op === 'update'),
			([uri]): TfIdfDoc => {
				const contentVersionId = new Lazy(() => this._host.proxy.getContentVersionId(uri));
				return {
					uri: uri,
					getContentVersionId: () => contentVersionId.value,
					getChunks: async () => this.getRawNaiveChunks(uri, await this._host.proxy.readFile(uri), CancellationToken.None)
				};
			}
		);

		if (updatedDocs.length) {
			await this._tfIdf.addOrUpdate(updatedDocs);
		}

		this._pendingChanges.clear();
	}

	private async getRawNaiveChunks(uri: URI, text: string, token: CancellationToken): Promise<Iterable<FileChunk>> {
		try {
			const naiveChunks = await this._chunker.chunkFile(uri, text, {}, token);
			return Iterable.map(naiveChunks, (e): FileChunk => {
				return {
					file: uri,
					text: e.text,
					rawText: e.rawText,
					range: Range.lift(e.range),
					isFullFile: e.isFullFile
				};
			});
		} catch (e) {
			console.error(`Could not chunk: ${uri}`, e);
			return [];
		}
	}
}

export type TfidfWorkerApi = Methods<TfidfWorker>;

export interface TfidfHostApi {
	getContentVersionId(uri: URI): Promise<string>;
	readFile(uri: URI): Promise<string>;
}

// #region Main

const port = parentPort;
if (!port) {
	throw new Error(`This module should only be used in a worker thread.`);
}

if (!workerData) {
	throw new Error(`Expected 'workerData' to be provided to the worker thread.`);
}

new TfidfWorker(port, workerData as TfIdfWorkerData);

// #endregion
