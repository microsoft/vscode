/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';

import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { NewPromptsParser } from '../../../../common/promptSyntax/service/newPromptsParser.js';
import { PromptValidator } from '../../../../common/promptSyntax/service/promptValidator.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { PromptsConfig } from '../../../../common/promptSyntax/config/config.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { ILanguageModelToolsService, IToolData, ToolDataSource, ToolSet } from '../../../../common/languageModelToolsService.js';
import { ObservableSet } from '../../../../../../../base/common/observable.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../../../../common/languageModels.js';
import { ExtensionIdentifier } from '../../../../../../../platform/extensions/common/extensions.js';
import { ChatMode, CustomChatMode, IChatModeService } from '../../../../common/chatModes.js';
import { MockChatModeService } from '../../mockChatModeService.js';
import { PromptsType } from '../../../../common/promptSyntax/promptTypes.js';
import { IMarkerData, MarkerSeverity } from '../../../../../../../platform/markers/common/markers.js';
import { getPromptFileExtension } from '../../../../common/promptSyntax/config/promptFileLocations.js';
import { IFileService } from '../../../../../../../platform/files/common/files.js';
import { ResourceSet } from '../../../../../../../base/common/map.js';
import { ILabelService } from '../../../../../../../platform/label/common/label.js';

suite('PromptValidator', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instaService: TestInstantiationService;

	setup(async () => {
		instaService = disposables.add(new TestInstantiationService());

		const testConfigService = new TestConfigurationService();
		testConfigService.setUserConfiguration(PromptsConfig.KEY, true);

		instaService.stub(IConfigurationService, testConfigService);
		instaService.stub(ILabelService, { getUriLabel: (uri: URI) => uri.path });

		const testTool1 = { id: 'testTool1', displayName: 'tool1', canBeReferencedInPrompt: true, modelDescription: 'Test Tool 1', source: ToolDataSource.External, inputSchema: {} } satisfies IToolData;
		const testTool2 = { id: 'testTool2', displayName: 'tool2', canBeReferencedInPrompt: true, toolReferenceName: 'tool2', modelDescription: 'Test Tool 2', source: ToolDataSource.External, inputSchema: {} } satisfies IToolData;

		instaService.stub(ILanguageModelToolsService, {
			getTools() { return [testTool1, testTool2]; },
			toolSets: new ObservableSet<ToolSet>().observable
		});

		const testModels: ILanguageModelChatMetadata[] = [
			{ id: 'mae-4', name: 'MAE 4', vendor: 'olama', version: '1.0', family: 'mae', modelPickerCategory: undefined, extension: new ExtensionIdentifier('a.b'), isUserSelectable: true, maxInputTokens: 8192, maxOutputTokens: 1024, capabilities: { agentMode: true, toolCalling: true } } satisfies ILanguageModelChatMetadata,
			{ id: 'mae-4.1', name: 'MAE 4.1', vendor: 'copilot', version: '1.0', family: 'mae', modelPickerCategory: undefined, extension: new ExtensionIdentifier('a.b'), isUserSelectable: true, maxInputTokens: 8192, maxOutputTokens: 1024, capabilities: { agentMode: true, toolCalling: true } } satisfies ILanguageModelChatMetadata,
			{ id: 'mae-3.5-turbo', name: 'MAE 3.5 Turbo', vendor: 'copilot', version: '1.0', family: 'mae', modelPickerCategory: undefined, extension: new ExtensionIdentifier('a.b'), isUserSelectable: true, maxInputTokens: 8192, maxOutputTokens: 1024 } satisfies ILanguageModelChatMetadata
		];

		instaService.stub(ILanguageModelsService, {
			getLanguageModelIds() { return testModels.map(m => m.id); },
			lookupLanguageModel(name: string) {
				return testModels.find(m => m.id === name);
			}
		});

		const customChatMode = new CustomChatMode({ uri: URI.parse('myFs:///test/test/chatmode.md'), name: 'BeastMode', body: '', variableReferences: [] });
		instaService.stub(IChatModeService, new MockChatModeService({ builtin: [ChatMode.Agent, ChatMode.Ask, ChatMode.Edit], custom: [customChatMode] }));


		const existingFiles = new ResourceSet([URI.parse('myFs:///test/reference1.md'), URI.parse('myFs:///test/reference2.md')]);
		instaService.stub(IFileService, {
			exists(uri: URI) {
				return Promise.resolve(existingFiles.has(uri));
			}
		});
	});

	async function validate(code: string, promptType: PromptsType): Promise<IMarkerData[]> {
		const uri = URI.parse('myFs:///test/testFile' + getPromptFileExtension(promptType));
		const result = new NewPromptsParser().parse(uri, code);
		const validator = instaService.createInstance(PromptValidator);
		const markers: IMarkerData[] = [];
		await validator.validate(result, promptType, m => markers.push(m));
		return markers;
	}
	suite('modes', () => {

		test('correct mode', async () => {
			const content = [
			/* 01 */"---",
			/* 02 */`description: "Agent mode test"`,
			/* 03 */"model: MAE 4.1",
			/* 04 */"tools: ['tool1', 'tool2']",
			/* 05 */"---",
			/* 06 */"This is a chat mode test.",
			/* 07 */"Here is a #tool1 variable and a #file:./reference1.md as well as a [reference](./reference2.md).",
			].join('\n');
			const markers = await validate(content, PromptsType.mode);
			assert.deepStrictEqual(markers, []);
		});

		test('mode with non-inline array and invalid attibutes', async () => {
			const content = [
			/* 01 */"---",
			/* 02 */`description: "Agent mode test"`,
			/* 03 */"mode: agent",
			/* 04 */"tools:",
			/* 04 */" - tool1",
			/* 05 */" - tool2",
			/* 06 */" - tool3",
			/* 07 */"---",
			].join('\n');
			const markers = await validate(content, PromptsType.mode);
			assert.deepStrictEqual(
				markers.map(m => ({ severity: m.severity, message: m.message })),
				[
					{ severity: MarkerSeverity.Warning, message: "Attribute 'mode' is not supported in mode files. Supported: description, model, tools." },
					{ severity: MarkerSeverity.Warning, message: "Unknown tool 'tool3'." },
				]
			);
		});

		test('mode with errors (empty description, unknown tool & model)', async () => {
			const content = [
			/* 01 */"---",
			/* 02 */`description: ""`, // empty description -> error
			/* 03 */"model: MAE 4.2", // unknown model -> warning
			/* 04 */"tools: ['tool1', 'tool2', 'tool3']", // tool3 unknown -> warning
			/* 05 */"---",
			/* 06 */"Body",
			].join('\n');
			const markers = await validate(content, PromptsType.mode);
			assert.deepStrictEqual(
				markers.map(m => ({ severity: m.severity, message: m.message })),
				[
					{ severity: MarkerSeverity.Error, message: "The 'description' attribute should not be empty." },
					{ severity: MarkerSeverity.Warning, message: "Unknown tool 'tool3'." },
					{ severity: MarkerSeverity.Warning, message: "Unknown model 'MAE 4.2'." },
				]
			);
		});

		test('tools must be array', async () => {
			const content = [
				"---",
				"description: \"Test\"",
				"tools: 'tool1'",
				"---",
			].join('\n');
			const markers = await validate(content, PromptsType.mode);
			assert.deepStrictEqual(
				markers.map(m => ({ severity: m.severity, message: m.message })),
				[
					{ severity: MarkerSeverity.Error, message: "The 'tools' attribute must be an array or a map." },
				]
			);
		});

		test('each tool must be string', async () => {
			const content = [
				"---",
				"description: \"Test\"",
				"tools: ['tool1', 2]",
				"---",
			].join('\n');
			const markers = await validate(content, PromptsType.mode);
			assert.deepStrictEqual(
				markers.map(m => ({ severity: m.severity, message: m.message })),
				[
					{ severity: MarkerSeverity.Error, message: "Each tool name in the 'tools' attribute must be a string." },
				]
			);
		});

		test('tools as object - valid structure', async () => {
			const content = [
				"---",
				"description: \"Test\"",
				"tools:",
				"  built-in: true",
				"  mcp:",
				"    some-server:",
				"      tool1: true",
				"      tool2: false",
				"  extensions:",
				"    ext1:",
				"      tool1: true",
				"---",
			].join('\n');
			const markers = await validate(content, PromptsType.mode);
			// Should have warnings for unknown tools since our test setup only has 'tool1' and 'tool2'
			assert.deepStrictEqual(
				markers.map(m => ({ severity: m.severity, message: m.message })),
				[
					{ severity: MarkerSeverity.Warning, message: "Unknown tool 'some-server'." },
					{ severity: MarkerSeverity.Warning, message: "Unknown tool 'ext1'." },
				]
			);
		});

		test('tools as object - invalid top-level category', async () => {
			const content = [
				"---",
				"description: \"Test\"",
				"tools:",
				"  invalid-category: true",
				"---",
			].join('\n');
			const markers = await validate(content, PromptsType.mode);
			assert.deepStrictEqual(
				markers.map(m => ({ severity: m.severity, message: m.message })),
				[
					{ severity: MarkerSeverity.Warning, message: "Invalid tool category 'invalid-category'. Valid categories are: built-in, mcp, extensions." },
					{ severity: MarkerSeverity.Error, message: "Tool category 'invalid-category' must be an object containing tool specifications." },
				]
			);
		});

		test('tools as object - non-object value for mcp category', async () => {
			const content = [
				"---",
				"description: \"Test\"",
				"tools:",
				"  mcp: 'invalid'",
				"---",
			].join('\n');
			const markers = await validate(content, PromptsType.mode);
			assert.deepStrictEqual(
				markers.map(m => ({ severity: m.severity, message: m.message })),
				[
					{ severity: MarkerSeverity.Error, message: "Tool category 'mcp' must be an object containing tool specifications." },
				]
			);
		});

		test('tools as object - invalid tool value type', async () => {
			const content = [
				"---",
				"description: \"Test\"",
				"tools:",
				"  mcp:",
				"    server1:",
				"      tool1: 'invalid'",
				"---",
			].join('\n');
			const markers = await validate(content, PromptsType.mode);
			assert.deepStrictEqual(
				markers.map(m => ({ severity: m.severity, message: m.message })),
				[
					{ severity: MarkerSeverity.Warning, message: "Unknown tool 'server1'." },
					{ severity: MarkerSeverity.Error, message: "Tool value 'tool1' must be a boolean or an object." },
				]
			);
		});

		test('unknown attribute in mode file', async () => {
			const content = [
				"---",
				"description: \"Test\"",
				"applyTo: '*.ts'", // not allowed in mode file
				"---",
			].join('\n');
			const markers = await validate(content, PromptsType.mode);
			assert.deepStrictEqual(
				markers.map(m => ({ severity: m.severity, message: m.message })),
				[
					{ severity: MarkerSeverity.Warning, message: "Attribute 'applyTo' is not supported in mode files. Supported: description, model, tools." },
				]
			);
		});
	});

	suite('instructions', () => {

		test('instructions valid', async () => {
			const content = [
				"---",
				"description: \"Instr\"",
				"applyTo: *.ts,*.js",
				"---",
			].join('\n');
			const markers = await validate(content, PromptsType.instructions);
			assert.deepEqual(markers, []);
		});

		test('instructions invalid applyTo type', async () => {
			const content = [
				"---",
				"description: \"Instr\"",
				"applyTo: 5",
				"---",
			].join('\n');
			const markers = await validate(content, PromptsType.instructions);
			assert.deepStrictEqual(
				markers.map(m => ({ severity: m.severity, message: m.message })),
				[
					{ severity: MarkerSeverity.Error, message: "The 'applyTo' attribute must be a string." },
				]
			);
		});

		test('instructions invalid applyTo glob & unknown attribute', async () => {
			const content = [
				"---",
				"description: \"Instr\"",
				"applyTo: ''", // empty -> invalid glob
				"model: mae-4", // model not allowed in instructions
				"---",
			].join('\n');
			const markers = await validate(content, PromptsType.instructions);
			assert.deepStrictEqual(
				markers.map(m => ({ severity: m.severity, message: m.message })),
				[
					{ severity: MarkerSeverity.Warning, message: "Attribute 'model' is not supported in instructions files. Supported: description, applyTo." },
					{ severity: MarkerSeverity.Error, message: "The 'applyTo' attribute must be a valid glob pattern." },
				]
			);
		});

		test('invalid header structure (YAML array)', async () => {
			const content = [
				"---",
				"- item1",
				"---",
				"Body",
			].join('\n');
			const markers = await validate(content, PromptsType.instructions);
			assert.deepStrictEqual(
				markers.map(m => ({ severity: m.severity, message: m.message })),
				[
					{ severity: MarkerSeverity.Error, message: "Invalid header, expecting <key: value> pairs." },
				]
			);
		});
	});

	suite('prompts', () => {

		test('prompt valid with agent mode (default) and tools and a BYO model', async () => {
			// mode omitted -> defaults to Agent; tools+model should validate; model MAE 4 is agent capable
			const content = [
				'---',
				'description: "Prompt with tools"',
				"model: MAE 4.1",
				"tools: ['tool1','tool2']",
				'---',
				'Body'
			].join('\n');
			const markers = await validate(content, PromptsType.prompt);
			assert.deepStrictEqual(markers, []);
		});

		test('prompt model not suited for agent mode', async () => {
			// MAE 3.5 Turbo lacks agentMode capability -> warning when used in agent (default) mode
			const content = [
				'---',
				'description: "Prompt with unsuitable model"',
				"model: MAE 3.5 Turbo",
				'---',
				'Body'
			].join('\n');
			const markers = await validate(content, PromptsType.prompt);
			assert.deepStrictEqual(
				markers.map(m => ({ severity: m.severity, message: m.message })),
				[
					{ severity: MarkerSeverity.Warning, message: "Model 'MAE 3.5 Turbo' is not suited for agent mode." },
				]
			);
		});

		test('prompt with custom mode BeastMode and tools', async () => {
			// Explicit custom mode should be recognized; BeastMode kind comes from setup; ensure tools accepted
			const content = [
				'---',
				'description: "Prompt custom mode"',
				'mode: BeastMode',
				"tools: ['tool1']",
				'---',
				'Body'
			].join('\n');
			const markers = await validate(content, PromptsType.prompt);
			assert.deepStrictEqual(markers, []);
		});

		test('prompt with unknown mode Ask', async () => {
			const content = [
				'---',
				'description: "Prompt unknown mode Ask"',
				'mode: Ask',
				"tools: ['tool1','tool2']",
				'---',
				'Body'
			].join('\n');
			const markers = await validate(content, PromptsType.prompt);
			assert.deepStrictEqual(
				markers.map(m => ({ severity: m.severity, message: m.message })),
				[
					{ severity: MarkerSeverity.Warning, message: "Unknown mode 'Ask'. Available modes: agent, ask, edit, BeastMode." },
				]
			);
		});

		test('prompt with mode edit', async () => {
			const content = [
				'---',
				'description: "Prompt edit mode with tool"',
				'mode: edit',
				"tools: ['tool1']",
				'---',
				'Body'
			].join('\n');
			const markers = await validate(content, PromptsType.prompt);
			assert.deepStrictEqual(
				markers.map(m => ({ severity: m.severity, message: m.message })),
				[
					{ severity: MarkerSeverity.Warning, message: "The 'tools' attribute is only supported in agent mode. Attribute will be ignored." },
				]
			);
		});
	});

	suite('body', () => {
		test('body with existing file references and known tools has no markers', async () => {
			const content = [
				'---',
				'description: "Refs"',
				'---',
				'Here is a #file:./reference1.md and a markdown [reference](./reference2.md) plus variables #tool1 and #tool2'
			].join('\n');
			const markers = await validate(content, PromptsType.prompt);
			assert.deepStrictEqual(markers, [], 'Expected no validation issues');
		});

		test('body with missing file references reports warnings', async () => {
			const content = [
				'---',
				'description: "Missing Refs"',
				'---',
				'Here is a #file:./missing1.md and a markdown [missing link](./missing2.md).'
			].join('\n');
			const markers = await validate(content, PromptsType.prompt);
			assert.deepStrictEqual(
				markers.map(m => ({ severity: m.severity, message: m.message })),
				[
					{ severity: MarkerSeverity.Warning, message: "File './missing1.md' not found at '/test/missing1.md'." },
					{ severity: MarkerSeverity.Warning, message: "File './missing2.md' not found at '/test/missing2.md'." },
				]
			);
		});

		test('body with unknown tool variable reference warns', async () => {
			const content = [
				'---',
				'description: "Unknown tool var"',
				'---',
				'This line references known #tool1 and unknown #toolX'
			].join('\n');
			const markers = await validate(content, PromptsType.prompt);
			assert.deepStrictEqual(
				markers.map(m => ({ severity: m.severity, message: m.message })),
				[
					{ severity: MarkerSeverity.Warning, message: "Unknown tool or toolset 'toolX'." },
				]
			);
		});

	});

});
