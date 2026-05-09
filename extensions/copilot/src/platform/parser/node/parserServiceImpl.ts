/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WorkerWithRpcProxy } from '../../../util/node/worker';
import { Lazy } from '../../../util/vs/base/common/lazy';
import * as path from '../../../util/vs/base/common/path';
import { TreeSitterOffsetRange, TreeSitterPointRange } from './nodes';
import * as parser from './parserImpl';
import { IParserService, ParserWorkerTimeoutError, TreeSitterAST } from './parserService';
import { WASMLanguage, getWasmLanguage } from './treeSitterLanguages';

const workerPath = path.join(__dirname, 'worker2.js');
type ParserType = Omit<typeof parser, '_getNodeMatchingSelection'>;

export class ParserServiceImpl implements IParserService {

	declare readonly _serviceBrand: undefined;

	private _parser: WorkerOrLocal<ParserType>;

	constructor(
		useWorker: boolean
	) {
		this._parser = new WorkerOrLocal<ParserType>(parser, workerPath, useWorker);
	}

	dispose(): void {
		this._parser.dispose();
	}

	getTreeSitterAST(textDocument: { readonly languageId: string; getText(): string }): TreeSitterAST | undefined {
		const wasmLanguage = getWasmLanguage(textDocument.languageId);
		if (!wasmLanguage) {
			return undefined;
		}
		return this.getTreeSitterASTForWASMLanguage(wasmLanguage, textDocument.getText());
	}

	getTreeSitterASTForWASMLanguage(wasmLanguage: WASMLanguage, source: string): TreeSitterAST {
		const parserProxy = this._parser.proxy;
		return {
			getFunctionBodies: () => parserProxy._getFunctionBodies(wasmLanguage, source),
			getCoarseParentScope: (range: TreeSitterPointRange) => parserProxy._getCoarseParentScope(wasmLanguage, source, range),
			getFixSelectionOfInterest: (range: TreeSitterPointRange, maxNumberOfLines: number) => parserProxy._getFixSelectionOfInterest(wasmLanguage, source, range, maxNumberOfLines),
			getCallExpressions: (selection: TreeSitterOffsetRange) => parserProxy._getCallExpressions(wasmLanguage, source, selection),
			getFunctionDefinitions: () => parserProxy._getFunctionDefinitions(wasmLanguage, source),
			getClassReferences: (selection: TreeSitterOffsetRange) => parserProxy._getClassReferences(wasmLanguage, source, selection),
			getClassDeclarations: () => parserProxy._getClassDeclarations(wasmLanguage, source),
			getTypeDeclarations: () => parserProxy._getTypeDeclarations(wasmLanguage, source),
			getTypeReferences: (selection: TreeSitterOffsetRange) => parserProxy._getTypeReferences(wasmLanguage, source, selection),
			getSymbols: (selection: TreeSitterOffsetRange) => parserProxy._getSymbols(wasmLanguage, source, selection),
			getDocumentableNodeIfOnIdentifier: (range: TreeSitterOffsetRange) => parserProxy._getDocumentableNodeIfOnIdentifier(wasmLanguage, source, range),
			getTestableNode: (range: TreeSitterOffsetRange) => parserProxy._getTestableNode(wasmLanguage, source, range),
			getTestableNodes: () => parserProxy._getTestableNodes(wasmLanguage, source),
			getNodeToExplain: (range: TreeSitterOffsetRange) => parserProxy._getNodeToExplain(wasmLanguage, source, range),
			getNodeToDocument: (range: TreeSitterOffsetRange) => parserProxy._getNodeToDocument(wasmLanguage, source, range),
			getFineScopes: (selection: TreeSitterOffsetRange) => parserProxy._getFineScopes(wasmLanguage, source, selection),
			getStructure: () => parserProxy._getStructure(wasmLanguage, source),
			findLastTest: () => parserProxy._findLastTest(wasmLanguage, source),
			getParseErrorCount: () => parserProxy._getParseErrorCount(wasmLanguage, source),
		};
	}

	getSemanticChunkTree(wasmLanguage: WASMLanguage, source: string) {
		return this._parser.proxy._getSemanticChunkTree(wasmLanguage, source);
	}

	getSemanticChunkNames(language: WASMLanguage, source: string) {
		return this._parser.proxy._getSemanticChunkNames(language, source);
	}
}

type Proxied<ProxyType> = {
	[K in keyof ProxyType]: ProxyType[K] extends ((...args: infer Args) => infer R) ? (...args: Args) => Promise<Awaited<R>> : never;
};

const _workerCallTimeout = 3_000;

class WorkerOrLocal<T extends object> {

	private readonly _local: T;

	public get proxy(): Proxied<T> {
		if (this._useWorker) {
			return this._workerProxy;
		}
		return <any>this._local;
	}

	private _worker: Lazy<WorkerWithRpcProxy<T>>;
	private readonly _workerProxy: Proxied<T>;

	private _restart(): void {
		if (this._worker.hasValue) {
			this._worker.value.terminate();
		}
		this._worker = new Lazy(() => new WorkerWithRpcProxy<T>(this._workerPath, { name: 'Parser worker' }));
	}

	constructor(
		local: T,
		private readonly _workerPath: string,
		private readonly _useWorker: boolean,
	) {
		this._local = new Proxy(local, {
			get: (target, prop, receiver) => {
				const originalMethod = (target as any)[prop];
				if (typeof originalMethod !== 'function') {
					return originalMethod;
				}

				return async (...args: any[]) => {
					const result = await originalMethod.apply(target, viaJSON(args));
					return viaJSON(result);
				};
			},
		});
		this._worker = new Lazy(() => new WorkerWithRpcProxy<T>(this._workerPath, { name: 'Parser worker' }));
		this._workerProxy = this._createTimeoutProxy();
	}

	private _createTimeoutProxy(): Proxied<T> {
		const self = this;
		return new Proxy({} as Proxied<T>, {
			get(_target, prop) {
				return async (...args: unknown[]) => {
					const timedOut = Symbol();
					const workerProxy = self._worker.value.proxy;
					const call = (workerProxy as any)[prop](...args);
					let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
					const timeoutPromise = new Promise<typeof timedOut>(resolve => {
						timeoutHandle = setTimeout(() => resolve(timedOut), _workerCallTimeout);
					});
					try {
						const result = await Promise.race([call, timeoutPromise]);
						if (result === timedOut) {
							self._restart();
							throw new ParserWorkerTimeoutError();
						}
						return result;
					} finally {
						clearTimeout(timeoutHandle);
					}
				};
			},
		});
	}

	dispose(): void {
		if (this._worker.hasValue) {
			this._worker.value.terminate();
		}
	}
}

function viaJSON<T>(obj: T): T {
	if (typeof obj === 'undefined') {
		return obj;
	}
	return JSON.parse(JSON.stringify(obj));
}
