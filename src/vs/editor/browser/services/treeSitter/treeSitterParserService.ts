/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TreeSitterTokenizationRegistry } from 'vs/editor/common/languages';
import type { Parser } from '@vscode/tree-sitter-wasm';
import { AppResourcePath, FileAccess, nodeModulesPath } from 'vs/base/common/network';
import { ITreeSitterParserService } from 'vs/editor/common/services/treeSitterParserService';
import { IModelService } from 'vs/editor/common/services/model';
import { Disposable, DisposableMap, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { ITextModel } from 'vs/editor/common/model';
import { IFileService } from 'vs/platform/files/common/files';
import { IModelContentChangedEvent } from 'vs/editor/common/textModelEvents';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ILogService } from 'vs/platform/log/common/log';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { setTimeout0 } from 'vs/base/common/platform';
import { importAMDNodeModule } from 'vs/amdX';
import { Event } from 'vs/base/common/event';
import { cancelOnDispose } from 'vs/base/common/cancellation';

const EDITOR_EXPERIMENTAL_PREFER_TREESITTER = 'editor.experimental.preferTreeSitter';
const moduleLocationTreeSitter: AppResourcePath = `${nodeModulesPath}/@vscode/tree-sitter-wasm/wasm`;
const moduleLocationTreeSitterWasm: AppResourcePath = `${moduleLocationTreeSitter}/tree-sitter.wasm`;

export class TextModelTreeSitter extends Disposable {
	private _treeSitterTree: TreeSitterTree | undefined;

	// Not currently used since we just get telemetry, but later this will be needed.
	get tree() { return this._treeSitterTree; }

	constructor(readonly model: ITextModel,
		private readonly _treeSitterParser: TreeSitterLanguages,
		private readonly _treeSitterImporter: TreeSitterImporter,
		private readonly _logService: ILogService,
		private readonly _telemetryService: ITelemetryService
	) {
		super();
		this._register(Event.runAndSubscribe(this.model.onDidChangeLanguage, (e => this._onDidChangeLanguage(e ? e.newLanguage : this.model.getLanguageId()))));
	}

	private readonly _languageSessionDisposables = this._register(new DisposableStore());
	/**
	 * Be very careful when making changes to this method as it is easy to introduce race conditions.
	 */
	private async _onDidChangeLanguage(languageId: string) {
		this._languageSessionDisposables.clear();
		this._treeSitterTree = undefined;

		const token = cancelOnDispose(this._languageSessionDisposables);
		const language = await this._treeSitterParser.getLanguage(languageId);
		if (!language || token.isCancellationRequested) {
			return;
		}

		const Parser = await this._treeSitterImporter.getParserClass();
		if (token.isCancellationRequested) {
			return;
		}

		const treeSitterTree = this._languageSessionDisposables.add(new TreeSitterTree(new Parser(), language, this._logService, this._telemetryService));
		this._languageSessionDisposables.add(this.model.onDidChangeContent(e => this._onDidChangeContent(treeSitterTree, e)));
		await this._onDidChangeContent(treeSitterTree);
		if (token.isCancellationRequested) {
			return;
		}

		this._treeSitterTree = treeSitterTree;
	}

	private async _onDidChangeContent(treeSitterTree: TreeSitterTree, e?: IModelContentChangedEvent) {
		return treeSitterTree.onDidChangeContent(this.model, e);
	}
}

const enum TelemetryParseType {
	Full = 'fullParse',
	Incremental = 'incrementalParse'
}

export class TreeSitterTree implements IDisposable {
	private _tree: Parser.Tree | undefined;
	private _isDisposed: boolean = false;
	constructor(public readonly parser: Parser,
		public /** exposed for tests **/ readonly language: Parser.Language,
		private readonly _logService: ILogService,
		private readonly _telemetryService: ITelemetryService) {
		this.parser.setTimeoutMicros(50 * 1000); // 50 ms
		this.parser.setLanguage(language);
	}
	dispose(): void {
		this._isDisposed = true;
		this._tree?.delete();
		this.parser?.delete();
	}
	get tree() { return this._tree; }
	set tree(newTree: Parser.Tree | undefined) {
		this._tree?.delete();
		this._tree = newTree;
	}
	get isDisposed() { return this._isDisposed; }

	private _onDidChangeContentQueue: Promise<void> = Promise.resolve();
	public async onDidChangeContent(model: ITextModel, e?: IModelContentChangedEvent) {
		this._onDidChangeContentQueue = this._onDidChangeContentQueue.then(() => {
			if (this.isDisposed) {
				// No need to continue the queue if we are disposed
				return;
			}
			return this._onDidChangeContent(model, e);
		}).catch((e) => {
			this._logService.error('Error parsing tree-sitter tree', e);
		});
		return this._onDidChangeContentQueue;
	}

	private async _onDidChangeContent(model: ITextModel, e?: IModelContentChangedEvent) {
		if (e) {
			for (const change of e.changes) {
				const newEndOffset = change.rangeOffset + change.text.length;
				const newEndPosition = model.getPositionAt(newEndOffset);

				this.tree?.edit({
					startIndex: change.rangeOffset,
					oldEndIndex: change.rangeOffset + change.rangeLength,
					newEndIndex: change.rangeOffset + change.text.length,
					startPosition: { row: change.range.startLineNumber - 1, column: change.range.startColumn - 1 },
					oldEndPosition: { row: change.range.endLineNumber - 1, column: change.range.endColumn - 1 },
					newEndPosition: { row: newEndPosition.lineNumber - 1, column: newEndPosition.column - 1 }
				});
			}
		}

		this.tree = await this.parse(model);
	}

	private parse(model: ITextModel): Promise<Parser.Tree | undefined> {
		let parseType: TelemetryParseType = TelemetryParseType.Full;
		if (this.tree) {
			parseType = TelemetryParseType.Incremental;
		}
		return this._parseAndYield(model, parseType);
	}

	private async _parseAndYield(model: ITextModel, parseType: TelemetryParseType): Promise<Parser.Tree | undefined> {
		const language = model.getLanguageId();
		let tree: Parser.Tree | undefined;
		let time: number = 0;
		let passes: number = 0;
		do {
			const timer = performance.now();
			try {
				tree = this.parser.parse((index: number, position?: Parser.Point) => this._parseCallback(model, index), this.tree);
			} catch (e) {
				// parsing can fail when the timeout is reached, will resume upon next loop
			} finally {
				time += performance.now() - timer;
				passes++;
			}

			// Even if the model changes and edits are applied, the tree parsing will continue correctly after the await.
			await new Promise<void>(resolve => setTimeout0(resolve));

			if (model.isDisposed() || this.isDisposed) {
				return;
			}
		} while (!tree);
		this.sendParseTimeTelemetry(parseType, language, time, passes);
		return tree;
	}

	private _parseCallback(textModel: ITextModel, index: number): string | null {
		return textModel.getTextBuffer().getNearestChunk(index);
	}

	private sendParseTimeTelemetry(parseType: TelemetryParseType, languageId: string, time: number, passes: number): void {
		this._logService.debug(`Tree parsing (${parseType}) took ${time} ms and ${passes} passes.`);
		type ParseTimeClassification = {
			owner: 'alros';
			comment: 'Used to understand how long it takes to parse a tree-sitter tree';
			languageId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The programming language ID.' };
			time: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The ms it took to parse' };
			passes: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The number of passes it took to parse' };
		};
		if (parseType === TelemetryParseType.Full) {
			this._telemetryService.publicLog2<{ languageId: string; time: number; passes: number }, ParseTimeClassification>(`treeSitter.fullParse`, { languageId, time, passes });
		} else {
			this._telemetryService.publicLog2<{ languageId: string; time: number; passes: number }, ParseTimeClassification>(`treeSitter.incrementalParse`, { languageId, time, passes });
		}
	}
}

export class TreeSitterLanguages extends Disposable {
	private _languages: Map<string, Parser.Language> = new Map();

	constructor(private readonly _treeSitterImporter: TreeSitterImporter,
		private readonly _fileService: IFileService
	) {
		super();
	}

	public async getLanguage(languageId: string): Promise<Parser.Language | undefined> {
		let language = this._languages.get(languageId);
		if (!language) {
			language = await this._fetchLanguage(languageId);
			if (!language) {
				return undefined;
			}
			this._languages.set(languageId, language);
		}
		return language;
	}

	private async _fetchLanguage(languageId: string): Promise<Parser.Language | undefined> {
		const grammarName = TreeSitterTokenizationRegistry.get(languageId);
		const languageLocation = this._getLanguageLocation(languageId);
		if (!grammarName || !languageLocation) {
			return undefined;
		}
		const wasmPath: AppResourcePath = `${languageLocation}/${grammarName.name}.wasm`;
		const languageFile = await (this._fileService.readFile(FileAccess.asFileUri(wasmPath)));
		const Parser = await this._treeSitterImporter.getParserClass();
		return Parser.Language.load(languageFile.value.buffer);
	}

	private _getLanguageLocation(languageId: string): AppResourcePath | undefined {
		const grammarName = TreeSitterTokenizationRegistry.get(languageId);
		if (!grammarName) {
			return undefined;
		}
		return moduleLocationTreeSitter;
	}
}

export class TreeSitterImporter {
	private _treeSitterImport: typeof import('@vscode/tree-sitter-wasm') | undefined;
	private async _getTreeSitterImport() {
		if (!this._treeSitterImport) {
			this._treeSitterImport = await importAMDNodeModule<typeof import('@vscode/tree-sitter-wasm')>('@vscode/tree-sitter-wasm', 'wasm/tree-sitter.js');
		}
		return this._treeSitterImport;
	}

	private _parserClass: typeof Parser | undefined;
	public async getParserClass() {
		if (!this._parserClass) {
			this._parserClass = (await this._getTreeSitterImport()).Parser;
		}
		return this._parserClass;
	}
}

export class TreeSitterTextModelService extends Disposable implements ITreeSitterParserService {
	readonly _serviceBrand: undefined;
	private _init!: Promise<boolean>;
	private _textModelTreeSitters: DisposableMap<ITextModel, TextModelTreeSitter> = this._register(new DisposableMap());
	private _registeredLanguages: DisposableMap<string, IDisposable> = this._register(new DisposableMap());
	private readonly _treeSitterImporter: TreeSitterImporter = new TreeSitterImporter();
	private readonly _treeSitterParser: TreeSitterLanguages;

	constructor(@IModelService private readonly _modelService: IModelService,
		@IFileService fileService: IFileService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ILogService private readonly _logService: ILogService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();
		this._treeSitterParser = this._register(new TreeSitterLanguages(this._treeSitterImporter, fileService));
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(EDITOR_EXPERIMENTAL_PREFER_TREESITTER)) {
				this._supportedLanguagesChanged();
			}
		}));
		this._supportedLanguagesChanged();
	}

	private async _doInitParser() {
		const Parser = await this._treeSitterImporter.getParserClass();
		await Parser.init({
			locateFile(_file: string, _folder: string) {
				return FileAccess.asBrowserUri(moduleLocationTreeSitterWasm).toString(true);
			}
		});
		return true;
	}

	private _hasInit: boolean = false;
	private async _initParser(hasLanguages: boolean): Promise<boolean> {
		if (this._hasInit) {
			return this._init;
		}

		if (hasLanguages) {
			this._hasInit = true;
			this._init = this._doInitParser();

			// New init, we need to deal with all the existing text models and set up listeners
			this._init.then(() => this._registerModelServiceListeners());
		} else {
			this._init = Promise.resolve(false);
		}
		return this._init;
	}

	private async _supportedLanguagesChanged() {
		const setting = this._getSetting();

		let hasLanguages = true;
		if (setting.length === 0) {
			hasLanguages = false;
		}

		if (await this._initParser(hasLanguages)) {
			// Eventually, this should actually use an extension point to add tree sitter grammars, but for now they are hard coded in core
			if (setting.includes('typescript')) {
				this._addGrammar('typescript', 'tree-sitter-typescript');
			} else {
				this._removeGrammar('typescript');
			}
		}
	}

	private _getSetting(): string[] {
		return this._configurationService.getValue<string[]>(EDITOR_EXPERIMENTAL_PREFER_TREESITTER) || [];
	}

	private async _registerModelServiceListeners() {
		this._register(this._modelService.onModelAdded(model => {
			this._createTextModelTreeSitter(model);
		}));
		this._register(this._modelService.onModelRemoved(model => {
			this._textModelTreeSitters.deleteAndDispose(model);
		}));
		this._modelService.getModels().forEach(model => this._createTextModelTreeSitter(model));
	}

	private _createTextModelTreeSitter(model: ITextModel) {
		const textModelTreeSitter = new TextModelTreeSitter(model, this._treeSitterParser, this._treeSitterImporter, this._logService, this._telemetryService);
		this._textModelTreeSitters.set(model, textModelTreeSitter);
	}

	private _addGrammar(languageId: string, grammarName: string) {
		if (!TreeSitterTokenizationRegistry.get(languageId)) {
			this._registeredLanguages.set(languageId, TreeSitterTokenizationRegistry.register(languageId, { name: grammarName }));
		}
	}

	private _removeGrammar(languageId: string) {
		if (this._registeredLanguages.has(languageId)) {
			this._registeredLanguages.deleteAndDispose('typescript');
		}
	}
}
