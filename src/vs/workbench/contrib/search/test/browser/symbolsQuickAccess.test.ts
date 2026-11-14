/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { SymbolKind } from '../../../../../editor/common/languages.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IChatWidgetService } from '../../../chat/browser/chat.js';
import { SymbolsQuickAccessProvider } from '../../browser/symbolsQuickAccess.js';
import { WorkspaceSymbolProviderRegistry } from '../../common/search.js';

suite('Symbols Quick Access', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('scores double-colon qualifiers against the symbol container', async () => {
		let providerQuery: string | undefined;
		store.add(WorkspaceSymbolProviderRegistry.register({
			provideWorkspaceSymbols(query) {
				providerQuery = query;
				return [{
					name: 'Bar',
					containerName: 'foo',
					kind: SymbolKind.Struct,
					location: {
						uri: URI.file('/workspace/src/lib.rs'),
						range: new Range(1, 1, 1, 4)
					}
				}];
			}
		}));

		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ILabelService, { getUriLabel: () => 'src/lib.rs' });
		instantiationService.stub(IOpenerService, {});
		instantiationService.stub(IEditorService, {});
		instantiationService.stub(IConfigurationService, { getValue: () => ({}) });
		instantiationService.stub(ICodeEditorService, {});
		instantiationService.stub(IChatWidgetService, {});

		const provider = store.add(instantiationService.createInstance(SymbolsQuickAccessProvider));
		const picks = await provider.getSymbolPicks('foo::Bar', { delay: 0 }, CancellationToken.None);

		assert.strictEqual(providerQuery, 'foo::Bar');
		assert.deepStrictEqual(picks.map(pick => ({ label: pick.label, description: pick.description })), [{
			label: 'Bar',
			description: 'foo • src/lib.rs'
		}]);
	});
});
