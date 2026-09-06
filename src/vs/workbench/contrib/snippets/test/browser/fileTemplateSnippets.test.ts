/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { ILanguageConfigurationService } from '../../../../../editor/common/languages/languageConfigurationRegistry.js';
import { TextModel } from '../../../../../editor/common/model/textModel.js';
import { SnippetController2 } from '../../../../../editor/contrib/snippet/browser/snippetController2.js';
import { createCodeEditorServices, instantiateTestCodeEditor, ITestCodeEditor } from '../../../../../editor/test/browser/testCodeEditor.js';
import { TestLanguageConfigurationService } from '../../../../../editor/test/common/modes/testLanguageConfigurationService.js';
import { instantiateTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IQuickInputService, IQuickPickItem, QuickPickInput } from '../../../../../platform/quickinput/common/quickInput.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ApplyFileSnippetAction } from '../../browser/commands/fileTemplateSnippets.js';
import { ISnippetsService } from '../../browser/snippets.js';
import { Snippet, SnippetSource } from '../../browser/snippetsFile.js';

suite('ApplyFileSnippetAction', () => {

	let disposables: DisposableStore;
	let instantiationService: TestInstantiationService;
	let model: TextModel;
	let editor: ITestCodeEditor;

	setup(() => {
		disposables = new DisposableStore();

		const langConfigService = disposables.add(new TestLanguageConfigurationService());
		disposables.add(langConfigService.register('csharp', {
			comments: {
				lineComment: '//',
				blockComment: ['/*', '*/']
			}
		}));

		const services = new ServiceCollection(
			[ILanguageConfigurationService, langConfigService]
		);
		instantiationService = createCodeEditorServices(disposables, services);

		const langService = instantiationService.get(ILanguageService);
		disposables.add(langService.registerLanguage({ id: 'csharp', extensions: ['.cs'] }));

		model = disposables.add(instantiateTextModel(instantiationService, '', null, {}, URI.parse('untitled:Untitled-1')));
		editor = disposables.add(instantiateTestCodeEditor(instantiationService, model));
		editor.registerAndInstantiateContribution(SnippetController2.ID, SnippetController2);

		instantiationService.stub(ISnippetsService, new class extends mock<ISnippetsService>() {
			override async getSnippets() {
				return [new Snippet(
					true,
					['csharp'],
					'comment template',
					'comment template',
					'comment template',
					'$BLOCK_COMMENT_START block $BLOCK_COMMENT_END\n$LINE_COMMENT line',
					'user',
					SnippetSource.User,
					generateUuid()
				)];
			}
		});

		instantiationService.stub(IQuickInputService, new class extends mock<IQuickInputService>() {
			override async pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[]): Promise<T | undefined> {
				const resolved = Array.isArray(picks) ? picks : await picks;
				return resolved.find(p => p.type !== 'separator') as T | undefined;
			}
		});

		instantiationService.stub(IEditorService, new class extends mock<IEditorService>() {
			override activeTextEditorControl = editor;
		});
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('resolves comment variables using selected file template language', async () => {
		await instantiationService.invokeFunction(accessor => new ApplyFileSnippetAction().run(accessor));
		assert.strictEqual(model.getValue(), '/* block */\n// line');
	});
});
