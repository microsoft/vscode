/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { ITextModelService, ITextModelContentProvider } from 'vs/editor/common/services/resolverService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ITextModel, DefaultEndOfLine, EndOfLinePreference, ITextBufferFactory } from 'vs/editor/common/model';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import * as marked from 'vs/base/common/marked/marked';
import { Schemas } from 'vs/base/common/network';
import { Range } from 'vs/editor/common/core/range';
import { createTextBufferFactory } from 'vs/editor/common/model/textModel';
import { assertIsDefined } from 'vs/base/common/types';

export function requireToContent(resource: URI): Promise<string> {
	if (!resource.query) {
		throw new Error('Welcome: invalid resource');
	}

	const query = JSON.parse(resource.query);
	if (!query.moduleId) {
		throw new Error('Welcome: invalid resource');
	}

	const content: Promise<string> = new Promise<string>((resolve, reject) => {
		require([query.moduleId], content => {
			try {
				resolve(content.default());
			} catch (err) {
				reject(err);
			}
		});
	});

	return content;
}

export class WalkThroughSnippetContentProvider implements ITextModelContentProvider, IWorkbenchContribution {
	private loads = new Map<string, Promise<ITextBufferFactory>>();

	constructor(
		@ITextModelService private readonly textModelResolverService: ITextModelService,
		@IModeService private readonly modeService: IModeService,
		@IModelService private readonly modelService: IModelService,
	) {
		this.textModelResolverService.registerTextModelContentProvider(Schemas.walkThroughSnippet, this);
	}

	private async textBufferFactoryFromResource(resource: URI): Promise<ITextBufferFactory> {
		let ongoing = this.loads.get(resource.toString());
		if (!ongoing) {
			ongoing = new Promise(async c => {
				c(createTextBufferFactory(await requireToContent(resource)));
				this.loads.delete(resource.toString());
			});
			this.loads.set(resource.toString(), ongoing);
		}
		return ongoing;
	}

	public async provideTextContent(resource: URI): Promise<ITextModel> {
		const factory = await this.textBufferFactoryFromResource(resource.with({ fragment: '' }));
		let codeEditorModel = this.modelService.getModel(resource);
		if (!codeEditorModel) {
			const j = parseInt(resource.fragment);
			let i = 0;
			const renderer = new marked.Renderer();
			renderer.code = (code, lang) => {
				i++;
				const languageId = this.modeService.getModeIdForLanguageName(lang) || '';
				const languageSelection = this.modeService.create(languageId);
				// Create all models for this resource in one go... we'll need them all and we don't want to re-parse markdown each time
				const model = this.modelService.createModel(code, languageSelection, resource.with({ fragment: `${i}.${lang}` }));
				if (i === j) { codeEditorModel = model; }
				return '';
			};
			const textBuffer = factory.create(DefaultEndOfLine.LF).textBuffer;
			const lineCount = textBuffer.getLineCount();
			const range = new Range(1, 1, lineCount, textBuffer.getLineLength(lineCount) + 1);
			const markdown = textBuffer.getValueInRange(range, EndOfLinePreference.TextDefined);
			marked(markdown, { renderer });
		}
		return assertIsDefined(codeEditorModel);
	}
}
