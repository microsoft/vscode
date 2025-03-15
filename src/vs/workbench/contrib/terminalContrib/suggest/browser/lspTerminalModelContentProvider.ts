/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { ITextModelContentProvider, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { URI } from '../../../../../base/common/uri.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { Schemas } from '../../../../../base/common/network.js';

// TODO: Where do I instantiate this? My guess is `terminal.suggest.contribution.ts`
export class LspTerminalModelContentProvider extends Disposable implements ITextModelContentProvider {
	static readonly scheme = Schemas.vscodeTerminal;

	constructor(
		@ITextModelService textModelService: ITextModelService,
		@IModelService private readonly _modelService: IModelService,
		@ILanguageService private readonly _languageService: ILanguageService
	) {
		super();
		this._register(textModelService.registerTextModelContentProvider(LspTerminalModelContentProvider.scheme, this));
	}

	async provideTextContent(resource: URI): Promise<ITextModel | null> {
		const existing = this._modelService.getModel(resource);
		if (existing && !existing.isDisposed()) {
			return existing;
		}

		// This would probably not work since `.py` != `.python`. Could just pass around shellTypes or use API.
		// TODO: Reference other TextModelContentProvider implementations.
		const extension = resource.path.split('.').pop();

		let languageId = extension ? this._languageService.getLanguageIdByLanguageName(extension) : undefined;
		languageId = 'python'; // Can't remember if this is ms-python or python.
		const languageSelection = languageId ? this._languageService.createById(languageId) : this._languageService.createById('plaintext');

		return this._modelService.createModel('', languageSelection, resource, false);
	}
}
