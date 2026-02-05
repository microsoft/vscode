/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';

import { ResourceSet } from '../../../../../../../base/common/map.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ContextKeyService } from '../../../../../../../platform/contextkey/browser/contextKeyService.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ExtensionIdentifier } from '../../../../../../../platform/extensions/common/extensions.js';
import { IFileService } from '../../../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILabelService } from '../../../../../../../platform/label/common/label.js';
import { IMarkerData, MarkerSeverity } from '../../../../../../../platform/markers/common/markers.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { LanguageModelToolsService } from '../../../../browser/tools/languageModelToolsService.js';
import { ChatMode, CustomChatMode, IChatModeService } from '../../../../common/chatModes.js';
import { ChatAgentLocation, ChatConfiguration } from '../../../../common/constants.js';
import { ILanguageModelToolsService, IToolData, ToolDataSource } from '../../../../common/tools/languageModelToolsService.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../../../../common/languageModels.js';
import { getPromptFileExtension } from '../../../../common/promptSyntax/config/promptFileLocations.js';
import { PromptValidator } from '../../../../common/promptSyntax/languageProviders/promptValidator.js';
import { PromptsType } from '../../../../common/promptSyntax/promptTypes.js';
import { PromptFileParser } from '../../../../common/promptSyntax/promptFileParser.js';
import { ICustomAgent, IPromptsService, PromptsStorage } from '../../../../common/promptSyntax/service/promptsService.js';
import { MockChatModeService } from '../../../common/mockChatModeService.js';
import { MockPromptsService } from '../../../common/promptSyntax/service/mockPromptsService.js';

suite('PromptValidator', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instaService: TestInstantiationService;

	const existingRef1 = URI.parse('myFs://test/reference1.md');
	const existingRef2 = URI.parse('myFs://test/reference2.md');

	setup(async () => {

		const testConfigService = new TestConfigurationService();
		testConfigService.setUserConfiguration(ChatConfiguration.ExtensionToolsEnabled, true);
		instaService = workbenchInstantiationService({
			contextKeyService: () => disposables.add(new ContextKeyService(testConfigService)),
			configurationService: () => testConfigService
		}, disposables);
		instaService.stub(ILabelService, { getUriLabel: (resource) => resource.path });

		const toolService = disposables.add(instaService.createInstance(LanguageModelToolsService));

		const testTool1 = { id: 'testTool1', displayName: 'tool1', canBeReferencedInPrompt: true, modelDescription: 'Test Tool 1', source: ToolDataSource.External, inputSchema: {} } satisfies IToolData;
		disposables.add(toolService.registerToolData(testTool1));
		const testTool2 = { id: 'testTool2', displayName: 'tool2', canBeReferencedInPrompt: true, toolReferenceName: 'tool2', modelDescription: 'Test Tool 2', source: ToolDataSource.External, inputSchema: {} } satisfies IToolData;
		disposables.add(toolService.registerToolData(testTool2));
		const shellTool = { id: 'shell', displayName: 'shell', canBeReferencedInPrompt: true, toolReferenceName: 'shell', modelDescription: 'Runs commands in the terminal', source: ToolDataSource.External, inputSchema: {} } satisfies IToolData;
		disposables.add(toolService.registerToolData(shellTool));

		const myExtSource = { type: 'extension', label: 'My Extension', extensionId: new ExtensionIdentifier('My.extension') } satisfies ToolDataSource;
		const testTool3 = { id: 'testTool3', displayName: 'tool3', canBeReferencedInPrompt: true, toolReferenceName: 'tool3', modelDescription: 'Test Tool 3', source: myExtSource, inputSchema: {} } satisfies IToolData;
		disposables.add(toolService.registerToolData(testTool3));

		const prExtSource = { type: 'extension', label: 'GitHub Pull Request Extension', extensionId: new ExtensionIdentifier('github.vscode-pull-request-github') } satisfies ToolDataSource;
		const prExtTool1 = { id: 'suggestFix', canBeReferencedInPrompt: true, toolReferenceName: 'suggest-fix', modelDescription: 'tool4', displayName: 'Test Tool 4', source: prExtSource, inputSchema: {} } satisfies IToolData;
		disposables.add(toolService.registerToolData(prExtTool1));

		const toolWithLegacy = { id: 'newTool', toolReferenceName: 'newToolRef', displayName: 'New Tool', canBeReferencedInPrompt: true, modelDescription: 'New Tool', source: ToolDataSource.External, inputSchema: {}, legacyToolReferenceFullNames: ['oldToolName', 'deprecatedToolName'] } satisfies IToolData;
		disposables.add(toolService.registerToolData(toolWithLegacy));

		const toolSetWithLegacy = disposables.add(toolService.createToolSet(
			ToolDataSource.External,
			'newToolSet',
			'newToolSetRef',
			{ description: 'New Tool Set', legacyFullNames: ['oldToolSet', 'deprecatedToolSet'] }
		));
		const toolInSet = { id: 'toolInSet', toolReferenceName: 'toolInSetRef', displayName: 'Tool In Set', canBeReferencedInPrompt: false, modelDescription: 'Tool In Set', source: ToolDataSource.External, inputSchema: {} } satisfies IToolData;
		disposables.add(toolService.registerToolData(toolInSet));
		disposables.add(toolSetWithLegacy.addTool(toolInSet));

		const anotherToolWithLegacy = { id: 'anotherTool', toolReferenceName: 'anotherToolRef', displayName: 'Another Tool', canBeReferencedInPrompt: true, modelDescription: 'Another Tool', source: ToolDataSource.External, inputSchema: {}, legacyToolReferenceFullNames: ['legacyTool'] } satisfies IToolData;
		disposables.add(toolService.registerToolData(anotherToolWithLegacy));

		const anotherToolSetWithLegacy = disposables.add(toolService.createToolSet(
			ToolDataSource.External,
			'anotherToolSet',
			'anotherToolSetRef',
			{ description: 'Another Tool Set', legacyFullNames: ['legacyToolSet'] }
		));
		const anotherToolInSet = { id: 'anotherToolInSet', toolReferenceName: 'anotherToolInSetRef', displayName: 'Another Tool In Set', canBeReferencedInPrompt: false, modelDescription: 'Another Tool In Set', source: ToolDataSource.External, inputSchema: {} } satisfies IToolData;
		disposables.add(toolService.registerToolData(anotherToolInSet));
		disposables.add(anotherToolSetWithLegacy.addTool(anotherToolInSet));

		const conflictToolSet1 = disposables.add(toolService.createToolSet(
			ToolDataSource.External,
			'conflictSet1',
			'conflictSet1Ref',
			{ legacyFullNames: ['sharedLegacyName'] }
		));
		const conflictTool1 = { id: 'conflictTool1', toolReferenceName: 'conflictTool1Ref', displayName: 'Conflict Tool 1', canBeReferencedInPrompt: false, modelDescription: 'Conflict Tool 1', source: ToolDataSource.External, inputSchema: {} } satisfies IToolData;
		disposables.add(toolService.registerToolData(conflictTool1));
		disposables.add(conflictToolSet1.addTool(conflictTool1));

		const conflictToolSet2 = disposables.add(toolService.createToolSet(
			ToolDataSource.External,
			'conflictSet2',
			'conflictSet2Ref',
			{ legacyFullNames: ['sharedLegacyName'] }
		));
		const conflictTool2 = { id: 'conflictTool2', toolReferenceName: 'conflictTool2Ref', displayName: 'Conflict Tool 2', canBeReferencedInPrompt: false, modelDescription: 'Conflict Tool 2', source: ToolDataSource.External, inputSchema: {} } satisfies IToolData;
		disposables.add(toolService.registerToolData(conflictTool2));
		disposables.add(conflictToolSet2.addTool(conflictTool2));

		instaService.set(ILanguageModelToolsService, toolService);

		const testModels: ILanguageModelChatMetadata[] = [
			{ id: 'mae-4', name: 'MAE 4', vendor: 'olama', version: '1.0', family: 'mae', modelPickerCategory: undefined, extension: new ExtensionIdentifier('a.b'), isUserSelectable: true, maxInputTokens: 8192, maxOutputTokens: 1024, capabilities: { agentMode: true, toolCalling: true }, isDefaultForLocation: { [ChatAgentLocation.Chat]: true } } satisfies ILanguageModelChatMetadata,
			{ id: 'mae-4.1', name: 'MAE 4.1', vendor: 'copilot', version: '1.0', family: 'mae', modelPickerCategory: undefined, extension: new ExtensionIdentifier('a.b'), isUserSelectable: true, maxInputTokens: 8192, maxOutputTokens: 1024, capabilities: { agentMode: true, toolCalling: true }, isDefaultForLocation: { [ChatAgentLocation.Chat]: true } } satisfies ILanguageModelChatMetadata,
			{ id: 'mae-3.5-turbo', name: 'MAE 3.5 Turbo', vendor: 'copilot', version: '1.0', family: 'mae', modelPickerCategory: undefined, extension: new ExtensionIdentifier('a.b'), isUserSelectable: true, maxInputTokens: 8192, maxOutputTokens: 1024, isDefaultForLocation: { [ChatAgentLocation.Chat]: true } } satisfies ILanguageModelChatMetadata
		];

		instaService.stub(ILanguageModelsService, {
			getLanguageModelIds() { return testModels.map(m => m.id); },
			lookupLanguageModelByQualifiedName(qualifiedName: string) {
				for (const metadata of testModels) {
					if (ILanguageModelChatMetadata.matchesQualifiedName(qualifiedName, metadata)) {
						return { metadata, identifier: metadata.id };
					}
				}
				return undefined;
			}
		});

		const customChatMode = new CustomChatMode({
			uri: URI.parse('myFs://test/test/chatmode.md'),
			name: 'BeastMode',
			agentInstructions: { content: 'Beast mode instructions', toolReferences: [] },
			source: { storage: PromptsStorage.local },
			visibility: { userInvokable: true, agentInvokable: true }
		});
		instaService.stub(IChatModeService, new MockChatModeService({ builtin: [ChatMode.Agent, ChatMode.Ask, ChatMode.Edit], custom: [customChatMode] }));


		const existingFiles = new ResourceSet([existingRef1, existingRef2]);
		instaService.stub(IFileService, {
			exists(uri: URI) {
				return Promise.resolve(existingFiles.has(uri));
			}
		});
		const promptsService = new MockPromptsService();
		const customMode: ICustomAgent = {
			uri: URI.parse('file:///test/custom-mode.md'),
			name: 'Plan',
			description: 'A test custom mode',
			tools: ['tool1', 'tool2'],
			agentInstructions: { content: 'Custom mode body', toolReferences: [] },
			source: { storage: PromptsStorage.local },
			visibility: { userInvokable: true, agentInvokable: true }
		};
		promptsService.setCustomModes([customMode]);
		instaService.stub(IPromptsService, promptsService);
	});

	async function validate(code: string, promptType: PromptsType, uri?: URI): Promise<IMarkerData[]> {
		if (!uri) {
			uri = URI.parse('myFs://test/testFile' + getPromptFileExtension(promptType));
		}
		const result = new PromptFileParser().parse(uri, code);
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

		test('model as string array - valid', async () => {
			const content = [
				'---',
				'description: "Test with model array"',
				`model: ['MAE 4 (olama)', 'MAE 4.1']`,
				'---',
			].join('\n');
			const markers = await validate(content, PromptsType.agent);
			assert.deepStrictEqual(markers, []);
		});

		test('model as string array - unknown model', async () => {
			const content = [
				'---',
				'description: "Test with model array"',
				`model: ['MAE 4 (olama)', 'Unknown Model']`,
				'---',
			].join('\n');
			const markers = await validate(content, PromptsType.agent);
			assert.strictEqual(markers.length, 1);
			assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
			assert.strictEqual(markers[0].message, `Unknown model 'Unknown Model'.`);
		});

		test('model as string array - unsuitable model', async () => {
			const content = [
				'---',
				'description: "Test with model array"',
				`model: ['MAE 4 (olama)', 'MAE 3.5 Turbo']`,
				'---',
			].join('\n');
			const markers = await validate(content, PromptsType.agent);
			assert.strictEqual(markers.length, 1);
			assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
			assert.strictEqual(markers[0].message, `Model 'MAE 3.5 Turbo' is not suited for agent mode.`);
		});

		test('model as string array - empty array', async () => {
			const content = [
				'---',
				'description: "Test with empty model array"',
				`model: []`,
				'---',
			].join('\n');
			const markers = await validate(content, PromptsType.agent);
			assert.strictEqual(markers.length, 1);
			assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
			assert.strictEqual(markers[0].message, `The 'model' array must not be empty.`);
		});

		test('model as string array - non-string item', async () => {
			const content = [
				'---',
				'description: "Test with invalid model array"',
				`model: ['MAE 4 (olama)', 123]`,
				'---',
			].join('\n');
			const markers = await validate(content, PromptsType.agent);
			assert.strictEqual(markers.length, 1);
			assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
			assert.strictEqual(markers[0].message, `The 'model' array must contain only strings.`);
		});

		test('model as string array - empty string item', async () => {
			const content = [
				'---',
				'description: "Test with empty string in model array"',
				`model: ['MAE 4 (olama)', '']`,
				'---',
			].join('\n');
			const markers = await validate(content, PromptsType.agent);
			assert.strictEqual(markers.length, 1);
			assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
			assert.strictEqual(markers[0].message, `Model names in the array must be non-empty strings.`);
		});

		test('model as invalid type', async () => {
			const content = [
				'---',
				'description: "Test with invalid model type"',
				`model: 123`,
				'---',
			].join('\n');
			const markers = await validate(content, PromptsType.agent);
			assert.strictEqual(markers.length, 1);
			assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
			assert.strictEqual(markers[0].message, `The 'model' attribute must be a string or an array of strings.`);
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

		test('legacy tool reference names', async () => {
			// Test using legacy tool reference name
			{
				const content = [
					'---',
					'description: "Test"',
					`tools: ['tool1', 'oldToolName']`,
					'---',
				].join('\n');
				const markers = await validate(content, PromptsType.agent);
				assert.deepStrictEqual(
					markers.map(m => ({ severity: m.severity, message: m.message })),
					[
						{ severity: MarkerSeverity.Info, message: `Tool or toolset 'oldToolName' has been renamed, use 'newToolRef' instead.` },
					]
				);
			}

			// Test using another legacy tool reference name
			{
				const content = [
					'---',
					'description: "Test"',
					`tools: ['tool1', 'deprecatedToolName']`,
					'---',
				].join('\n');
				const markers = await validate(content, PromptsType.agent);
				assert.deepStrictEqual(
					markers.map(m => ({ severity: m.severity, message: m.message })),
					[
						{ severity: MarkerSeverity.Info, message: `Tool or toolset 'deprecatedToolName' has been renamed, use 'newToolRef' instead.` },
					]
				);
			}
		});

		test('legacy toolset names', async () => {
			// Test using legacy toolset name
			{
				const content = [
					'---',
					'description: "Test"',
					`tools: ['tool1', 'oldToolSet']`,
					'---',
				].join('\n');
				const markers = await validate(content, PromptsType.agent);
				assert.deepStrictEqual(
					markers.map(m => ({ severity: m.severity, message: m.message })),
					[
						{ severity: MarkerSeverity.Info, message: `Tool or toolset 'oldToolSet' has been renamed, use 'newToolSetRef' instead.` },
					]
				);
			}

			// Test using another legacy toolset name
			{
				const content = [
					'---',
					'description: "Test"',
					`tools: ['tool1', 'deprecatedToolSet']`,
					'---',
				].join('\n');
				const markers = await validate(content, PromptsType.agent);
				assert.deepStrictEqual(
					markers.map(m => ({ severity: m.severity, message: m.message })),
					[
						{ severity: MarkerSeverity.Info, message: `Tool or toolset 'deprecatedToolSet' has been renamed, use 'newToolSetRef' instead.` },
					]
				);
			}
		});

		test('multiple legacy names in same tools list', async () => {
			// Test multiple legacy names together
			const content = [
				'---',
				'description: "Test"',
				`tools: ['legacyTool', 'legacyToolSet', 'tool3']`,
				'---',
			].join('\n');
			const markers = await validate(content, PromptsType.agent);
			assert.deepStrictEqual(
				markers.map(m => ({ severity: m.severity, message: m.message })),
				[
					{ severity: MarkerSeverity.Info, message: `Tool or toolset 'legacyTool' has been renamed, use 'anotherToolRef' instead.` },
					{ severity: MarkerSeverity.Info, message: `Tool or toolset 'legacyToolSet' has been renamed, use 'anotherToolSetRef' instead.` },
					{ severity: MarkerSeverity.Info, message: `Tool or toolset 'tool3' has been renamed, use 'my.extension/tool3' instead.` },
				]
			);
		});

		test('deprecated tool name mapping to multiple new names', async () => {
			// The toolsets are registered in setup with a shared legacy name 'sharedLegacyName'
			// This simulates the case where one deprecated name maps to multiple current names
			const content = [
				'---',
				'description: "Test"',
				`tools: ['sharedLegacyName']`,
				'---',
			].join('\n');
			const markers = await validate(content, PromptsType.agent);
			assert.strictEqual(markers.length, 1);
			assert.strictEqual(markers[0].severity, MarkerSeverity.Info);
			// When multiple toolsets share the same legacy name, the message should indicate multiple options
			// The message will say "use the following tools instead:" for multiple mappings
			const expectedMessage = `Tool or toolset 'sharedLegacyName' has been renamed, use the following tools instead: conflictSet1Ref, conflictSet2Ref`;
			assert.strictEqual(markers[0].message, expectedMessage);
		});

		test('deprecated tool name in body variable reference - single mapping', async () => {
			// Test deprecated tool name used as variable reference in body
			const content = [
				'---',
				'description: "Test"',
				'---',
				'Body with #tool:oldToolName reference',
			].join('\n');
			const markers = await validate(content, PromptsType.agent);
			assert.strictEqual(markers.length, 1);
			assert.strictEqual(markers[0].severity, MarkerSeverity.Info);
			assert.strictEqual(markers[0].message, `Tool or toolset 'oldToolName' has been renamed, use 'newToolRef' instead.`);
		});

		test('deprecated tool name in body variable reference - multiple mappings', async () => {
			// Register tools with the same legacy name to create multiple mappings
			const multiMapToolSet1 = disposables.add(instaService.get(ILanguageModelToolsService).createToolSet(
				ToolDataSource.External,
				'multiMapSet1',
				'multiMapSet1Ref',
				{ legacyFullNames: ['multiMapLegacy'] }
			));
			const multiMapTool1 = { id: 'multiMapTool1', toolReferenceName: 'multiMapTool1Ref', displayName: 'Multi Map Tool 1', canBeReferencedInPrompt: true, modelDescription: 'Multi Map Tool 1', source: ToolDataSource.External, inputSchema: {} } satisfies IToolData;
			disposables.add(instaService.get(ILanguageModelToolsService).registerToolData(multiMapTool1));
			disposables.add(multiMapToolSet1.addTool(multiMapTool1));

			const multiMapToolSet2 = disposables.add(instaService.get(ILanguageModelToolsService).createToolSet(
				ToolDataSource.External,
				'multiMapSet2',
				'multiMapSet2Ref',
				{ legacyFullNames: ['multiMapLegacy'] }
			));
			const multiMapTool2 = { id: 'multiMapTool2', toolReferenceName: 'multiMapTool2Ref', displayName: 'Multi Map Tool 2', canBeReferencedInPrompt: true, modelDescription: 'Multi Map Tool 2', source: ToolDataSource.External, inputSchema: {} } satisfies IToolData;
			disposables.add(instaService.get(ILanguageModelToolsService).registerToolData(multiMapTool2));
			disposables.add(multiMapToolSet2.addTool(multiMapTool2));

			const content = [
				'---',
				'description: "Test"',
				'---',
				'Body with #tool:multiMapLegacy reference',
			].join('\n');
			const markers = await validate(content, PromptsType.agent);
			assert.strictEqual(markers.length, 1);
			assert.strictEqual(markers[0].severity, MarkerSeverity.Info);
			// When multiple toolsets share the same legacy name, the message should indicate multiple options
			// The message will say "use the following tools instead:" for multiple mappings in body references
			const expectedMessage = `Tool or toolset 'multiMapLegacy' has been renamed, use the following tools instead: multiMapSet1Ref, multiMapSet2Ref`;
			assert.strictEqual(markers[0].message, expectedMessage);
		});

		test('unknown attribute in agent file', async () => {
			const content = [
				'---',
				'description: "Test"',
				`applyTo: '*.ts'`, // not allowed in agent file
				'---',
			].join('\n');
			const markers = await validate(content, PromptsType.agent);
			assert.deepStrictEqual(
				markers.map(m => ({ severity: m.severity, message: m.message })),
				[
					{ severity: MarkerSeverity.Warning, message: `Attribute 'applyTo' is not supported in VS Code agent files. Supported: agents, argument-hint, description, disable-model-invocation, handoffs, model, name, target, tools, user-invokable.` },
				]
			);
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
			{
				const content = [
					'---',
					'description: "Test"',
					`handoffs:`,
					`  - label: '123'`,
					`    agent: 'Cool'`,
					`    prompt: ''`,
					`    send: true`,
					'---',
				].join('\n');
				const markers = await validate(content, PromptsType.agent);
				assert.strictEqual(markers.length, 1);
				assert.deepStrictEqual(markers.map(m => m.message), [`Unknown agent 'Cool'. Available agents: agent, ask, edit, BeastMode.`]);
			}
		});

		test('agent with handoffs attribute', async () => {
			const content = [
				'---',
				'description: \"Test agent with handoffs\"',
				`handoffs:`,
				'  - label: Test Prompt',
				'    agent: agent',
				'    prompt: Add tests for this code',
				'  - label: Optimize Performance',
				'    agent: agent',
				'    prompt: Optimize for performance',
				'---',
				'Body',
			].join('\n');
			const markers = await validate(content, PromptsType.agent);
			assert.deepStrictEqual(markers, [], 'Expected no validation issues for handoffs attribute');
		});

		test('github-copilot agent with supported attributes', async () => {
			const content = [
				'---',
				'name: "GitHub_Copilot_Custom_Agent"',
				'description: "GitHub Copilot agent"',
				'target: github-copilot',
				`tools: ['shell', 'edit', 'search', 'custom-agent']`,
				'mcp-servers: []',
				'---',
				'Body with #search and #edit references',
			].join('\n');
			const markers = await validate(content, PromptsType.agent);
			assert.deepStrictEqual(markers, [], 'Expected no validation issues for github-copilot target');
		});

		test('github-copilot agent warns about model and handoffs attributes', async () => {
			const content = [
				'---',
				'name: "GitHubAgent"',
				'description: "GitHub Copilot agent"',
				'target: github-copilot',
				'model: MAE 4.1',
				`tools: ['shell', 'edit']`,
				`handoffs:`,
				'  - label: Test',
				'    agent: Default',
				'    prompt: Test',
				'---',
				'Body',
			].join('\n');
			const markers = await validate(content, PromptsType.agent);
			const messages = markers.map(m => m.message);
			assert.deepStrictEqual(messages, [
				'Attribute \'model\' is not supported in custom GitHub Copilot agent files. Supported: description, infer, mcp-servers, name, target, tools.',
				'Attribute \'handoffs\' is not supported in custom GitHub Copilot agent files. Supported: description, infer, mcp-servers, name, target, tools.',
			], 'Model and handoffs are not validated for github-copilot target');
		});

		test('github-copilot agent does not validate variable references', async () => {
			const content = [
				'---',
				'name: "GitHubAgent"',
				'description: "GitHub Copilot agent"',
				'target: github-copilot',
				`tools: ['shell', 'edit']`,
				'---',
				'Body with #unknownTool reference',
			].join('\n');
			const markers = await validate(content, PromptsType.agent);
			// Variable references should not be validated for github-copilot target
			assert.deepStrictEqual(markers, [], 'Variable references are not validated for github-copilot target');
		});

		test('github-copilot agent rejects unsupported attributes', async () => {
			const content = [
				'---',
				'name: "GitHubAgent"',
				'description: "GitHub Copilot agent"',
				'target: github-copilot',
				'argument-hint: "test hint"',
				`tools: ['shell']`,
				'---',
				'Body',
			].join('\n');
			const markers = await validate(content, PromptsType.agent);
			assert.strictEqual(markers.length, 1);
			assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
			assert.ok(markers[0].message.includes(`Attribute 'argument-hint' is not supported`), 'Expected warning about unsupported attribute');
		});

		test('vscode target agent validates normally', async () => {
			const content = [
				'---',
				'description: "VS Code agent"',
				'target: vscode',
				'model: MAE 4.1',
				`tools: ['tool1', 'tool2']`,
				'---',
				'Body with #tool1',
			].join('\n');
			const markers = await validate(content, PromptsType.agent);
			assert.deepStrictEqual(markers, [], 'VS Code target should validate normally');
		});

		test('vscode target agent warns about unknown tools', async () => {
			const content = [
				'---',
				'description: "VS Code agent"',
				'target: vscode',
				`tools: ['tool1', 'unknownTool']`,
				'---',
				'Body',
			].join('\n');
			const markers = await validate(content, PromptsType.agent);
			assert.strictEqual(markers.length, 1);
			assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
			assert.strictEqual(markers[0].message, `Unknown tool 'unknownTool'.`);
		});

		test('vscode target agent with mcp-servers and github-tools', async () => {
			const content = [
				'---',
				'description: "VS Code agent"',
				'target: vscode',
				`tools: ['tool1', 'edit']`,
				`mcp-servers: {}`,
				'---',
				'Body',
			].join('\n');
			const markers = await validate(content, PromptsType.agent);
			const messages = markers.map(m => m.message);
			assert.deepStrictEqual(messages, [
				'Attribute \'mcp-servers\' is ignored when running locally in VS Code.',
				'Unknown tool \'edit\'.',
			]);
		});

		test('undefined target with mcp-servers and github-tools', async () => {
			const content = [
				'---',
				'description: "VS Code agent"',
				`tools: ['tool1', 'shell']`,
				`mcp-servers: {}`,
				'---',
				'Body',
			].join('\n');
			const markers = await validate(content, PromptsType.agent);
			const messages = markers.map(m => m.message);
			assert.deepStrictEqual(messages, [
				'Attribute \'mcp-servers\' is ignored when running locally in VS Code.',
			]);
		});

		test('default target (no target specified) validates as vscode', async () => {
			const content = [
				'---',
				'description: "Agent without target"',
				'model: MAE 4.1',
				`tools: ['tool1']`,
				'argument-hint: "test hint"',
				'---',
				'Body',
			].join('\n');
			const markers = await validate(content, PromptsType.agent);
			// Should validate normally as if target was vscode
			assert.deepStrictEqual(markers, [], 'Agent without target should validate as vscode');
		});

		test('name attribute validation', async () => {
			// Valid name
			{
				const content = [
					'---',
					'name: "MyAgent"',
					'description: "Test agent"',
					'target: vscode',
					'---',
					'Body',
				].join('\n');
				const markers = await validate(content, PromptsType.agent);
				assert.deepStrictEqual(markers, [], 'Valid name should not produce errors');
			}

			// Empty name
			{
				const content = [
					'---',
					'name: ""',
					'description: "Test agent"',
					'target: vscode',
					'---',
					'Body',
				].join('\n');
				const markers = await validate(content, PromptsType.agent);
				assert.strictEqual(markers.length, 1);
				assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
				assert.strictEqual(markers[0].message, `The 'name' attribute must not be empty.`);
			}

			// Non-string name
			{
				const content = [
					'---',
					'name: 123',
					'description: "Test agent"',
					'target: vscode',
					'---',
					'Body',
				].join('\n');
				const markers = await validate(content, PromptsType.agent);
				assert.strictEqual(markers.length, 1);
				assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
				assert.strictEqual(markers[0].message, `The 'name' attribute must be a string.`);
			}

			// Valid name with allowed characters
			{
				const content = [
					'---',
					'name: "My_Agent-2.0 with spaces"',
					'description: "Test agent"',
					'target: vscode',
					'---',
					'Body',
				].join('\n');
				const markers = await validate(content, PromptsType.agent);
				assert.deepStrictEqual(markers, [], 'Name with allowed characters should be valid');
			}
		});

		test('github-copilot target requires name attribute', async () => {
			// Missing name with github-copilot target
			{
				const content = [
					'---',
					'description: "GitHub Copilot agent"',
					'target: github-copilot',
					`tools: ['shell']`,
					'---',
					'Body',
				].join('\n');
				const markers = await validate(content, PromptsType.agent);
				assert.strictEqual(markers.length, 0);
			}

			// Valid name with github-copilot target
			{
				const content = [
					'---',
					'name: "GitHubAgent"',
					'description: "GitHub Copilot agent"',
					'target: github-copilot',
					`tools: ['shell']`,
					'---',
					'Body',
				].join('\n');
				const markers = await validate(content, PromptsType.agent);
				assert.deepStrictEqual(markers, [], 'Valid github-copilot agent with name should not produce errors');
			}

			// Missing name with vscode target (should be optional)
			{
				const content = [
					'---',
					'description: "VS Code agent"',
					'target: vscode',
					`tools: ['tool1']`,
					'---',
					'Body',
				].join('\n');
				const markers = await validate(content, PromptsType.agent);
				assert.deepStrictEqual(markers, [], 'Name should be optional for vscode target');
			}
		});

		test('infer attribute validation', async () => {
			const deprecationMessage = `The 'infer' attribute is deprecated in favour of 'user-invokable' and 'disable-model-invocation'.`;

			// Valid infer: true (maps to 'all') - shows deprecation warning
			{
				const content = [
					'---',
					'name: "TestAgent"',
					'description: "Test agent"',
					'infer: true',
					'---',
					'Body',
				].join('\n');
				const markers = await validate(content, PromptsType.agent);
				assert.strictEqual(markers.length, 1, 'infer: true should produce deprecation warning');
				assert.strictEqual(markers[0].message, deprecationMessage);
				assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
			}

			// Valid infer: false (maps to 'user') - shows deprecation warning
			{
				const content = [
					'---',
					'name: "TestAgent"',
					'description: "Test agent"',
					'infer: false',
					'---',
					'Body',
				].join('\n');
				const markers = await validate(content, PromptsType.agent);
				assert.strictEqual(markers.length, 1, 'infer: false should produce deprecation warning');
				assert.strictEqual(markers[0].message, deprecationMessage);
				assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
			}

			// Valid infer: 'all' - shows deprecation warning
			{
				const content = [
					'---',
					'name: "TestAgent"',
					'description: "Test agent"',
					'infer: all',
					'---',
					'Body',
				].join('\n');
				const markers = await validate(content, PromptsType.agent);
				assert.strictEqual(markers.length, 1, 'infer: all should produce deprecation warning');
				assert.strictEqual(markers[0].message, deprecationMessage);
				assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
			}

			// Valid infer: 'user' - shows deprecation warning
			{
				const content = [
					'---',
					'name: "TestAgent"',
					'description: "Test agent"',
					'infer: user',
					'---',
					'Body',
				].join('\n');
				const markers = await validate(content, PromptsType.agent);
				assert.strictEqual(markers.length, 1, 'infer: user should produce deprecation warning');
				assert.strictEqual(markers[0].message, deprecationMessage);
				assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
			}

			// Valid infer: 'agent' - shows deprecation warning
			{
				const content = [
					'---',
					'name: "TestAgent"',
					'description: "Test agent"',
					'infer: agent',
					'---',
					'Body',
				].join('\n');
				const markers = await validate(content, PromptsType.agent);
				assert.strictEqual(markers.length, 1, 'infer: agent should produce deprecation warning');
				assert.strictEqual(markers[0].message, deprecationMessage);
				assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
			}

			// Valid infer: 'hidden' - shows deprecation warning
			{
				const content = [
					'---',
					'name: "TestAgent"',
					'description: "Test agent"',
					'infer: hidden',
					'---',
					'Body',
				].join('\n');
				const markers = await validate(content, PromptsType.agent);
				assert.strictEqual(markers.length, 1, 'infer: hidden should produce deprecation warning');
				assert.strictEqual(markers[0].message, deprecationMessage);
				assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
			}

			// Invalid infer: unknown string value - shows deprecation warning (validation removed for deprecated attribute)
			{
				const content = [
					'---',
					'name: "TestAgent"',
					'description: "Test agent"',
					'infer: "yes"',
					'---',
					'Body',
				].join('\n');
				const markers = await validate(content, PromptsType.agent);
				assert.strictEqual(markers.length, 1, 'infer: "yes" should produce deprecation warning');
				assert.strictEqual(markers[0].message, deprecationMessage);
				assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
			}

			// Invalid infer: number value - shows deprecation warning (validation removed for deprecated attribute)
			{
				const content = [
					'---',
					'name: "TestAgent"',
					'description: "Test agent"',
					'infer: 1',
					'---',
					'Body',
				].join('\n');
				const markers = await validate(content, PromptsType.agent);
				assert.strictEqual(markers.length, 1, 'infer: 1 should produce deprecation warning');
				assert.strictEqual(markers[0].message, deprecationMessage);
				assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
			}

			// Missing infer attribute (should be optional)
			{
				const content = [
					'---',
					'name: "TestAgent"',
					'description: "Test agent"',
					'---',
					'Body',
				].join('\n');
				const markers = await validate(content, PromptsType.agent);
				assert.deepStrictEqual(markers, [], 'Missing infer attribute should be allowed');
			}
		});

		test('agents attribute must be an array', async () => {
			const content = [
				'---',
				'description: "Test"',
				`agents: 'myAgent'`,
				'---',
			].join('\n');
			const markers = await validate(content, PromptsType.agent);
			assert.deepStrictEqual(markers.map(m => m.message), [`The 'agents' attribute must be an array.`]);
		});

		test('each agent name in agents attribute must be a string', async () => {
			const content = [
				'---',
				'description: "Test"',
				`agents: ['agent', 123]`,
				`tools: ['agent']`,
				'---',
			].join('\n');
			const markers = await validate(content, PromptsType.agent);
			assert.deepStrictEqual(markers.map(m => m.message), [`Each agent name in the 'agents' attribute must be a string.`]);
		});

		test('unknown agent in agents attribute shows warning', async () => {
			const content = [
				'---',
				'description: "Test"',
				`agents: ['UnknownAgent']`,
				`tools: ['agent']`,
				'---',
			].join('\n');
			const markers = await validate(content, PromptsType.agent);
			assert.strictEqual(markers.length, 1);
			assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
			assert.strictEqual(markers[0].message, `Unknown agent 'UnknownAgent'. Available agents: Plan, agent.`);
		});

		test('agents attribute with non-empty value requires agent tool 1', async () => {
			const content = [
				'---',
				'description: "Test"',
				`agents: ['agent', 'Plan']`,
				'---',
			].join('\n');
			const markers = await validate(content, PromptsType.agent);
			assert.deepStrictEqual(markers.map(m => m.message), [], `No warnings about agents attribute when no tools are specified`);
		});

		test('agents attribute with non-empty value requires agent tool 2', async () => {
			const content = [
				'---',
				'description: "Test"',
				`agents: ['agent', 'Plan']`,
				`tools: ['shell']`,
				'---',
			].join('\n');
			const markers = await validate(content, PromptsType.agent);
			assert.deepStrictEqual(markers.map(m => m.message), [`When 'agents' and 'tools' are specified, the 'agent' tool must be included in the 'tools' attribute.`]);
		});

		test('agents attribute with non-empty value requires agent tool 3', async () => {
			const content = [
				'---',
				'description: "Test"',
				`agents: ['agent', 'Plan']`,
				`tools: ['agent']`,
				'---',
			].join('\n');
			const markers = await validate(content, PromptsType.agent);
			assert.deepStrictEqual(markers.map(m => m.message), [], `No warnings about agents attribute when agent tool is in header`);
		});

		test('agents attribute with non-empty value requires agent tool 4', async () => {
			const content = [
				'---',
				'description: "Test"',
				`agents: ['*']`,
				`tools: ['shell']`,
				'---',
			].join('\n');
			const markers = await validate(content, PromptsType.agent);
			assert.deepStrictEqual(markers.map(m => m.message), [`When 'agents' and 'tools' are specified, the 'agent' tool must be included in the 'tools' attribute.`]);
		});

		test('agents attribute with empty array does not require agent tool', async () => {
			const content = [
				'---',
				'description: "Test"',
				`agents: []`,
				'---',
			].join('\n');
			const markers = await validate(content, PromptsType.agent);
			assert.deepStrictEqual(markers, [], 'Empty array should not require agent tool');
		});

		test('user-invokable attribute validation', async () => {
			// Valid user-invokable: true
			{
				const content = [
					'---',
					'name: "TestAgent"',
					'description: "Test agent"',
					'user-invokable: true',
					'---',
					'Body',
				].join('\n');
				const markers = await validate(content, PromptsType.agent);
				assert.deepStrictEqual(markers, [], 'Valid user-invokable: true should not produce errors');
			}

			// Valid user-invokable: false
			{
				const content = [
					'---',
					'name: "TestAgent"',
					'description: "Test agent"',
					'user-invokable: false',
					'---',
					'Body',
				].join('\n');
				const markers = await validate(content, PromptsType.agent);
				assert.deepStrictEqual(markers, [], 'Valid user-invokable: false should not produce errors');
			}

			// Invalid user-invokable: string value
			{
				const content = [
					'---',
					'name: "TestAgent"',
					'description: "Test agent"',
					'user-invokable: "yes"',
					'---',
					'Body',
				].join('\n');
				const markers = await validate(content, PromptsType.agent);
				assert.strictEqual(markers.length, 1);
				assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
				assert.strictEqual(markers[0].message, `The 'user-invokable' attribute must be a boolean.`);
			}

			// Invalid user-invokable: number value
			{
				const content = [
					'---',
					'name: "TestAgent"',
					'description: "Test agent"',
					'user-invokable: 1',
					'---',
					'Body',
				].join('\n');
				const markers = await validate(content, PromptsType.agent);
				assert.strictEqual(markers.length, 1);
				assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
				assert.strictEqual(markers[0].message, `The 'user-invokable' attribute must be a boolean.`);
			}
		});

		test('disable-model-invocation attribute validation', async () => {
			// Valid disable-model-invocation: true
			{
				const content = [
					'---',
					'name: "TestAgent"',
					'description: "Test agent"',
					'disable-model-invocation: true',
					'---',
					'Body',
				].join('\n');
				const markers = await validate(content, PromptsType.agent);
				assert.deepStrictEqual(markers, [], 'Valid disable-model-invocation: true should not produce errors');
			}

			// Valid disable-model-invocation: false
			{
				const content = [
					'---',
					'name: "TestAgent"',
					'description: "Test agent"',
					'disable-model-invocation: false',
					'---',
					'Body',
				].join('\n');
				const markers = await validate(content, PromptsType.agent);
				assert.deepStrictEqual(markers, [], 'Valid disable-model-invocation: false should not produce errors');
			}

			// Invalid disable-model-invocation: string value
			{
				const content = [
					'---',
					'name: "TestAgent"',
					'description: "Test agent"',
					'disable-model-invocation: "yes"',
					'---',
					'Body',
				].join('\n');
				const markers = await validate(content, PromptsType.agent);
				assert.strictEqual(markers.length, 1);
				assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
				assert.strictEqual(markers[0].message, `The 'disable-model-invocation' attribute must be a boolean.`);
			}

			// Invalid disable-model-invocation: number value
			{
				const content = [
					'---',
					'name: "TestAgent"',
					'description: "Test agent"',
					'disable-model-invocation: 0',
					'---',
					'Body',
				].join('\n');
				const markers = await validate(content, PromptsType.agent);
				assert.strictEqual(markers.length, 1);
				assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
				assert.strictEqual(markers[0].message, `The 'disable-model-invocation' attribute must be a boolean.`);
			}
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

		test('name attribute validation in instructions', async () => {
			// Valid name
			{
				const content = [
					'---',
					'name: "MyInstructions"',
					'description: "Test instructions"',
					'applyTo: "**/*.ts"',
					'---',
					'Body',
				].join('\n');
				const markers = await validate(content, PromptsType.instructions);
				assert.deepStrictEqual(markers, [], 'Valid name should not produce errors');
			}

			// Empty name
			{
				const content = [
					'---',
					'name: ""',
					'description: "Test instructions"',
					'applyTo: "**/*.ts"',
					'---',
					'Body',
				].join('\n');
				const markers = await validate(content, PromptsType.instructions);
				assert.strictEqual(markers.length, 1);
				assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
				assert.strictEqual(markers[0].message, `The 'name' attribute must not be empty.`);
			}
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
			assert.strictEqual(markers[0].message, `The 'tools' attribute is only supported when using agents. Attribute will be ignored.`);
		});

		test('name attribute validation in prompts', async () => {
			// Valid name
			{
				const content = [
					'---',
					'name: "MyPrompt"',
					'description: "Test prompt"',
					'---',
					'Body',
				].join('\n');
				const markers = await validate(content, PromptsType.prompt);
				assert.deepStrictEqual(markers, [], 'Valid name should not produce errors');
			}

			// Empty name
			{
				const content = [
					'---',
					'name: ""',
					'description: "Test prompt"',
					'---',
					'Body',
				].join('\n');
				const markers = await validate(content, PromptsType.prompt);
				assert.strictEqual(markers.length, 1);
				assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
				assert.strictEqual(markers[0].message, `The 'name' attribute must not be empty.`);
			}
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
				'This line references known #tool:tool1 and unknown #tool:toolX'
			].join('\n');
			const markers = await validate(content, PromptsType.prompt);
			assert.strictEqual(markers.length, 1, 'Expected one warning for unknown tool variable');
			assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
			assert.strictEqual(markers[0].message, `Unknown tool or toolset 'toolX'.`);
		});

		test('body with tool not present in tools list', async () => {
			const content = [
				'---',
				'tools: []',
				'---',
				'I need',
				'#tool:ms-azuretools.vscode-azure-github-copilot/azure_recommend_custom_modes',
				'#tool:github.vscode-pull-request-github/suggest-fix',
				'#tool:openSimpleBrowser',
			].join('\n');
			const markers = await validate(content, PromptsType.prompt);
			const actual = markers.sort((a, b) => a.startLineNumber - b.startLineNumber).map(m => ({ message: m.message, startColumn: m.startColumn, endColumn: m.endColumn }));
			assert.deepEqual(actual, [
				{ message: `Unknown tool or toolset 'ms-azuretools.vscode-azure-github-copilot/azure_recommend_custom_modes'.`, startColumn: 7, endColumn: 77 },
				{ message: `Tool or toolset 'github.vscode-pull-request-github/suggest-fix' also needs to be enabled in the header.`, startColumn: 7, endColumn: 52 },
				{ message: `Unknown tool or toolset 'openSimpleBrowser'.`, startColumn: 7, endColumn: 24 },
			]);
		});

	});

	suite('skills', () => {

		test('skill name matches folder name', async () => {
			const content = [
				'---',
				'name: my-skill',
				'description: Test Skill',
				'---',
				'This is a skill.'
			].join('\n');
			const markers = await validate(content, PromptsType.skill, URI.parse('file:///.github/skills/my-skill/SKILL.md'));
			assert.deepStrictEqual(markers, [], 'Expected no validation issues when name matches folder');
		});

		test('skill name does not match folder name', async () => {
			const content = [
				'---',
				'name: different-name',
				'description: Test Skill',
				'---',
				'This is a skill.'
			].join('\n');
			const markers = await validate(content, PromptsType.skill, URI.parse('file:///.github/skills/my-skill/SKILL.md'));
			assert.strictEqual(markers.length, 1);
			assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
			assert.strictEqual(markers[0].message, `The skill name 'different-name' should match the folder name 'my-skill'.`);
		});

		test('skill without name attribute does not error', async () => {
			const content = [
				'---',
				'description: Test Skill',
				'---',
				'This is a skill without a name.'
			].join('\n');
			const markers = await validate(content, PromptsType.skill, URI.parse('file:///.github/skills/my-skill/SKILL.md'));
			assert.deepStrictEqual(markers, [], 'Expected no validation issues when name is missing');
		});

		test('skill with empty name does not validate folder match', async () => {
			const content = [
				'---',
				'name: ""',
				'description: Test Skill',
				'---',
				'This is a skill.'
			].join('\n');
			const markers = await validate(content, PromptsType.skill, URI.parse('file:///.github/skills/my-skill/SKILL.md'));
			// Should get error for empty name, but no folder mismatch warning since name is empty
			assert.ok(markers.some(m => m.message.includes('must not be empty')), 'Expected error for empty name');
			assert.ok(!markers.some(m => m.message.includes('should match the folder name')), 'Should not warn about folder mismatch for empty name');
		});

		test('skill name with whitespace trimmed matches folder name', async () => {
			const content = [
				'---',
				'name: "  my-skill  "',
				'description: Test Skill',
				'---',
				'This is a skill.'
			].join('\n');
			const markers = await validate(content, PromptsType.skill, URI.parse('file:///.github/skills/my-skill/SKILL.md'));
			assert.deepStrictEqual(markers, [], 'Expected no validation issues when trimmed name matches folder');
		});

		test('skill name validation with different folder depths', async () => {
			// Test with deeper path structure
			{
				const content = [
					'---',
					'name: advanced-skill',
					'description: Test Skill',
					'---',
					'This is a skill.'
				].join('\n');
				const markers = await validate(content, PromptsType.skill, URI.parse('file:///home/user/.github/skills/advanced-skill/SKILL.md'));
				assert.deepStrictEqual(markers, [], 'Expected no issues for deeper path when name matches');
			}

			// Test with mismatch in deeper path
			{
				const content = [
					'---',
					'name: wrong-name',
					'description: Test Skill',
					'---',
					'This is a skill.'
				].join('\n');
				const markers = await validate(content, PromptsType.skill, URI.parse('file:///home/user/.github/skills/correct-folder/SKILL.md'));
				assert.strictEqual(markers.length, 1);
				assert.strictEqual(markers[0].message, `The skill name 'wrong-name' should match the folder name 'correct-folder'.`);
			}
		});

		test('skill name validation with special characters in folder', async () => {
			const content = [
				'---',
				'name: my_special-skill.v2',
				'description: Test Skill',
				'---',
				'This is a skill.'
			].join('\n');
			const markers = await validate(content, PromptsType.skill, URI.parse('file:///.github/skills/my_special-skill.v2/SKILL.md'));
			assert.deepStrictEqual(markers, [], 'Expected no issues when name with special chars matches folder');
		});

		test('skill with non-string name type does not validate folder match', async () => {
			const content = [
				'---',
				'name: 123',
				'description: Test Skill',
				'---',
				'This is a skill.'
			].join('\n');
			const markers = await validate(content, PromptsType.skill, URI.parse('file:///.github/skills/my-skill/SKILL.md'));
			// Should get error for non-string name type, but no folder mismatch warning
			assert.ok(markers.some(m => m.message.includes('must be a string')), 'Expected error for non-string name');
			assert.ok(!markers.some(m => m.message.includes('should match the folder name')), 'Should not warn about folder mismatch for non-string name');
		});

		test('skill folder name validation only for skill type', async () => {
			// Verify that folder name validation doesn't run for non-skill prompt types
			const content = [
				'---',
				'name: different-name',
				'description: Test Agent',
				'---',
				'This is an agent.'
			].join('\n');
			const markers = await validate(content, PromptsType.agent, URI.parse('file:///.github/agents/my-agent/AGENT.md'));
			// Should not get folder name mismatch warning for agents
			assert.ok(!markers.some(m => m.message.includes('should match the folder name')), 'Should not validate folder names for agents');
		});

		test('skill with unknown attributes shows warning', async () => {
			const content = [
				'---',
				'name: my-skill',
				'description: Test Skill',
				'unknownAttr: value',
				'anotherUnknown: 123',
				'---',
				'This is a skill.'
			].join('\n');
			const markers = await validate(content, PromptsType.skill, URI.parse('file:///.github/skills/my-skill/SKILL.md'));
			assert.strictEqual(markers.length, 2);
			assert.ok(markers.every(m => m.severity === MarkerSeverity.Warning));
			assert.ok(markers.some(m => m.message.includes('unknownAttr')));
			assert.ok(markers.some(m => m.message.includes('anotherUnknown')));
			assert.ok(markers.every(m => m.message.includes('Supported: ')));
		});

	});

});
