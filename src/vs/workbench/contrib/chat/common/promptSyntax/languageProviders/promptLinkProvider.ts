/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPromptsService } from '../service/promptsService.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { ILink, ILinksList, LinkProvider } from '../../../../../../editor/common/languages.js';
import { IPathService } from '../../../../../services/path/common/pathService.js';
import { URI } from '../../../../../../base/common/uri.js';
import { isPromptFileTildePath } from '../promptFileParser.js';

/**
 * Provides link references for prompt files.
 */
export class PromptLinkProvider implements LinkProvider {
	constructor(
		@IPromptsService private readonly promptsService: IPromptsService,
		@IPathService private readonly pathService: IPathService,
	) {
	}

	/**
	 * Provide list of links for the provided text model.
	 */
	public async provideLinks(model: ITextModel, token: CancellationToken): Promise<ILinksList | undefined> {
		const promptAST = this.promptsService.getParsedPromptFile(model);
		if (!promptAST.body) {
			return;
		}
		const links: ILink[] = [];
		let userHome: URI | undefined;
		for (const ref of promptAST.body.fileReferences) {
			const isTildePath = isPromptFileTildePath(ref.content);
			if (ref.isMarkdownLink && !isTildePath) {
				continue;
			}
			if (isTildePath) {
				userHome ??= await this.pathService.userHome();
			}
			const url = promptAST.body.resolveFilePath(ref.content, userHome);
			if (url) {
				links.push({ range: ref.range, url });
			}
		}
		return { links };
	}
}
