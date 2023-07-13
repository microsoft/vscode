/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI, UriComponents } from 'vs/base/common/uri';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { IModelService } from 'vs/editor/common/services/model';
import { MainThreadLanguagesShape, MainContext, ExtHostContext, ExtHostLanguagesShape } from '../common/extHost.protocol';
import { extHostNamedCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { IPosition } from 'vs/editor/common/core/position';
import { IRange, Range } from 'vs/editor/common/core/range';
import { StandardTokenType } from 'vs/editor/common/encodedTokenAttributes';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { grammarsExtPoint, ITMSyntaxExtensionPoint } from 'vs/workbench/services/textMate/common/TMGrammars';
import { IExtensionService, ExtensionPointContribution } from 'vs/workbench/services/extensions/common/extensions';
import { ILanguageStatus, ILanguageStatusService } from 'vs/workbench/services/languageStatus/common/languageStatusService';
import { DisposableMap, DisposableStore } from 'vs/base/common/lifecycle';

interface ModeScopeMap {
	[key: string]: string;
}

export interface IGrammarContributions {
	getGrammar(mode: string): string;
}

class GrammarContributions implements IGrammarContributions {

	private static _grammars: ModeScopeMap = {};

	constructor(contributions: ExtensionPointContribution<ITMSyntaxExtensionPoint[]>[]) {
		if (!Object.keys(GrammarContributions._grammars).length) {
			this.fillModeScopeMap(contributions);
		}
	}

	private fillModeScopeMap(contributions: ExtensionPointContribution<ITMSyntaxExtensionPoint[]>[]) {
		contributions.forEach((contribution) => {
			contribution.value.forEach((grammar) => {
				if (grammar.language && grammar.scopeName) {
					GrammarContributions._grammars[grammar.language] = grammar.scopeName;
				}
			});
		});
	}

	public getGrammar(mode: string): string {
		return GrammarContributions._grammars[mode];
	}
}

@extHostNamedCustomer(MainContext.MainThreadLanguages)
export class MainThreadLanguages implements MainThreadLanguagesShape {

	private readonly _disposables = new DisposableStore();
	private readonly _proxy: ExtHostLanguagesShape;

	private readonly _status = new DisposableMap<number>();

	constructor(
		_extHostContext: IExtHostContext,
		@ILanguageService private readonly _languageService: ILanguageService,
		@IModelService private readonly _modelService: IModelService,
		@ITextModelService private _resolverService: ITextModelService,
		@ILanguageStatusService private readonly _languageStatusService: ILanguageStatusService,
		@IExtensionService extensionService: IExtensionService,
	) {
		this._proxy = _extHostContext.getProxy(ExtHostContext.ExtHostLanguages);

		this._proxy.$acceptLanguageIds(_languageService.getRegisteredLanguageIds());
		this._disposables.add(_languageService.onDidChange(_ => {
			this._proxy.$acceptLanguageIds(_languageService.getRegisteredLanguageIds());
		}));
		this._disposables.add(this.extensionService.onDidChangeExtensions(() => { this._extensionsUpdated = true; }));
	}

	dispose(): void {
		this._disposables.dispose();
		this._status.dispose();
	}

	async $changeLanguage(resource: UriComponents, languageId: string): Promise<void> {

		if (!this._languageService.isRegisteredLanguageId(languageId)) {
			return Promise.reject(new Error(`Unknown language id: ${languageId}`));
		}

		const uri = URI.revive(resource);
		const ref = await this._resolverService.createModelReference(uri);
		try {
			ref.object.textEditorModel.setLanguage(this._languageService.createById(languageId));
		} finally {
			ref.dispose();
		}
	}

	async $tokensAtPosition(resource: UriComponents, position: IPosition): Promise<undefined | { type: StandardTokenType; range: IRange }> {
		const uri = URI.revive(resource);
		const model = this._modelService.getModel(uri);
		if (!model) {
			return undefined;
		}
		model.tokenization.tokenizeIfCheap(position.lineNumber);
		const tokens = model.tokenization.getLineTokens(position.lineNumber);
		const idx = tokens.findTokenIndexAtOffset(position.column - 1);
		return {
			type: tokens.getStandardTokenType(idx),
			range: new Range(position.lineNumber, 1 + tokens.getStartOffset(idx), position.lineNumber, 1 + tokens.getEndOffset(idx))
		};
	}

	async $languageAtPosition(resource: UriComponents, position: IPosition): Promise<string | undefined> {
		const uri = URI.revive(resource);
		const model = this._modelService.getModel(uri);
		if (!model) {
			return undefined;
		}
		model.tokenization.tokenizeIfCheap(position.lineNumber);
		const languageId = model.getLanguageIdAtPosition(position.lineNumber, position.column);
	}

	private _extensionsUpdated = false;
	private _lastGrammarContributions: Promise<GrammarContributions> | undefined = undefined;
	async $scopeName(languageId: string): Promise<string | undefined> {
		if (this._extensionsUpdated) {
			this._extensionsUpdated = false;
			this._lastGrammarContributions = this.extensionService.readExtensionPointContributions(grammarsExtPoint).then((contributions) => {
				return new GrammarContributions(contributions);
			});
		}
		const grammarContributions = await this._lastGrammarContributions;
		return this._getGrammarContributions()?.getGrammar(languageId);
	}

	// --- language status

	$setLanguageStatus(handle: number, status: ILanguageStatus): void {
		this._status.get(handle)?.dispose();
		this._status.set(handle, this._languageStatusService.addStatus(status));
	}

	$removeLanguageStatus(handle: number): void {
		this._status.get(handle)?.dispose();
	}
}
