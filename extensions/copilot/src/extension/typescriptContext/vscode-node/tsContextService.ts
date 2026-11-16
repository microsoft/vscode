/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

import { LRUCache } from 'lru-cache';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { ILanguageContextService, type ContextItem, type RequestContext } from '../../../platform/languageServer/common/languageContextService';
import { ILogService } from '../../../platform/log/common/logService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { DisposableStore } from '../../../util/vs/base/common/lifecycle';
import * as protocol from '../common/serverProtocol';
import { CacheState, ContextItemUsageMode, ResolvedRunnableResult, type CacheInfo, type OnCachePopulatedEvent, type OnContextComputedEvent, type OnContextComputedOnTimeoutEvent } from './types';
import { TelemetrySender } from './telemetrySender';

export const currentTokenBudget: number = 8 * 1024;

type RequestInfo = {
	readonly document: string;
	readonly version: number;
	readonly languageId: string;
	readonly position: vscode.Position;
	readonly requestId: string;
	readonly path: number[];
};

type ContextRequestState = {
	client: readonly ResolvedRunnableResult[];
	clientOnTimeout: readonly ResolvedRunnableResult[];
	server: readonly protocol.CachedContextRunnableResult[];
	resultMap: Map<protocol.ContextRunnableResultId, ResolvedRunnableResult>;
	itemMap: Map<protocol.ContextItemKey, protocol.FullContextItem>;
};

type ManagerUpdateResult = {
	resolved: ResolvedRunnableResult[];
	serverComputed: Set<string>;
	cached: number;
	referenced: number;
};

class RunnableResultManager implements vscode.Disposable {

	private readonly disposables = new DisposableStore();
	private requestInfo: RequestInfo | undefined;

	private cacheInfo: CacheInfo;
	private results: Map<protocol.ContextRunnableResultId, ResolvedRunnableResult>;
	private readonly withInRangeRunnableResults: { resultId: protocol.ContextRunnableResultId; range: vscode.Range }[];
	private readonly outsideRangeRunnableResults: { resultId: protocol.ContextRunnableResultId; ranges: vscode.Range[] }[] = [];
	private readonly neighborFileRunnableResults: { resultId: protocol.ContextRunnableResultId }[];

	constructor() {
		this.requestInfo = undefined;
		this.results = new Map();

		this.cacheInfo = {
			version: 0,
			state: CacheState.NotPopulated
		};
		this.withInRangeRunnableResults = [];
		this.outsideRangeRunnableResults = [];
		this.neighborFileRunnableResults = [];

		this.disposables.add(vscode.workspace.onDidChangeTextDocument((event: vscode.TextDocumentChangeEvent) => {
			if (this.requestInfo === undefined || event.contentChanges.length === 0) {
				return;
			}
			if (event.document.uri.toString() !== this.requestInfo.document) {
				if (this.affectsTypeScript(event)) {
					this.clear();
				}
			} else {
				for (const change of event.contentChanges) {
					const changeRange = change.range;
					for (let i = 0; i < this.withInRangeRunnableResults.length;) {
						const entry = this.withInRangeRunnableResults[i];
						if (entry.range.contains(changeRange)) {
							entry.range = this.applyTextContentChangeEventToWithinRange(change, entry.range);
							i++;
						} else {
							const id = entry.resultId;
							this.results.delete(id);
							this.withInRangeRunnableResults.splice(i, 1);
						}
					}
					for (let i = 0; i < this.outsideRangeRunnableResults.length;) {
						const entry = this.outsideRangeRunnableResults[i];
						const ranges = this.applyTextContentChangeEventToOutsideRanges(change, entry.ranges);
						if (ranges === undefined) {
							const id = entry.resultId;
							this.results.delete(id);
							this.outsideRangeRunnableResults.splice(i, 1);
						} else {
							entry.ranges = ranges;
							i++;
						}
					}
					this.cacheInfo.version = event.document.version;
				}
			}
		}));
		this.disposables.add(vscode.workspace.onDidCloseTextDocument((document: vscode.TextDocument) => {
			if (this.requestInfo?.document === document.uri.toString()) {
				this.clear();
			}
		}));
		this.disposables.add(vscode.window.onDidChangeActiveTextEditor(() => {
			this.clear();
		}));
		this.disposables.add(vscode.window.tabGroups.onDidChangeTabs((event: vscode.TabChangeEvent) => {
			if (event.closed.length === 0 && event.opened.length === 0) {
				return;
			}
			for (const item of this.neighborFileRunnableResults) {
				this.results.delete(item.resultId);
			}
			this.neighborFileRunnableResults.length = 0;
		}));
	}

	public clear(): void {
		this.requestInfo = undefined;
		this.results.clear();

		this.cacheInfo = {
			version: 0,
			state: CacheState.NotPopulated
		};
		this.withInRangeRunnableResults.length = 0;
		this.outsideRangeRunnableResults.length = 0;
		this.neighborFileRunnableResults.length = 0;
	}

	public getCacheState(): CacheState {
		return this.cacheInfo.state;
	}

	public update(document: vscode.TextDocument, version: number, position: vscode.Position, context: RequestContext, body: protocol.ComputeContextResponse.OK, requestState: ContextRequestState | undefined): ManagerUpdateResult {
		const itemMap = requestState?.itemMap ?? new Map();
		const usedResults = requestState?.resultMap ?? new Map();

		this.withInRangeRunnableResults.length = 0;
		this.outsideRangeRunnableResults.length = 0;
		this.neighborFileRunnableResults.length = 0;
		this.results.clear();
		this.cacheInfo = {
			version: version,
			state: CacheState.NotPopulated
		};

		let cachedItems = 0;
		let referencedItems = 0;
		const serverComputed: Set<string> = new Set();
		this.requestInfo = {
			document: document.uri.toString(),
			version: version,
			languageId: document.languageId,
			position: position,
			requestId: context.requestId,
			path: body.path ?? [0]
		};

		if (body.runnableResults === undefined || body.runnableResults.length === 0 || body.path === undefined || body.path.length === 0 || body.path[0] === 0) {
			return { resolved: [], cached: cachedItems, referenced: referencedItems, serverComputed: serverComputed };
		}

		const serverItems: Set<protocol.ContextItemKey> = new Set();
		// Add new client side context items to the item map.
		if (body.contextItems !== undefined && body.contextItems.length > 0) {
			for (const item of body.contextItems) {
				if (protocol.ContextItem.hasKey(item)) {
					itemMap.set(item.key, item);
					serverItems.add(item.key);
				}
			}
		}
		const updateRunnableResult = (resultItem: protocol.ContextRunnableResultTypes): ResolvedRunnableResult | undefined => {
			let result: ResolvedRunnableResult | undefined;
			if (resultItem.kind === protocol.ContextRunnableResultKind.ComputedResult) {
				serverComputed.add(resultItem.id);
				const items: protocol.FullContextItem[] = [];
				for (const contextItem of resultItem.items) {
					if (contextItem.kind === protocol.ContextKind.Reference) {
						const referenced: protocol.FullContextItem | undefined = itemMap.get(contextItem.key);
						if (referenced !== undefined) {
							referencedItems++;
							items.push(referenced);
							if (!serverItems.has(contextItem.key)) {
								cachedItems++;
							}
						}
					} else {
						items.push(contextItem);
					}
				}
				result = ResolvedRunnableResult.from(resultItem, items);
			} else if (resultItem.kind === protocol.ContextRunnableResultKind.Reference) {
				result = usedResults.get(resultItem.id);
				if (result !== undefined) {
					cachedItems += result.items.length;
				}
			}
			if (result === undefined) {
				return;
			}
			this.results.set(result.id, result);
			if (result.cache !== undefined) {
				if (result.cache.scope.kind === protocol.CacheScopeKind.WithinRange) {
					const scopeRange = result.cache.scope.range;
					const range = new vscode.Range(scopeRange.start.line, scopeRange.start.character, scopeRange.end.line, scopeRange.end.character);
					this.withInRangeRunnableResults.push({ range, resultId: result.id });
				} else if (result.cache.scope.kind === protocol.CacheScopeKind.NeighborFiles) {
					this.neighborFileRunnableResults.push({ resultId: result.id });
				} else if (result.cache.scope.kind === protocol.CacheScopeKind.OutsideRange) {
					const ranges: vscode.Range[] = [];
					for (const scopeRange of result.cache.scope.ranges) {
						ranges.push(new vscode.Range(scopeRange.start.line, scopeRange.start.character, scopeRange.end.line, scopeRange.end.character));
					}
					this.outsideRangeRunnableResults.push({ resultId: result.id, ranges });
				}
			}
			this.updateCacheState(result.state);
			return result;
		};

		const results: ResolvedRunnableResult[] = [];
		for (const runnableResult of body.runnableResults) {
			const result = updateRunnableResult(runnableResult);
			if (result !== undefined) {
				results.push(result);
			}
		}
		return { resolved: results, cached: cachedItems, referenced: referencedItems, serverComputed: serverComputed };
	}

	private updateCacheState(state: protocol.ContextRunnableState): void {
		switch (this.cacheInfo.state) {
			case CacheState.NotPopulated:
				switch (state) {
					case protocol.ContextRunnableState.Finished:
						this.cacheInfo.state = CacheState.FullyPopulated;
						break;
					case protocol.ContextRunnableState.IsFull:
					case protocol.ContextRunnableState.InProgress:
						this.cacheInfo.state = CacheState.PartiallyPopulated;
						break;
					default:
						this.cacheInfo.state = CacheState.NotPopulated;
				}
				break;
			case CacheState.PartiallyPopulated:
				// If the cache is partially populated we can only stay in that state.
				break;
			case CacheState.FullyPopulated:
				switch (state) {
					case protocol.ContextRunnableState.Finished:
						// If the cache is fully populated we can only stay in that state.
						break;
					case protocol.ContextRunnableState.IsFull:
					case protocol.ContextRunnableState.InProgress:
						this.cacheInfo.state = CacheState.PartiallyPopulated;
						break;
					default:
						this.cacheInfo.state = CacheState.NotPopulated;
				}
				break;
		}
	}

	public getRequestId(): string | undefined {
		return this.requestInfo?.requestId;
	}

	public getNodePath(): number[] {
		return this.requestInfo?.path ?? [0];
	}

	public getRunnableResult(id: protocol.ContextRunnableResultId): ResolvedRunnableResult | undefined {
		return this.results.get(id);
	}

	public getCachedRunnableResults(document: vscode.TextDocument, position: vscode.Position, emitMode?: protocol.EmitMode): ResolvedRunnableResult[] {
		const results: ResolvedRunnableResult[] = [];
		if (this.requestInfo?.document !== document.uri.toString()) {
			return results;
		}
		if (this.cacheInfo.version !== document.version || this.cacheInfo.state === CacheState.NotPopulated || this.requestInfo.path.length === 0 || this.requestInfo.path[0] === 0) {
			return results;
		}
		for (const item of this.results.values()) {
			if (emitMode !== undefined && item.cache?.emitMode === emitMode) {
				continue;
			}
			const scope = item.cache?.scope;
			if (scope === undefined || scope.kind !== protocol.CacheScopeKind.WithinRange) {
				results.push(item);
			} else {
				const r = scope.range;
				const range = new vscode.Range(r.start.line, r.start.character, r.end.line, r.end.character);
				if (range.contains(position)) {
					results.push(item);
				}
			}
		}
		// Sort them by priority so that the most important items are emitted first if they
		// are contained in more than one runnable result.
		return results.sort((a, b) => {
			return a.priority < b.priority ? 1 : a.priority > b.priority ? -1 : 0;
		});
	}

	public getContextRequestState(document: vscode.TextDocument, position: vscode.Position): ContextRequestState | undefined {
		if (this.requestInfo?.document !== document.uri.toString()) {
			return undefined;
		}
		if (this.cacheInfo.version !== document.version || this.cacheInfo.state === CacheState.NotPopulated || this.requestInfo.path.length === 0 || this.requestInfo.path[0] === 0) {
			return undefined;
		}
		const items: Map<protocol.ContextItemKey, protocol.FullContextItem> = new Map();
		const client: ResolvedRunnableResult[] = [];
		const clientOnTimeout: ResolvedRunnableResult[] = [];
		const server: protocol.CachedContextRunnableResult[] = [];
		if (this.isCacheFullyUpToDate(document, position)) {
			for (const item of this.results.values()) {
				client.push(item);
			}
		} else {
			const canSkipItems = (rr: ResolvedRunnableResult, cache: protocol.CacheInfo): boolean => {
				if (rr.state === protocol.ContextRunnableState.Finished) {
					return true;
				}
				if (rr.state === protocol.ContextRunnableState.IsFull) {
					const kind = cache.scope.kind;
					return kind === protocol.CacheScopeKind.WithinRange || kind === protocol.CacheScopeKind.NeighborFiles || kind === protocol.CacheScopeKind.File;
				}
				return false;
			};
			const handleRunnableResult = (id: string, rr: ResolvedRunnableResult) => {
				const cache = rr.cache;
				const cachedResult: protocol.CachedContextRunnableResult = {
					id: id,
					kind: protocol.ContextRunnableResultKind.CacheEntry,
					state: rr.state,
					items: []
				};
				let skipItems = false;
				if (cache !== undefined) {
					cachedResult.cache = cache;
					const emitMode = cache.emitMode;
					if (emitMode === protocol.EmitMode.ClientBased) {
						client.push(rr);
						skipItems = canSkipItems(rr, cache);
					} else if (emitMode === protocol.EmitMode.ClientBasedOnTimeout) {
						clientOnTimeout.push(rr);
					}
				}
				server.push(cachedResult);

				if (skipItems) {
					return;
				}

				// Add cached context items to the result;
				for (const item of rr.items) {
					if (!protocol.ContextItem.hasKey(item)) {
						continue;
					}
					const key = item.key;
					let size: number | undefined = undefined;
					switch (item.kind) {
						case protocol.ContextKind.Snippet:
							size = protocol.CodeSnippet.sizeInChars(item);
							break;
						case protocol.ContextKind.Trait:
							size = protocol.Trait.sizeInChars(item);
							break;
						default:
					}
					cachedResult.items.push(protocol.CachedContextItem.create(key, size));
					items.set(key, item);
				}
			};
			// We don't need to sort by priority here since the data is used for the next cache request.
			for (const [id, item] of this.results.entries()) {
				const scope = item.cache?.scope;
				if (scope === undefined || scope.kind !== protocol.CacheScopeKind.WithinRange) {
					handleRunnableResult(id, item);
				} else {
					const r = scope.range;
					const range = new vscode.Range(r.start.line, r.start.character, r.end.line, r.end.character);
					if (range.contains(position)) {
						handleRunnableResult(id, item);
					}
				}
			}
		}
		return { client, clientOnTimeout, server, itemMap: items, resultMap: new Map(this.results) };
	}

	private isCacheFullyUpToDate(document: vscode.TextDocument, position: vscode.Position): boolean {
		if (this.requestInfo === undefined) {
			return false;
		}
		if (this.requestInfo.document !== document.uri.toString()) {
			return false;
		}

		// Same document, version and position. Cache can be full used.
		if (this.requestInfo.version === document.version && this.requestInfo.position.isEqual(position)) {
			return true;
		}

		// Document is older than cached request. Not up to date.
		if (this.requestInfo.version > document.version) {
			return false;
		}

		// if the position is not contained in all ranges return false.
		for (const runnable of this.withInRangeRunnableResults) {
			if (!runnable.range.contains(position)) {
				return false;
			}
		}

		const range = position.isBefore(this.requestInfo.position) ? new vscode.Range(position, this.requestInfo.position) : new vscode.Range(this.requestInfo.position, position);
		const text = document.getText(range);
		return text.trim().length === 0;
	}

	public dispose(): void {
		this.clear();
		this.disposables.dispose();
	}

	private affectsTypeScript(event: vscode.TextDocumentChangeEvent): boolean {
		const languageId = event.document.languageId;
		return languageId === 'typescript' || languageId === 'typescriptreact' || languageId === 'javascript' || languageId === 'javascriptreact' || languageId === 'json';
	}

	private applyTextContentChangeEventToWithinRange(event: vscode.TextDocumentContentChangeEvent, range: vscode.Range): vscode.Range {
		// The start stays untouched since the change range is contained in the range.
		const eventRange = event.range;
		const eventText = event.text;

		// Calculate how many lines the new text adds or removes
		const linesDelta = (eventText.match(/\n/g) || []).length - (eventRange.end.line - eventRange.start.line);

		// Calculate the new end position
		const endLine = range.end.line + linesDelta;

		let endCharacter = range.end.character;
		if (eventRange.end.line === range.end.line) {
			// Calculate the character delta for the last line of the change
			const lastNewLineIndex = eventText.lastIndexOf('\n');
			const newTextLength = lastNewLineIndex !== -1 ? eventText.length - lastNewLineIndex - 1 : eventText.length;
			const oldTextLength = eventRange.end.character - (eventRange.end.line > eventRange.start.line ? 0 : eventRange.start.character);
			const charDelta = newTextLength - oldTextLength;
			endCharacter += charDelta;
		}
		return new vscode.Range(range.start, new vscode.Position(endLine, endCharacter));
	}

	private applyTextContentChangeEventToOutsideRanges(event: vscode.TextDocumentContentChangeEvent, ranges: vscode.Range[]): vscode.Range[] | undefined {
		if (ranges.length === 0) {
			return ranges;
		}
		const changeRange = event.range;
		const eventText = event.text;

		// Quick optimization: if change is completely after last range, no ranges need adjustment
		const lastRange = ranges[ranges.length - 1];
		if (changeRange.start.isAfter(lastRange.end)) {
			return ranges;
		}
		// Calculate how many lines the new text adds or removes
		const linesDelta = (eventText.match(/\n/g) || []).length - (changeRange.end.line - changeRange.start.line);
		const adjustedRanges: vscode.Range[] = [];

		for (const range of ranges) {
			if (range.end.isBefore(changeRange.start)) {
				// Range is completely before change, no adjustment needed
				adjustedRanges.push(range);
			} else if (range.start.isAfter(changeRange.end)) {
				// Range is completely after change, adjust by lines delta
				if (linesDelta === 0) {
					adjustedRanges.push(range);
				} else {
					adjustedRanges.push(new vscode.Range(
						new vscode.Position(range.start.line + linesDelta, range.start.character),
						new vscode.Position(range.end.line + linesDelta, range.end.character)
					));
				}
			} else {

				// The range intersects with the range with will invalidate the cache entry.
				return undefined;
			}
		}

		return adjustedRanges;
	}
}

namespace TextDocuments {
	export function consider(document: vscode.TextDocument): boolean {
		return document.uri.scheme === 'file' && (document.languageId === 'typescript' || document.languageId === 'typescriptreact');
	}
}

class NeighborFileModel implements vscode.Disposable {

	private static readonly MAX_ITEMS = 12;

	private readonly disposables;
	private readonly visible: LRUCache<string, string>;
	private readonly notVisible: LRUCache<string, string>;

	constructor() {
		this.disposables = new DisposableStore();
		this.visible = new LRUCache<string, string>({ max: NeighborFileModel.MAX_ITEMS });
		this.notVisible = new LRUCache<string, string>({ max: NeighborFileModel.MAX_ITEMS });
		this.disposables.add(vscode.window.onDidChangeActiveTextEditor((editor: vscode.TextEditor | undefined) => {
			if (editor === undefined) {
				return;
			}
			const document = editor.document;
			if (TextDocuments.consider(document)) {
				const uri = document.uri.toString();
				this.visible.set(uri, document.uri.fsPath);
				this.notVisible.delete(uri);
			}
		}));
		this.disposables.add(vscode.workspace.onDidCloseTextDocument((document: vscode.TextDocument) => {
			const uri = document.uri.toString();
			if (TextDocuments.consider(document)) {
				this.visible.delete(uri);
				this.notVisible.delete(uri);
			}
		}));
		this.disposables.add(vscode.window.tabGroups.onDidChangeTabs((e: vscode.TabChangeEvent) => {
			// We don't track open tabs here to ensure we only track documents that are
			// actually focused. Otherwise opening multiple tabs at once would cause too much churn.
			for (const tab of e.closed) {
				if (tab.input instanceof vscode.TabInputText) {
					const uri = tab.input.uri.toString();
					const isVisible = this.visible.has(uri);
					if (isVisible) {
						this.visible.delete(uri);
						this.notVisible.set(uri, tab.input.uri.fsPath);
					}
				}
			}
		}));
		const textDocumentsToConsider: Map<string, vscode.Uri> = new Map();
		for (const document of vscode.workspace.textDocuments) {
			if (TextDocuments.consider(document)) {
				textDocumentsToConsider.set(document.uri.toString(), document.uri);
			}
		}
		for (const group of vscode.window.tabGroups.all) {
			for (const tab of group.tabs) {
				const uri = tab.input instanceof vscode.TabInputText ? tab.input.uri : undefined;
				if (uri !== undefined && textDocumentsToConsider.has(uri.toString())) {
					this.visible.set(uri.toString(), uri.fsPath);
					textDocumentsToConsider.delete(uri.toString());
				}
			}
		}
		for (const [key, uri] of textDocumentsToConsider.entries()) {
			this.notVisible.set(key, uri.fsPath);
		}
		if (vscode.window.activeTextEditor !== undefined) {
			const document = vscode.window.activeTextEditor.document;
			if (TextDocuments.consider(document)) {
				const uri = document.uri.toString();
				this.visible.set(uri, document.uri.fsPath);
				this.notVisible.delete(uri);
			}
		}
	}

	public getNeighborFiles(currentDocument: vscode.TextDocument): string[] {
		const result: string[] = [];
		const currentUri = currentDocument.uri.toString();
		for (const [key, value] of this.visible.entries()) {
			if (key === currentUri) {
				continue;
			}
			result.push(value);
		}
		if (result.length < NeighborFileModel.MAX_ITEMS) {
			for (const [key, value] of this.notVisible.entries()) {
				if (key === currentUri) {
					continue;
				}
				result.push(value);
				if (result.length >= NeighborFileModel.MAX_ITEMS) {
					break;
				}
			}
		}
		return result;
	}

	public dispose(): void {
		this.disposables.dispose();
	}
}

class CharacterBudget {

	public readonly overall: number;
	private mandatory: number;
	private optional: number;
	private start: { mandatory: number; optional: number };

	constructor(mandatory: number, optional: number) {
		this.overall = mandatory;
		this.mandatory = mandatory;
		this.optional = optional;
		this.start = { mandatory, optional };
	}

	spend(chars: number): void {
		this.mandatory -= chars;
		this.optional -= chars;
	}

	isExhausted(): boolean {
		return this.mandatory <= 0;
	}

	isOptionalExhausted(): boolean {
		return this.optional <= 0;
	}

	public fresh(): CharacterBudget {
		return new CharacterBudget(this.start.mandatory, this.start.optional);
	}
}

export interface TSLanguageContextService extends Omit<ILanguageContextService, '_serviceBrand'>, vscode.Disposable {
	readonly onCachePopulated: vscode.Event<OnCachePopulatedEvent>;
	readonly onContextComputed: vscode.Event<OnContextComputedEvent>;
	readonly onContextComputedOnTimeout: vscode.Event<OnContextComputedOnTimeoutEvent>;
}

export abstract class AbstractTSLanguageContextService implements TSLanguageContextService {

	private static readonly defaultCachePopulationBudget: number = 500;

	protected readonly disposables: DisposableStore;
	protected readonly telemetrySender: TelemetrySender;
	protected readonly neighborFileModel: NeighborFileModel;
	protected readonly runnableResultManager: RunnableResultManager;
	protected readonly logService: ILogService;
	protected readonly configurationService: IConfigurationService;
	protected readonly experimentationService: IExperimentationService;

	protected usageMode: ContextItemUsageMode;
	protected cachePopulationTimeout: number;
	protected includeDocumentation: boolean;


	protected _onCachePopulated: vscode.EventEmitter<OnCachePopulatedEvent>;
	public readonly onCachePopulated: vscode.Event<OnCachePopulatedEvent>;

	protected _onContextComputed: vscode.EventEmitter<OnContextComputedEvent>;
	public readonly onContextComputed: vscode.Event<OnContextComputedEvent>;

	protected _onContextComputedOnTimeout: vscode.EventEmitter<OnContextComputedOnTimeoutEvent>;
	public readonly onContextComputedOnTimeout: vscode.Event<OnContextComputedOnTimeoutEvent>;

	constructor(
		telemetryService: ITelemetryService,
		logService: ILogService,
		configurationService: IConfigurationService,
		experimentationService: IExperimentationService
	) {
		this.disposables = new DisposableStore();

		this.configurationService = configurationService;
		this.experimentationService = experimentationService;
		this.logService = logService;
		this.telemetrySender = new TelemetrySender(telemetryService, logService);
		this.neighborFileModel = this.disposables.add(new NeighborFileModel());
		this.runnableResultManager = this.disposables.add(new RunnableResultManager());

		this.usageMode = this.getUsageMode();
		this.cachePopulationTimeout = this.getCachePopulationBudget();
		this.includeDocumentation = this.getIncludeDocumentation();

		this.disposables.add(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ConfigKey.TypeScriptLanguageContextMode.fullyQualifiedId)) {
				this.usageMode = this.getUsageMode();
			} else if (e.affectsConfiguration(ConfigKey.TypeScriptLanguageContextCacheTimeout.fullyQualifiedId)) {
				this.cachePopulationTimeout = this.getCachePopulationBudget();
			} else if (e.affectsConfiguration(ConfigKey.TypeScriptLanguageContextIncludeDocumentation.fullyQualifiedId)) {
				this.includeDocumentation = this.getIncludeDocumentation();
			}
		}));


		this._onCachePopulated = this.disposables.add(new vscode.EventEmitter<OnCachePopulatedEvent>());
		this.onCachePopulated = this._onCachePopulated.event;

		this._onContextComputed = this.disposables.add(new vscode.EventEmitter<OnContextComputedEvent>());
		this.onContextComputed = this._onContextComputed.event;

		this._onContextComputedOnTimeout = this.disposables.add(new vscode.EventEmitter<OnContextComputedOnTimeoutEvent>());
		this.onContextComputedOnTimeout = this._onContextComputedOnTimeout.event;
	}

	public dispose(): void {
		this.disposables.dispose();
	}

	public abstract isActivated(documentOrLanguageId: vscode.TextDocument | string): Promise<boolean>;

	public abstract populateCache(document: vscode.TextDocument, position: vscode.Position, context: RequestContext): Promise<void>;

	public abstract getContext(document: vscode.TextDocument, position: vscode.Position, context: RequestContext, token: vscode.CancellationToken): AsyncIterable<ContextItem>;

	public abstract getContextOnTimeout(document: vscode.TextDocument, position: vscode.Position, context: RequestContext): readonly ContextItem[] | undefined;

	private getCachePopulationBudget(): number {
		const result = this.configurationService.getExperimentBasedConfig(ConfigKey.TypeScriptLanguageContextCacheTimeout, this.experimentationService);
		return result ?? AbstractTSLanguageContextService.defaultCachePopulationBudget;
	}

	private getUsageMode(): ContextItemUsageMode {
		const value = this.configurationService.getExperimentBasedConfig(ConfigKey.TypeScriptLanguageContextMode, this.experimentationService);
		return ContextItemUsageMode.fromString(value);
	}

	private getIncludeDocumentation(): boolean {
		return this.configurationService.getExperimentBasedConfig<boolean>(ConfigKey.TypeScriptLanguageContextIncludeDocumentation, this.experimentationService);
	}

	protected getCharacterBudget(context: RequestContext, document: vscode.TextDocument): CharacterBudget {
		const chars = (context.tokenBudget ?? currentTokenBudget) * 4;
		switch (this.usageMode) {
			case ContextItemUsageMode.minimal:
				return new CharacterBudget(chars, 0);
			case ContextItemUsageMode.double:
				return new CharacterBudget(chars, Math.min(chars, document.getText().length));
			case ContextItemUsageMode.fillHalf:
				return new CharacterBudget(chars, Math.floor(chars / 2));
			case ContextItemUsageMode.fill:
				return new CharacterBudget(chars, chars);
			default:
				return new CharacterBudget(chars, chars);
		}
	}
}

export class NullTSLanguageContextService implements TSLanguageContextService {

	private readonly disposables: DisposableStore;

	public readonly onCachePopulated: vscode.Event<OnCachePopulatedEvent>;
	public readonly onContextComputed: vscode.Event<OnContextComputedEvent>;
	public readonly onContextComputedOnTimeout: vscode.Event<OnContextComputedOnTimeoutEvent>;

	constructor() {
		this.disposables = new DisposableStore();
		this.onCachePopulated = this.disposables.add(new vscode.EventEmitter<OnCachePopulatedEvent>()).event;
		this.onContextComputed = this.disposables.add(new vscode.EventEmitter<OnContextComputedEvent>()).event;
		this.onContextComputedOnTimeout = this.disposables.add(new vscode.EventEmitter<OnContextComputedOnTimeoutEvent>()).event;
	}

	public dispose(): void {
		this.disposables.dispose();
	}

	public async isActivated(): Promise<boolean> {
		return false;
	}

	public async populateCache(): Promise<void> {
		// No cache to populate
	}

	public getContext(): AsyncIterable<ContextItem> {
		return (async function* () { })();
	}

	public getContextOnTimeout(): readonly ContextItem[] | undefined {
		return undefined;
	}
}
