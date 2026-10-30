/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { Position } from '../../../../../../../editor/common/core/position.js';
import { CompletionContext, CompletionTriggerKind } from '../../../../../../../editor/common/languages.js';
import { ContextKeyService } from '../../../../../../../platform/contextkey/browser/contextKeyService.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ExtensionIdentifier } from '../../../../../../../platform/extensions/common/extensions.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { LanguageModelToolsService } from '../../../../browser/tools/languageModelToolsService.js';
import { ChatConfiguration } from '../../../../common/constants.js';
import { ILanguageModelToolsService, IToolData, ToolDataSource } from '../../../../common/tools/languageModelToolsService.js';
import { PromptBodyAutocompletion } from '../../../../common/promptSyntax/languageProviders/promptBodyAutocompletion.js';
import { createTextModel } from '../../../../../../../editor/test/common/testTextModel.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { getLanguageIdForPromptsType, PromptsType, Target } from '../../../../common/promptSyntax/promptTypes.js';
import { getPromptFileExtension } from '../../../../common/promptSyntax/config/promptFileLocations.js';
import { IFileService } from '../../../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../../../platform/files/common/fileService.js';
import { VSBuffer } from '../../../../../../../base/common/buffer.js';
import { InMemoryFileSystemProvider } from '../../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { ILogService, NullLogService } from '../../../../../../../platform/log/common/log.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
import { PromptFileParser } from '../../../../common/promptSyntax/promptFileParser.js';
import { ITextModel } from '../../../../../../../editor/common/model.js';
import { IPromptsService } from '../../../../common/promptSyntax/service/promptsService.js';
import { createVSCodeHarnessDescriptor, ICustomizationHarnessService } from '../../../../common/customizationHarnessService.js';
import { CompletionModel } from '../../../../../../../editor/contrib/suggest/browser/completionModel.js';
import { CompletionItem as SuggestCompletionItem } from '../../../../../../../editor/contrib/suggest/browser/suggest.js';
import { WordDistance } from '../../../../../../../editor/contrib/suggest/browser/wordDistance.js';
import { EditorOptions } from '../../../../../../../editor/common/config/editorOptions.js';

suite('PromptBodyAutocompletion', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instaService: TestInstantiationService;
	let completionProvider: PromptBodyAutocompletion;
	let activeTarget: Target;

	setup(async () => {
		activeTarget = Target.Undefined;
		const testConfigService = new TestConfigurationService();
		testConfigService.setUserConfiguration(ChatConfiguration.ExtensionToolsEnabled, true);
		instaService = workbenchInstantiationService({
			contextKeyService: () => disposables.add(new ContextKeyService(testConfigService)),
			configurationService: () => testConfigService
		}, disposables);
		instaService.stub(ILogService, new NullLogService());
		const fileService = disposables.add(instaService.createInstance(FileService));
		instaService.stub(IFileService, fileService);

		const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider('test', fileSystemProvider));

		// Create some test files and directories
		await fileService.createFolder(URI.parse('test:///workspace'));
		await fileService.createFolder(URI.parse('test:///workspace/src'));
		await fileService.createFolder(URI.parse('test:///workspace/docs'));
		await fileService.writeFile(URI.parse('test:///workspace/src/index.ts'), VSBuffer.fromString('export function hello() {}'));
		await fileService.writeFile(URI.parse('test:///workspace/README.md'), VSBuffer.fromString('# Project'));
		await fileService.writeFile(URI.parse('test:///workspace/package.json'), VSBuffer.fromString('{}'));

		const toolService = disposables.add(instaService.createInstance(LanguageModelToolsService));

		const testTool1 = { id: 'testTool1', displayName: 'tool1', canBeReferencedInPrompt: true, modelDescription: 'Test Tool 1', source: ToolDataSource.External, inputSchema: {} } satisfies IToolData;
		disposables.add(toolService.registerToolData(testTool1));

		const testTool2 = { id: 'testTool2', displayName: 'tool2', canBeReferencedInPrompt: true, toolReferenceName: 'tool2', modelDescription: 'Test Tool 2', source: ToolDataSource.External, inputSchema: {} } satisfies IToolData;
		disposables.add(toolService.registerToolData(testTool2));

		const myExtSource = { type: 'extension', label: 'My Extension', extensionId: new ExtensionIdentifier('My.extension') } satisfies ToolDataSource;
		const testTool3 = { id: 'testTool3', displayName: 'tool3', canBeReferencedInPrompt: true, toolReferenceName: 'tool3', modelDescription: 'Test Tool 3', source: myExtSource, inputSchema: {} } satisfies IToolData;
		disposables.add(toolService.registerToolData(testTool3));

		const prExtSource = { type: 'extension', label: 'GitHub Pull Request Extension', extensionId: new ExtensionIdentifier('github.vscode-pull-request-github') } satisfies ToolDataSource;
		const prExtTool1 = { id: 'suggestFix', canBeReferencedInPrompt: true, toolReferenceName: 'suggest-fix', modelDescription: 'tool4', displayName: 'Test Tool 4', source: prExtSource, inputSchema: {} } satisfies IToolData;
		disposables.add(toolService.registerToolData(prExtTool1));

		instaService.set(ILanguageModelToolsService, toolService);
		const parser = new PromptFileParser();
		instaService.stub(IPromptsService, {
			getParsedPromptFile(model: ITextModel) {
				return parser.parse(model.uri, model.getValue());
			}
		});
		instaService.stub(ICustomizationHarnessService, {
			getActiveDescriptor: () => ({ ...createVSCodeHarnessDescriptor(), customAgentTarget: activeTarget }),
		});

		completionProvider = instaService.createInstance(PromptBodyAutocompletion);
	});

	async function getCompletions(content: string, line: number, column: number, promptType: PromptsType) {
		const languageId = getLanguageIdForPromptsType(promptType);
		const model = disposables.add(createTextModel(content, languageId, undefined, URI.parse('test://workspace/test' + getPromptFileExtension(promptType))));
		const position = new Position(line, column);
		const context: CompletionContext = { triggerKind: CompletionTriggerKind.Invoke };
		const result = await completionProvider.provideCompletionItems(model, position, context, CancellationToken.None);
		if (!result || !result.suggestions) {
			return [];
		}
		const lineContent = model.getLineContent(position.lineNumber);
		return result.suggestions.map(s => {
			assert(s.range instanceof Range);
			return {
				label: s.label,
				result: lineContent.substring(0, s.range.startColumn - 1) + s.insertText + lineContent.substring(s.range.endColumn - 1)
			};
		});
	}

	suite('prompt body completions', () => {
		test('github-copilot placeholder suggestions', async () => {
			activeTarget = Target.GitHubCopilot;
			const content = [
				'---',
				'description: "Test"',
				'---',
				'',
				'Work in {{c'
			].join('\n');

			const actual = await getCompletions(content, 5, 12, PromptsType.agent);

			assert.deepStrictEqual(actual, [
				{ label: 'cwd', result: 'Work in {{cwd}}' },
				{ label: 'homedir', result: 'Work in {{homedir}}' },
				{ label: 'configDir', result: 'Work in {{configDir}}' },
				{ label: 'grepToolName', result: 'Work in {{grepToolName}}' },
				{ label: 'globToolName', result: 'Work in {{globToolName}}' },
				{ label: 'shellToolName', result: 'Work in {{shellToolName}}' },
				{ label: 'shellCommandExamples', result: 'Work in {{shellCommandExamples}}' },
			]);
		});

		test('github-copilot placeholder completion replaces an existing suffix', async () => {
			activeTarget = Target.GitHubCopilot;
			const values = [
				{ line: 'Work in {{c}}', column: 12 },
				{ line: 'Work in {{cwd}}', column: 12 },
			];

			const actual = [];
			for (const value of values) {
				const content = ['---', 'description: "Test"', '---', '', value.line].join('\n');
				actual.push((await getCompletions(content, 5, value.column, PromptsType.agent))[0]);
			}

			assert.deepStrictEqual(actual, [
				{ label: 'cwd', result: 'Work in {{cwd}}' },
				{ label: 'cwd', result: 'Work in {{cwd}}' },
			]);
		});

		test('github-copilot placeholder completions remain visible through editor filtering', async () => {
			activeTarget = Target.GitHubCopilot;
			const content = ['---', 'description: "Test"', '---', '', 'Work in {{c'].join('\n');
			const model = disposables.add(createTextModel(content, getLanguageIdForPromptsType(PromptsType.agent), undefined, URI.parse('test://workspace/filter.agent.md')));
			const position = new Position(5, 12);
			const context: CompletionContext = { triggerKind: CompletionTriggerKind.Invoke };
			const list = await completionProvider.provideCompletionItems(model, position, context, CancellationToken.None);
			assert.ok(list);
			const provider = { _debugDisplayName: 'PromptBodyAutocompletion', provideCompletionItems: () => list };
			const completionModel = new CompletionModel(
				list.suggestions.map(item => new SuggestCompletionItem(position, item, list, provider)),
				position.column,
				{ leadingLineContent: model.getLineContent(position.lineNumber), characterCountDelta: 0 },
				WordDistance.None,
				EditorOptions.suggest.defaultValue,
				EditorOptions.snippetSuggestions.defaultValue,
				undefined,
			);

			assert.deepStrictEqual(completionModel.items.map(item => item.completion.label), ['cwd', 'configDir', 'shellCommandExamples']);
		});

		test('github-copilot does not suggest Local references', async () => {
			activeTarget = Target.GitHubCopilot;
			const content = [
				'---',
				'description: "Test"',
				'---',
				'',
				'Use #'
			].join('\n');

			assert.deepStrictEqual(await getCompletions(content, 5, 6, PromptsType.agent), []);
		});

		test('default suggestions', async () => {
			const content = [
				'---',
				'description: "Test"',
				'---',
				'',
				'Use # to reference a file or tool.',
				'One more #to'
			].join('\n');

			{
				const actual = (await getCompletions(content, 5, 6, PromptsType.prompt));
				assert.deepEqual(actual, [
					{
						label: 'file:',
						result: 'Use #file: to reference a file or tool.'
					},
					{
						label: 'tool:',
						result: 'Use #tool: to reference a file or tool.'
					}
				]);
			}
			{
				const actual = (await getCompletions(content, 6, 13, PromptsType.prompt));
				assert.deepEqual(actual, [
					{
						label: 'file:',
						result: 'One more #file:'
					},
					{
						label: 'tool:',
						result: 'One more #tool:'
					}
				]);
			}
		});

		test('tool suggestions', async () => {
			const content = [
				'---',
				'description: "Test"',
				'---',
				'',
				'Use #tool: to reference a tool.',
			].join('\n');
			{
				const actual = (await getCompletions(content, 5, 11, PromptsType.prompt));
				assert.deepEqual(actual, [
					{
						label: 'vscode',
						result: 'Use #tool:vscode to reference a tool.'
					},
					{
						label: 'execute',
						result: 'Use #tool:execute to reference a tool.'
					},
					{
						label: 'read',
						result: 'Use #tool:read to reference a tool.'
					},
					{
						label: 'agent',
						result: 'Use #tool:agent to reference a tool.'
					},
					{
						label: 'tool1',
						result: 'Use #tool:tool1 to reference a tool.'
					},
					{
						label: 'tool2',
						result: 'Use #tool:tool2 to reference a tool.'
					},
					{
						label: 'my.extension/tool3',
						result: 'Use #tool:my.extension/tool3 to reference a tool.'
					},
					{
						label: 'github.vscode-pull-request-github/suggest-fix',
						result: 'Use #tool:github.vscode-pull-request-github/suggest-fix to reference a tool.'
					}
				]);
			}
		});
	});
});
