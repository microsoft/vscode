/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { AppResourcePath, FileAccess } from '../../../../base/common/network.js';
import { ITreeSitterTokenizationSupport, LazyTokenizationSupport, TreeSitterTokenizationRegistry } from '../../../../editor/common/languages.js';
import { EDITOR_EXPERIMENTAL_PREFER_TREESITTER, ITreeSitterImporter, TREESITTER_ALLOWED_SUPPORT } from '../../../../editor/common/services/treeSitterBefore/treeSitterParserService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { LanguageId } from '../../../../editor/common/encodedTokenAttributes.js';

type TreeSitterQueries = string;

export const ITreeSitterTokenizationFeature = createDecorator<ITreeSitterTokenizationFeature>('treeSitterTokenizationFeature');

export interface ITreeSitterTokenizationFeature {
	_serviceBrand: undefined;
}

interface EndOffsetToken {
	endOffset: number;
	metadata: number;
}

interface EndOffsetAndScopes {
	endOffset: number;
	scopes: string[];
	bracket?: number[];
	encodedLanguageId: LanguageId;
}

interface EndOffsetWithMeta extends EndOffsetAndScopes {
	metadata?: number;
}

export const TREESITTER_BASE_SCOPES: Record<string, string> = {
	'css': 'source.css',
	'typescript': 'source.ts',
	'ini': 'source.ini',
	'regex': 'source.regex',
};

const BRACKETS = /[\{\}\[\]\<\>\(\)]/g;

export class TreeSitterTokenizationFeature extends Disposable implements ITreeSitterTokenizationFeature {
	public _serviceBrand: undefined;
	private readonly _tokenizersRegistrations: DisposableMap<string, DisposableStore> = this._register(new DisposableMap());

	constructor(
		@ITreeSitterImporter private readonly _treeSitterImporter: ITreeSitterImporter,
		@ILanguageService private readonly _languageService: ILanguageService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IFileService private readonly _fileService: IFileService
	) {
		super();

		this._handleGrammarsExtPoint();
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(EDITOR_EXPERIMENTAL_PREFER_TREESITTER)) {
				this._handleGrammarsExtPoint();
			}
		}));
	}

	private _getSetting(languageId: string): boolean {
		return this._configurationService.getValue<boolean>(`${EDITOR_EXPERIMENTAL_PREFER_TREESITTER}.${languageId}`);
	}

	private _handleGrammarsExtPoint(): void {
		// Eventually, this should actually use an extension point to add tree sitter grammars, but for now they are hard coded in core
		for (const languageId of TREESITTER_ALLOWED_SUPPORT) {
			const setting = this._getSetting(languageId);
			if (setting && !this._tokenizersRegistrations.has(languageId)) {
				const lazyTokenizationSupport = new LazyTokenizationSupport(() => this._createTokenizationSupport(languageId));
				const disposableStore = new DisposableStore();
				disposableStore.add(lazyTokenizationSupport);
				disposableStore.add(TreeSitterTokenizationRegistry.registerFactory(languageId, lazyTokenizationSupport));
				this._tokenizersRegistrations.set(languageId, disposableStore);
				TreeSitterTokenizationRegistry.getOrCreate(languageId);
			}
		}
		const languagesToUnregister = [...this._tokenizersRegistrations.keys()].filter(languageId => !this._getSetting(languageId));
		for (const languageId of languagesToUnregister) {
			this._tokenizersRegistrations.deleteAndDispose(languageId);
		}
	}

	private async _fetchQueries(newLanguage: string): Promise<TreeSitterQueries> {
		const languageLocation: AppResourcePath = `vs/editor/common/languages/highlights/${newLanguage}.scm`;
		const query = await this._fileService.readFile(FileAccess.asFileUri(languageLocation));
		return query.value.toString();
	}

	private async _createTokenizationSupport(languageId: string): Promise<ITreeSitterTokenizationSupport & IDisposable | null> {
		const queries = await this._fetchQueries(languageId);
		const Query = await this._treeSitterImporter.getQueryClass();
		return this._instantiationService.createInstance(TreeSitterTokenizationSupport, queries, Query, languageId, this._languageService.languageIdCodec);
	}
}

export class TreeSitterTokenizationSupport extends Disposable implements ITreeSitterTokenizationSupport {

}

registerSingleton(ITreeSitterTokenizationFeature, TreeSitterTokenizationFeature, InstantiationType.Eager);

