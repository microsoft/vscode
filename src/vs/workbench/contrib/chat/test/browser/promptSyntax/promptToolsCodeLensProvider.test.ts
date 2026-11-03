/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../../../editor/common/services/languageFeatures.js';
import { LanguageFeaturesService } from '../../../../../../editor/common/services/languageFeaturesService.js';
import { createTextModel } from '../../../../../../editor/test/common/testTextModel.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IQuickInputService, IQuickTreeItem } from '../../../../../../platform/quickinput/common/quickInput.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { showToolsPicker } from '../../../browser/actions/chatToolPicker.js';
import { PromptToolsCodeLensProvider } from '../../../browser/promptSyntax/promptToolsCodeLensProvider.js';
import { LanguageModelToolsService } from '../../../browser/tools/languageModelToolsService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { createVSCodeHarnessDescriptor, IAgentFileToolInventoryEntry, ICustomizationHarnessService } from '../../../common/customizationHarnessService.js';
import { PromptFileParser } from '../../../common/promptSyntax/promptFileParser.js';
import { getLanguageIdForPromptsType, PromptsType, Target } from '../../../common/promptSyntax/promptTypes.js';
import { IPromptsService } from '../../../common/promptSyntax/service/promptsService.js';
import { ILanguageModelToolsService, IToolData, ToolDataSource } from '../../../common/tools/languageModelToolsService.js';

suite('PromptToolsCodeLensProvider', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let instantiationService: TestInstantiationService;
	let provider: PromptToolsCodeLensProvider;
	let activeTarget: Target;
	let inventory: readonly IAgentFileToolInventoryEntry[];
	let offeredTools: readonly IQuickTreeItem[];
	let offeredGroups: readonly IQuickTreeItem[];
	let selectedNames: readonly string[] | undefined;
	let pickerDisposed: boolean;

	setup(() => {
		activeTarget = Target.VSCode;
		inventory = [];
		offeredTools = [];
		offeredGroups = [];
		selectedNames = undefined;
		pickerDisposed = false;
		const configurationService = new TestConfigurationService();
		configurationService.setUserConfiguration(ChatConfiguration.ExtensionToolsEnabled, true);
		instantiationService = workbenchInstantiationService({
			contextKeyService: () => disposables.add(new ContextKeyService(configurationService)),
			configurationService: () => configurationService,
		}, disposables);
		instantiationService.set(ILanguageFeaturesService, new LanguageFeaturesService());
		const toolsService = disposables.add(instantiationService.createInstance(LanguageModelToolsService));
		instantiationService.set(ILanguageModelToolsService, toolsService);
		disposables.add(toolsService.registerToolData({
			id: 'vscodeOnly', displayName: 'VS Code Only', toolReferenceName: 'vscodeOnly',
			canBeReferencedInPrompt: true, modelDescription: 'VS Code tool',
			source: ToolDataSource.Internal, inputSchema: {},
		} satisfies IToolData));
		const parser = new PromptFileParser();
		instantiationService.stub(IPromptsService, {
			getParsedPromptFile: model => parser.parse(model.uri, model.getValue()),
		});
		const local = createVSCodeHarnessDescriptor();
		const copilot = {
			...local,
			id: 'copilot-test',
			customAgentTarget: Target.GitHubCopilot,
			itemProvider: {
				onDidChange: Event.None,
				provideChatSessionCustomizations: async () => [],
				provideAgentFileTools: async () => inventory,
			},
		};
		instantiationService.stub(ICustomizationHarnessService, {
			availableHarnesses: constObservable([local, copilot]),
			getActiveDescriptor: () => activeTarget === Target.GitHubCopilot ? copilot : local,
			getSessionResourceForHarness: () => URI.parse('test:/session'),
		});
		const accepted = disposables.add(new Emitter<void>());
		const hidden = disposables.add(new Emitter<void>());
		instantiationService.stub(IQuickInputService, 'createQuickTree', () => ({
			onDidAccept: accepted.event,
			onDidHide: hidden.event,
			setItemTree: (items: IQuickTreeItem[]) => {
				offeredGroups = items;
				offeredTools = items.flatMap(item => item.children ?? []);
			},
			get checkedLeafItems() {
				const selection = selectedNames;
				return offeredTools.filter(item => selection?.includes(item.id!));
			},
			show: () => queueMicrotask(() => selectedNames === undefined ? hidden.fire() : accepted.fire()),
			hide: () => hidden.fire(),
			dispose: () => { pickerDisposed = true; },
		}));
		provider = disposables.add(instantiationService.createInstance(PromptToolsCodeLensProvider));
	});

	teardown(() => sinon.restore());

	function createModel(header: string, type = PromptsType.agent, path = '/test.agent.md'): ITextModel {
		return disposables.add(createTextModel(`---\n${header}\n---\n`, getLanguageIdForPromptsType(type), undefined, URI.from({ scheme: 'test', path })));
	}

	async function getLens(model: ITextModel) {
		const result = await provider.provideCodeLenses(model, CancellationToken.None);
		assert.ok(result?.lenses.length);
		return result.lenses[0];
	}

	async function runLens(model: ITextModel) {
		const lens = await getLens(model);
		assert.ok(lens.command);
		const command = CommandsRegistry.getCommand(lens.command.id);
		assert.ok(command);
		await instantiationService.invokeFunction(command.handler, ...lens.command.arguments!);
	}

	test('explicit Copilot target offers only its available tools and namespaces', async () => {
		inventory = [
			{ name: 'copilot/read_file', description: 'Read a file', availability: 'available' },
			{ name: 'disabled/tool', availability: 'disabled' },
			{ name: 'missing/tool', availability: 'unavailable' },
			{ name: 'copilot/read_file', availability: 'unavailable' },
		];
		await runLens(createModel('target: github-copilot\ntools: [read, copilot/read_file]'));
		assert.deepStrictEqual(offeredTools.map(tool => [tool.label, tool.checked]), [
			['execute', false], ['read', true], ['edit', false], ['search', false],
			['agent', false], ['web', false], ['todo', false], ['*', false],
			['read_file', true], ['*', false], ['*', false],
		]);
	});

	test('groups unqualified tools and namespaced tools without losing reference names', async () => {
		inventory = [
			{ name: 'vscode/usages', availability: 'available' },
			{ name: 'browser/openBrowserPage', availability: 'available' },
			{ name: 'vscode/runTask', availability: 'available' },
			{ name: 'custom/nested/tool', availability: 'available' },
		];
		selectedNames = ['vscode/runTask', 'custom/nested/tool'];
		const model = createModel('target: github-copilot\ntools: [vscode/usages]');
		await runLens(model);
		assert.deepStrictEqual({
			groups: offeredGroups.map(group => [group.label, group.children?.map(tool => [tool.id, tool.label, tool.ariaLabel])]),
			content: model.getValue(),
			pickerDisposed,
		}, {
			groups: [
				['Built-In', ['execute', 'read', 'edit', 'search', 'agent', 'web', 'todo', '*'].map(name => [name, name, name])],
				['vscode', [['vscode/usages', 'usages', 'vscode/usages'], ['vscode/runTask', 'runTask', 'vscode/runTask']]],
				['browser', [['browser/openBrowserPage', 'openBrowserPage', 'browser/openBrowserPage']]],
				['custom', [['custom/nested/tool', 'nested/tool', 'custom/nested/tool']]],
				['github', [['github/*', '*', 'github/*']]],
				['playwright', [['playwright/*', '*', 'playwright/*']]],
			],
			content: '---\ntarget: github-copilot\ntools: [vscode/runTask, custom/nested/tool]\n---\n',
			pickerDisposed: true,
		});
	});

	test('uses the active session target when the header has no target', async () => {
		activeTarget = Target.GitHubCopilot;
		await runLens(createModel('tools: []'));
		assert.deepStrictEqual(offeredTools.map(tool => tool.label), [
			'execute', 'read', 'edit', 'search', 'agent', 'web', 'todo', '*', '*', '*',
		]);
	});

	test('resolves the active target when the code lens is invoked', async () => {
		const model = createModel('tools: []');
		const lens = await getLens(model);
		activeTarget = Target.GitHubCopilot;
		await instantiationService.invokeFunction(CommandsRegistry.getCommand(lens.command!.id)!.handler, ...lens.command!.arguments!);
		assert.ok(offeredTools.some(tool => tool.label === 'execute'));
	});

	for (const target of ['', 'target: vscode\n']) {
		test(`preserves the VS Code picker for ${target ? 'explicit' : 'default'} VS Code targets`, async () => {
			activeTarget = target ? Target.GitHubCopilot : Target.VSCode;
			const model = createModel(`${target}tools: [vscodeOnly]`);
			const invoke = sinon.stub(instantiationService, 'invokeFunction').callThrough();
			const tools = instantiationService.get(ILanguageModelToolsService).toToolAndToolSetEnablementMap(['vscodeOnly'], undefined);
			invoke.withArgs(showToolsPicker).resolves(tools);
			await runLens(model);
			assert.deepStrictEqual({ usedVSCodePicker: invoke.calledWith(showToolsPicker), offeredTools, content: model.getValue() }, {
				usedVSCodePicker: true, offeredTools: [], content: `---\n${target}tools: [vscodeOnly]\n---\n`,
			});
		});
	}

	for (const tools of ['[read, custom/tool]', 'read, custom/tool']) {
		test(`writes Copilot names without registry mapping for ${tools}`, async () => {
			selectedNames = ['execute', 'github/*'];
			const model = createModel(`target: github-copilot\ntools: ${tools}`);
			await runLens(model);
			const expected = 'custom/tool, execute, \'github/*\'';
			assert.strictEqual(model.getValue(), `---\ntarget: github-copilot\ntools: ${tools.startsWith('[') ? `[${expected}]` : expected}\n---\n`);
			model.undo();
			assert.strictEqual(model.getValue(), `---\ntarget: github-copilot\ntools: ${tools}\n---\n`);
		});
	}

	test('cancelling the Copilot picker leaves the file unchanged', async () => {
		const model = createModel('target: github-copilot\ntools: [read]');
		const before = model.getValue();
		await runLens(model);
		assert.deepStrictEqual({ content: model.getValue(), pickerDisposed }, { content: before, pickerDisposed: true });
	});

	test('accepting an empty selection writes an empty array', async () => {
		selectedNames = [];
		const model = createModel('target: github-copilot\ntools: [read]');
		await runLens(model);
		assert.strictEqual(model.getValue(), '---\ntarget: github-copilot\ntools: []\n---\n');
	});

	test('prompt files retain the VS Code target even in a Copilot session', async () => {
		activeTarget = Target.GitHubCopilot;
		const model = createModel('tools: []', PromptsType.prompt, '/test.prompt.md');
		const invoke = sinon.stub(instantiationService, 'invokeFunction').callThrough();
		invoke.withArgs(showToolsPicker).resolves(undefined);
		await runLens(model);
		assert.ok(invoke.calledWith(showToolsPicker));
	});

	test('does not offer tools code lenses for Claude agents or instructions', async () => {
		const results = await Promise.all([
			provider.provideCodeLenses(createModel('tools: [Read]', PromptsType.agent, '/.claude/agents/test.md'), CancellationToken.None),
			provider.provideCodeLenses(createModel('tools: []', PromptsType.instructions), CancellationToken.None),
		]);
		assert.deepStrictEqual(results, [undefined, undefined]);
	});
});
