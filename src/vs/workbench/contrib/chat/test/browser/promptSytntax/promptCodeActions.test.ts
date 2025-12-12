/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { CodeActionContext, CodeActionTriggerType, IWorkspaceTextEdit, IWorkspaceFileEdit } from '../../../../../../editor/common/languages.js';
import { createTextModel } from '../../../../../../editor/test/common/testTextModel.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IMarkerService } from '../../../../../../platform/markers/common/markers.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { ILanguageModelToolsService, IToolData, ToolDataSource } from '../../../common/languageModelToolsService.js';
import { LanguageModelToolsService } from '../../../browser/languageModelToolsService.js';
import { IPromptsService } from '../../../common/promptSyntax/service/promptsService.js';
import { getLanguageIdForPromptsType, PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { getPromptFileExtension } from '../../../common/promptSyntax/config/promptFileLocations.js';
import { PromptFileParser } from '../../../common/promptSyntax/promptFileParser.js';
import { PromptCodeActionProvider } from '../../../common/promptSyntax/languageProviders/promptCodeActions.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { CodeActionKind } from '../../../../../../editor/contrib/codeAction/common/types.js';

suite('PromptCodeActionProvider', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instaService: TestInstantiationService;
	let codeActionProvider: PromptCodeActionProvider;
	let fileService: IFileService;

	setup(async () => {
		const testConfigService = new TestConfigurationService();
		testConfigService.setUserConfiguration(ChatConfiguration.ExtensionToolsEnabled, true);
		instaService = workbenchInstantiationService({
			contextKeyService: () => disposables.add(new ContextKeyService(testConfigService)),
			configurationService: () => testConfigService
		}, disposables);

		const toolService = disposables.add(instaService.createInstance(LanguageModelToolsService));

		// Register test tools including deprecated ones
		const testTool1 = { id: 'testTool1', displayName: 'tool1', canBeReferencedInPrompt: true, modelDescription: 'Test Tool 1', source: ToolDataSource.External, inputSchema: {} } satisfies IToolData;
		disposables.add(toolService.registerToolData(testTool1));

		const deprecatedTool = { id: 'oldTool', displayName: 'oldTool', canBeReferencedInPrompt: true, modelDescription: 'Deprecated Tool', source: ToolDataSource.External, inputSchema: {} } satisfies IToolData;
		disposables.add(toolService.registerToolData(deprecatedTool));

		// Mock deprecated tool names
		toolService.getDeprecatedFullReferenceNames = () => {
			const map = new Map<string, Set<string>>();
			map.set('oldTool', new Set(['newTool1', 'newTool2']));
			map.set('singleDeprecated', new Set(['singleReplacement']));
			return map;
		};

		instaService.set(ILanguageModelToolsService, toolService);
		instaService.stub(IMarkerService, { read: () => [] });

		fileService = {
			canMove: async (source: URI, target: URI) => {
				// Mock file service that allows moves for testing
				return true;
			}
		} as IFileService;
		instaService.set(IFileService, fileService);

		const parser = new PromptFileParser();
		instaService.stub(IPromptsService, {
			getParsedPromptFile(model: ITextModel) {
				return parser.parse(model.uri, model.getValue());
			},
			getAgentFileURIFromModeFile(uri: URI) {
				// Mock conversion from .chatmode.md to .agent.md
				if (uri.path.endsWith('.chatmode.md')) {
					return uri.with({ path: uri.path.replace('.chatmode.md', '.agent.md') });
				}
				return undefined;
			}
		});

		codeActionProvider = instaService.createInstance(PromptCodeActionProvider);
	});

	async function getCodeActions(content: string, line: number, column: number, promptType: PromptsType, fileExtension?: string): Promise<{ title: string; textEdits?: IWorkspaceTextEdit[]; fileEdits?: IWorkspaceFileEdit[] }[]> {
		const languageId = getLanguageIdForPromptsType(promptType);
		const uri = URI.parse('test:///test' + (fileExtension ?? getPromptFileExtension(promptType)));
		const model = disposables.add(createTextModel(content, languageId, undefined, uri));
		const range = new Range(line, column, line, column);
		const context: CodeActionContext = { trigger: CodeActionTriggerType.Invoke };

		const result = await codeActionProvider.provideCodeActions(model, range, context, CancellationToken.None);
		if (!result || result.actions.length === 0) {
			return [];
		}

		for (const action of result.actions) {
			assert.equal(action.kind, CodeActionKind.QuickFix.value);
		}

		return result.actions.map(action => ({
			title: action.title,
			textEdits: action.edit?.edits?.filter((edit): edit is IWorkspaceTextEdit => 'textEdit' in edit),
			fileEdits: action.edit?.edits?.filter((edit): edit is IWorkspaceFileEdit => 'oldResource' in edit)
		}));
	}

	suite('agent code actions', () => {
		test('no code actions for instructions files', async () => {
			const content = [
				'---',
				'description: "Test instruction"',
				'applyTo: "**/*.ts"',
				'---',
			].join('\n');
			const actions = await getCodeActions(content, 2, 1, PromptsType.instructions);
			assert.strictEqual(actions.length, 0);
		});

		test('migrate mode file to agent file', async () => {
			const content = [
				'---',
				'name: "Test Mode"',
				'description: "Test mode file"',
				'---',
			].join('\n');
			const actions = await getCodeActions(content, 1, 1, PromptsType.agent, '.chatmode.md');
			assert.strictEqual(actions.length, 1);
			assert.strictEqual(actions[0].title, `Migrate to custom agent file`);
		});

		test('update deprecated tool names - single replacement', async () => {
			const content = [
				'---',
				'description: "Test"',
				'target: vscode',
				`tools: ['singleDeprecated']`,
				'---',
			].join('\n');
			const actions = await getCodeActions(content, 4, 10, PromptsType.agent);
			assert.strictEqual(actions.length, 1);
			assert.strictEqual(actions[0].title, `Update to 'singleReplacement'`);
			assert.ok(actions[0].textEdits);
			assert.strictEqual(actions[0].textEdits!.length, 1);
			assert.strictEqual(actions[0].textEdits![0].textEdit.text, `'singleReplacement'`);
		});

		test('update deprecated tool names - multiple replacements', async () => {
			const content = [
				'---',
				'description: "Test"',
				'target: vscode',
				`tools: ['oldTool']`,
				'---',
			].join('\n');
			const actions = await getCodeActions(content, 4, 10, PromptsType.agent);
			assert.strictEqual(actions.length, 1);
			assert.strictEqual(actions[0].title, `Expand to 2 tools`);
			assert.ok(actions[0].textEdits);
			assert.strictEqual(actions[0].textEdits!.length, 1);
			assert.strictEqual(actions[0].textEdits![0].textEdit.text, `'newTool1','newTool2'`);
		});

		test('update all deprecated tool names', async () => {
			const content = [
				'---',
				'description: "Test"',
				'target: vscode',
				`tools: ['oldTool', 'singleDeprecated', 'validTool']`,
				'---',
			].join('\n');
			const actions = await getCodeActions(content, 4, 8, PromptsType.agent); // Position at the bracket
			assert.strictEqual(actions.length, 1);
			assert.strictEqual(actions[0].title, `Update all tool names`);
			assert.ok(actions[0].textEdits);
			assert.strictEqual(actions[0].textEdits!.length, 2); // Only deprecated tools are updated
		});

		test('handles double quotes in tool names', async () => {
			const content = [
				'---',
				'description: "Test"',
				'target: vscode',
				`tools: ["singleDeprecated"]`,
				'---',
			].join('\n');
			const actions = await getCodeActions(content, 4, 10, PromptsType.agent);
			assert.strictEqual(actions.length, 1);
			assert.strictEqual(actions[0].title, `Update to 'singleReplacement'`);
			assert.ok(actions[0].textEdits);
			assert.strictEqual(actions[0].textEdits![0].textEdit.text, `"singleReplacement"`);
		});

		test('handles unquoted tool names', async () => {
			const content = [
				'---',
				'description: "Test"',
				'target: vscode',
				'tools: [singleDeprecated]', // No quotes
				'---',
			].join('\n');
			const actions = await getCodeActions(content, 4, 10, PromptsType.agent);
			assert.strictEqual(actions.length, 1);
			assert.strictEqual(actions[0].title, `Update to 'singleReplacement'`);
			assert.ok(actions[0].textEdits);
			assert.strictEqual(actions[0].textEdits![0].textEdit.text, `singleReplacement`); // No quotes preserved
		});

		test('no code actions when range not in tools array', async () => {
			const content = [
				'---',
				'description: "Test"',
				'target: vscode',
				`tools: ['singleDeprecated']`,
				'---',
			].join('\n');
			const actions = await getCodeActions(content, 2, 1, PromptsType.agent); // Range in description, not tools
			assert.strictEqual(actions.length, 0);
		});
	});

	suite('prompt code actions', () => {
		test('rename mode to agent', async () => {
			const content = [
				'---',
				'description: "Test"',
				'mode: edit',
				'---',
			].join('\n');
			const actions = await getCodeActions(content, 3, 1, PromptsType.prompt);
			assert.strictEqual(actions.length, 1);
			assert.strictEqual(actions[0].title, `Rename to 'agent'`);
			assert.ok(actions[0].textEdits);
			assert.strictEqual(actions[0].textEdits!.length, 1);
			assert.strictEqual(actions[0].textEdits![0].textEdit.text, 'agent');
		});

		test('update deprecated tool names in prompt', async () => {
			const content = [
				'---',
				'description: "Test"',
				`tools: ['singleDeprecated']`,
				'---',
			].join('\n');
			const actions = await getCodeActions(content, 3, 10, PromptsType.prompt);
			assert.strictEqual(actions.length, 1);
			assert.strictEqual(actions[0].title, `Update to 'singleReplacement'`);
			assert.ok(actions[0].textEdits);
			assert.strictEqual(actions[0].textEdits!.length, 1);
			assert.strictEqual(actions[0].textEdits![0].textEdit.text, `'singleReplacement'`);
		});

		test('no code actions when range not in mode attribute', async () => {
			const content = [
				'---',
				'description: "Test"',
				'mode: edit',
				'---',
			].join('\n');
			const actions = await getCodeActions(content, 2, 1, PromptsType.prompt); // Range in description, not mode
			assert.strictEqual(actions.length, 0);
		});

		test('both mode and tools code actions available', async () => {
			const content = [
				'---',
				'description: "Test"',
				'mode: edit',
				`tools: ['singleDeprecated']`,
				'---',
			].join('\n');
			// Test mode action
			const modeActions = await getCodeActions(content, 3, 1, PromptsType.prompt);
			assert.strictEqual(modeActions.length, 1);
			assert.strictEqual(modeActions[0].title, `Rename to 'agent'`);

			// Test tools action
			const toolActions = await getCodeActions(content, 4, 10, PromptsType.prompt);
			assert.strictEqual(toolActions.length, 1);
			assert.strictEqual(toolActions[0].title, `Update to 'singleReplacement'`);
		});
	});

	test('returns undefined when no code actions available', async () => {
		const content = [
			'---',
			'description: "Test"',
			'target: vscode',
			`tools: ['validTool']`, // No deprecated tools
			'---',
		].join('\n');
		const actions = await getCodeActions(content, 4, 10, PromptsType.agent);
		assert.strictEqual(actions.length, 0);
	});

	test('uses comma-space delimiter when separator includes comma', async () => {
		const content = [
			'---',
			'description: "Test"',
			'target: vscode',
			`tools: ['oldTool', 'validTool']`,
			'---',
		].join('\n');
		const actions = await getCodeActions(content, 4, 10, PromptsType.agent);
		assert.strictEqual(actions.length, 1);
		assert.strictEqual(actions[0].title, `Expand to 2 tools`);
		assert.ok(actions[0].textEdits);
		assert.strictEqual(actions[0].textEdits![0].textEdit.text, `'newTool1', 'newTool2'`);
	});

});
