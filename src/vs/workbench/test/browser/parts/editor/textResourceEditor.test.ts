/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { Handler } from '../../../../../editor/common/editorCommon.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IUserInteractionService, MockUserInteractionService } from '../../../../../platform/userInteraction/browser/userInteractionService.js';
import { TextResourceEditor } from '../../../../browser/parts/editor/textResourceEditor.js';
import { UntitledTextEditorInput } from '../../../../services/untitled/common/untitledTextEditorInput.js';
import { TestEditorGroupView, TestServiceAccessor, workbenchInstantiationService } from '../../workbenchTestServices.js';

suite('TextResourceEditor', () => {

	const disposables = new DisposableStore();

	teardown(() => {
		disposables.clear();
	});

	async function pasteIntoUntitled(settings: Record<string, unknown>, mode?: string): Promise<{ languageId: string; insertSpaces: boolean; tabSize: number }> {
		const configurationService = new TestConfigurationService({ editor: settings });
		const instantiationService = workbenchInstantiationService({ configurationService: () => configurationService }, disposables);
		instantiationService.stub(IUserInteractionService, new MockUserInteractionService());
		const accessor = instantiationService.createInstance(TestServiceAccessor);
		disposables.add(accessor.languageService.registerLanguage({ id: 'typescript' }));

		const editor = disposables.add(instantiationService.createInstance(TextResourceEditor, new TestEditorGroupView(0)));
		editor.create(document.createElement('div'));

		const input = disposables.add(instantiationService.createInstance(UntitledTextEditorInput, accessor.untitledTextEditorService.create()));
		await editor.setInput(input, undefined, Object.create(null), CancellationToken.None);

		const control = editor.getControl() as ICodeEditor;
		control.trigger('keyboard', Handler.Paste, { text: 'export const a = () => {\n  return 1;\n};', mode });

		const model = control.getModel()!;
		const options = model.getOptions();
		return { languageId: model.getLanguageId(), insertSpaces: options.insertSpaces, tabSize: options.tabSize };
	}

	test('paste into untitled detects indentation by default', async () => {
		assert.deepStrictEqual(
			await pasteIntoUntitled({ detectIndentation: true, insertSpaces: false, tabSize: 4 }, 'typescript'),
			{ languageId: 'typescript', insertSpaces: true, tabSize: 2 }
		);
	});

	test('paste into untitled respects editor.detectIndentation: false (#330504)', async () => {
		assert.deepStrictEqual(
			await pasteIntoUntitled({ detectIndentation: false, insertSpaces: false, tabSize: 4 }, 'typescript'),
			{ languageId: 'typescript', insertSpaces: false, tabSize: 4 }
		);
	});

	test('paste from outside VS Code into untitled respects editor.detectIndentation: false (#330504)', async () => {
		assert.deepStrictEqual(
			await pasteIntoUntitled({ detectIndentation: false, insertSpaces: false, tabSize: 4 }),
			{ languageId: 'plaintext', insertSpaces: false, tabSize: 4 }
		);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
