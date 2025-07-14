/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IReference, ReferenceCollection } from '../../../../../../base/common/lifecycle.js';
import { createDecorator, IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { CellKind } from '../../../common/notebookCommon.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';


export const INotebookOriginalCellModelFactory = createDecorator<INotebookOriginalCellModelFactory>('INotebookOriginalCellModelFactory');

export interface INotebookOriginalCellModelFactory {
	readonly _serviceBrand: undefined;
	getOrCreate(uri: URI, cellValue: string, language: string, cellKind: CellKind): IReference<ITextModel>;
}


export class OriginalNotebookCellModelReferenceCollection extends ReferenceCollection<ITextModel> {
	constructor(@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly _languageService: ILanguageService,
	) {
		super();
	}

	protected override createReferencedObject(_key: string, uri: URI, cellValue: string, language: string, cellKind: CellKind): ITextModel {
		const scheme = `${uri.scheme}-chat-edit`;
		const originalCellUri = URI.from({ scheme, fragment: uri.fragment, path: uri.path });
		const languageSelection = this._languageService.getLanguageIdByLanguageName(language) ? this._languageService.createById(language) : cellKind === CellKind.Markup ? this._languageService.createById('markdown') : null;
		return this.modelService.createModel(cellValue, languageSelection, originalCellUri);
	}
	protected override destroyReferencedObject(_key: string, model: ITextModel): void {
		model.dispose();
	}
}

export class OriginalNotebookCellModelFactory implements INotebookOriginalCellModelFactory {
	readonly _serviceBrand: undefined;
	private readonly _data: OriginalNotebookCellModelReferenceCollection;
	constructor(@IInstantiationService instantiationService: IInstantiationService) {
		this._data = instantiationService.createInstance(OriginalNotebookCellModelReferenceCollection);
	}

	getOrCreate(uri: URI, cellValue: string, language: string, cellKind: CellKind): IReference<ITextModel> {
		return this._data.acquire(uri.toString(), uri, cellValue, language, cellKind);
	}
}


