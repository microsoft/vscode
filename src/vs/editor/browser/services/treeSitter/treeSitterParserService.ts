/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TreeSitterTokenizationRegistry } from 'vs/editor/common/languages';
import type { Parser } from '@vscode/tree-sitter-wasm';
import { AppResourcePath, FileAccess, nodeModulesPath } from 'vs/base/common/network';
import { ITreeSitterParserService } from 'vs/editor/common/services/treeSitterParserService';
import { IModelService } from 'vs/editor/common/services/model';
import { Disposable, DisposableMap, IDisposable } from 'vs/base/common/lifecycle';
import { ITextModel } from 'vs/editor/common/model';
import { IFileService } from 'vs/platform/files/common/files';
import { IModelContentChangedEvent } from 'vs/editor/common/textModelEvents';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ILogService } from 'vs/platform/log/common/log';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { setTimeout0 } from 'vs/base/common/platform';
import { importAMDNodeModule } from 'vs/amdX';

const EDITOR_EXPERIMENTAL_PREFER_TREESITTER = 'editor.experimental.preferTreeSitter';
const moduleLocationTreeSitter: AppResourcePath = `${nodeModulesPath}/@vscode/tree-sitter-wasm/wasm`;
const moduleLocationTreeSitterWasm: AppResourcePath = `${moduleLocationTreeSitter}/tree-sitter.wasm`;

class TextModelTreeSitter extends Disposable {
	private _treeSitterTree: TreeSitterTree | undefined;
	private _contentChangedListener: IDisposable | undefined;

	constructor(readonly model: ITextModel,
		private readonly _treeSitterParser: TreeSitterParser,
		private readonly _treeSitterImporter: TreeSitterImporter,
	) {
		super();
		this._register(this.model.onDidChangeLanguage(e => this._onDidChangeLanguage(e)));
		this._onDidChangeLanguage({ newLanguage: this.model.getLanguageId() });
	}

	private _registerModelListeners() {
		this._contentChangedListener = this.model.onDidChangeContent(e => this._onDidChangeContent(e));
		this._onDidChangeContent();
	}

	private _unregisterModelListeners() {
		this._contentChangedListener?.dispose();
	}

	private async _onDidChangeLanguage(e: { newLanguage: string }) {
		if (this._treeSitterTree) {
			this._treeSitterTree.dispose();
		}
		const language = await this._treeSitterParser.getLanguage(e.newLanguage);
		if (!language || this.model.isDisposed()) {
			this._unregisterModelListeners();
			return;
		}

		const Parser = await this._treeSitterImporter.getParserClass();
		this._treeSitterTree = new TreeSitterTree(new Parser(), language);
		this._registerModelListeners();
	}

	private async _onDidChangeContent(e?: IModelContentChangedEvent) {
		if (!this._treeSitterTree) {
			return;
		}

		if (e) {
			for (const change of e.changes) {
				const newEndOffset = change.rangeOffset + change.text.length;
				const newEndPosition = this.model.getPositionAt(newEndOffset);

				this._treeSitterTree.tree?.edit({
					startIndex: change.rangeOffset,
					oldEndIndex: change.rangeOffset + change.rangeLength,
					newEndIndex: change.rangeOffset + change.text.length,
					startPosition: { row: change.range.startLineNumber - 1, column: change.range.startColumn - 1 },
					oldEndPosition: { row: change.range.endLineNumber - 1, column: change.range.endColumn - 1 },
					newEndPosition: { row: newEndPosition.lineNumber - 1, column: newEndPosition.column - 1 }
				});
			}
		}

		this._treeSitterTree.tree = await this._treeSitterParser.parse(this.model, this._treeSitterTree);
	}

	override dispose() {
		super.dispose();
		this._treeSitterTree?.dispose();
		this._unregisterModelListeners();
	}
}

export class TreeSitterTree implements IDisposable {
	private _tree: Parser.Tree | undefined;
	private _isDisposed: boolean = false;
	constructor(public readonly parser: Parser, language: Parser.Language) {
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
}

class TreeSitterParser extends Disposable {
	private _languages: Map<string, Parser.Language> = new Map();

	constructor(private readonly _treeSitterImporter: TreeSitterImporter,
		private readonly _fileService: IFileService,
		private readonly _logService: ILogService,
		private readonly _telemetryService: ITelemetryService
	) {
		super();
	}

	public parse(model: ITextModel, treeSitterTree: TreeSitterTree): Promise<Parser.Tree | undefined> {
		let telemetryTag: string;
		if (treeSitterTree.tree) {
			telemetryTag = 'incrementalParse';
		} else {
			telemetryTag = 'fullParse';
		}
		return this._parseAndYield(model, treeSitterTree, telemetryTag);
	}

	private async _parseAndYield(model: ITextModel, treeSitterTree: TreeSitterTree, telemetryTag: string): Promise<Parser.Tree | undefined> {
		const language = model.getLanguageId();
		let tree: Parser.Tree | undefined;
		let time: number = 0;
		let passes: number = 0;
		do {
			const timer = performance.now();
			try {
				tree = treeSitterTree.parser.parse((index: number, position?: Parser.Point) => this._parseCallback(model, index), treeSitterTree.tree);
			} catch (e) {
				// parsing can fail when the timeout is reached, will resume upon next loop
			} finally {
				time += performance.now() - timer;
				passes++;
			}

			// Even if the model changes and edits are applied, the tree parsing will continue correctly after the await.
			await new Promise<void>(resolve => setTimeout0(resolve));

			if (model.isDisposed() || treeSitterTree.isDisposed) {
				return;
			}
		} while (!tree);
		this.sendParseTimeTelemetry(telemetryTag, language, time, passes);
		return tree;
	}

	private _parseCallback(textModel: ITextModel, index: number): string | null {
		return textModel.getTextBuffer().getNearestChunk(index);
	}

	private sendParseTimeTelemetry(eventName: string, languageId: string, time: number, passes: number): void {
		this._logService.info(`Tree parsing (${eventName}) took ${time} ms and ${passes} passes.`);
		type ParseTimeClassification = {
			owner: 'alros';
			comment: 'Used to understand how long it takes to parse a tree-sitter tree';
			languageId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The programming language ID.' };
			time: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The ms it took to parse' };
			passes: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The number of passes it took to parse' };
		};
		this._telemetryService.publicLog2<{ languageId: string; time: number; passes: number }, ParseTimeClassification>(`treeSitter.${eventName}`, { languageId, time, passes });
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

class TreeSitterImporter {
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
	private _registeredLanguages: DisposableMap<string, IDisposable> = new DisposableMap();
	private readonly _treeSitterImporter: TreeSitterImporter = new TreeSitterImporter();
	private readonly _treeSitterParser: TreeSitterParser;

	constructor(@IModelService private readonly _modelService: IModelService,
		@IFileService fileService: IFileService,
		@ITelemetryService telemetryService: ITelemetryService,
		@ILogService logService: ILogService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();
		this._treeSitterParser = this._register(new TreeSitterParser(this._treeSitterImporter, fileService, logService, telemetryService));
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

	private async _createTextModelTreeSitter(model: ITextModel) {
		const textModelTreeSitter = new TextModelTreeSitter(model, this._treeSitterParser, this._treeSitterImporter);
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

	public override dispose(): void {
		super.dispose();
		this._textModelTreeSitters.dispose();
	}
}
