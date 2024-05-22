/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { StandardTokenType } from 'vs/editor/common/encodedTokenAttributes';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { IndentationContextProcessor } from 'vs/editor/common/languages/supports/indentationLineProcessor';
import { Language, registerLanguage, registerTokenizationSupport, StandardTokenTypeData } from 'vs/editor/contrib/indentation/test/browser/indentation.test';
import { withTestCodeEditor } from 'vs/editor/test/browser/testCodeEditor';
import { createTextModel } from 'vs/editor/test/common/testTextModel';
import { Range } from 'vs/editor/common/core/range';

suite('Indentation Context Processor - TypeScript/JavaScript', () => {

	const languageId = Language.TypeScript;
	let disposables: DisposableStore;

	setup(() => {
		disposables = new DisposableStore();
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('issue #208232: incorrect indentation inside of comments', () => {

		// https://github.com/microsoft/vscode/issues/208232

		const model = createTextModel([
			'const someVar = "{some text}"',
		].join('\n'), languageId, {});
		disposables.add(model);

		withTestCodeEditor(model, { autoIndent: "full" }, (editor, viewModel, instantiationService) => {
			const tokens: StandardTokenTypeData[][] = [[
				{ startIndex: 0, standardTokenType: StandardTokenType.Other },
				{ startIndex: 16, standardTokenType: StandardTokenType.String },
				{ startIndex: 28, standardTokenType: StandardTokenType.String }
			]];
			disposables.add(registerLanguage(instantiationService, languageId));
			disposables.add(registerTokenizationSupport(instantiationService, tokens, languageId));
			const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
			const indentationContextProcessor = new IndentationContextProcessor(model, languageConfigurationService);
			const processedContext = indentationContextProcessor.getProcessedTokenContextAroundRange(new Range(1, 23, 1, 23));
			assert.strictEqual(processedContext.beforeRangeProcessedTokens.getLineContent(), 'const someVar = "some');
			assert.strictEqual(processedContext.afterRangeProcessedTokens.getLineContent(), ' text"');
			assert.strictEqual(processedContext.previousLineProcessedTokens.getLineContent(), '');
		});
	});

});
