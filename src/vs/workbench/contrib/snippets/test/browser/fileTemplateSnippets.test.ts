/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { ILanguageConfigurationService } from '../../../../../editor/common/languages/languageConfigurationRegistry.js';
import { createTestCodeEditor } from '../../../../../editor/test/browser/testCodeEditor.js';
import { TestLanguageConfigurationService } from '../../../../../editor/test/common/modes/testLanguageConfigurationService.js';
import { createModelServices, createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IQuickInputService, IQuickPickItem, QuickPickInput } from '../../../../../platform/quickinput/common/quickInput.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ApplyFileSnippetAction } from '../../browser/commands/fileTemplateSnippets.js';
import { ISnippetsService } from '../../browser/snippets.js';
import { Snippet, SnippetSource } from '../../browser/snippetsFile.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { SnippetController2 } from '../../../../../editor/contrib/snippet/browser/snippetController2.js';
import { InstantiationService } from '../../../../../platform/instantiation/common/instantiationService.js';

suite('ApplyFileSnippetAction', () => {

	let disposables: DisposableStore;
	let instantiationService: TestInstantiationService;
	let model: ReturnType<typeof createTextModel>;
	let editor: ICodeEditor;

	setup(() => {
		disposables = new DisposableStore();
		instantiationService = createModelServices(disposables);

		const languageConfigurationService = disposables.add(new TestLanguageConfigurationService());
		disposables.add(languageConfigurationService.register('csharp', {
			comments: {
				lineComment: '//',
				blockComment: ['/*', '*/']
			}
		}));

		const serviceCollection = new ServiceCollection(
			[ILanguageConfigurationService, languageConfigurationService],
			[IContextKeyService, new MockContextKeyService()],
			[ILabelService, new class extends mock<ILabelService>() { }],
			[IWorkspaceContextService, new class extends mock<IWorkspaceContextService>() {
				override getWorkspace() {
					return { id: 'test-workspace', folders: [] };
				}
			}],
			[ILogService, new NullLogService()]
		);

		model = disposables.add(createTextModel('', undefined, undefined, URI.parse('untitled:Untitled-1')));
		editor = disposables.add(createTestCodeEditor(model, { serviceCollection }));
		const snippetController = disposables.add(new InstantiationService(serviceCollection).createInstance(SnippetController2, editor));
		const originalGet = SnippetController2.get;
		Object.defineProperty(SnippetController2, 'get', { value: () => snippetController });
		disposables.add(toDisposable(() => {
			Object.defineProperty(SnippetController2, 'get', { value: originalGet });
		}));

		const languageService = instantiationService.get(ILanguageService);
		disposables.add(languageService.registerLanguage({ id: 'csharp', extensions: ['.cs'] }));
		instantiationService.stub(ILanguageService, languageService);

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
				const resolvedPicks = Array.isArray(picks) ? picks : await picks;
				for (const pick of resolvedPicks) {
					if (!('type' in pick)) {
						return pick;
					}
				}
				return undefined;
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
