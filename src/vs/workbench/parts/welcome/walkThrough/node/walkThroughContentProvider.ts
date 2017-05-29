/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { ITextModelResolverService, ITextModelContentProvider } from 'vs/editor/common/services/resolverService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IModel } from 'vs/editor/common/editorCommon';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { marked } from 'vs/base/common/marked/marked';
import { Schemas } from 'vs/base/common/network';
import { IRawTextSource } from 'vs/editor/common/model/textSource';

export class WalkThroughContentProvider implements ITextModelContentProvider, IWorkbenchContribution {

	constructor(
		@ITextModelResolverService private textModelResolverService: ITextModelResolverService,
		@ITextFileService private textFileService: ITextFileService,
		@IModeService private modeService: IModeService,
		@IModelService private modelService: IModelService,
	) {
		this.textModelResolverService.registerTextModelContentProvider(Schemas.walkThrough, this);
	}

	public provideTextContent(resource: URI): TPromise<IModel> {
		const query = resource.query ? JSON.parse(resource.query) : {};
		const content: TPromise<string | IRawTextSource> = (query.moduleId ? new TPromise<string>((resolve, reject) => {
			require([query.moduleId], content => {
				try {
					resolve(content.default());
				} catch (err) {
					reject(err);
				}
			});
		}) : this.textFileService.resolveTextContent(URI.file(resource.fsPath)).then(content => content.value));
		return content.then(content => {
			let codeEditorModel = this.modelService.getModel(resource);
			if (!codeEditorModel) {
				codeEditorModel = this.modelService.createModel(content, this.modeService.getOrCreateModeByFilenameOrFirstLine(resource.fsPath), resource);
			} else {
				this.modelService.updateModel(codeEditorModel, content);
			}

			return codeEditorModel;
		});
	}

	public getId(): string {
		return 'vs.walkThroughContentProvider';
	}
}

export class WalkThroughSnippetContentProvider implements ITextModelContentProvider, IWorkbenchContribution {

	constructor(
		@ITextModelResolverService private textModelResolverService: ITextModelResolverService,
		@ITextFileService private textFileService: ITextFileService,
		@IModeService private modeService: IModeService,
		@IModelService private modelService: IModelService,
	) {
		this.textModelResolverService.registerTextModelContentProvider(Schemas.walkThroughSnippet, this);
	}

	public provideTextContent(resource: URI): TPromise<IModel> {
		return this.textFileService.resolveTextContent(URI.file(resource.fsPath)).then(content => {
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

				const markdown = content.value.lines.join('\n');
				marked(markdown, { renderer });

				const modeId = this.modeService.getModeIdForLanguageName(languageName);
				const mode = this.modeService.getOrCreateMode(modeId);
				codeEditorModel = this.modelService.createModel(codeSnippet, mode, resource);
			} else {
				this.modelService.updateModel(codeEditorModel, content.value);
			}

			return codeEditorModel;
		});
	}

	public getId(): string {
		return 'vs.walkThroughSnippetContentProvider';
	}
}