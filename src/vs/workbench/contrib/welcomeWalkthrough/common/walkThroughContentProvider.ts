/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { ITextModelService, ITextModelContentProvider } from '../../../../editor/common/services/resolverService.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITextModel, DefaultEndOfLine, EndOfLinePreference, ITextBufferFactory } from '../../../../editor/common/model.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import * as marked from '../../../../base/common/marked/marked.js';
import { Schemas } from '../../../../base/common/network.js';
import { Range } from '../../../../editor/common/core/range.js';
import { createTextBufferFactory } from '../../../../editor/common/model/textModel.js';
import { assertIsDefined } from '../../../../base/common/types.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';

interface IWalkThroughContentProvider {
	(accessor: ServicesAccessor): string;
}

class WalkThroughContentProviderRegistry {

	private readonly providers = new Map<string, IWalkThroughContentProvider>();

	registerProvider(moduleId: string, provider: IWalkThroughContentProvider): void {
		this.providers.set(moduleId, provider);
	}

	getProvider(moduleId: string): IWalkThroughContentProvider | undefined {
		return this.providers.get(moduleId);
	}
}
export const walkThroughContentRegistry = new WalkThroughContentProviderRegistry();

export async function moduleToContent(instantiationService: IInstantiationService, resource: URI): Promise<string> {
	if (!resource.query) {
		throw new Error('Walkthrough: invalid resource');
	}

	const query = JSON.parse(resource.query);
	if (!query.moduleId) {
		throw new Error('Walkthrough: invalid resource');
	}

	const provider = walkThroughContentRegistry.getProvider(query.moduleId);
	if (!provider) {
		// ESM-comment-begin
		// return new Promise<string>((resolve, reject) => {
		// require([query.moduleId], content => {
		// try {
		// resolve(instantiationService.invokeFunction(content.default));
		// } catch (err) {
		// reject(err);
		// }
		// });
		// });
		// ESM-comment-end
		// ESM-uncomment-begin
		throw new Error(`Walkthrough: no provider registered for ${query.moduleId}`);
		// ESM-uncomment-end
	}

	return instantiationService.invokeFunction(provider);
}

export class WalkThroughSnippetContentProvider implements ITextModelContentProvider, IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.walkThroughSnippetContentProvider';

	private loads = new Map<string, Promise<ITextBufferFactory>>();

	constructor(
		@ITextModelService private readonly textModelResolverService: ITextModelService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IModelService private readonly modelService: IModelService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		this.textModelResolverService.registerTextModelContentProvider(Schemas.walkThroughSnippet, this);
	}

	private async textBufferFactoryFromResource(resource: URI): Promise<ITextBufferFactory> {
		let ongoing = this.loads.get(resource.toString());
		if (!ongoing) {
			ongoing = moduleToContent(this.instantiationService, resource)
				.then(content => createTextBufferFactory(content))
				.finally(() => this.loads.delete(resource.toString()));
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
			const renderer = new marked.marked.Renderer();
			renderer.code = ({ text, lang }: marked.Tokens.Code) => {
				i++;
				const languageId = typeof lang === 'string' ? this.languageService.getLanguageIdByLanguageName(lang) || '' : '';
				const languageSelection = this.languageService.createById(languageId);
				// Create all models for this resource in one go... we'll need them all and we don't want to re-parse markdown each time
				const model = this.modelService.createModel(text, languageSelection, resource.with({ fragment: `${i}.${lang}` }));
				if (i === j) { codeEditorModel = model; }
				return '';
			};
			const textBuffer = factory.create(DefaultEndOfLine.LF).textBuffer;
			const lineCount = textBuffer.getLineCount();
			const range = new Range(1, 1, lineCount, textBuffer.getLineLength(lineCount) + 1);
			const markdown = textBuffer.getValueInRange(range, EndOfLinePreference.TextDefined);
			marked.marked(markdown, { renderer });
		}
		return assertIsDefined(codeEditorModel);
	}
}
