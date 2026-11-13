/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { DeferredPromise, raceCancellation } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../../../editor/common/services/languageFeatures.js';
import { LanguageFeaturesService } from '../../../../../../editor/common/services/languageFeaturesService.js';
import { createTextModel } from '../../../../../../editor/test/common/testTextModel.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IQuickInputHideEvent, IQuickInputService, IQuickTree, IQuickTreeItem, QuickInputHideReason } from '../../../../../../platform/quickinput/common/quickInput.js';
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
	let inventory: readonly IAgentFileToolInventoryEntry[] | undefined;
	let inventoryWait: DeferredPromise<void> | undefined;
	let interaction: ((picker: IQuickTree<IQuickTreeItem>) => void) | undefined;
	let shown: DeferredPromise<IQuickTree<IQuickTreeItem>>;
	let notifications: string[];
	let validation: DeferredPromise<string>;
	let offeredTools: readonly IQuickTreeItem[];
	let offeredGroups: readonly IQuickTreeItem[];
	let selectedNames: readonly string[] | undefined;
	let pickerDisposed: boolean;
	let toggleCheckbox: (id: string, checked: boolean) => void;
	let filterPicker: (query: string) => void;

	setup(() => {
		activeTarget = Target.VSCode;
		inventory = [];
		inventoryWait = undefined;
		interaction = undefined;
		shown = new DeferredPromise<IQuickTree<IQuickTreeItem>>();
		notifications = [];
		validation = new DeferredPromise<string>();
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
				provideAgentFileTools: async (_resource: URI, token: CancellationToken) => {
					if (inventoryWait) {
						await raceCancellation(inventoryWait.p, token);
					}
					return inventory;
				},
			},
		};
		instantiationService.stub(ICustomizationHarnessService, {
			availableHarnesses: constObservable([local, copilot]),
			getActiveDescriptor: () => activeTarget === Target.GitHubCopilot ? copilot : local,
			getSessionResourceForHarness: () => URI.parse('test:/session'),
		});
		instantiationService.stub(INotificationService, 'warn', (message: string) => notifications.push(String(message)));
		const accepted = disposables.add(new Emitter<void>());
		const hidden = disposables.add(new Emitter<IQuickInputHideEvent>());
		const changed = disposables.add(new Emitter<IQuickTreeItem>());
		const valueChanged = disposables.add(new Emitter<string>());
		let scheduled = false;
		let validationMessage: string | undefined;
		const picker = upcastPartial<IQuickTree<IQuickTreeItem>>({
			onDidAccept: accepted.event,
			onDidHide: hidden.event,
			onDidChangeCheckboxState: changed.event,
			onDidChangeValue: valueChanged.event,
			value: '',
			get validationMessage() { return validationMessage; },
			set validationMessage(message: string | undefined) {
				validationMessage = message;
				if (message && !validation.isSettled) {
					validation.complete(message);
				}
			},
			setItemTree: (items: IQuickTreeItem[]) => {
				offeredGroups = items;
				offeredTools = items.flatMap(item => item.children ?? [item]);
				if (!scheduled) {
					scheduled = true;
					queueMicrotask(() => {
						if (interaction) {
							interaction(picker);
						} else if (selectedNames === undefined) {
							picker.hide();
						} else {
							for (const item of offeredTools) {
								item.checked = selectedNames.includes(item.id!);
							}
							picker.accept();
							if (picker.validationMessage) {
								picker.hide();
							}
						}
					});
				}
			},
			get checkedLeafItems() { return offeredTools.filter(item => item.checked === true); },
			show: () => { shown.complete(picker); },
			hide: () => hidden.fire({ reason: QuickInputHideReason.Other }),
			accept: () => accepted.fire(),
			dispose: () => { pickerDisposed = true; },
		});
		instantiationService.stub(IQuickInputService, 'createQuickTree', () => picker);
		filterPicker = query => { picker.value = query; valueChanged.fire(query); };
		toggleCheckbox = (id: string, checked: boolean) => {
			const item = offeredGroups.find(item => item.id === id) ?? offeredTools.find(item => item.id === id);
			assert.ok(item);
			item.checked = checked;
			for (const child of item.children ?? []) {
				child.checked = checked;
			}
			changed.fire(item);
		};
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
			['All Tools', false], ['execute', false], ['read', true], ['edit', false], ['search', false],
			['agent', false], ['web', false], ['todo', false],
			['*', false], ['*', false], ['read_file', true],
		]);
	});

	test('offers and saves spec-defined namespaces without inventory entries', async () => {
		selectedNames = ['github/*', 'playwright/*'];
		const model = createModel('target: github-copilot\ntools: [read]');
		await runLens(model);
		assert.deepStrictEqual({
			namespaces: offeredGroups.filter(group => group.id === 'group:github' || group.id === 'group:playwright').map(group => [group.label, group.children?.map(item => [item.id, item.label])]),
			content: model.getValue(),
		}, {
			namespaces: [['github', [['github/*', '*']]], ['playwright', [['playwright/*', '*']]]],
			content: '---\ntarget: github-copilot\ntools: [\'github/*\', \'playwright/*\']\n---\n',
		});
	});

	test('spec-defined namespaces remain selectable despite conflicting inventory entries', async () => {
		inventory = [
			{ name: 'github/*', availability: 'disabled' },
			{ name: 'playwright/*', availability: 'unavailable' },
		];
		selectedNames = ['github/*', 'playwright/*'];
		const model = createModel('target: github-copilot\ntools: [read]');
		await runLens(model);
		assert.deepStrictEqual({
			groups: offeredGroups.map(group => group.label),
			content: model.getValue(),
		}, {
			groups: ['All Tools', 'Built-In', 'github', 'playwright'],
			content: '---\ntarget: github-copilot\ntools: [\'github/*\', \'playwright/*\']\n---\n',
		});
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
			allTools: offeredGroups[0].id,
			groups: offeredGroups.filter(group => group.children).map(group => [group.label, group.children?.map(tool => [tool.id, tool.label])]),
			content: model.getValue(),
			pickerDisposed,
		}, {
			allTools: '*',
			groups: [
				['Built-In', ['execute', 'read', 'edit', 'search', 'agent', 'web', 'todo'].map(name => [name, name])],
				['github', [['github/*', '*']]],
				['playwright', [['playwright/*', '*']]],
				['vscode', [['vscode/usages', 'usages'], ['vscode/runTask', 'runTask']]],
				['browser', [['browser/openBrowserPage', 'openBrowserPage']]],
				['custom', [['custom/nested/tool', 'nested/tool']]],
			],
			content: '---\ntarget: github-copilot\ntools: [vscode/runTask, custom/nested/tool]\n---\n',
			pickerDisposed: true,
		});
	});

	test('uses the active session target when the header has no target', async () => {
		activeTarget = Target.GitHubCopilot;
		await runLens(createModel('tools: []'));
		assert.deepStrictEqual(offeredTools.map(tool => tool.label), [
			'All Tools', 'execute', 'read', 'edit', 'search', 'agent', 'web', 'todo', '*', '*',
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
			inventory = [{ name: 'github/*', availability: 'available' }];
			selectedNames = ['execute', 'github/*'];
			const model = createModel(`target: github-copilot\ntools: ${tools}`);
			await runLens(model);
			const expected = 'custom/tool, execute, \'github/*\'';
			assert.strictEqual(model.getValue(), `---\ntarget: github-copilot\ntools: [${expected}]\n---\n`);
			model.undo();
			assert.strictEqual(model.getValue(), `---\ntarget: github-copilot\ntools: ${tools}\n---\n`);
		});
	}

	test('preserves an unlisted reference containing an apostrophe', async () => {
		selectedNames = ['read'];
		const model = createModel(`target: github-copilot\ntools: ["owner's/tool", search]`);
		await runLens(model);
		const value = new PromptFileParser().parse(model.uri, model.getValue()).header!.getAttribute('tools')!.value;
		assert.deepStrictEqual(value.type === 'sequence' ? value.items.map(item => item.type === 'scalar' ? item.value : undefined) : [], ['owner\'s/tool', 'read']);
	});

	test('cancelling the Copilot picker leaves the file unchanged', async () => {
		const model = createModel('target: github-copilot\ntools: [read]');
		const before = model.getValue();
		await runLens(model);
		assert.deepStrictEqual({ content: model.getValue(), pickerDisposed }, { content: before, pickerDisposed: true });
	});

	test('accepting an empty selection does not broaden access', async () => {
		selectedNames = [];
		const model = createModel('target: github-copilot\ntools: [read]');
		await runLens(model);
		assert.deepStrictEqual({ content: model.getValue(), warning: await validation.p }, { content: '---\ntarget: github-copilot\ntools: [read]\n---\n', warning: 'Select at least one tool, or select All Tools. An empty tools list allows all tools in Copilot.' });
	});

	for (const tools of ['[]', '[\'*\']']) {
		test(`shows effective all-tools coverage for ${tools}`, async () => {
			await runLens(createModel(`target: github-copilot\ntools: ${tools}`));
			assert.deepStrictEqual(offeredTools.map(item => [item.id, item.checked]), [
				['*', true], ['execute', true], ['read', true], ['edit', true], ['search', true], ['agent', true], ['web', true], ['todo', true], ['github/*', true], ['playwright/*', true],
			]);
		});
	}

	test('checking Built-In does not select the global wildcard', async () => {
		interaction = picker => { toggleCheckbox('group:', true); picker.accept(); };
		const model = createModel('target: github-copilot\ntools: [read]');
		await runLens(model);
		assert.strictEqual(model.getValue(), '---\ntarget: github-copilot\ntools: [execute, read, edit, search, agent, web, todo]\n---\n');
	});

	test('deselecting a covered tool removes the global wildcard', async () => {
		interaction = picker => { toggleCheckbox('read', false); picker.accept(); };
		const model = createModel('target: github-copilot\ntools: [\'*\']');
		await runLens(model);
		assert.strictEqual(model.getValue(), '---\ntarget: github-copilot\ntools: [execute, edit, search, agent, web, todo, \'github/*\', \'playwright/*\']\n---\n');
	});

	test('selecting All Tools saves the explicit wildcard', async () => {
		interaction = picker => { toggleCheckbox('*', true); picker.accept(); };
		const model = createModel('target: github-copilot\ntools: [read]');
		await runLens(model);
		assert.strictEqual(model.getValue(), '---\ntarget: github-copilot\ntools: [\'*\']\n---\n');
	});

	test('namespace wildcard coverage can be narrowed by deselecting a child', async () => {
		inventory = ['custom/*', 'custom/first', 'custom/second'].map(name => ({ name, availability: 'available' }));
		interaction = picker => { toggleCheckbox('custom/first', false); picker.accept(); };
		const model = createModel('target: github-copilot\ntools: [\'custom/*\']');
		await runLens(model);
		assert.strictEqual(model.getValue(), '---\ntarget: github-copilot\ntools: [custom/second]\n---\n');
	});

	test('accessible labels retain qualified IDs and descriptions', async () => {
		inventory = [{ name: 'vscode/usages', description: 'Find references', availability: 'available' }];
		await runLens(createModel('target: github-copilot\ntools: [vscode/usages]'));
		const item = offeredTools.find(item => item.id === 'vscode/usages');
		assert.deepStrictEqual([item?.label, item?.ariaLabel], ['usages', 'vscode/usages, Find references']);
	});

	test('filters qualified references locally without changing short labels', async () => {
		inventory = ['vscode/usages', 'vscode/runTask', 'browser/usages'].map(name => ({ name, availability: 'available' }));
		interaction = picker => { filterPicker('vscode/usages'); picker.hide(); };
		await runLens(createModel('target: github-copilot\ntools: [read]'));
		assert.deepStrictEqual(offeredGroups.map(group => [group.label, group.children?.map(item => [item.id, item.label])]), [['vscode', [['vscode/usages', 'usages']]]]);
	});

	test('keeps checked tools outside the local search results', async () => {
		inventory = ['vscode/usages', 'vscode/runTask'].map(name => ({ name, availability: 'available' }));
		interaction = picker => { filterPicker('vscode/usages'); toggleCheckbox('vscode/usages', true); picker.accept(); };
		const model = createModel('target: github-copilot\ntools: [read, vscode/runTask]');
		await runLens(model);
		assert.strictEqual(model.getValue(), '---\ntarget: github-copilot\ntools: [read, vscode/usages, vscode/runTask]\n---\n');
	});

	test('local search matches namespaces and descriptions and restores all groups when cleared', async () => {
		inventory = [
			{ name: 'vscode/usages', description: 'Find references', availability: 'available' },
			{ name: 'vscode/runTask', availability: 'available' },
			{ name: 'browser/openBrowserPage', availability: 'available' },
		];
		const results: (string | undefined)[][] = [];
		interaction = picker => {
			for (const query of ['vscode', 'Find references', '']) {
				filterPicker(query);
				results.push(offeredTools.map(item => item.id));
			}
			picker.hide();
		};
		await runLens(createModel('target: github-copilot\ntools: [read]'));
		assert.deepStrictEqual(results, [
			['vscode/usages', 'vscode/runTask'],
			['vscode/usages'],
			['*', 'execute', 'read', 'edit', 'search', 'agent', 'web', 'todo', 'github/*', 'playwright/*', 'vscode/usages', 'vscode/runTask', 'browser/openBrowserPage'],
		]);
	});

	test('reparses tools and their range when a stale code lens is invoked', async () => {
		const model = createModel('target: github-copilot\ntools: [read]');
		const lens = await getLens(model);
		model.setValue('---\ndescription: changed\ntarget: github-copilot\ntools: [search]\n---\n');
		interaction = picker => picker.accept();
		await instantiationService.invokeFunction(CommandsRegistry.getCommand(lens.command!.id)!.handler, ...lens.command!.arguments!);
		assert.strictEqual(model.getValue(), '---\ndescription: changed\ntarget: github-copilot\ntools: [search]\n---\n');
	});

	test('does not overwrite edits made while the picker is open', async () => {
		const model = createModel('target: github-copilot\ntools: [read]');
		interaction = picker => { model.setValue('---\ntarget: github-copilot\ntools: [edit]\n---\n'); picker.accept(); };
		await runLens(model);
		assert.deepStrictEqual({ content: model.getValue(), warnings: notifications.length }, { content: '---\ntarget: github-copilot\ntools: [edit]\n---\n', warnings: 1 });
	});

	test('cancels pending catalogue resolution when the model changes', async () => {
		inventoryWait = new DeferredPromise<void>();
		const model = createModel('target: github-copilot\ntools: [read]');
		const operation = runLens(model);
		const picker = await shown.p;
		assert.strictEqual(picker.busy, true);
		model.setValue('---\ntarget: github-copilot\ntools: [edit]\n---\n');
		await operation;
		assert.deepStrictEqual({ content: model.getValue(), warnings: notifications.length, pickerDisposed }, { content: '---\ntarget: github-copilot\ntools: [edit]\n---\n', warnings: 1, pickerDisposed: true });
	});

	test('waits for an inventory before populating the picker', async () => {
		inventoryWait = new DeferredPromise<void>();
		const operation = runLens(createModel('target: github-copilot\ntools: [read]'));
		const picker = await shown.p;
		assert.deepStrictEqual({ busy: picker.busy, offeredTools }, { busy: true, offeredTools: [] });
		inventory = [{ name: 'vscode/usages', availability: 'available' }];
		await inventoryWait.complete();
		await operation;
		assert.ok(offeredTools.some(item => item.id === 'vscode/usages'));
	});

	test('cancels pending inventory when the picker is dismissed', async () => {
		inventoryWait = new DeferredPromise<void>();
		const operation = runLens(createModel('target: github-copilot\ntools: [read]'));
		const picker = await shown.p;
		picker.hide();
		await operation;
		assert.deepStrictEqual({ offeredTools, pickerDisposed, notifications }, { offeredTools: [], pickerDisposed: true, notifications: [] });
	});

	test('cancels pending inventory when the model is disposed', async () => {
		inventoryWait = new DeferredPromise<void>();
		const model = createModel('target: github-copilot\ntools: [read]');
		const operation = runLens(model);
		await shown.p;
		model.dispose();
		await operation;
		assert.deepStrictEqual({ offeredTools, pickerDisposed, notifications }, { offeredTools: [], pickerDisposed: true, notifications: [] });
	});

	test('does not present an unresolved inventory as complete', async () => {
		inventory = undefined;
		const model = createModel('target: github-copilot\ntools: [read]');
		const operation = runLens(model);
		const picker = await shown.p;
		await validation.p;
		picker.accept();
		picker.hide();
		await operation;
		assert.deepStrictEqual({ offeredTools, content: model.getValue(), warning: await validation.p }, { offeredTools: [], content: '---\ntarget: github-copilot\ntools: [read]\n---\n', warning: 'The Copilot tool inventory is unavailable. Open a Copilot session and run Configure Tools again.' });
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
