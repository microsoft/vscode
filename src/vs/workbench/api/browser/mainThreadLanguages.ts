/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI, UriComponents } from '../../../base/common/uri.js';
import { ILanguageService } from '../../../editor/common/languages/language.js';
import { IModelService } from '../../../editor/common/services/model.js';
import { MainThreadLanguagesShape, MainContext, ExtHostContext, ExtHostLanguagesShape } from '../common/extHost.protocol.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { IPosition } from '../../../editor/common/core/position.js';
import { IRange, Range } from '../../../editor/common/core/range.js';
import { StandardTokenType } from '../../../editor/common/encodedTokenAttributes.js';
import { ITextModelService } from '../../../editor/common/services/resolverService.js';
import { ILanguageStatus, ILanguageStatusService } from '../../services/languageStatus/common/languageStatusService.js';
import { DisposableMap, DisposableStore } from '../../../base/common/lifecycle.js';

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
	) {
		this._proxy = _extHostContext.getProxy(ExtHostContext.ExtHostLanguages);

		this._proxy.$acceptLanguageIds(_languageService.getRegisteredLanguageIds());
		this._disposables.add(_languageService.onDidChange(_ => {
			this._proxy.$acceptLanguageIds(_languageService.getRegisteredLanguageIds());
		}));
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

	// --- language status

	$setLanguageStatus(handle: number, status: ILanguageStatus): void {
		this._status.get(handle)?.dispose();
		this._status.set(handle, this._languageStatusService.addStatus(status));
	}

	$removeLanguageStatus(handle: number): void {
		this._status.get(handle)?.dispose();
	}
}
