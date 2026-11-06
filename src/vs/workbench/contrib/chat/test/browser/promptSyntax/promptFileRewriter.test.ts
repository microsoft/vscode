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
import { formatArrayValue } from '../../../common/promptSyntax/utils/promptEditHelper.js';
import { Range } from '../../../../../../editor/common/core/range.js';
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
	for (const input of [
		'tools: read',
		'tools: [read]',
		'tools:\n  - read',
		'tools:\n- read',
		'tools:\n    - read',
	]) {
		for (const names of [[], ['github/*', 'playwright/*'], ['owner\'s/tool', 'read'], ['read', 'owner\'s/tool'], ['read', 'vscode/usages']]) {
			test(`tool names round-trip for ${JSON.stringify(input)} to ${JSON.stringify(names)}`, () => {
				const uri = URI.parse('test:///test.agent.md');
				const original = `---\n${input}\ndescription: keep me\n---\n`;
				const model = disposables.add(createTextModel(original, getLanguageIdForPromptsType(PromptsType.agent), undefined, uri));
				const parser = new PromptFileParser();
				const attribute = parser.parse(uri, original).header!.getAttribute('tools')!;
				instaService.createInstance(PromptFileRewriter).rewriteToolNames(model, names, attribute.value.range, attribute.value.type === 'scalar');
				const header = parser.parse(uri, model.getValue()).header!;
				const value = header.getAttribute('tools')!.value;
				const parsedTools = value.type === 'scalar' ? parseCommaSeparatedList(value).items : value.type === 'sequence' ? value.items : [];
				assert.deepStrictEqual({ tools: parsedTools.map(item => item.type === 'scalar' ? item.value : undefined), description: header.getAttribute('description')!.value }, {
					tools: names,
					description: { type: 'scalar', value: 'keep me', range: header.getAttribute('description')!.value.range, format: 'none' },
				});
				model.undo();
				assert.strictEqual(model.getValue(), original);
			});
		}
	}

	test('quoted tool names round-trip through YAML and scalar-list parsing', () => {
		const names = ['owner\'s/tool', 'tool"quoted', 'tool\\path'];
		const parser = new PromptFileParser();
		const uri = URI.parse('test:///test.agent.md');
		for (const preference of ['\'', '"'] as const) {
			const formatted = names.map(name => formatArrayValue(name, preference)).join(', ');
			const scalar = parseCommaSeparatedList({ type: 'scalar', value: formatted, range: new Range(1, 1, 1, formatted.length + 1), format: 'none' });
			const yaml = parser.parse(uri, `---\ntools: [${formatted}]\n---\n`).header!.getAttribute('tools')!.value;
			assert.deepStrictEqual({ scalar: scalar.items.map(item => item.type === 'scalar' ? item.value : undefined), yaml: yaml.type === 'sequence' ? yaml.items.map(item => item.type === 'scalar' ? item.value : undefined) : [] }, { scalar: names, yaml: names });
		}
	});

});
