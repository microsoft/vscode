/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LANGUAGE_SELECTOR } from '../constants.js';
import { assert } from '../../../../../../base/common/assert.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { assertDefined } from '../../../../../../base/common/types.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { NonPromptSnippetFile } from '../../promptFileReferenceErrors.js';
import { ObjectCache } from '../../../../../../base/common/objectCache.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { TextModelPromptParser } from '../parsers/textModelPromptParser.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { LifecyclePhase } from '../../../../../services/lifecycle/common/lifecycle.js';
import { ILink, ILinksList, LinkProvider } from '../../../../../../editor/common/languages.js';
import { ILanguageFeaturesService } from '../../../../../../editor/common/services/languageFeatures.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from '../../../../../common/contributions.js';

/**
 * Provides link references for prompt files.
 */
export class PromptLinkProvider extends Disposable implements LinkProvider {
	/**
	 * Cache of text model content prompt parsers.
	 */
	private readonly parserProvider: ObjectCache<TextModelPromptParser, ITextModel>;

	constructor(
		@IInstantiationService private readonly initService: IInstantiationService,
		@ILanguageFeaturesService private readonly languageService: ILanguageFeaturesService,
	) {
		super();

		this._register(this.languageService.linkProvider.register(LANGUAGE_SELECTOR, this));
		this.parserProvider = this._register(new ObjectCache(this.createParser.bind(this)));
	}

	/**
	 * Create new prompt parser instance for the provided text model.
	 *
	 * @param model - text model to create the parser for
	 * @param initService - the instantiation service
	 */
	private createParser(
		model: ITextModel,
	): TextModelPromptParser & { disposed: false } {
		const parser: TextModelPromptParser = this.initService.createInstance(
			TextModelPromptParser,
			model,
			[],
		);

		parser.assertNotDisposed(
			'Created prompt parser must not be disposed.',
		);

		return parser;
	}

	/**
	 * Provide list of links for the provided text model.
	 */
	public async provideLinks(
		model: ITextModel,
		token: CancellationToken,
	): Promise<ILinksList> {
		assert(
			!token.isCancellationRequested,
			new CancellationError(),
		);

		const parser = this.parserProvider.get(model);
		assert(
			!parser.disposed,
			'Prompt parser must not be disposed.',
		);

		// start the parser in case it was not started yet,
		// and wait for it to settle to a final result
		const { references } = await parser
			.start()
			.settled();

		// validate that the cancellation was not yet requested
		assert(
			!token.isCancellationRequested,
			new CancellationError(),
		);

		// filter out references that are not valid links
		const links: ILink[] = references
			.filter((reference) => {
				const { errorCondition, linkRange } = reference;
				if (!errorCondition && linkRange) {
					return true;
				}

				return errorCondition instanceof NonPromptSnippetFile;
			})
			.map((reference) => {
				const { linkRange } = reference;

				// must always be true because of the filter above
				assertDefined(
					linkRange,
					'Link range must be defined.',
				);


				return {
					range: linkRange,
					url: reference.uri,
				};
			});

		return {
			links,
		};
	}
}

// register the text model prompt decorators provider as a workbench contribution
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(PromptLinkProvider, LifecyclePhase.Eventually);
