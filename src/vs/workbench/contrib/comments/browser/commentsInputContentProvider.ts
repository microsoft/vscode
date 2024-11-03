/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { IEditorContribution, ScrollType } from '../../../../editor/common/editorCommon.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITextModelContentProvider, ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { ITextResourceEditorInput } from '../../../../platform/editor/common/editor.js';
import { applyTextEditorOptions } from '../../../common/editor/editorOptions.js';
import { SimpleCommentEditor } from './simpleCommentEditor.js';

export class CommentsInputContentProvider extends Disposable implements ITextModelContentProvider, IEditorContribution {

	public static readonly ID = 'comments.input.contentProvider';

	constructor(
		@ITextModelService textModelService: ITextModelService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@IModelService private readonly _modelService: IModelService,
		@ILanguageService private readonly _languageService: ILanguageService,
	) {
		super();
		this._register(textModelService.registerTextModelContentProvider(Schemas.commentsInput, this));

		this._register(codeEditorService.registerCodeEditorOpenHandler(async (input: ITextResourceEditorInput, editor: ICodeEditor | null, _sideBySide?: boolean): Promise<ICodeEditor | null> => {
			if (!(editor instanceof SimpleCommentEditor)) {
				return null;
			}

			if (editor.getModel()?.uri.toString() !== input.resource.toString()) {
				return null;
			}

			if (input.options) {
				applyTextEditorOptions(input.options, editor, ScrollType.Immediate);
			}
			return editor;
		}));
	}

	async provideTextContent(resource: URI): Promise<ITextModel | null> {
		const existing = this._modelService.getModel(resource);
		return existing ?? this._modelService.createModel('', this._languageService.createById('markdown'), resource);
	}
}
