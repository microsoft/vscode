/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../base/common/async.js';
import { Disposable, IDisposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { logOnceWebWorkerWarning, IWebWorkerClient, Proxied } from '../../../base/common/worker/webWorker.js';
import { WebWorkerDescriptor } from '../../../platform/webWorker/browser/webWorkerDescriptor.js';
import { IWebWorkerService } from '../../../platform/webWorker/browser/webWorkerService.js';
import { Position } from '../../common/core/position.js';
import { IRange, Range } from '../../common/core/range.js';
import { ITextModel } from '../../common/model.js';
import * as languages from '../../common/languages.js';
import { ILanguageConfigurationService } from '../../common/languages/languageConfigurationRegistry.js';
import { EditorWorker } from '../../common/services/editorWebWorker.js';
import { DiffAlgorithmName, IEditorWorkerService, ILineChange, IUnicodeHighlightsResult } from '../../common/services/editorWorker.js';
import { IModelService } from '../../common/services/model.js';
import { ITextResourceConfigurationService } from '../../common/services/textResourceConfiguration.js';
import { isNonEmptyArray } from '../../../base/common/arrays.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { StopWatch } from '../../../base/common/stopwatch.js';
import { canceled, onUnexpectedError } from '../../../base/common/errors.js';
import { UnicodeHighlighterOptions } from '../../common/services/unicodeTextModelHighlighter.js';
import { ILanguageFeaturesService } from '../../common/services/languageFeatures.js';
import { IChange } from '../../common/diff/legacyLinesDiffComputer.js';
import { IDocumentDiff, IDocumentDiffProviderOptions } from '../../common/diff/documentDiffProvider.js';
import { ILinesDiffComputerOptions, MovedText } from '../../common/diff/linesDiffComputer.js';
import { DetailedLineRangeMapping, RangeMapping, LineRangeMapping } from '../../common/diff/rangeMapping.js';
import { LineRange } from '../../common/core/ranges/lineRange.js';
import { SectionHeader, FindSectionHeaderOptions } from '../../common/services/findSectionHeaders.js';
import { mainWindow } from '../../../base/browser/window.js';
import { WindowIntervalTimer } from '../../../base/browser/dom.js';
import { WorkerTextModelSyncClient } from '../../common/services/textModelSync/textModelSync.impl.js';
import { EditorWorkerHost } from '../../common/services/editorWorkerHost.js';
import { StringEdit } from '../../common/core/edits/stringEdit.js';
import { OffsetRange } from '../../common/core/ranges/offsetRange.js';
import { FileAccess } from '../../../base/common/network.js';

/**
 * Stop the worker if it was not needed for 5 min.
 */
const STOP_WORKER_DELTA_TIME_MS = 5 * 60 * 1000;

function canSyncModel(modelService: IModelService, resource: URI): boolean {
	const model = modelService.getModel(resource);
	if (!model) {
		return false;
	}
	if (model.isTooLargeForSyncing()) {
		return false;
	}
	return true;
}

export class EditorWorkerService extends Disposable implements IEditorWorkerService {

	declare readonly _serviceBrand: undefined;

	private readonly _modelService: IModelService;
	private readonly _workerManager: WorkerManager;
	private readonly _logService: ILogService;

	constructor(
		@IModelService modelService: IModelService,
		@ITextResourceConfigurationService configurationService: ITextResourceConfigurationService,
		@ILogService logService: ILogService,
		@ILanguageConfigurationService private readonly _languageConfigurationService: ILanguageConfigurationService,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@IWebWorkerService private readonly _webWorkerService: IWebWorkerService,
	) {
		super();
		this._modelService = modelService;

		const workerDescriptor = new WebWorkerDescriptor({
			esmModuleLocation: () => FileAccess.asBrowserUri('vs/editor/common/services/editorWebWorkerMain.js'),
			esmModuleLocationBundler: () => new URL('../../common/services/editorWebWorkerMain.ts?workerModule', import.meta.url),
			label: 'editorWorkerService'
		});

		this._workerManager = this._register(new WorkerManager(workerDescriptor, this._modelService, this._webWorkerService));
		this._logService = logService;

		// register default link-provider and default completions-provider
		this._register(languageFeaturesService.linkProvider.register({ language: '*', hasAccessToAllModels: true }, {
			provideLinks: async (model, token) => {
				if (!canSyncModel(this._modelService, model.uri)) {
					return Promise.resolve({ links: [] }); // File too large
				}
				const worker = await this._workerWithResources([model.uri]);
				const links = await worker.$computeLinks(model.uri.toString());
				return links && { links };
			}
		}));
		this._register(languageFeaturesService.completionProvider.register('*', new WordBasedCompletionItemProvider(this._workerManager, configurationService, this._modelService, this._languageConfigurationService, this._logService, languageFeaturesService)));
	}

	public override dispose(): void {
		super.dispose();
	}

	public canComputeUnicodeHighlights(uri: URI): boolean {
		return canSyncModel(this._modelService, uri);
	}

	public async computedUnicodeHighlights(uri: URI, options: UnicodeHighlighterOptions, range?: IRange): Promise<IUnicodeHighlightsResult> {
		const worker = await this._workerWithResources([uri]);
		return worker.$computeUnicodeHighlights(uri.toString(), options, range);
	}

	public async computeDiff(original: URI, modified: URI, options: IDocumentDiffProviderOptions, algorithm: DiffAlgorithmName): Promise<IDocumentDiff | null> {
		const worker = await this._workerWithResources([original, modified], /* forceLargeModels */true);
		const result = await worker.$computeDiff(original.toString(), modified.toString(), options, algorithm);
		if (!result) {
			return null;
		}
		// Convert from space efficient JSON data to rich objects.
		const diff: IDocumentDiff = {
			identical: result.identical,
			quitEarly: result.quitEarly,
			changes: toLineRangeMappings(result.changes),
			moves: result.moves.map(m => new MovedText(
				new LineRangeMapping(new LineRange(m[0], m[1]), new LineRange(m[2], m[3])),
				toLineRangeMappings(m[4])
			))
		};
		return diff;

		function toLineRangeMappings(changes: readonly ILineChange[]): readonly DetailedLineRangeMapping[] {
			return changes.map(
				(c) => new DetailedLineRangeMapping(
					new LineRange(c[0], c[1]),
					new LineRange(c[2], c[3]),
					c[4]?.map(
						(c) => new RangeMapping(
							new Range(c[0], c[1], c[2], c[3]),
							new Range(c[4], c[5], c[6], c[7])
						)
					)
				)
			);
		}
	}

	public canComputeDirtyDiff(original: URI, modified: URI): boolean {
		return (canSyncModel(this._modelService, original) && canSyncModel(this._modelService, modified));
	}

	public async computeDirtyDiff(original: URI, modified: URI, ignoreTrimWhitespace: boolean): Promise<IChange[] | null> {
		const worker = await this._workerWithResources([original, modified]);
		return worker.$computeDirtyDiff(original.toString(), modified.toString(), ignoreTrimWhitespace);
	}

	public async computeMoreMinimalEdits(resource: URI, edits: languages.TextEdit[] | null | undefined, pretty: boolean = false): Promise<languages.TextEdit[] | undefined> {
		if (isNonEmptyArray(edits)) {
			if (!canSyncModel(this._modelService, resource)) {
				return Promise.resolve(edits); // File too large
			}
			const sw = StopWatch.create();
			const result = this._workerWithResources([resource]).then(worker => worker.$computeMoreMinimalEdits(resource.toString(), edits, pretty));
			result.finally(() => this._logService.trace('FORMAT#computeMoreMinimalEdits', resource.toString(true), sw.elapsed()));
			return Promise.race([result, timeout(1000).then(() => edits)]);

		} else {
			return Promise.resolve(undefined);
		}
	}

	public computeHumanReadableDiff(resource: URI, edits: languages.TextEdit[] | null | undefined): Promise<languages.TextEdit[] | undefined> {
		if (isNonEmptyArray(edits)) {
			if (!canSyncModel(this._modelService, resource)) {
				return Promise.resolve(edits); // File too large
			}
			const sw = StopWatch.create();
			const opts: ILinesDiffComputerOptions = { ignoreTrimWhitespace: false, maxComputationTimeMs: 1000, computeMoves: false };
			const result = (
				this._workerWithResources([resource])
					.then(worker => worker.$computeHumanReadableDiff(resource.toString(), edits, opts))
					.catch((err) => {
						onUnexpectedError(err);
						// In case of an exception, fall back to computeMoreMinimalEdits
						return this.computeMoreMinimalEdits(resource, edits, true);
					})
			);
			result.finally(() => this._logService.trace('FORMAT#computeHumanReadableDiff', resource.toString(true), sw.elapsed()));
			return result;

		} else {
			return Promise.resolve(undefined);
		}
	}

	public async computeStringEditFromDiff(original: string, modified: string, options: { maxComputationTimeMs: number }, algorithm: DiffAlgorithmName): Promise<StringEdit> {
		try {
			const worker = await this._workerWithResources([]);
			const edit = await worker.$computeStringDiff(original, modified, options, algorithm);
			return StringEdit.fromJson(edit);
		} catch (e) {
			onUnexpectedError(e);
			return StringEdit.replace(OffsetRange.ofLength(original.length), modified); // approximation
		}
	}

	public canNavigateValueSet(resource: URI): boolean {
		return (canSyncModel(this._modelService, resource));
	}

	public async navigateValueSet(resource: URI, range: IRange, up: boolean): Promise<languages.IInplaceReplaceSupportResult | null> {
		const model = this._modelService.getModel(resource);
		if (!model) {
			return null;
		}
		const wordDefRegExp = this._languageConfigurationService.getLanguageConfiguration(model.getLanguageId()).getWordDefinition();
		const wordDef = wordDefRegExp.source;
		const wordDefFlags = wordDefRegExp.flags;
		const worker = await this._workerWithResources([resource]);
		return worker.$navigateValueSet(resource.toString(), range, up, wordDef, wordDefFlags);
	}

	public canComputeWordRanges(resource: URI): boolean {
		return canSyncModel(this._modelService, resource);
	}

	public async computeWordRanges(resource: URI, range: IRange): Promise<{ [word: string]: IRange[] } | null> {
		const model = this._modelService.getModel(resource);
		if (!model) {
			return Promise.resolve(null);
		}
		const wordDefRegExp = this._languageConfigurationService.getLanguageConfiguration(model.getLanguageId()).getWordDefinition();
		const wordDef = wordDefRegExp.source;
		const wordDefFlags = wordDefRegExp.flags;
		const worker = await this._workerWithResources([resource]);
		return worker.$computeWordRanges(resource.toString(), range, wordDef, wordDefFlags);
	}

	public async findSectionHeaders(uri: URI, options: FindSectionHeaderOptions): Promise<SectionHeader[]> {
		const worker = await this._workerWithResources([uri]);
		return worker.$findSectionHeaders(uri.toString(), options);
	}

	public async computeDefaultDocumentColors(uri: URI): Promise<languages.IColorInformation[] | null> {
		const worker = await this._workerWithResources([uri]);
		return worker.$computeDefaultDocumentColors(uri.toString());
	}

	private async _workerWithResources(resources: URI[], forceLargeModels: boolean = false): Promise<Proxied<EditorWorker>> {
		const worker = await this._workerManager.withWorker();
		return await worker.workerWithSyncedResources(resources, forceLargeModels);
	}
}

class WordBasedCompletionItemProvider implements languages.CompletionItemProvider {

	private readonly _workerManager: WorkerManager;
	private readonly _configurationService: ITextResourceConfigurationService;
	private readonly _modelService: IModelService;

	readonly _debugDisplayName = 'wordbasedCompletions';

	constructor(
		workerManager: WorkerManager,
		configurationService: ITextResourceConfigurationService,
		modelService: IModelService,
		private readonly languageConfigurationService: ILanguageConfigurationService,
		private readonly logService: ILogService,
		private readonly languageFeaturesService: ILanguageFeaturesService,
	) {
		this._workerManager = workerManager;
		this._configurationService = configurationService;
		this._modelService = modelService;
	}

	async provideCompletionItems(model: ITextModel, position: Position): Promise<languages.CompletionList | undefined> {
		type WordBasedSuggestionsConfig = {
			wordBasedSuggestions?: 'off' | 'currentDocument' | 'matchingDocuments' | 'allDocuments' | 'offWithInlineSuggestions';
		};
		const config = this._configurationService.getValue<WordBasedSuggestionsConfig>(model.uri, position, 'editor');
		if (config.wordBasedSuggestions === 'off') {
			return undefined;
		}

		if (config.wordBasedSuggestions === 'offWithInlineSuggestions' && this.languageFeaturesService.inlineCompletionsProvider.has(model)) {
			return undefined;
		}

		const models: URI[] = [];
		if (config.wordBasedSuggestions === 'currentDocument') {
			// only current file and only if not too large
			if (canSyncModel(this._modelService, model.uri)) {
				models.push(model.uri);
			}
		} else {
			// either all files or files of same language
			for (const candidate of this._modelService.getModels()) {
				if (!canSyncModel(this._modelService, candidate.uri)) {
					continue;
				}
				if (candidate === model) {
					models.unshift(candidate.uri);

				} else if (config.wordBasedSuggestions === 'allDocuments' || candidate.getLanguageId() === model.getLanguageId()) {
					models.push(candidate.uri);
				}
			}
		}

		if (models.length === 0) {
			return undefined; // File too large, no other files
		}

		const wordDefRegExp = this.languageConfigurationService.getLanguageConfiguration(model.getLanguageId()).getWordDefinition();
		const word = model.getWordAtPosition(position);
		const replace = !word ? Range.fromPositions(position) : new Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
		const insert = replace.setEndPosition(position.lineNumber, position.column);

		// Trace logging about the word and replace/insert ranges
		this.logService.trace('[WordBasedCompletionItemProvider]', `word: "${word?.word || ''}", wordDef: "${wordDefRegExp}", replace: [${replace.toString()}], insert: [${insert.toString()}]`);

		const client = await this._workerManager.withWorker();
		const data = await client.textualSuggest(models, word?.word, wordDefRegExp);
		if (!data) {
			return undefined;
		}

		return {
			duration: data.duration,
			suggestions: data.words.map((word): languages.CompletionItem => {
				return {
					kind: languages.CompletionItemKind.Text,
					label: word,
					insertText: word,
					range: { insert, replace }
				};
			}),
		};
	}
}

class WorkerManager extends Disposable {

	private readonly _modelService: IModelService;
	private readonly _webWorkerService: IWebWorkerService;
	private _editorWorkerClient: EditorWorkerClient | null;
	private _lastWorkerUsedTime: number;

	constructor(
		private readonly _workerDescriptor: WebWorkerDescriptor,
		@IModelService modelService: IModelService,
		@IWebWorkerService webWorkerService: IWebWorkerService
	) {
		super();
		this._modelService = modelService;
		this._webWorkerService = webWorkerService;
		this._editorWorkerClient = null;
		this._lastWorkerUsedTime = (new Date()).getTime();

		const stopWorkerInterval = this._register(new WindowIntervalTimer());
		stopWorkerInterval.cancelAndSet(() => this._checkStopIdleWorker(), Math.round(STOP_WORKER_DELTA_TIME_MS / 2), mainWindow);

		this._register(this._modelService.onModelRemoved(_ => this._checkStopEmptyWorker()));
	}

	public override dispose(): void {
		if (this._editorWorkerClient) {
			this._editorWorkerClient.dispose();
			this._editorWorkerClient = null;
		}
		super.dispose();
	}

	/**
	 * Check if the model service has no more models and stop the worker if that is the case.
	 */
	private _checkStopEmptyWorker(): void {
		if (!this._editorWorkerClient) {
			return;
		}

		const models = this._modelService.getModels();
		if (models.length === 0) {
			// There are no more models => nothing possible for me to do
			this._editorWorkerClient.dispose();
			this._editorWorkerClient = null;
		}
	}

	/**
	 * Check if the worker has been idle for a while and then stop it.
	 */
	private _checkStopIdleWorker(): void {
		if (!this._editorWorkerClient) {
			return;
		}

		const timeSinceLastWorkerUsedTime = (new Date()).getTime() - this._lastWorkerUsedTime;
		if (timeSinceLastWorkerUsedTime > STOP_WORKER_DELTA_TIME_MS) {
			this._editorWorkerClient.dispose();
			this._editorWorkerClient = null;
		}
	}

	public withWorker(): Promise<EditorWorkerClient> {
		this._lastWorkerUsedTime = (new Date()).getTime();
		if (!this._editorWorkerClient) {
			this._editorWorkerClient = new EditorWorkerClient(this._workerDescriptor, false, this._modelService, this._webWorkerService);
		}
		return Promise.resolve(this._editorWorkerClient);
	}
}

class SynchronousWorkerClient<T extends IDisposable> implements IWebWorkerClient<T> {
	private readonly _instance: T;
	public readonly proxy: Proxied<T>;

	constructor(instance: T) {
		this._instance = instance;
		this.proxy = this._instance as Proxied<T>;
	}

	public dispose(): void {
		this._instance.dispose();
	}

	public setChannel<T extends object>(channel: string, handler: T): void {
		throw new Error(`Not supported`);
	}

	public getChannel<T extends object>(channel: string): Proxied<T> {
		throw new Error(`Not supported`);
	}
}

export interface IEditorWorkerClient {
	fhr(method: string, args: unknown[]): Promise<unknown>;
}

export class EditorWorkerClient extends Disposable implements IEditorWorkerClient {

	private readonly _modelService: IModelService;
	private readonly _webWorkerService: IWebWorkerService;
	private readonly _keepIdleModels: boolean;
	private _worker: IWebWorkerClient<EditorWorker> | null;
	private _modelManager: WorkerTextModelSyncClient | null;
	private _disposed = false;

	constructor(
		private readonly _workerDescriptorOrWorker: WebWorkerDescriptor | Worker | Promise<Worker>,
		keepIdleModels: boolean,
		@IModelService modelService: IModelService,
		@IWebWorkerService webWorkerService: IWebWorkerService
	) {
		super();
		this._modelService = modelService;
		this._webWorkerService = webWorkerService;
		this._keepIdleModels = keepIdleModels;
		this._worker = null;
		this._modelManager = null;
	}

	// foreign host request
	public fhr(method: string, args: unknown[]): Promise<unknown> {
		throw new Error(`Not implemented!`);
	}

	private _getOrCreateWorker(): IWebWorkerClient<EditorWorker> {
		if (!this._worker) {
			try {
				this._worker = this._register(this._webWorkerService.createWorkerClient<EditorWorker>(this._workerDescriptorOrWorker));
				EditorWorkerHost.setChannel(this._worker, this._createEditorWorkerHost());
			} catch (err) {
				logOnceWebWorkerWarning(err);
				this._worker = this._createFallbackLocalWorker();
			}
		}
		return this._worker;
	}

	protected async _getProxy(): Promise<Proxied<EditorWorker>> {
		try {
			const proxy = this._getOrCreateWorker().proxy;
			await proxy.$ping();
			return proxy;
		} catch (err) {
			logOnceWebWorkerWarning(err);
			this._worker = this._createFallbackLocalWorker();
			return this._worker.proxy;
		}
	}

	private _createFallbackLocalWorker(): SynchronousWorkerClient<EditorWorker> {
		return new SynchronousWorkerClient(new EditorWorker(null));
	}

	private _createEditorWorkerHost(): EditorWorkerHost {
		return {
			$fhr: (method, args) => this.fhr(method, args)
		};
	}

	private _getOrCreateModelManager(proxy: Proxied<EditorWorker>): WorkerTextModelSyncClient {
		if (!this._modelManager) {
			this._modelManager = this._register(new WorkerTextModelSyncClient(proxy, this._modelService, this._keepIdleModels));
		}
		return this._modelManager;
	}

	public async workerWithSyncedResources(resources: URI[], forceLargeModels: boolean = false): Promise<Proxied<EditorWorker>> {
		if (this._disposed) {
			return Promise.reject(canceled());
		}
		const proxy = await this._getProxy();
		this._getOrCreateModelManager(proxy).ensureSyncedResources(resources, forceLargeModels);
		return proxy;
	}

	public async textualSuggest(resources: URI[], leadingWord: string | undefined, wordDefRegExp: RegExp): Promise<{ words: string[]; duration: number } | null> {
		const proxy = await this.workerWithSyncedResources(resources);
		const wordDef = wordDefRegExp.source;
		const wordDefFlags = wordDefRegExp.flags;
		return proxy.$textualSuggest(resources.map(r => r.toString()), leadingWord, wordDef, wordDefFlags);
	}

	override dispose(): void {
		super.dispose();
		this._disposed = true;
	}
}
