/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { DocumentTokensProvider } from 'vs/editor/common/services/model';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ILoggerService } from 'vs/platform/log/common/log';
import { SemanticTokensProviderStyling } from 'vs/editor/common/services/semanticTokensProviderStyling';
import { ISemanticTokensStylingService } from 'vs/editor/common/services/semanticTokensStyling';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';

export class SemanticTokensStylingService extends Disposable implements ISemanticTokensStylingService {

	public _serviceBrand: undefined;

	private _caches: WeakMap<DocumentTokensProvider, SemanticTokensProviderStyling>;

	constructor(
		@IThemeService private readonly _themeService: IThemeService,
		@ILoggerService private readonly _loggerService: ILoggerService,
		@ILanguageService private readonly _languageService: ILanguageService,
	) {
		super();
		this._caches = new WeakMap<DocumentTokensProvider, SemanticTokensProviderStyling>();
		this._register(this._themeService.onDidColorThemeChange(() => {
			this._caches = new WeakMap<DocumentTokensProvider, SemanticTokensProviderStyling>();
		}));
	}

	public getStyling(provider: DocumentTokensProvider): SemanticTokensProviderStyling {
		if (!this._caches.has(provider)) {
			this._caches.set(provider, new SemanticTokensProviderStyling(provider.getLegend(), this._themeService, this._languageService, this._loggerService));
		}
		return this._caches.get(provider)!;
	}
}

registerSingleton(ISemanticTokensStylingService, SemanticTokensStylingService, InstantiationType.Delayed);
