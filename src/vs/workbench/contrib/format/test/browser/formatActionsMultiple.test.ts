/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DocumentFormattingEditProvider } from '../../../../../editor/common/languages.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { withAsyncTestCodeEditor } from '../../../../../editor/test/browser/testCodeEditor.js';
import { IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import '../../browser/formatActionsMultiple.js';

const IEditorCancellationTokens = createDecorator<{ add(): () => void }>('IEditorCancelService');

suite('Format Actions Multiple', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('selects formatter argument case-insensitively', async () => {
		const invokedFormatters: string[] = [];
		const serviceCollection = new ServiceCollection(
			[IContextKeyService, new class extends MockContextKeyService {
				override contextMatchesRules(): boolean {
					return true;
				}
			}],
			[IAccessibilitySignalService, new class extends mock<IAccessibilitySignalService>() { }],
			[IEditorCancellationTokens, { add: () => () => { } }],
		);

		await withAsyncTestCodeEditor('const value = 1;', { serviceCollection }, async (editor, _viewModel, instantiationService) => {
			const languageFeaturesService = instantiationService.get(ILanguageFeaturesService);
			const createProvider = (extensionId: string): DocumentFormattingEditProvider => ({
				extensionId: new ExtensionIdentifier(extensionId),
				provideDocumentFormattingEdits: () => {
					invokedFormatters.push(extensionId);
					return [];
				}
			});

			editor.registerDisposable(languageFeaturesService.documentFormattingEditProvider.register('*', createProvider('publisher.first')));
			editor.registerDisposable(languageFeaturesService.documentFormattingEditProvider.register('*', createProvider('publisher.requested')));

			const command = CommandsRegistry.getCommand('editor.action.formatDocument.multiple');
			assert.ok(command);

			await instantiationService.invokeFunction(command.handler, { formatter: 'PUBLISHER.REQUESTED' });
		});

		assert.deepStrictEqual(invokedFormatters, ['publisher.requested']);
	});
});
