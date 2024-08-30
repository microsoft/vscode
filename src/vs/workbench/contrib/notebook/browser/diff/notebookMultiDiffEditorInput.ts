/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { ITextResourceConfigurationService } from '../../../../../editor/common/services/textResourceConfiguration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { MultiDiffEditorInput } from '../../../multiDiffEditor/browser/multiDiffEditorInput.js';
import { IMultiDiffSourceResolverService, IResolvedMultiDiffSource, type IMultiDiffSourceResolver } from '../../../multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { NotebookDiffViewModel } from './notebookDiffViewModel.js';
import { NotebookDiffEditorInput } from '../../common/notebookDiffEditorInput.js';
import { NotebookEditorInput } from '../../common/notebookEditorInput.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';

export const NotebookMultiDiffEditorScheme = 'multi-cell-notebook-diff-editor';

export class NotebookMultiDiffEditorInput extends NotebookDiffEditorInput {
	static override readonly ID: string = 'workbench.input.multiDiffNotebookInput';
	static override create(instantiationService: IInstantiationService, resource: URI, name: string | undefined, description: string | undefined, originalResource: URI, viewType: string) {
		const original = NotebookEditorInput.getOrCreate(instantiationService, originalResource, undefined, viewType);
		const modified = NotebookEditorInput.getOrCreate(instantiationService, resource, undefined, viewType);
		return instantiationService.createInstance(NotebookMultiDiffEditorInput, name, description, original, modified, viewType);
	}
}

export class NotebookMultiDiffEditorWidgetInput extends MultiDiffEditorInput implements IMultiDiffSourceResolver {
	public static createInput(notebookDiffViewModel: NotebookDiffViewModel, instantiationService: IInstantiationService): NotebookMultiDiffEditorWidgetInput {
		const multiDiffSource = URI.parse(`${NotebookMultiDiffEditorScheme}:${new Date().getMilliseconds().toString() + Math.random().toString()}`);
		return instantiationService.createInstance(
			NotebookMultiDiffEditorWidgetInput,
			multiDiffSource,
			notebookDiffViewModel
		);
	}
	constructor(
		multiDiffSource: URI,
		private readonly notebookDiffViewModel: NotebookDiffViewModel,
		@ITextModelService _textModelService: ITextModelService,
		@ITextResourceConfigurationService _textResourceConfigurationService: ITextResourceConfigurationService,
		@IInstantiationService _instantiationService: IInstantiationService,
		@IMultiDiffSourceResolverService _multiDiffSourceResolverService: IMultiDiffSourceResolverService,
		@ITextFileService _textFileService: ITextFileService,
	) {
		super(multiDiffSource, undefined, undefined, true, _textModelService, _textResourceConfigurationService, _instantiationService, _multiDiffSourceResolverService, _textFileService);
		this._register(_multiDiffSourceResolverService.registerResolver(this));
	}

	canHandleUri(uri: URI): boolean {
		return uri.toString() === this.multiDiffSource.toString();
	}

	async resolveDiffSource(_: URI): Promise<IResolvedMultiDiffSource> {
		return { resources: this.notebookDiffViewModel };
	}
}
