/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { SnippetController2 } from '../../../../../../editor/contrib/snippet/browser/snippetController2.js';
import { createTestCodeEditor } from '../../../../../../editor/test/browser/testCodeEditor.js';
import { createTextModel } from '../../../../../../editor/test/common/testTextModel.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { createInMemoryFileService } from '../../../../../../platform/files/test/common/inMemoryFileService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IQuickInputService } from '../../../../../../platform/quickinput/common/quickInput.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { INewPromptOptions, NEW_SKILL_COMMAND_ID, registerNewPromptFileActions } from '../../../browser/promptSyntax/newPromptFileActions.js';

suite('New skill file', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const targetFolder = URI.file('/workspace/.agents/skills');
	const skillFileUri = URI.joinPath(targetFolder, 'test-skill', 'SKILL.md');
	const expectedContent = [
		'---',
		'name: test-skill',
		'description: Describe what this skill does and when to use it. Include keywords that help agents identify relevant tasks.',
		'---',
		'',
		'<!-- Tip: Use /create-skill in chat to generate content with agent assistance -->',
		'',
		'Define the functionality provided by this skill, including detailed instructions and examples',
	].join('\n');

	function setup() {
		const instantiationService = store.add(new TestInstantiationService());
		const fileService = createInMemoryFileService(store, skillFileUri.scheme);
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IQuickInputService, { input: async () => ' test-skill ' });
		instantiationService.stub(IEditorService, { activeTextEditorControl: undefined });
		store.add(registerNewPromptFileActions());
		return { instantiationService, fileService };
	}

	async function createSkill(instantiationService: TestInstantiationService, options?: INewPromptOptions) {
		const command = CommandsRegistry.getCommand(NEW_SKILL_COMMAND_ID)!;
		await instantiationService.invokeFunction(command.handler, { targetFolder, ...options });
	}

	test('writes the template before opening in a non-text editor', async () => {
		const { instantiationService, fileService } = setup();
		let openedContent: string | undefined;
		instantiationService.stub(IOpenerService, {
			open: async resource => {
				assert.strictEqual(resource.toString(), skillFileUri.toString());
				openedContent = (await fileService.readFile(skillFileUri)).value.toString();
				return true;
			}
		});

		await createSkill(instantiationService);

		assert.strictEqual(openedContent, expectedContent);
	});

	test('writes the template before calling a custom opener without a code editor', async () => {
		const { instantiationService, fileService } = setup();
		instantiationService.stub(IOpenerService, {});
		let openedContent: string | undefined;

		await createSkill(instantiationService, {
			openFile: async resource => {
				openedContent = (await fileService.readFile(resource)).value.toString();
				return undefined;
			}
		});

		assert.strictEqual(openedContent, expectedContent);
	});

	test('preserves snippet navigation in the embedded code editor', async () => {
		const { instantiationService, fileService } = setup();
		instantiationService.stub(IOpenerService, {});
		const model = store.add(createTextModel('', undefined, undefined, skillFileUri));
		const editor = store.add(createTestCodeEditor(model));
		editor.registerAndInstantiateContribution(SnippetController2.ID, SnippetController2);

		await createSkill(instantiationService, {
			openFile: async resource => {
				model.setValue((await fileService.readFile(resource)).value.toString());
				return editor;
			}
		});

		assert.deepStrictEqual({
			content: model.getValue(),
			selectedText: model.getValueInRange(editor.getSelection()!),
		}, {
			content: expectedContent,
			selectedText: 'Describe what this skill does and when to use it. Include keywords that help agents identify relevant tasks.',
		});
	});
});
