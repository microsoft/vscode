/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { canceled } from '../../../../../base/common/errors.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { LanguageFeatureRegistry } from '../../../../common/languageFeatureRegistry.js';
import { DocumentSemanticTokensProvider, ProviderResult, SemanticTokens, SemanticTokensEdits, SemanticTokensLegend } from '../../../../common/languages.js';
import { ITextModel } from '../../../../common/model.js';
import { getDocumentSemanticTokens } from '../../common/getSemanticTokens.js';
import { createTextModel } from '../../../../test/common/testTextModel.js';

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
