/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from 'vs/base/common/cancellation';
import { canceled } from 'vs/base/common/errors';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { LanguageFeatureRegistry } from 'vs/editor/common/languageFeatureRegistry';
import { DocumentSemanticTokensProvider, ProviderResult, SemanticTokens, SemanticTokensEdits, SemanticTokensLegend } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { getDocumentSemanticTokens } from 'vs/editor/contrib/semanticTokens/common/getSemanticTokens';
import { createTextModel } from 'vs/editor/test/common/testTextModel';

suite('getSemanticTokens', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('issue #136540: semantic highlighting flickers', async () => {
		const disposables = new DisposableStore();
		const registry = new LanguageFeatureRegistry<DocumentSemanticTokensProvider>();
		const provider = new class implements DocumentSemanticTokensProvider {
			getLegend(): SemanticTokensLegend {
				return { tokenTypes: ['test'], tokenModifiers: [] };
			}
			provideDocumentSemanticTokens(model: ITextModel, lastResultId: string | null, token: CancellationToken): ProviderResult<SemanticTokens | SemanticTokensEdits> {
				throw canceled();
			}
			releaseDocumentSemanticTokens(resultId: string | undefined): void {
			}
		};

		disposables.add(registry.register('testLang', provider));

		const textModel = disposables.add(createTextModel('example', 'testLang'));

		await getDocumentSemanticTokens(registry, textModel, null, null, CancellationToken.None).then((res) => {
			assert.fail();
		}, (err) => {
			assert.ok(!!err);
		});

		disposables.dispose();
	});

});
