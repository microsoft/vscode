/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';

import { ResourceSet } from '../../../../../../base/common/map.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { IMarkerData, MarkerSeverity } from '../../../../../../platform/markers/common/markers.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { LanguageModelToolsService } from '../../../browser/languageModelToolsService.js';
import { ChatMode, CustomChatMode, IChatModeService } from '../../../common/chatModes.js';
import { IChatService } from '../../../common/chatService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { ILanguageModelToolsService, IToolData, ToolDataSource } from '../../../common/languageModelToolsService.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../../../common/languageModels.js';
import { PromptsConfig } from '../../../common/promptSyntax/config/config.js';
import { getPromptFileExtension } from '../../../common/promptSyntax/config/promptFileLocations.js';
import { PromptValidator } from '../../../common/promptSyntax/languageProviders/promptValidator.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { NewPromptsParser } from '../../../common/promptSyntax/service/newPromptsParser.js';
import { PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { MockChatModeService } from '../../common/mockChatModeService.js';
import { MockChatService } from '../../common/mockChatService.js';

suite('PromptValidator', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instaService: TestInstantiationService;

	const existingRef1 = URI.parse('myFs://test/reference1.md');
	const existingRef2 = URI.parse('myFs://test/reference2.md');

	setup(async () => {

		const testConfigService = new TestConfigurationService();
		testConfigService.setUserConfiguration(PromptsConfig.KEY, true);
		testConfigService.setUserConfiguration(ChatConfiguration.ExtensionToolsEnabled, true);
		instaService = workbenchInstantiationService({
			contextKeyService: () => disposables.add(new ContextKeyService(testConfigService)),
			configurationService: () => testConfigService
		}, disposables);
		const chatService = new MockChatService();
		instaService.stub(IChatService, chatService);
		instaService.stub(ILabelService, { getUriLabel: (resource) => resource.path });

		const toolService = disposables.add(instaService.createInstance(LanguageModelToolsService));

		const testTool1 = { id: 'testTool1', displayName: 'tool1', canBeReferencedInPrompt: true, modelDescription: 'Test Tool 1', source: ToolDataSource.External, inputSchema: {} } satisfies IToolData;
		const testTool2 = { id: 'testTool2', displayName: 'tool2', canBeReferencedInPrompt: true, toolReferenceName: 'tool2', modelDescription: 'Test Tool 2', source: ToolDataSource.External, inputSchema: {} } satisfies IToolData;
		const testTool3 = { id: 'testTool3', displayName: 'tool3', canBeReferencedInPrompt: true, toolReferenceName: 'tool3', modelDescription: 'Test Tool 3', source: { type: 'extension', label: 'My Extension', extensionId: new ExtensionIdentifier('My.extension') }, inputSchema: {} } satisfies IToolData;

		disposables.add(toolService.registerToolData(testTool1));
		disposables.add(toolService.registerToolData(testTool2));
		disposables.add(toolService.registerToolData(testTool3));

		instaService.set(ILanguageModelToolsService, toolService);

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

		const customChatMode = new CustomChatMode({
			uri: URI.parse('myFs://test/test/chatmode.md'),
			name: 'BeastMode',
			agentInstructions: { content: 'Beast mode instructions', toolReferences: [] },
			source: { storage: PromptsStorage.local }
		});
		instaService.stub(IChatModeService, new MockChatModeService({ builtin: [ChatMode.Agent, ChatMode.Ask, ChatMode.Edit], custom: [customChatMode] }));


		const existingFiles = new ResourceSet([existingRef1, existingRef2]);
		instaService.stub(IFileService, {
			exists(uri: URI) {
				return Promise.resolve(existingFiles.has(uri));
			}
		});
	});

	async function validate(code: string, promptType: PromptsType): Promise<IMarkerData[]> {
		const uri = URI.parse('myFs://test/testFile' + getPromptFileExtension(promptType));
		const result = new NewPromptsParser().parse(uri, code);
		const validator = instaService.createInstance(PromptValidator);
		const markers: IMarkerData[] = [];
		await validator.validate(result, promptType, m => markers.push(m));
		return markers;
	}
	suite('agents', () => {

		test('correct agent', async () => {
			const content = [
			/* 01 */'---',
			/* 02 */`description: "Agent mode test"`,
			/* 03 */'model: MAE 4.1',
			/* 04 */`tools: ['tool1', 'tool2']`,
			/* 05 */'---',
			/* 06 */'This is a chat agent test.',
			/* 07 */'Here is a #tool1 variable and a #file:./reference1.md as well as a [reference](./reference2.md).',
			].join('\n');
			const markers = await validate(content, PromptsType.agent);
			assert.deepStrictEqual(markers, []);
		});

		test('agent with errors (empty description, unknown tool & model)', async () => {
			const content = [
			/* 01 */'---',
			/* 02 */`description: ""`, // empty description -> error
			/* 03 */'model: MAE 4.2', // unknown model -> warning
			/* 04 */`tools: ['tool1', 'tool2', 'tool4', 'my.extension/tool3']`, // tool4 unknown -> error
			/* 05 */'---',
			/* 06 */'Body',
			].join('\n');
			const markers = await validate(content, PromptsType.agent);
			assert.deepStrictEqual(
				markers.map(m => ({ severity: m.severity, message: m.message })),
				[
					{ severity: MarkerSeverity.Error, message: `The 'description' attribute should not be empty.` },
					{ severity: MarkerSeverity.Warning, message: `Unknown tool 'tool4'.` },
					{ severity: MarkerSeverity.Warning, message: `Unknown model 'MAE 4.2'.` },
				]
			);
		});

		test('tools must be array', async () => {
			const content = [
				'---',
				'description: "Test"',
				`tools: 'tool1'`,
				'---',
			].join('\n');
			const markers = await validate(content, PromptsType.agent);
			assert.strictEqual(markers.length, 1);
			assert.deepStrictEqual(markers.map(m => m.message), [`The 'tools' attribute must be an array.`]);
		});

		test('each tool must be string', async () => {
			const content = [
				'---',
				'description: "Test"',
				`tools: ['tool1', 2]`,
				'---',
			].join('\n');
			const markers = await validate(content, PromptsType.agent);
			assert.deepStrictEqual(
				markers.map(m => ({ severity: m.severity, message: m.message })),
				[
					{ severity: MarkerSeverity.Error, message: `Each tool name in the 'tools' attribute must be a string.` },
				]
			);
		});

		test('old tool reference', async () => {
			const content = [
				'---',
				'description: "Test"',
				`tools: ['tool1', 'tool3']`,
				'---',
			].join('\n');
			const markers = await validate(content, PromptsType.agent);
			assert.deepStrictEqual(
				markers.map(m => ({ severity: m.severity, message: m.message })),
				[
					{ severity: MarkerSeverity.Info, message: `Tool or toolset 'tool3' has been renamed, use 'my.extension/tool3' instead.` },
				]
			);
		});

		test('unknown attribute in agent file', async () => {
			const content = [
				'---',
				'description: "Test"',
				`applyTo: '*.ts'`, // not allowed in agent file
				'---',
			].join('\n');
			const markers = await validate(content, PromptsType.agent);
			assert.strictEqual(markers.length, 1);
			assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
			assert.ok(markers[0].message.startsWith(`Attribute 'applyTo' is not supported in agent files.`));
		});

		test('tools with invalid handoffs', async () => {
			{
				const content = [
					'---',
					'description: "Test"',
					`handoffs: next`,
					'---',
				].join('\n');
				const markers = await validate(content, PromptsType.agent);
				assert.strictEqual(markers.length, 1);
				assert.deepStrictEqual(markers.map(m => m.message), [`The 'handoffs' attribute must be an array.`]);
			}
			{
				const content = [
					'---',
					'description: "Test"',
					`handoffs:`,
					`  - label: '123'`,
					'---',
				].join('\n');
				const markers = await validate(content, PromptsType.agent);
				assert.strictEqual(markers.length, 1);
				assert.deepStrictEqual(markers.map(m => m.message), [`Missing required properties 'agent', 'prompt' in handoff object.`]);
			}
			{
				const content = [
					'---',
					'description: "Test"',
					`handoffs:`,
					`  - label: '123'`,
					`    agent: ''`,
					`    prompt: ''`,
					`    send: true`,
					'---',
				].join('\n');
				const markers = await validate(content, PromptsType.agent);
				assert.strictEqual(markers.length, 1);
				assert.deepStrictEqual(markers.map(m => m.message), [`The 'agent' property in a handoff must be a non-empty string.`]);
			}
		});

		test('agent with handoffs attribute', async () => {
			const content = [
				'---',
				'description: \"Test agent with handoffs\"',
				`handoffs:`,
				'  - label: Test Prompt',
				'    agent: Default',
				'    prompt: Add tests for this code',
				'  - label: Optimize Performance',
				'    agent: Default',
				'    prompt: Optimize for performance',
				'---',
				'Body',
			].join('\n');
			const markers = await validate(content, PromptsType.agent);
			assert.deepStrictEqual(markers, [], 'Expected no validation issues for handoffs attribute');
		});
	});

	suite('instructions', () => {

		test('instructions valid', async () => {
			const content = [
				'---',
				'description: "Instr"',
				'applyTo: *.ts,*.js',
				'---',
			].join('\n');
			const markers = await validate(content, PromptsType.instructions);
			assert.deepEqual(markers, []);
		});

		test('instructions invalid applyTo type', async () => {
			const content = [
				'---',
				'description: "Instr"',
				'applyTo: 5',
				'---',
			].join('\n');
			const markers = await validate(content, PromptsType.instructions);
			assert.strictEqual(markers.length, 1);
			assert.strictEqual(markers[0].message, `The 'applyTo' attribute must be a string.`);
		});

		test('instructions invalid applyTo glob & unknown attribute', async () => {
			const content = [
				'---',
				'description: "Instr"',
				`applyTo: ''`, // empty -> invalid glob
				'model: mae-4', // model not allowed in instructions
				'---',
			].join('\n');
			const markers = await validate(content, PromptsType.instructions);
			assert.strictEqual(markers.length, 2);
			// Order: unknown attribute warnings first (attribute iteration) then applyTo validation
			assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
			assert.ok(markers[0].message.startsWith(`Attribute 'model' is not supported in instructions files.`));
			assert.strictEqual(markers[1].message, `The 'applyTo' attribute must be a valid glob pattern.`);
		});

		test('invalid header structure (YAML array)', async () => {
			const content = [
				'---',
				'- item1',
				'---',
				'Body',
			].join('\n');
			const markers = await validate(content, PromptsType.instructions);
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
				'model: MAE 4.1',
				`tools: ['tool1','tool2']`,
				'---',
				'Body'
			].join('\n');
			const markers = await validate(content, PromptsType.prompt);
			assert.deepStrictEqual(markers, []);
		});

		test('prompt model not suited for agent mode', async () => {
			// MAE 3.5 Turbo lacks agentMode capability -> warning when used in agent (default)
			const content = [
				'---',
				'description: "Prompt with unsuitable model"',
				'model: MAE 3.5 Turbo',
				'---',
				'Body'
			].join('\n');
			const markers = await validate(content, PromptsType.prompt);
			assert.strictEqual(markers.length, 1, 'Expected one warning about unsuitable model');
			assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
			assert.strictEqual(markers[0].message, `Model 'MAE 3.5 Turbo' is not suited for agent mode.`);
		});

		test('prompt with custom agent BeastMode and tools', async () => {
			// Explicit custom agent should be recognized; BeastMode kind comes from setup; ensure tools accepted
			const content = [
				'---',
				'description: "Prompt custom mode"',
				'agent: BeastMode',
				`tools: ['tool1']`,
				'---',
				'Body'
			].join('\n');
			const markers = await validate(content, PromptsType.prompt);
			assert.deepStrictEqual(markers, []);
		});

		test('prompt with custom mode BeastMode and tools', async () => {
			// Explicit custom mode should be recognized; BeastMode kind comes from setup; ensure tools accepted
			const content = [
				'---',
				'description: "Prompt custom mode"',
				'mode: BeastMode',
				`tools: ['tool1']`,
				'---',
				'Body'
			].join('\n');
			const markers = await validate(content, PromptsType.prompt);
			assert.strictEqual(markers.length, 1);
			assert.deepStrictEqual(markers.map(m => m.message), [`The 'mode' attribute has been deprecated. Please rename it to 'agent'.`]);

		});

		test('prompt with custom mode an agent', async () => {
			// Explicit custom mode should be recognized; BeastMode kind comes from setup; ensure tools accepted
			const content = [
				'---',
				'description: "Prompt custom mode"',
				'mode: BeastMode',
				`agent: agent`,
				'---',
				'Body'
			].join('\n');
			const markers = await validate(content, PromptsType.prompt);
			assert.strictEqual(markers.length, 1);
			assert.deepStrictEqual(markers.map(m => m.message), [`The 'mode' attribute has been deprecated. The 'agent' attribute is used instead.`]);

		});

		test('prompt with unknown agent Ask', async () => {
			const content = [
				'---',
				'description: "Prompt unknown agent Ask"',
				'agent: Ask',
				`tools: ['tool1','tool2']`,
				'---',
				'Body'
			].join('\n');
			const markers = await validate(content, PromptsType.prompt);
			assert.strictEqual(markers.length, 1, 'Expected one warning about tools in non-agent mode');
			assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
			assert.strictEqual(markers[0].message, `Unknown agent 'Ask'. Available agents: agent, ask, edit, BeastMode.`);
		});

		test('prompt with agent edit', async () => {
			const content = [
				'---',
				'description: "Prompt edit mode with tool"',
				'agent: edit',
				`tools: ['tool1']`,
				'---',
				'Body'
			].join('\n');
			const markers = await validate(content, PromptsType.prompt);
			assert.strictEqual(markers.length, 1);
			assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
			assert.strictEqual(markers[0].message, `The 'tools' attribute is only supported in agent mode. Attribute will be ignored.`);
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
			const messages = markers.map(m => m.message).sort();
			assert.deepStrictEqual(messages, [
				`File './missing1.md' not found at '/missing1.md'.`,
				`File './missing2.md' not found at '/missing2.md'.`
			]);
		});

		test('body with http link', async () => {
			const content = [
				'---',
				'description: "HTTP Link"',
				'---',
				'Here is a [http link](http://example.com).'
			].join('\n');
			const markers = await validate(content, PromptsType.prompt);
			assert.deepStrictEqual(markers, [], 'Expected no validation issues');
		});

		test('body with url link', async () => {
			const nonExistingRef = existingRef1.with({ path: '/nonexisting' });
			const content = [
				'---',
				'description: "URL Links"',
				'---',
				`Here is a [url link](${existingRef1.toString()}).`,
				`Here is a [url link](${nonExistingRef.toString()}).`
			].join('\n');
			const markers = await validate(content, PromptsType.prompt);
			const messages = markers.map(m => m.message).sort();
			assert.deepStrictEqual(messages, [
				`File 'myFs://test/nonexisting' not found at '/nonexisting'.`,
			]);
		});

		test('body with unknown tool variable reference warns', async () => {
			const content = [
				'---',
				'description: "Unknown tool var"',
				'---',
				'This line references known #tool1 and unknown #toolX'
			].join('\n');
			const markers = await validate(content, PromptsType.prompt);
			assert.strictEqual(markers.length, 1, 'Expected one warning for unknown tool variable');
			assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
			assert.strictEqual(markers[0].message, `Unknown tool or toolset 'toolX'.`);
		});

	});

});
