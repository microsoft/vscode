/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ITextModel } from '../../../../../../../editor/common/model.js';
import { createTextModel } from '../../../../../../../editor/test/common/testTextModel.js';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { TestPathService } from '../../../../../../test/browser/workbenchTestServices.js';
import { PromptLinkProvider } from '../../../../common/promptSyntax/languageProviders/promptLinkProvider.js';
import { ParsedPromptFile, PromptFileParser } from '../../../../common/promptSyntax/promptFileParser.js';
import { MockPromptsService } from '../../../common/promptSyntax/service/mockPromptsService.js';

suite('PromptLinkProvider', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('resolves user home links', async () => {
		const parser = new PromptFileParser();
		const promptsService = new class extends MockPromptsService {
			override getParsedPromptFile(textModel: ITextModel): ParsedPromptFile {
				return parser.parse(textModel.uri, textModel.getValue());
			}
		}();
		const provider = new PromptLinkProvider(promptsService, new TestPathService(URI.parse('myFs://test/home')));
		const model = disposables.add(createTextModel(
			'#file:~/work/vscode/ and [home](~/work/vscode/)',
			'skill',
			undefined,
			URI.parse('myFs://test/skills/example/SKILL.md'),
		));

		const result = await provider.provideLinks(model, CancellationToken.None);

		assert.deepStrictEqual(result?.links.map(link => link.url?.toString()), [
			'myFs://test/home/work/vscode/',
			'myFs://test/home/work/vscode/',
		]);
	});
});
