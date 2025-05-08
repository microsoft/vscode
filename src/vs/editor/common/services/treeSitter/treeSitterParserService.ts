/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as Parser from '@vscode/tree-sitter-wasm';
import { AppResourcePath, FileAccess } from '../../../../base/common/network.js';
import { EDITOR_EXPERIMENTAL_PREFER_TREESITTER, ITreeSitterParserService, ITextModelTreeSitter, TreeUpdateEvent, ITreeSitterImporter, TREESITTER_ALLOWED_SUPPORT, ModelTreeUpdateEvent } from '../treeSitterParserService.js';
import { IModelService } from '../model.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { ITextModel } from '../../model.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { TextModelTreeSitter, TextModelTreeSitterItem } from './textModelTreeSitter.js';
import { getModuleLocation, TreeSitterLanguages } from './treeSitterLanguages.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';

const EDITOR_TREESITTER_TELEMETRY = 'editor.experimental.treeSitterTelemetry';
const FILENAME_TREESITTER_WASM = `tree-sitter.wasm`;

export class TreeSitterTextModelService extends Disposable implements ITreeSitterParserService {
	readonly _serviceBrand: undefined;
	private _init!: Promise<boolean>;
	private _textModelTreeSitters: DisposableMap<ITextModel, TextModelTreeSitterItem> = this._register(new DisposableMap());
	private readonly _registeredLanguages: Map<string, string> = new Map();
	private readonly _treeSitterLanguages: TreeSitterLanguages;

	public readonly onDidAddLanguage: Event<{ id: string; language: Parser.Language }>;
	private _onDidUpdateTree: Emitter<TreeUpdateEvent> = this._register(new Emitter());
	public readonly onDidUpdateTree: Event<TreeUpdateEvent> = this._onDidUpdateTree.event;

	public isTest: boolean = false;

	constructor(@IModelService private readonly _modelService: IModelService,
		@IFileService fileService: IFileService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@ITreeSitterImporter private readonly _treeSitterImporter: ITreeSitterImporter,
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super();
		this._treeSitterLanguages = this._register(new TreeSitterLanguages(this._treeSitterImporter, fileService, this._environmentService, this._configurationService, this._registeredLanguages));
		this.onDidAddLanguage = this._treeSitterLanguages.onDidAddLanguage;
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(EDITOR_EXPERIMENTAL_PREFER_TREESITTER)) {
				this._supportedLanguagesChanged();
			}
		}));
		this._supportedLanguagesChanged();
	}

	getOrInitLanguage(languageId: string): Parser.Language | undefined {
		return this._treeSitterLanguages.getOrInitLanguage(languageId);
	}

	getParseResult(textModel: ITextModel): ITextModelTreeSitter | undefined {
		const textModelTreeSitter = this._textModelTreeSitters.get(textModel);
		return textModelTreeSitter?.textModelTreeSitter;
	}

	/**
	 * For testing
	 */
	async getTree(content: string, languageId: string): Promise<Parser.Tree | undefined> {
		const language = await this.getLanguage(languageId);
		const Parser = await this._treeSitterImporter.getParserClass();
		if (language) {
			const parser = new Parser();
			parser.setLanguage(language);
			return parser.parse(content) ?? undefined;
		}
		return undefined;
	}

	getTreeSync(content: string, languageId: string): Parser.Tree | undefined {
		const language = this.getOrInitLanguage(languageId);
		const Parser = this._treeSitterImporter.parserClass;
		if (language && Parser) {
			const parser = new Parser();
			parser.setLanguage(language);
			return parser.parse(content) ?? undefined;
		}
		return undefined;
	}

	async getLanguage(languageId: string): Promise<Parser.Language | undefined> {
		await this._init;
		return this._treeSitterLanguages.getLanguage(languageId);
	}

	private async _doInitParser() {
		const Parser = await this._treeSitterImporter.getParserClass();
		const environmentService = this._environmentService;
		const isTest = this.isTest;
		await Parser.init({
			locateFile(_file: string, _folder: string) {
				const location: AppResourcePath = `${getModuleLocation(environmentService)}/${FILENAME_TREESITTER_WASM}`;
				if (isTest) {
					return FileAccess.asFileUri(location).toString(true);
				} else {
					return FileAccess.asBrowserUri(location).toString(true);
				}
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
		let hasLanguages = false;

		const handleLanguage = (languageId: string) => {
			if (this._getSetting(languageId)) {
				hasLanguages = true;
				this._addGrammar(languageId, `tree-sitter-${languageId}`);
			} else {
				this._removeGrammar(languageId);
			}
		};

		// Eventually, this should actually use an extension point to add tree sitter grammars, but for now they are hard coded in core
		for (const languageId of TREESITTER_ALLOWED_SUPPORT) {
			handleLanguage(languageId);
		}

		return this._initParser(hasLanguages);
	}

	private _getSetting(languageId: string): boolean {
		const setting = this._configurationService.getValue<boolean>(`${EDITOR_EXPERIMENTAL_PREFER_TREESITTER}.${languageId}`);
		if (!setting && TREESITTER_ALLOWED_SUPPORT.includes(languageId)) {
			return this._configurationService.getValue<boolean>(EDITOR_TREESITTER_TELEMETRY);
		}
		return setting;
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

	public async getTextModelTreeSitter(model: ITextModel, parseImmediately: boolean = false): Promise<ITextModelTreeSitter> {
		await this.getLanguage(model.getLanguageId());
		return this._createTextModelTreeSitter(model, parseImmediately);
	}

	private _createTextModelTreeSitter(model: ITextModel, parseImmediately: boolean = true): ITextModelTreeSitter {
		const textModelTreeSitter = this._instantiationService.createInstance(TextModelTreeSitter, model, this._treeSitterLanguages, parseImmediately);
		const disposables = new DisposableStore();
		disposables.add(textModelTreeSitter);
		disposables.add(textModelTreeSitter.onDidChangeParseResult((e) => this._handleOnDidChangeParseResult(e, model)));
		this._textModelTreeSitters.set(model, {
			textModelTreeSitter,
			disposables,
			dispose: disposables.dispose.bind(disposables)
		});
		return textModelTreeSitter;
	}

	private _handleOnDidChangeParseResult(change: ModelTreeUpdateEvent, model: ITextModel) {
		this._onDidUpdateTree.fire({ textModel: model, ranges: change.ranges, versionId: change.versionId, tree: change.tree, languageId: change.languageId, hasInjections: change.hasInjections });
	}

	private _addGrammar(languageId: string, grammarName: string) {
		if (!this._registeredLanguages.has(languageId)) {
			this._registeredLanguages.set(languageId, grammarName);
		}
	}

	private _removeGrammar(languageId: string) {
		if (this._registeredLanguages.has(languageId)) {
			this._registeredLanguages.delete(languageId);
		}
	}
}


