/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// import { IAsyncDataSource, ITreeRenderer, ITreeNode } from 'vs/base/browser/ui/tree/tree';
// import * as modes from 'vs/editor/common/modes';
// import { ITextModelContentProvider, ITextModelService } from 'vs/editor/common/services/resolverService';
// import { URI } from 'vs/base/common/uri';
// import { ITextModel } from 'vs/editor/common/model';
// import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
// import { IModeService } from 'vs/editor/common/services/modeService';
// import { IModelService } from 'vs/editor/common/services/modelService';
// import { createTextBufferFactoryFromSnapshot } from 'vs/editor/common/model/textModel';

// export class BulkEditPreviewProvider implements ITextModelContentProvider {

// 	static readonly Schema = 'vscode-bulkeditpreview';

// 	static asPreviewUri(uri: URI): URI {
// 		return URI.from({ scheme: BulkEditPreviewProvider.Schema, path: uri.toString() });
// 	}

// 	static fromPreviewUri(uri: URI): URI {
// 		return URI.parse(uri.path);
// 	}

// 	constructor(
// 		@IModeService private readonly _modeService: IModeService,
// 		@IModelService private readonly _modelService: IModelService,
// 		@ITextModelService private readonly textModelResolverService: ITextModelService
// 	) {
// 		this.textModelResolverService.registerTextModelContentProvider(BulkEditPreviewProvider.Schema, this);
// 	}

// 	async provideTextContent(previewUri: URI) {

// 		const resourceUri = BulkEditPreviewProvider.fromPreviewUri(previewUri);

// 		const ref = await this.textModelResolverService.createModelReference(resourceUri);

// 		const sourceModel = ref.object.textEditorModel;

// 		const previewModel = this._modelService.createModel(
// 			createTextBufferFactoryFromSnapshot(sourceModel.createSnapshot()),
// 			this._modeService.create(sourceModel.getLanguageIdentifier().language),
// 			previewUri
// 		);

// 		return null;
// 	}
// }
