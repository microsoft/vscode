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

suite('PromptValidator', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instaService: TestInstantiationService;

	setup(async () => {
		instaService = disposables.add(new TestInstantiationService());

		const testConfigService = new TestConfigurationService();
		testConfigService.setUserConfiguration(PromptsConfig.KEY, true);

		instaService.stub(IConfigurationService, testConfigService);

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

		const customChatMode = new CustomChatMode({ uri: URI.file('/test/chatmode.md'), name: 'BeastMode', body: '', variableReferences: [] });
		instaService.stub(IChatModeService, new MockChatModeService({ builtin: [ChatMode.Agent, ChatMode.Ask, ChatMode.Edit], custom: [customChatMode] }));
	});

	function validate(code: string, promptType: PromptsType): IMarkerData[] {
		const uri = URI.parse('file:///test/chatmode' + getPromptFileExtension(promptType));
		const result = new NewPromptsParser().parse(uri, code);
		const validator = instaService.createInstance(PromptValidator);
		return validator.validate(result, promptType);
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
			const markers = validate(content, PromptsType.mode);
			assert.deepStrictEqual(markers, []);
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
			const markers = validate(content, PromptsType.mode);
			assert.strictEqual(markers.length, 3, 'Expected 3 validation issues');
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
			const markers = validate(content, PromptsType.mode);
			assert.strictEqual(markers.length, 1);
			assert.deepStrictEqual(markers.map(m => m.message), ["The 'tools' attribute must be an array."]);
		});

		test('each tool must be string', async () => {
			const content = [
				"---",
				"description: \"Test\"",
				"tools: ['tool1', 2]",
				"---",
			].join('\n');
			const markers = validate(content, PromptsType.mode);
			assert.strictEqual(markers.length, 1);
			assert.strictEqual(markers[0].message, "Each tool name in the 'tools' attribute must be a string.");
		});

		test('unknown attribute in mode file', async () => {
			const content = [
				"---",
				"description: \"Test\"",
				"applyTo: '*.ts'", // not allowed in mode file
				"---",
			].join('\n');
			const markers = validate(content, PromptsType.mode);
			assert.strictEqual(markers.length, 1);
			assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
			assert.ok(markers[0].message.startsWith("Attribute 'applyTo' is not supported in mode files."));
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
			const markers = validate(content, PromptsType.instructions);
			assert.deepEqual(markers, []);
		});

		test('instructions invalid applyTo type', async () => {
			const content = [
				"---",
				"description: \"Instr\"",
				"applyTo: 5",
				"---",
			].join('\n');
			const markers = validate(content, PromptsType.instructions);
			assert.strictEqual(markers.length, 1);
			assert.strictEqual(markers[0].message, "The 'applyTo' attribute must be a string.");
		});

		test('instructions invalid applyTo glob & unknown attribute', async () => {
			const content = [
				"---",
				"description: \"Instr\"",
				"applyTo: ''", // empty -> invalid glob
				"model: mae-4", // model not allowed in instructions
				"---",
			].join('\n');
			const markers = validate(content, PromptsType.instructions);
			assert.strictEqual(markers.length, 2);
			// Order: unknown attribute warnings first (attribute iteration) then applyTo validation
			assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
			assert.ok(markers[0].message.startsWith("Attribute 'model' is not supported in instructions files."));
			assert.strictEqual(markers[1].message, "The 'applyTo' attribute must be a valid glob pattern.");
		});

		test('invalid header structure (YAML array)', async () => {
			const content = [
				"---",
				"- item1",
				"---",
				"Body",
			].join('\n');
			const markers = validate(content, PromptsType.instructions);
			assert.strictEqual(markers.length, 1);
			assert.strictEqual(markers[0].message, 'Invalid header, expecting <key: value> pairs');
		});
	});

	suite('prompts', () => {

		test('prompt valid with agent mode (default) and tools and a BYO model', async () => {
			// mode omitted -> defaults to Agent; tools+model should validate; model MAE 4 is agent capable
			const content = [
				'---',
				'description: "Prompt with tools"',
				"model: MAE 4 (olama)",
				"tools: ['tool1','tool2']",
				'---',
				'Body'
			].join('\n');
			const markers = validate(content, PromptsType.prompt);
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
			const markers = validate(content, PromptsType.prompt);
			assert.strictEqual(markers.length, 1, 'Expected one warning about unsuitable model');
			assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
			assert.strictEqual(markers[0].message, "Model 'MAE 3.5 Turbo' is not suited for agent mode.");
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
			const markers = validate(content, PromptsType.prompt);
			assert.deepStrictEqual(markers, []);
		});

		test('prompt with mode Ask and tools warns', async () => {
			const content = [
				'---',
				'description: "Prompt ask mode with tools"',
				'mode: Ask',
				"tools: ['tool1','tool2']",
				'---',
				'Body'
			].join('\n');
			const markers = validate(content, PromptsType.prompt);
			assert.strictEqual(markers.length, 1, 'Expected one warning about unknown mode');
			assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
			assert.strictEqual(markers[0].message, "Unknown mode 'Ask'. Available modes: agent, ask, edit, BeastMode.");
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
			const markers = validate(content, PromptsType.prompt);
			assert.strictEqual(markers.length, 1);
			assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
			assert.strictEqual(markers[0].message, "The 'tools' attribute is only supported in agent mode. Attribute will be ignored.");
		});
	});

});
