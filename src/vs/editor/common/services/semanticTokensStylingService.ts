/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { ILanguageService } from '../languages/language.js';
import { DocumentTokensProvider } from './model.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { SemanticTokensProviderStyling } from './semanticTokensProviderStyling.js';
import { ISemanticTokensStylingService } from './semanticTokensStyling.js';
import { InstantiationType, registerSingleton } from '../../../platform/instantiation/common/extensions.js';

export class SemanticTokensStylingService extends Disposable implements ISemanticTokensStylingService {

	public _serviceBrand: undefined;

	private _caches: WeakMap<DocumentTokensProvider, SemanticTokensProviderStyling>;

	constructor(
		@IThemeService private readonly _themeService: IThemeService,
		@ILogService private readonly _logService: ILogService,
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
			this._caches.set(provider, new SemanticTokensProviderStyling(provider.getLegend(), this._themeService, this._languageService, this._logService));
		}
		return this._caches.get(provider)!;
	}
}

registerSingleton(ISemanticTokensStylingService, SemanticTokensStylingService, InstantiationType.Delayed);
