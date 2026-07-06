/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { createTextModel } from '../../../../../../editor/test/common/testTextModel.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { ILanguageModelToolsService, IToolData, ToolDataSource } from '../../../common/tools/languageModelToolsService.js';
import { LanguageModelToolsService } from '../../../browser/tools/languageModelToolsService.js';
import { IPromptsService } from '../../../common/promptSyntax/service/promptsService.js';
import { getLanguageIdForPromptsType, PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { PromptFileParser, PromptHeaderAttributes, parseCommaSeparatedList } from '../../../common/promptSyntax/promptFileParser.js';
import { PromptFileRewriter } from '../../../browser/promptSyntax/promptFileRewriter.js';

suite('PromptFileRewriter', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instaService: TestInstantiationService;

	setup(async () => {
		const testConfigService = new TestConfigurationService();
		testConfigService.setUserConfiguration(ChatConfiguration.ExtensionToolsEnabled, true);
		instaService = workbenchInstantiationService({
			contextKeyService: () => disposables.add(new ContextKeyService(testConfigService)),
			configurationService: () => testConfigService
		}, disposables);

		const toolService = disposables.add(instaService.createInstance(LanguageModelToolsService));

		const testTool1 = { id: 'testTool1', displayName: 'tool1', toolReferenceName: 'testTool1', canBeReferencedInPrompt: true, modelDescription: 'Test Tool 1', source: ToolDataSource.External, inputSchema: {} } satisfies IToolData;
		disposables.add(toolService.registerToolData(testTool1));
		const testTool2 = { id: 'testTool2', displayName: 'tool2', toolReferenceName: 'testTool2', canBeReferencedInPrompt: true, modelDescription: 'Test Tool 2', source: ToolDataSource.External, inputSchema: {} } satisfies IToolData;
		disposables.add(toolService.registerToolData(testTool2));

		instaService.set(ILanguageModelToolsService, toolService);

		const parser = new PromptFileParser();
		instaService.stub(IPromptsService, {
			getParsedPromptFile(model: import('../../../../../../editor/common/model.js').ITextModel) {
				return parser.parse(model.uri, model.getValue());
			},
		});
	});

	test('rewriteTools preserves tools key when using value range (array syntax)', () => {
		const content = [
			'---',
			'description: "Test agent"',
			'tools: [testTool1]',
			'---',
		].join('\n');
		const languageId = getLanguageIdForPromptsType(PromptsType.agent);
		const uri = URI.parse('test:///test.agent.md');
		const model = disposables.add(createTextModel(content, languageId, undefined, uri));

		const parser = new PromptFileParser();
		const parsed = parser.parse(uri, content);
		const toolsAttr = parsed.header!.getAttribute(PromptHeaderAttributes.tools);
		assert.ok(toolsAttr);

		const toolService = instaService.get(ILanguageModelToolsService);
		const enablementMap = toolService.toToolAndToolSetEnablementMap(['testTool1', 'testTool2'], undefined);

		const rewriter = instaService.createInstance(PromptFileRewriter);
		rewriter.rewriteTools(model, enablementMap, toolsAttr.value.range, false);

		const result = model.getValue();
		assert.ok(result.includes('tools:'), `Expected 'tools:' key to be preserved, but got: ${result}`);
		assert.ok(result.includes('testTool1'), `Expected 'testTool1' in result: ${result}`);
		assert.ok(result.includes('testTool2'), `Expected 'testTool2' in result: ${result}`);
	});

	test('rewriteTools preserves tools key when using value range (string syntax)', () => {
		const content = [
			'---',
			'description: "Test agent"',
			'tools: testTool1',
			'---',
		].join('\n');
		const languageId = getLanguageIdForPromptsType(PromptsType.agent);
		const uri = URI.parse('test:///test.agent.md');
		const model = disposables.add(createTextModel(content, languageId, undefined, uri));

		const parser = new PromptFileParser();
		const parsed = parser.parse(uri, content);
		const toolsAttr = parsed.header!.getAttribute(PromptHeaderAttributes.tools);
		assert.ok(toolsAttr);

		let value = toolsAttr.value;
		if (value.type === 'scalar') {
			value = parseCommaSeparatedList(value);
		}

		const toolService = instaService.get(ILanguageModelToolsService);
		const enablementMap = toolService.toToolAndToolSetEnablementMap(['testTool1', 'testTool2'], undefined);

		const rewriter = instaService.createInstance(PromptFileRewriter);
		rewriter.rewriteTools(model, enablementMap, toolsAttr.value.range, true);

		const result = model.getValue();
		assert.ok(result.includes('tools:'), `Expected 'tools:' key to be preserved, but got: ${result}`);
		assert.ok(result.includes('testTool1'), `Expected 'testTool1' in result: ${result}`);
		assert.ok(result.includes('testTool2'), `Expected 'testTool2' in result: ${result}`);
	});

	test('rewriteTools with attribute range would destroy the tools key (regression)', () => {
		const content = [
			'---',
			'description: "Test agent"',
			'tools: [testTool1]',
			'---',
		].join('\n');
		const languageId = getLanguageIdForPromptsType(PromptsType.agent);
		const uri = URI.parse('test:///test.agent.md');
		disposables.add(createTextModel(content, languageId, undefined, uri));

		const parser = new PromptFileParser();
		const parsed = parser.parse(uri, content);
		const toolsAttr = parsed.header!.getAttribute(PromptHeaderAttributes.tools);
		assert.ok(toolsAttr);

		// Verify that the attribute range is larger than the value range
		assert.ok(
			toolsAttr.range.startColumn < toolsAttr.value.range.startColumn ||
			toolsAttr.range.startLineNumber < toolsAttr.value.range.startLineNumber,
			'Attribute range should start before value range (includes the key)'
		);
	});
});
