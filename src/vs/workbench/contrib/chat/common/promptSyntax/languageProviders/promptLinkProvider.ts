/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPromptsService } from '../service/promptsService.js';
import { assert } from '../../../../../../base/common/assert.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { assertDefined } from '../../../../../../base/common/types.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { ILink, ILinksList, LinkProvider } from '../../../../../../editor/common/languages.js';

/**
 * Provides link references for prompt files.
 */
export class PromptLinkProvider implements LinkProvider {
	constructor(
		@IPromptsService private readonly promptsService: IPromptsService,
	) {
	}

	/**
	 * Provide list of links for the provided text model.
	 */
	public async provideLinks(
		model: ITextModel,
		token: CancellationToken,
	): Promise<ILinksList | undefined> {
		assert(
			!token.isCancellationRequested,
			new CancellationError(),
		);

		const parser = this.promptsService.getSyntaxParserFor(model);
		assert(
			parser.isDisposed === false,
			'Prompt parser must not be disposed.',
		);

		// start the parser in case it was not started yet,
		// and wait for it to settle to a final result
		const completed = await parser.start(token).settled();
		if (!completed || token.isCancellationRequested) {
			return undefined;
		}
		const { references } = parser;

		// filter out references that are not valid links
		const links: ILink[] = references
			.map((reference) => {
				const { uri, linkRange } = reference;

				// must always be true because of the filter above
				assertDefined(
					linkRange,
					'Link range must be defined.',
				);

				return {
					range: linkRange,
					url: uri,
				};
			});

		return {
			links,
		};
	}
}
