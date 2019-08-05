/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { ITextModelService, ITextModelContentProvider } from 'vs/editor/common/services/resolverService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { ITextModel, DefaultEndOfLine, EndOfLinePreference, ITextBufferFactory } from 'vs/editor/common/model';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import * as marked from 'vs/base/common/marked/marked';
import { Schemas } from 'vs/base/common/network';
import { Range } from 'vs/editor/common/core/range';

export class WalkThroughContentProvider implements ITextModelContentProvider, IWorkbenchContribution {

	constructor(
		@ITextModelService private readonly textModelResolverService: ITextModelService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IModeService private readonly modeService: IModeService,
		@IModelService private readonly modelService: IModelService,
	) {
		this.textModelResolverService.registerTextModelContentProvider(Schemas.walkThrough, this);
	}

	public provideTextContent(resource: URI): Promise<ITextModel> {
		const query = resource.query ? JSON.parse(resource.query) : {};
		const content: Promise<string | ITextBufferFactory> = (query.moduleId ? new Promise<string>((resolve, reject) => {
			require([query.moduleId], content => {
				try {
					resolve(content.default());
				} catch (err) {
					reject(err);
				}
			});
		}) : this.textFileService.readStream(URI.file(resource.fsPath)).then(content => content.value));
		return content.then(content => {
			let codeEditorModel = this.modelService.getModel(resource);
			if (!codeEditorModel) {
				codeEditorModel = this.modelService.createModel(content, this.modeService.createByFilepathOrFirstLine(resource), resource);
			} else {
				this.modelService.updateModel(codeEditorModel, content);
			}

			return codeEditorModel;
		});
	}
}

export class WalkThroughSnippetContentProvider implements ITextModelContentProvider, IWorkbenchContribution {

	constructor(
		@ITextModelService private readonly textModelResolverService: ITextModelService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IModeService private readonly modeService: IModeService,
		@IModelService private readonly modelService: IModelService,
	) {
		this.textModelResolverService.registerTextModelContentProvider(Schemas.walkThroughSnippet, this);
	}

	public provideTextContent(resource: URI): Promise<ITextModel> {
		return this.textFileService.readStream(URI.file(resource.fsPath)).then(content => {
			let codeEditorModel = this.modelService.getModel(resource);
			if (!codeEditorModel) {
				const j = parseInt(resource.fragment);

				let codeSnippet = '';
				let languageName = '';
				let i = 0;
				const renderer = new marked.Renderer();
				renderer.code = (code, lang) => {
					if (i++ === j) {
						codeSnippet = code;
						languageName = lang;
					}
					return '';
				};

				const textBuffer = content.value.create(DefaultEndOfLine.LF);
				const lineCount = textBuffer.getLineCount();
				const range = new Range(1, 1, lineCount, textBuffer.getLineLength(lineCount) + 1);
				const markdown = textBuffer.getValueInRange(range, EndOfLinePreference.TextDefined);
				marked(markdown, { renderer });

				const languageId = this.modeService.getModeIdForLanguageName(languageName) || '';
				const languageSelection = this.modeService.create(languageId);
				codeEditorModel = this.modelService.createModel(codeSnippet, languageSelection, resource);
			} else {
				this.modelService.updateModel(codeEditorModel, content.value);
			}

			return codeEditorModel;
		});
	}
}
