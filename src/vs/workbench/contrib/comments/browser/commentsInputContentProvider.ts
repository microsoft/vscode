/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { IEditorContribution, ScrollType } from 'vs/editor/common/editorCommon';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { ITextModelContentProvider, ITextModelService } from 'vs/editor/common/services/resolverService';
import { ITextResourceEditorInput } from 'vs/platform/editor/common/editor';
import { applyTextEditorOptions } from 'vs/workbench/common/editor/editorOptions';
import { SimpleCommentEditor } from 'vs/workbench/contrib/comments/browser/simpleCommentEditor';

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
