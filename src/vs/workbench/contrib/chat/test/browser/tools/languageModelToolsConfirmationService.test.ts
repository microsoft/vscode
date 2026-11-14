/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { observableValue, transaction } from '../../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationOverrides, IConfigurationValue, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IQuickInputHideEvent, IQuickInputService, IQuickTree, IQuickTreeItem, IQuickTreeItemButtonEvent, QuickInputHideReason } from '../../../../../../platform/quickinput/common/quickInput.js';
import { IStorageService, InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { LanguageModelToolsConfirmationService } from '../../../browser/tools/languageModelToolsConfirmationService.js';
import { ToolConfirmKind } from '../../../common/chatService/chatService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { computeCombinationKey, ILanguageModelToolConfirmationActions, ILanguageModelToolConfirmationContribution, ILanguageModelToolConfirmationRef, IToolPreApprovalStore } from '../../../common/tools/languageModelToolsConfirmationService.js';
import { IToolData, ToolDataSource } from '../../../common/tools/languageModelToolsService.js';

class PolicyTestConfigurationService extends TestConfigurationService {
	policyRestricted = false;

	override inspect<T>(key: string, overrides?: IConfigurationOverrides): IConfigurationValue<T> {
		const result = super.inspect<T>(key, overrides);
		return key === ChatConfiguration.GlobalAutoApprove
			? { ...result, policyValue: this.policyRestricted ? false as T : undefined }
			: result;
	}
}

suite('LanguageModelToolsConfirmationService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let service: LanguageModelToolsConfirmationService;
	let instantiationService: TestInstantiationService;
	let configurationService: PolicyTestConfigurationService;

	setup(() => {
		instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
		configurationService = new PolicyTestConfigurationService();
		instantiationService.stub(IConfigurationService, configurationService);

		service = store.add(instantiationService.createInstance(LanguageModelToolsConfirmationService));
	});

	function createToolRef(toolId: string, source: ToolDataSource = ToolDataSource.Internal, parameters: unknown = {}): ILanguageModelToolConfirmationRef {
		return { toolId, source, parameters };
	}

	function createMcpToolRef(toolId: string, definitionId: string, serverLabel: string, parameters: unknown = {}): ILanguageModelToolConfirmationRef {
		return {
			toolId,
			source: {
				type: 'mcp',
				label: serverLabel,
				serverLabel,
				instructions: undefined,
				collectionId: 'testCollection',
				definitionId
			},
			parameters
		};
	}

	async function createCombinationRef(toolId: string, parameters: unknown, combinationLabel: string, combinationArgs?: string): Promise<ILanguageModelToolConfirmationRef> {
		return {
			...createToolRef(toolId, ToolDataSource.Internal, parameters),
			combination: {
				label: combinationLabel,
				key: await computeCombinationKey(toolId, parameters),
				arguments: combinationArgs,
			},
		};
	}

	test('manage actions that close the picker do not reopen it', async () => {
		const onDidAccept = store.add(new Emitter<void>());
		const onDidHide = store.add(new Emitter<IQuickInputHideEvent>());
		let items: IQuickTreeItem[] = [];
		let shown = 0;
		const quickTree = upcastPartial<IQuickTree<IQuickTreeItem>>({
			get itemTree() { return items; },
			get activeItems() { return items[0].children!.filter(item => item.label === 'More Options...'); },
			buttons: [],
			onDidChangeCheckboxState: Event.None,
			onDidHide: onDidHide.event,
			onDidTriggerItemButton: Event.None,
			onDidTriggerButton: Event.None,
			onDidAccept: onDidAccept.event,
			setItemTree: value => { items = value; },
			isCollapsed: () => true,
			show: () => { shown++; },
			hide: () => onDidHide.fire({ reason: QuickInputHideReason.Other }),
			dispose: () => { },
		});
		instantiationService.stub(IQuickInputService, { createQuickTree: <T extends IQuickTreeItem>() => quickTree as IQuickTree<T> });
		service = store.add(instantiationService.createInstance(LanguageModelToolsConfirmationService));
		let opened = 0;
		store.add(service.registerConfirmationContribution('fetch', {
			canUseDefaultApprovals: false,
			getManageActions: () => [{ label: 'More Options...', pickable: false, closesPicker: true, onDidOpen: () => { opened++; } }],
		}));
		service.manageConfirmationPreferences([{ id: 'fetch', source: ToolDataSource.Internal, displayName: 'Fetch', modelDescription: '' }]);
		onDidAccept.fire();
		await Promise.resolve();

		assert.deepStrictEqual({ opened, shown }, { opened: 1, shown: 1 });
	});

	test('manage external pre-approvals without reading or changing stored approvals', async () => {
		const onDidChangeCheckboxState = store.add(new Emitter<IQuickTreeItem>());
		const onDidHide = store.add(new Emitter<IQuickInputHideEvent>());
		let items: IQuickTreeItem[] = [];
		const focused: string[] = [];
		const quickTree = upcastPartial<IQuickTree<IQuickTreeItem>>({
			get itemTree() { return items; },
			buttons: [],
			busy: false,
			onDidChangeCheckboxState: onDidChangeCheckboxState.event,
			onDidHide: onDidHide.event,
			onDidTriggerItemButton: Event.None,
			onDidAccept: Event.None,
			setItemTree: value => { items = value; },
			isCollapsed: () => true,
			expand: item => { focused.push(item.label); },
			reveal: item => { focused.push(item.label); },
			show: () => { },
			dispose: () => { },
		});
		instantiationService.stub(IQuickInputService, { createQuickTree: <T extends IQuickTreeItem>() => quickTree as IQuickTree<T> });
		service = store.add(instantiationService.createInstance(LanguageModelToolsConfirmationService));
		const ref = createMcpToolRef('mcpTool', 'server', 'Test Server');
		await service.getPreConfirmActions(ref).find(action => action.scope === 'workspace')!.select();
		const combinationRef = await createCombinationRef(ref.toolId, {}, 'Allow this combination');
		await service.getPreConfirmActions(combinationRef).find(action => action.scope === 'workspace')!.select();
		await service.getPostConfirmActions(ref).find(action => action.scope === 'workspace')!.select();
		const tool: IToolData = { id: ref.toolId, source: ref.source, displayName: 'Tool', modelDescription: '', canRequestPreApproval: true, canRequestPostApproval: true };
		let serverApproved = false;
		let toolApproved = false;
		const writes: [string, boolean][] = [];
		const discoveredTools = observableValue<readonly IToolData[]>('discoveredTools', []);
		const isDiscovering = observableValue('isDiscovering', true);
		const preApprovalStore: IToolPreApprovalStore = {
			discoveredTools,
			isDiscovering,
			placeholder: 'Host approvals',
			servers: [{ id: 'empty', label: 'Empty Server' }, { id: 'server', label: 'Test Server' }],
			isServerApproved: () => serverApproved,
			setServerApproved: (id, approved) => { serverApproved = approved; writes.push([id, approved]); },
			isToolApproved: () => toolApproved,
			setToolApproved: (tool, approved) => { toolApproved = approved; writes.push([tool.id, approved]); },
		};
		store.add(service.registerConfirmationContribution('fetch', {
			getManageActions: () => [{ label: 'Configure URLs' }],
		}));
		service.manageConfirmationPreferences([
			{ id: 'fetch', source: ToolDataSource.Internal, displayName: 'Fetch', modelDescription: '', canRequestPreApproval: true },
		], { preApprovalStore, focusToolId: tool.id });

		const snapshot = (entries: readonly IQuickTreeItem[]): object[] => entries.map(item => ({
			id: item.id,
			label: item.label,
			type: (item as IQuickTreeItem & { type?: string }).type,
			checked: item.checked,
			pickable: item.pickable,
			children: item.children ? snapshot(item.children) : [],
		}));
		const initial = { items: snapshot(items), busy: quickTree.busy, fetchCollapsed: items.find(item => item.id === 'tool/fetch')?.collapsed };
		transaction(tx => {
			discoveredTools.set([tool], tx);
			isDiscovering.set(false, tx);
		});
		const discovered = { items: snapshot(items), busy: quickTree.busy };
		const server = items.find(item => item.label === 'Test Server')!;
		const toolItem = server.children!.find(item => item.label === 'Tool')!;
		onDidChangeCheckboxState.fire({ ...toolItem, checked: true });
		onDidChangeCheckboxState.fire({ ...toolItem, checked: false });
		const itemsAfterToggle = snapshot(items);
		const storedPreApproval = service.getPreConfirmAction(ref);
		onDidChangeCheckboxState.fire({ ...server, checked: true });
		onDidChangeCheckboxState.fire({ ...server, checked: false });
		const serverPre = items.find(item => item.label === 'Test Server')!.children![0];
		onDidChangeCheckboxState.fire({ ...serverPre, checked: true });
		configurationService.policyRestricted = true;
		onDidChangeCheckboxState.fire({ ...server, checked: false });
		configurationService.policyRestricted = false;
		onDidHide.fire({ reason: QuickInputHideReason.Other });

		assert.deepStrictEqual({ initial, discovered, itemsAfterToggle, focused, writes, storedPreApproval, storedPostApproval: service.getPostConfirmAction(ref), buttons: quickTree.buttons, placeholder: quickTree.placeholder }, {
			initial: {
				items: [
					{
						id: 'server/empty', label: 'Empty Server', type: 'server', checked: false, pickable: false, children: [
							{ id: 'server-pre/empty', label: 'Run any tool without approval', type: 'server-pre', checked: false, pickable: undefined, children: [] },
						]
					},
					{
						id: 'server/server', label: 'Test Server', type: 'server', checked: false, pickable: false, children: [
							{ id: 'server-pre/server', label: 'Run any tool without approval', type: 'server-pre', checked: false, pickable: undefined, children: [] },
						]
					},
					{
						id: 'tool/fetch', label: 'Fetch', type: 'tool', checked: false, pickable: false, children: [
							{ id: 'manage/fetch/Configure URLs', label: 'Configure URLs', type: 'manage', checked: undefined, pickable: undefined, children: [] },
						]
					},
				],
				busy: true,
				fetchCollapsed: true,
			},
			discovered: {
				items: [
					{
						id: 'server/empty', label: 'Empty Server', type: 'server', checked: false, pickable: false, children: [
							{ id: 'server-pre/empty', label: 'Run any tool without approval', type: 'server-pre', checked: false, pickable: undefined, children: [] },
						]
					},
					{
						id: 'server/server', label: 'Test Server', type: 'server', checked: false, pickable: false, children: [
							{ id: 'server-pre/server', label: 'Run any tool without approval', type: 'server-pre', checked: false, pickable: undefined, children: [] },
							{ id: 'tool/mcpTool', label: 'Tool', type: 'tool', checked: false, pickable: undefined, children: [] },
						]
					},
					{
						id: 'tool/fetch', label: 'Fetch', type: 'tool', checked: false, pickable: false, children: [
							{ id: 'manage/fetch/Configure URLs', label: 'Configure URLs', type: 'manage', checked: undefined, pickable: undefined, children: [] },
						]
					},
				],
				busy: false,
			},
			itemsAfterToggle: discovered.items,
			focused: ['Test Server', 'Tool'],
			writes: [['mcpTool', true], ['mcpTool', false], ['server', true], ['server', false], ['server', true]],
			storedPreApproval: { type: ToolConfirmKind.LmServicePerTool, scope: 'workspace' },
			storedPostApproval: { type: ToolConfirmKind.LmServicePerTool, scope: 'workspace' },
			buttons: [],
			placeholder: 'Host approvals',
		});
	});

	test('retains unchecked contribution rows until rechecked or deleted', async () => {
		const onDidChangeCheckboxState = store.add(new Emitter<IQuickTreeItem>());
		const onDidTriggerItemButton = store.add(new Emitter<IQuickTreeItemButtonEvent<IQuickTreeItem>>());
		const onDidHide = store.add(new Emitter<IQuickInputHideEvent>());
		const onDidSetItemTree = store.add(new Emitter<void>());
		let items: IQuickTreeItem[] = [];
		const quickTree = upcastPartial<IQuickTree<IQuickTreeItem>>({
			get itemTree() { return items; },
			onDidChangeCheckboxState: onDidChangeCheckboxState.event,
			onDidTriggerItemButton: onDidTriggerItemButton.event,
			onDidHide: onDidHide.event,
			onDidAccept: Event.None,
			setItemTree: value => { items = value; onDidSetItemTree.fire(); },
			show: () => { },
			dispose: () => { },
		});
		instantiationService.stub(IQuickInputService, { createQuickTree: <T extends IQuickTreeItem>() => quickTree as IQuickTree<T> });
		service = store.add(instantiationService.createInstance(LanguageModelToolsConfirmationService));
		const deleteButton = { tooltip: 'Delete' };
		let rows = ['first', 'second'];
		store.add(service.registerConfirmationContribution('testTool', {
			canUseDefaultApprovals: false,
			getManageActions: () => [
				...rows.map(label => ({
					id: label === 'first' ? 'row/first' : undefined,
					label,
					checked: true,
					buttons: [deleteButton],
					onDidChangeChecked: async (checked: boolean) => {
						await Promise.resolve();
						rows = checked ? [...rows, label] : rows.filter(row => row !== label);
					},
					onDidTriggerItemButton: async () => {
						await Promise.resolve();
						rows = rows.filter(row => row !== label);
					},
				})),
				{ label: 'Add Row...', pickable: false },
			],
		}));
		const tools: IToolData[] = [{ id: 'testTool', source: ToolDataSource.Internal, displayName: 'Tool', modelDescription: '' }];
		service.manageConfirmationPreferences(tools, { defaultScope: 'session' });

		const snapshot = () => items[0].children!.map(item => [item.id, item.label, item.checked]);
		const changeChecked = async (label: string, checked: boolean) => {
			const updated = Event.toPromise(onDidSetItemTree.event);
			onDidChangeCheckboxState.fire({ ...items[0].children!.find(item => item.label === label)!, checked });
			await updated;
		};
		const remove = async (label: string) => {
			const updated = Event.toPromise(onDidSetItemTree.event);
			onDidTriggerItemButton.fire({ item: items[0].children!.find(item => item.label === label)!, button: deleteButton });
			await updated;
		};
		const initial = snapshot();
		await changeChecked('first', false);
		const unchecked = snapshot();
		await changeChecked('second', false);
		const bothUnchecked = snapshot();
		await changeChecked('second', true);
		await changeChecked('first', true);
		const restored = snapshot();
		await remove('second');
		await changeChecked('first', false);
		await remove('first');
		const deleted = snapshot();
		onDidHide.fire({ reason: QuickInputHideReason.Other });

		assert.deepStrictEqual({ initial, unchecked, bothUnchecked, restored, deleted, rows }, {
			initial: [
				['manage/testTool/row/first', 'first', true],
				['manage/testTool/second', 'second', true],
				['manage/testTool/Add Row...', 'Add Row...', undefined],
			],
			unchecked: [
				['manage/testTool/row/first', 'first', false],
				['manage/testTool/second', 'second', true],
				['manage/testTool/Add Row...', 'Add Row...', undefined],
			],
			bothUnchecked: [
				['manage/testTool/row/first', 'first', false],
				['manage/testTool/second', 'second', false],
				['manage/testTool/Add Row...', 'Add Row...', undefined],
			],
			restored: [
				['manage/testTool/second', 'second', true],
				['manage/testTool/row/first', 'first', true],
				['manage/testTool/Add Row...', 'Add Row...', undefined],
			],
			deleted: [['manage/testTool/Add Row...', 'Add Row...', undefined]],
			rows: [],
		});
	});

	test('serializes contribution checkbox and button handlers before they read settings', async () => {
		const onDidChangeCheckboxState = store.add(new Emitter<IQuickTreeItem>());
		const onDidTriggerItemButton = store.add(new Emitter<IQuickTreeItemButtonEvent<IQuickTreeItem>>());
		const onDidHide = store.add(new Emitter<IQuickInputHideEvent>());
		const firstStarted = new DeferredPromise<void>();
		const writeReady = new DeferredPromise<void>();
		const rebuilt = new DeferredPromise<void>();
		let items: IQuickTreeItem[] = [];
		let rebuilds = 0;
		const quickTree = upcastPartial<IQuickTree<IQuickTreeItem>>({
			get itemTree() { return items; },
			onDidChangeCheckboxState: onDidChangeCheckboxState.event,
			onDidTriggerItemButton: onDidTriggerItemButton.event,
			onDidHide: onDidHide.event,
			onDidAccept: Event.None,
			setItemTree: value => {
				items = value;
				if (++rebuilds === 3) {
					void rebuilt.complete();
				}
			},
			show: () => { },
			dispose: () => { },
		});
		instantiationService.stub(IQuickInputService, { createQuickTree: <T extends IQuickTreeItem>() => quickTree as IQuickTree<T> });
		service = store.add(instantiationService.createInstance(LanguageModelToolsConfirmationService));
		let approvals: string[] = [];
		const started: string[] = [];
		const update = async (label: string) => {
			const current = approvals;
			started.push(label);
			if (label === 'first') {
				void firstStarted.complete();
			}
			await writeReady.p;
			approvals = [...current, label];
		};
		const deleteButton = { tooltip: 'Delete' };
		store.add(service.registerConfirmationContribution('testTool', {
			canUseDefaultApprovals: false,
			getManageActions: () => [
				{ label: 'first', checked: false, onDidChangeChecked: () => update('first') },
				{ label: 'second', buttons: [deleteButton], onDidTriggerItemButton: () => update('second') },
			],
		}));
		service.manageConfirmationPreferences([{ id: 'testTool', source: ToolDataSource.Internal, displayName: 'Tool', modelDescription: '' }], { defaultScope: 'session' });
		onDidChangeCheckboxState.fire({ ...items[0].children![0], checked: true });
		onDidTriggerItemButton.fire({ item: items[0].children![1], button: deleteButton });
		await firstStarted.p;
		const beforeWrite = { started: [...started], approvals };
		await writeReady.complete();
		await rebuilt.p;
		onDidHide.fire({ reason: QuickInputHideReason.Other });

		assert.deepStrictEqual({ beforeWrite, started, approvals }, {
			beforeWrite: { started: ['first'], approvals: [] },
			started: ['first', 'second'],
			approvals: ['first', 'second'],
		});
	});

	test('getPreConfirmAction returns undefined by default', () => {
		const ref = createToolRef('testTool');
		const result = service.getPreConfirmAction(ref);
		assert.strictEqual(result, undefined);
	});

	test('getPostConfirmAction returns undefined by default', () => {
		const ref = createToolRef('testTool');
		const result = service.getPostConfirmAction(ref);
		assert.strictEqual(result, undefined);
	});

	test('getPreConfirmActions returns default tool-level actions', () => {
		const ref = createToolRef('testTool');
		const actions = service.getPreConfirmActions(ref);

		assert.ok(actions.length >= 3);
		assert.ok(actions.some(a => a.label.includes('Session')));
		assert.ok(actions.some(a => a.label.includes('Workspace')));
		assert.ok(actions.some(a => a.label.includes('Always Allow')));
	});

	test('getPostConfirmActions returns default tool-level actions', () => {
		const ref = createToolRef('testTool');
		const actions = service.getPostConfirmActions(ref);

		assert.ok(actions.length >= 3);
		assert.ok(actions.some(a => a.label.includes('Session')));
		assert.ok(actions.some(a => a.label.includes('Workspace')));
		assert.ok(actions.some(a => a.label.includes('Always Allow')));
	});

	test('getPreConfirmActions includes server-level actions for MCP tools', () => {
		const ref = createMcpToolRef('mcpTool', 'serverId', 'Test Server');
		const actions = service.getPreConfirmActions(ref);

		assert.ok(actions.some(a => a.label.includes('Test Server') && a.label.includes('Session')));
		assert.ok(actions.some(a => a.label.includes('Test Server') && a.label.includes('Workspace')));
		assert.ok(actions.some(a => a.label.includes('Test Server') && a.label.includes('Always Allow')));
	});

	test('getPostConfirmActions includes server-level actions for MCP tools', () => {
		const ref = createMcpToolRef('mcpTool', 'serverId', 'Test Server');
		const actions = service.getPostConfirmActions(ref);

		assert.ok(actions.some(a => a.label.includes('Test Server') && a.label.includes('Session')));
		assert.ok(actions.some(a => a.label.includes('Test Server') && a.label.includes('Workspace')));
		assert.ok(actions.some(a => a.label.includes('Test Server') && a.label.includes('Always Allow')));
	});

	test('pre-execution session confirmation works', async () => {
		const ref = createToolRef('testTool');
		const actions = service.getPreConfirmActions(ref);
		const sessionAction = actions.find(a => a.label.includes('Session') && !a.label.includes('Server'));

		assert.ok(sessionAction);
		await sessionAction.select();

		const result = service.getPreConfirmAction(ref);
		assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: 'session' });
	});

	test('pre-execution workspace confirmation works', async () => {
		const ref = createToolRef('testTool');
		const actions = service.getPreConfirmActions(ref);
		const workspaceAction = actions.find(a => a.label.includes('Workspace') && !a.label.includes('Server'));

		assert.ok(workspaceAction);
		await workspaceAction.select();

		const result = service.getPreConfirmAction(ref);
		assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: 'workspace' });
	});

	test('pre-execution profile confirmation works', async () => {
		const ref = createToolRef('testTool');
		const actions = service.getPreConfirmActions(ref);
		const profileAction = actions.find(a => a.label.includes('Always Allow') && !a.label.includes('Server'));

		assert.ok(profileAction);
		await profileAction.select();

		const result = service.getPreConfirmAction(ref);
		assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: 'profile' });
	});

	test('post-execution session confirmation works', async () => {
		const ref = createToolRef('testTool');
		const actions = service.getPostConfirmActions(ref);
		const sessionAction = actions.find(a => a.label.includes('Session') && !a.label.includes('Server'));

		assert.ok(sessionAction);
		await sessionAction.select();

		const result = service.getPostConfirmAction(ref);
		assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: 'session' });
	});

	test('post-execution workspace confirmation works', async () => {
		const ref = createToolRef('testTool');
		const actions = service.getPostConfirmActions(ref);
		const workspaceAction = actions.find(a => a.label.includes('Workspace') && !a.label.includes('Server'));

		assert.ok(workspaceAction);
		await workspaceAction.select();

		const result = service.getPostConfirmAction(ref);
		assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: 'workspace' });
	});

	test('post-execution profile confirmation works', async () => {
		const ref = createToolRef('testTool');
		const actions = service.getPostConfirmActions(ref);
		const profileAction = actions.find(a => a.label.includes('Always Allow') && !a.label.includes('Server'));

		assert.ok(profileAction);
		await profileAction.select();

		const result = service.getPostConfirmAction(ref);
		assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: 'profile' });
	});

	test('MCP server-level pre-execution session confirmation works', async () => {
		const ref = createMcpToolRef('mcpTool', 'serverId', 'Test Server');
		const actions = service.getPreConfirmActions(ref);
		const serverAction = actions.find(a => a.label.includes('Test Server') && a.label.includes('Session'));

		assert.ok(serverAction);
		await serverAction.select();

		const result = service.getPreConfirmAction(ref);
		assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: 'session' });
	});

	test('MCP server-level pre-execution workspace confirmation works', async () => {
		const ref = createMcpToolRef('mcpTool', 'serverId', 'Test Server');
		const actions = service.getPreConfirmActions(ref);
		const serverAction = actions.find(a => a.label.includes('Test Server') && a.label.includes('Workspace'));

		assert.ok(serverAction);
		await serverAction.select();

		const result = service.getPreConfirmAction(ref);
		assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: 'workspace' });
	});

	test('MCP server-level pre-execution profile confirmation works', async () => {
		const ref = createMcpToolRef('mcpTool', 'serverId', 'Test Server');
		const actions = service.getPreConfirmActions(ref);
		const serverAction = actions.find(a => a.label.includes('Test Server') && a.label.includes('Always Allow'));

		assert.ok(serverAction);
		await serverAction.select();

		const result = service.getPreConfirmAction(ref);
		assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: 'profile' });
	});

	test('MCP server-level post-execution session confirmation works', async () => {
		const ref = createMcpToolRef('mcpTool', 'serverId', 'Test Server');
		const actions = service.getPostConfirmActions(ref);
		const serverAction = actions.find(a => a.label.includes('Test Server') && a.label.includes('Session'));

		assert.ok(serverAction);
		await serverAction.select();

		const result = service.getPostConfirmAction(ref);
		assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: 'session' });
	});

	test('MCP server-level confirmation applies to all tools from that server', async () => {
		const ref1 = createMcpToolRef('mcpTool1', 'serverId', 'Test Server');
		const ref2 = createMcpToolRef('mcpTool2', 'serverId', 'Test Server');

		const actions = service.getPreConfirmActions(ref1);
		const serverAction = actions.find(a => a.label.includes('Test Server') && a.label.includes('Session'));

		assert.ok(serverAction);
		await serverAction.select();

		const result1 = service.getPreConfirmAction(ref1);
		const result2 = service.getPreConfirmAction(ref2);

		assert.deepStrictEqual(result1, { type: ToolConfirmKind.LmServicePerTool, scope: 'session' });
		assert.deepStrictEqual(result2, { type: ToolConfirmKind.LmServicePerTool, scope: 'session' });
	});

	test('tool-level confirmation takes precedence over server-level confirmation', async () => {
		const ref = createMcpToolRef('mcpTool', 'serverId', 'Test Server');

		// Set server-level confirmation
		const serverActions = service.getPreConfirmActions(ref);
		const serverAction = serverActions.find(a => a.label.includes('Test Server') && a.label.includes('Session'));
		assert.ok(serverAction);
		await serverAction.select();

		// Set tool-level confirmation to a different scope
		const toolActions = service.getPreConfirmActions(ref);
		const toolAction = toolActions.find(a => !a.label.includes('Test Server') && a.label.includes('Workspace'));
		assert.ok(toolAction);
		await toolAction.select();

		// Tool-level should take precedence
		const result = service.getPreConfirmAction(ref);
		assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: 'workspace' });
	});

	test('registerConfirmationContribution allows custom pre-confirm actions', () => {
		const contribution: ILanguageModelToolConfirmationContribution = {
			getPreConfirmAction: (ref) => {
				return { type: ToolConfirmKind.UserAction };
			}
		};

		store.add(service.registerConfirmationContribution('customTool', contribution));

		const ref = createToolRef('customTool');
		const result = service.getPreConfirmAction(ref);

		assert.ok(result);
		assert.strictEqual(result.type, ToolConfirmKind.UserAction);
	});

	test('registerConfirmationContribution allows custom post-confirm actions', () => {
		const contribution: ILanguageModelToolConfirmationContribution = {
			getPostConfirmAction: (ref) => {
				return { type: ToolConfirmKind.UserAction };
			}
		};

		store.add(service.registerConfirmationContribution('customTool', contribution));

		const ref = createToolRef('customTool');
		const result = service.getPostConfirmAction(ref);

		assert.ok(result);
		assert.strictEqual(result.type, ToolConfirmKind.UserAction);
	});

	test('registerConfirmationContribution allows custom pre-confirm action list', () => {
		const customActions: ILanguageModelToolConfirmationActions[] = [
			{
				label: 'Custom Action 1',
				select: async () => true
			},
			{
				label: 'Custom Action 2',
				select: async () => true
			}
		];

		const contribution: ILanguageModelToolConfirmationContribution = {
			getPreConfirmActions: (ref) => customActions
		};

		store.add(service.registerConfirmationContribution('customTool', contribution));

		const ref = createToolRef('customTool');
		const actions = service.getPreConfirmActions(ref);

		// Should include both custom actions and default actions
		assert.ok(actions.some(a => a.label === 'Custom Action 1'));
		assert.ok(actions.some(a => a.label === 'Custom Action 2'));
		assert.ok(actions.some(a => a.label.includes('Session')));
	});

	test('registerConfirmationContribution with canUseDefaultApprovals=false only shows custom actions', () => {
		const customActions: ILanguageModelToolConfirmationActions[] = [
			{
				label: 'Custom Action Only',
				select: async () => true
			}
		];

		const contribution: ILanguageModelToolConfirmationContribution = {
			canUseDefaultApprovals: false,
			getPreConfirmActions: (ref) => customActions
		};

		store.add(service.registerConfirmationContribution('customTool', contribution));

		const ref = createToolRef('customTool');
		const actions = service.getPreConfirmActions(ref);

		assert.strictEqual(actions.length, 1);
		assert.strictEqual(actions[0].label, 'Custom Action Only');
	});

	test('contribution getPreConfirmAction takes precedence over default stores', () => {
		const contribution: ILanguageModelToolConfirmationContribution = {
			getPreConfirmAction: (ref) => {
				return { type: ToolConfirmKind.UserAction };
			}
		};

		store.add(service.registerConfirmationContribution('customTool', contribution));

		// Contribution should take precedence even without setting default
		const ref = createToolRef('customTool');
		const result = service.getPreConfirmAction(ref);
		assert.ok(result);
		assert.strictEqual(result.type, ToolConfirmKind.UserAction);
	});

	test('policy restriction makes existing default grants dormant until removal', async () => {
		const preRef = createToolRef('preTool');
		const postRef = createToolRef('postTool');
		const combinationRef = await createCombinationRef('combinationTool', { path: 'file.txt' }, 'Allow file.txt');
		const mcpRef = createMcpToolRef('mcpTool', 'serverId', 'Test Server');

		await service.getPreConfirmActions(preRef).find(action => action.scope === 'workspace')!.select();
		await service.getPostConfirmActions(postRef).find(action => action.scope === 'profile')!.select();
		await service.getPreConfirmActions(combinationRef).find(action => action.scope === 'session' && action.label.includes('file.txt'))!.select();
		await service.getPreConfirmActions(mcpRef).find(action => action.scope === 'profile' && action.label.includes('Test Server'))!.select();
		await service.getPostConfirmActions(mcpRef).find(action => action.scope === 'workspace' && action.label.includes('Test Server'))!.select();

		configurationService.policyRestricted = true;
		assert.deepStrictEqual({
			pre: service.getPreConfirmAction(preRef),
			post: service.getPostConfirmAction(postRef),
			combination: service.getPreConfirmAction(combinationRef),
			mcpPre: service.getPreConfirmAction(mcpRef),
			mcpPost: service.getPostConfirmAction(mcpRef),
		}, {
			pre: undefined,
			post: undefined,
			combination: undefined,
			mcpPre: undefined,
			mcpPost: undefined,
		});

		configurationService.policyRestricted = false;
		assert.deepStrictEqual({
			pre: service.getPreConfirmAction(preRef),
			post: service.getPostConfirmAction(postRef),
			combination: service.getPreConfirmAction(combinationRef),
			mcpPre: service.getPreConfirmAction(mcpRef),
			mcpPost: service.getPostConfirmAction(mcpRef),
		}, {
			pre: { type: ToolConfirmKind.LmServicePerTool, scope: 'workspace' },
			post: { type: ToolConfirmKind.LmServicePerTool, scope: 'profile' },
			combination: { type: ToolConfirmKind.LmServicePerTool, scope: 'session' },
			mcpPre: { type: ToolConfirmKind.LmServicePerTool, scope: 'profile' },
			mcpPost: { type: ToolConfirmKind.LmServicePerTool, scope: 'workspace' },
		});
	});

	test('policy restriction suppresses default actions but preserves contribution decisions and actions', async () => {
		const customActions: ILanguageModelToolConfirmationActions[] = [{
			label: 'Custom Pre Action',
			select: async () => true,
		}];
		const contribution: ILanguageModelToolConfirmationContribution = {
			getPreConfirmAction: () => ({ type: ToolConfirmKind.UserAction }),
			getPostConfirmAction: () => ({ type: ToolConfirmKind.UserAction }),
			getPreConfirmActions: () => customActions,
			getPostConfirmActions: () => [{
				label: 'Custom Post Action',
				select: async () => true,
			}],
		};
		store.add(service.registerConfirmationContribution('customTool', contribution));
		const ref: ILanguageModelToolConfirmationRef = {
			...createMcpToolRef('customTool', 'serverId', 'Test Server'),
			combination: {
				label: 'Allow custom combination',
				key: await computeCombinationKey('customTool', {}),
			},
		};

		configurationService.policyRestricted = true;
		assert.deepStrictEqual({
			preDecision: service.getPreConfirmAction(ref),
			postDecision: service.getPostConfirmAction(ref),
			preActions: service.getPreConfirmActions(ref).map(action => action.label),
			postActions: service.getPostConfirmActions(ref).map(action => action.label),
		}, {
			preDecision: { type: ToolConfirmKind.UserAction },
			postDecision: { type: ToolConfirmKind.UserAction },
			preActions: ['Custom Pre Action'],
			postActions: ['Custom Post Action'],
		});
	});

	test('contribution with canUseDefaultApprovals=false prevents default store checks', () => {
		const contribution: ILanguageModelToolConfirmationContribution = {
			canUseDefaultApprovals: false,
			getPreConfirmAction: () => undefined
		};

		store.add(service.registerConfirmationContribution('customTool', contribution));

		const ref = createToolRef('customTool');
		const actions = service.getPreConfirmActions(ref);

		// Should have no actions since canUseDefaultApprovals is false
		assert.strictEqual(actions.length, 0);
	});

	test('resetToolAutoConfirmation clears all confirmations', async () => {
		const ref1 = createToolRef('tool1');
		const ref2 = createMcpToolRef('mcpTool', 'serverId', 'Test Server');

		// Set some confirmations
		const actions1 = service.getPreConfirmActions(ref1);
		const sessionAction1 = actions1.find(a => a.label.includes('Session') && !a.label.includes('Server'));
		assert.ok(sessionAction1);
		await sessionAction1.select();

		const actions2 = service.getPreConfirmActions(ref2);
		const serverAction = actions2.find(a => a.label.includes('Test Server') && a.label.includes('Session'));
		assert.ok(serverAction);
		await serverAction.select();

		// Verify they're set
		assert.ok(service.getPreConfirmAction(ref1));
		assert.ok(service.getPreConfirmAction(ref2));

		// Reset
		service.resetToolAutoConfirmation();

		// Verify they're cleared
		assert.strictEqual(service.getPreConfirmAction(ref1), undefined);
		assert.strictEqual(service.getPreConfirmAction(ref2), undefined);
	});

	test('resetToolAutoConfirmation calls contribution reset', () => {
		let resetCalled = false;
		const contribution: ILanguageModelToolConfirmationContribution = {
			reset: () => {
				resetCalled = true;
			}
		};

		store.add(service.registerConfirmationContribution('customTool', contribution));

		service.resetToolAutoConfirmation();

		assert.strictEqual(resetCalled, true);
	});

	test('disposing contribution registration removes it', () => {
		const contribution: ILanguageModelToolConfirmationContribution = {
			getPreConfirmAction: (ref) => {
				return { type: ToolConfirmKind.UserAction };
			}
		};

		const disposable = service.registerConfirmationContribution('customTool', contribution);

		const ref = createToolRef('customTool');
		let result = service.getPreConfirmAction(ref);
		assert.ok(result);
		assert.strictEqual(result.type, ToolConfirmKind.UserAction);

		disposable.dispose();

		result = service.getPreConfirmAction(ref);
		assert.strictEqual(result, undefined);
	});

	test('different tools have independent confirmations', async () => {
		const ref1 = createToolRef('tool1');
		const ref2 = createToolRef('tool2');

		// Set session for tool1
		const actions1 = service.getPreConfirmActions(ref1);
		const sessionAction = actions1.find(a => a.label.includes('Session') && !a.label.includes('Server'));
		assert.ok(sessionAction);
		await sessionAction.select();

		// Set workspace for tool2
		const actions2 = service.getPreConfirmActions(ref2);
		const workspaceAction = actions2.find(a => a.label.includes('Workspace') && !a.label.includes('Server'));
		assert.ok(workspaceAction);
		await workspaceAction.select();

		// Verify they're independent
		const result1 = service.getPreConfirmAction(ref1);
		const result2 = service.getPreConfirmAction(ref2);

		assert.deepStrictEqual(result1, { type: ToolConfirmKind.LmServicePerTool, scope: 'session' });
		assert.deepStrictEqual(result2, { type: ToolConfirmKind.LmServicePerTool, scope: 'workspace' });
	});

	test('pre and post execution confirmations are independent', async () => {
		const ref = createToolRef('testTool');

		// Set pre-execution to session
		const preActions = service.getPreConfirmActions(ref);
		const preSessionAction = preActions.find(a => a.label.includes('Session') && !a.label.includes('Server'));
		assert.ok(preSessionAction);
		await preSessionAction.select();

		// Set post-execution to workspace
		const postActions = service.getPostConfirmActions(ref);
		const postWorkspaceAction = postActions.find(a => a.label.includes('Workspace') && !a.label.includes('Server'));
		assert.ok(postWorkspaceAction);
		await postWorkspaceAction.select();

		// Verify they're independent
		const preResult = service.getPreConfirmAction(ref);
		const postResult = service.getPostConfirmAction(ref);

		assert.deepStrictEqual(preResult, { type: ToolConfirmKind.LmServicePerTool, scope: 'session' });
		assert.deepStrictEqual(postResult, { type: ToolConfirmKind.LmServicePerTool, scope: 'workspace' });
	});

	test('different MCP servers have independent confirmations', async () => {
		const ref1 = createMcpToolRef('tool1', 'server1', 'Server 1');
		const ref2 = createMcpToolRef('tool2', 'server2', 'Server 2');

		// Set server1 to session
		const actions1 = service.getPreConfirmActions(ref1);
		const serverAction1 = actions1.find(a => a.label.includes('Server 1') && a.label.includes('Session'));
		assert.ok(serverAction1);
		await serverAction1.select();

		// Set server2 to workspace
		const actions2 = service.getPreConfirmActions(ref2);
		const serverAction2 = actions2.find(a => a.label.includes('Server 2') && a.label.includes('Workspace'));
		assert.ok(serverAction2);
		await serverAction2.select();

		// Verify they're independent
		const result1 = service.getPreConfirmAction(ref1);
		const result2 = service.getPreConfirmAction(ref2);

		assert.deepStrictEqual(result1, { type: ToolConfirmKind.LmServicePerTool, scope: 'session' });
		assert.deepStrictEqual(result2, { type: ToolConfirmKind.LmServicePerTool, scope: 'workspace' });
	});

	test('actions return true when select is called', async () => {
		const ref = createToolRef('testTool');
		const actions = service.getPreConfirmActions(ref);

		for (const action of actions) {
			const result = await action.select();
			assert.strictEqual(result, true);
		}
	});

	test('session confirmations are stored in memory only', async () => {
		const ref = createToolRef('testTool');
		const actions = service.getPreConfirmActions(ref);
		const sessionAction = actions.find(a => a.label.includes('Session') && !a.label.includes('Server'));

		assert.ok(sessionAction);
		await sessionAction.select();

		// Verify it's set
		const result = service.getPreConfirmAction(ref);
		assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: 'session' });

		// Create new service instance (simulating restart)
		const newService = store.add(instantiationService.createInstance(LanguageModelToolsConfirmationService));

		// Session confirmation should not persist
		const newResult = newService.getPreConfirmAction(ref);
		assert.strictEqual(newResult, undefined);
	});

	test('combination actions are only offered when combinationLabel is set', async () => {
		const refWithout = createToolRef('testTool', ToolDataSource.Internal, { file: 'foo.txt' });
		const actionsWithout = service.getPreConfirmActions(refWithout);
		assert.ok(!actionsWithout.some(a => a.label.includes('foo.txt')));

		const refWith = await createCombinationRef('testTool', { file: 'foo.txt' }, 'Allow reading "foo.txt"');
		const actionsWith = service.getPreConfirmActions(refWith);
		assert.ok(actionsWith.some(a => a.label.includes('Allow reading "foo.txt"')));
	});

	test('combination actions include session, workspace, and profile scopes', async () => {
		const ref = await createCombinationRef('testTool', { file: 'foo.txt' }, 'Allow reading "foo.txt"');
		const actions = service.getPreConfirmActions(ref);
		const combinationActions = actions.filter(a => a.label.includes('Allow reading "foo.txt"'));
		assert.strictEqual(combinationActions.length, 3);
		assert.ok(combinationActions.some(a => a.scope === 'session'));
		assert.ok(combinationActions.some(a => a.scope === 'workspace'));
		assert.ok(combinationActions.some(a => a.scope === 'profile'));
	});

	test('selecting a combination session action auto-confirms the same parameters', async () => {
		const ref = await createCombinationRef('testTool', { file: 'foo.txt' }, 'Allow reading "foo.txt"');

		assert.strictEqual(service.getPreConfirmAction(ref), undefined);

		const actions = service.getPreConfirmActions(ref);
		const combinationAction = actions.find(a => a.label.includes('Allow reading "foo.txt"') && a.scope === 'session');
		assert.ok(combinationAction);
		await combinationAction.select();

		const result = service.getPreConfirmAction(ref);
		assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: 'session' });
	});

	test('selecting a combination workspace action stores at workspace scope', async () => {
		const ref = await createCombinationRef('testTool', { file: 'foo.txt' }, 'Allow reading "foo.txt"');

		const actions = service.getPreConfirmActions(ref);
		const combinationAction = actions.find(a => a.label.includes('Allow reading "foo.txt"') && a.scope === 'workspace');
		assert.ok(combinationAction);
		await combinationAction.select();

		assert.deepStrictEqual(service.getPreConfirmAction(ref), { type: ToolConfirmKind.LmServicePerTool, scope: 'workspace' });
	});

	test('combination approval does not apply to different parameters', async () => {
		const refFoo = await createCombinationRef('testTool', { file: 'foo.txt' }, 'Allow reading "foo.txt"');
		const refBar = await createCombinationRef('testTool', { file: 'bar.txt' }, 'Allow reading "bar.txt"');

		const actions = service.getPreConfirmActions(refFoo);
		const combinationAction = actions.find(a => a.label.includes('Allow reading "foo.txt"') && a.scope === 'session');
		assert.ok(combinationAction);
		await combinationAction.select();

		assert.ok(service.getPreConfirmAction(refFoo));
		assert.strictEqual(service.getPreConfirmAction(refBar), undefined);
	});

	test('tool-level approval takes precedence over combination approval', async () => {
		const ref = await createCombinationRef('testTool', { file: 'foo.txt' }, 'Allow reading "foo.txt"');

		const actions = service.getPreConfirmActions(ref);
		const toolSessionAction = actions.find(a => a.label.includes('Session')
			&& !a.label.includes('foo.txt') && !a.label.includes('Server'));
		assert.ok(toolSessionAction);
		await toolSessionAction.select();

		const result = service.getPreConfirmAction(ref);
		assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: 'session' });
	});

	test('combination approvals are cleared on reset', async () => {
		const ref = await createCombinationRef('testTool', { file: 'foo.txt' }, 'Allow reading "foo.txt"');

		const actions = service.getPreConfirmActions(ref);
		const combinationAction = actions.find(a => a.label.includes('Allow reading "foo.txt"') && a.scope === 'session');
		assert.ok(combinationAction);
		await combinationAction.select();
		assert.ok(service.getPreConfirmAction(ref));

		service.resetToolAutoConfirmation();
		assert.strictEqual(service.getPreConfirmAction(ref), undefined);
	});

	test('combination session approvals do not persist across service instances', async () => {
		const ref = await createCombinationRef('testTool', { file: 'foo.txt' }, 'Allow reading "foo.txt"');

		const actions = service.getPreConfirmActions(ref);
		const combinationAction = actions.find(a => a.label.includes('Allow reading "foo.txt"') && a.scope === 'session');
		assert.ok(combinationAction);
		await combinationAction.select();
		assert.ok(service.getPreConfirmAction(ref));

		const newService = store.add(instantiationService.createInstance(LanguageModelToolsConfirmationService));
		assert.strictEqual(newService.getPreConfirmAction(ref), undefined);
	});

	test('legacy string[] storage format is read correctly', () => {
		// Pre-seed storage with the legacy string[] format
		const storageService = instantiationService.get(IStorageService);
		storageService.store('chat/autoconfirm', JSON.stringify(['tool1', 'tool2']), StorageScope.WORKSPACE, StorageTarget.MACHINE);

		// Create a new service instance that reads the legacy data
		const newService = store.add(instantiationService.createInstance(LanguageModelToolsConfirmationService));

		const ref1 = createToolRef('tool1');
		const ref2 = createToolRef('tool2');
		const ref3 = createToolRef('tool3');

		assert.deepStrictEqual(newService.getPreConfirmAction(ref1), { type: ToolConfirmKind.LmServicePerTool, scope: 'workspace' });
		assert.deepStrictEqual(newService.getPreConfirmAction(ref2), { type: ToolConfirmKind.LmServicePerTool, scope: 'workspace' });
		assert.strictEqual(newService.getPreConfirmAction(ref3), undefined);
	});

	test('new Record storage format preserves labels', () => {
		// Pre-seed storage with the new Record<string, string | boolean> format
		const storageService = instantiationService.get(IStorageService);
		const data: Record<string, string | boolean> = {
			'tool1:combination:12345': 'Allow reading foo.txt',
			'tool2': true,
		};
		storageService.store('chat/autoconfirm', JSON.stringify(data), StorageScope.WORKSPACE, StorageTarget.MACHINE);

		const newService = store.add(instantiationService.createInstance(LanguageModelToolsConfirmationService));

		// tool2 should be auto-confirmed (boolean true, no label)
		const ref2 = createToolRef('tool2');
		assert.deepStrictEqual(newService.getPreConfirmAction(ref2), { type: ToolConfirmKind.LmServicePerTool, scope: 'workspace' });
	});

	test('object storage format with arguments round-trips across restart', () => {
		// Pre-seed storage with the new object format containing arguments
		const storageService = instantiationService.get(IStorageService);
		const data: Record<string, string | boolean | { label?: string; arguments?: string }> = {
			'tool1:combination:12345': { label: 'Allow reading foo.txt', arguments: '["foo.txt"]' },
			'tool2:combination:67890': { label: 'Allow command with args' },
		};
		storageService.store('chat/autoconfirm-combination', JSON.stringify(data), StorageScope.WORKSPACE, StorageTarget.MACHINE);

		const newService = store.add(instantiationService.createInstance(LanguageModelToolsConfirmationService));

		// Both combination keys should be auto-confirmed
		const ref1: ILanguageModelToolConfirmationRef = {
			...createToolRef('tool1'),
			combination: { label: 'Allow reading foo.txt', key: 'tool1:combination:12345', arguments: '["foo.txt"]' },
		};
		const ref2: ILanguageModelToolConfirmationRef = {
			...createToolRef('tool2'),
			combination: { label: 'Allow command with args', key: 'tool2:combination:67890' },
		};

		assert.deepStrictEqual(newService.getPreConfirmAction(ref1), { type: ToolConfirmKind.LmServicePerTool, scope: 'workspace' });
		assert.deepStrictEqual(newService.getPreConfirmAction(ref2), { type: ToolConfirmKind.LmServicePerTool, scope: 'workspace' });
	});

	test('combination approval with arguments persists via workspace scope', async () => {
		const ref = await createCombinationRef('testTool', { file: 'foo.txt' }, 'Allow reading "foo.txt"', '{"file":"foo.txt"}');

		const actions = service.getPreConfirmActions(ref);
		const combinationAction = actions.find(a => a.label.includes('Allow reading "foo.txt"') && a.scope === 'workspace');
		assert.ok(combinationAction);
		await combinationAction.select();

		assert.deepStrictEqual(service.getPreConfirmAction(ref), { type: ToolConfirmKind.LmServicePerTool, scope: 'workspace' });
	});
});
