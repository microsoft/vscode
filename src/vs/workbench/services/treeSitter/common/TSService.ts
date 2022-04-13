/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { grammarsExtPoint } from 'vs/workbench/services/treeSitter/common/TSGrammars';
import { Disposable, dispose, IDisposable } from 'vs/base/common/lifecycle';
import { Emitter, Event } from 'vs/base/common/event';
import { joinPath } from 'vs/base/common/resources';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { URI } from 'vs/base/common/uri';
import { ITokenizationSupport, ITokenizationSupportFactory, TokenizationRegistry } from 'vs/editor/common/languages';
import { TSTokenization } from 'vs/workbench/services/treeSitter/common/TSTokenization';



export interface IValidTSGrammarDefinition {
	location: URI;
	language?: string;
}

export interface ITreeSitterService {
	readonly _serviceBrand: undefined;

	onDidEncounterLanguage: Event<string>;
}

export const ITreeSitterService = createDecorator<ITreeSitterService>('treeSitterService');

class TSService extends Disposable {
	public _serviceBrand: undefined;
	private _grammarDefinitions: Map<string, IValidTSGrammarDefinition | null>;
	private readonly _createdModes: string[];
	private _tokenizersRegistrations: IDisposable[];

	private readonly _onDidEncounterLanguage: Emitter<string> = this._register(new Emitter<string>());
	public readonly onDidEncounterLanguage: Event<string> = this._onDidEncounterLanguage.event;

	constructor(
		@ILanguageService protected readonly _languageService: ILanguageService,
	) {
		super();
		this._grammarDefinitions = new Map();
		this._tokenizersRegistrations = [];
		this._createdModes = [];
		grammarsExtPoint.setHandler((extensions) => {
			this._tokenizersRegistrations = dispose(this._tokenizersRegistrations);
			for (const extension of extensions) {
				const grammars = extension.value;
				for (const grammar of grammars) {
					const grammarLocation = joinPath(extension.description.extensionLocation, grammar.path);

					let validLanguageId: string | null = null;
					if (grammar.language && this._languageService.isRegisteredLanguageId(grammar.language)) {
						validLanguageId = grammar.language;
					}

					if (validLanguageId) {
						this._tokenizersRegistrations.push(TokenizationRegistry.registerFactory(validLanguageId, this._createFactory(validLanguageId)));

						this._grammarDefinitions?.set(validLanguageId, {
							location: grammarLocation,
							language: validLanguageId ?? undefined
						});
					}
				}
			}

			for (const createMode of this._createdModes) {
				TokenizationRegistry.getOrCreate(createMode);
			}
		});

		this._languageService.onDidEncounterLanguage((languageId) => {
			this._createdModes.push(languageId);
		});
	}

	private _createFactory(languageId: string): ITokenizationSupportFactory {
		return {
			createTokenizationSupport: async (): Promise<ITokenizationSupport | null> => {
				if (!this._languageService.isRegisteredLanguageId(languageId)) {
					return null;
				}

				const grammar = this._grammarDefinitions.get(languageId);
				if (!grammar) {
					return null;
				}

				const tsTokenizationInstance = new TSTokenization(grammar);
				await tsTokenizationInstance.init();
				return tsTokenizationInstance;
			}
		};
	}

}

registerSingleton(ITreeSitterService, TSService);
