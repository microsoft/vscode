/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { CancellationToken } from 'vs/base/common/cancellation';
import { canceled } from 'vs/base/common/errors';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ITextModel } from 'vs/editor/common/model';
import { DocumentSemanticTokensProvider, DocumentSemanticTokensProviderRegistry, ProviderResult, SemanticTokens, SemanticTokensEdits, SemanticTokensLegend } from 'vs/editor/common/modes';
import { getDocumentSemanticTokens } from 'vs/editor/common/services/getSemanticTokens';
import { createTextModel } from 'vs/editor/test/common/editorTestUtils';

suite('getSemanticTokens', () => {

	test('issue #136540: semantic highlighting flickers', async () => {
		const disposables = new DisposableStore();

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

		disposables.add(DocumentSemanticTokensProviderRegistry.register('testLang', provider));

		const textModel = disposables.add(createTextModel('example', undefined, 'testLang'));

		await getDocumentSemanticTokens(textModel, null, null, CancellationToken.None).then((res) => {
			assert.fail();
		}, (err) => {
			assert.ok(!!err);
		});

		disposables.dispose();
	});

});
