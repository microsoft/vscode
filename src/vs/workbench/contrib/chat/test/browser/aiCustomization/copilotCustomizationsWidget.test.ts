/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as DOM from '../../../../../../base/browser/dom.js';
import { IContextMenuDelegate } from '../../../../../../base/browser/contextmenu.js';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { IAction } from '../../../../../../base/common/actions.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentExtensionInventory } from '../../../../../../platform/agentHost/common/agent.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { getCanvasDefinitionInstanceId, ICanvas, ICanvasContext, ICanvasContextService, ICanvasDefinition, ICanvasReference, ICanvasService } from '../../../../canvases/common/canvas.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { ICustomizationHarnessService } from '../../../common/customizationHarnessService.js';
import { IAgentPlugin, IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { CopilotCanvasesWidget } from '../../../browser/aiCustomization/copilotCustomizationsWidget.js';
import { ICopilotExtensionsService } from '../../../browser/aiCustomization/copilotExtensionsService.js';

suite('CopilotCanvasesWidget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function definition(overrides: Partial<ICanvasDefinition> = {}): ICanvasDefinition {
		return {
			canvasId: 'preview',
			extensionId: 'user:preview',
			extensionSource: 'user',
			extensionName: 'Preview Extension',
			displayName: 'Preview',
			description: 'Preview canvas',
			requiresInput: false,
			...overrides,
		};
	}

	function inventory(definitions: readonly ICanvasDefinition[], status: 'running' | 'disabled' | 'failed' | 'starting' = 'running'): IAgentExtensionInventory {
		const extensions = new Map<string, IAgentExtensionInventory['extensions'][number]>();
		for (const canvas of definitions) {
			if (canvas.extensionSource === 'session') {
				continue;
			}
			const extensionId = canvas.extensionId;
			extensions.set(extensionId, {
				id: extensionId,
				name: canvas.extensionName ?? canvas.extensionId,
				source: canvas.extensionSource === 'unknown' ? 'user' : canvas.extensionSource,
				status,
				...(canvas.extensionSource === 'user' ? { resource: URI.file(`/extensions/${canvas.extensionName ?? canvas.extensionId}/extension.mjs`) } : {}),
				...(canvas.extensionSource === 'plugin' ? { pluginName: canvas.extensionName } : {}),
			});
		}
		return { mode: 'load_and_augment', extensions: [...extensions.values()] };
	}

	function createHarness(options?: {
		readonly definitions?: readonly ICanvasDefinition[];
		readonly initialCanvases?: (definition: ICanvasDefinition) => readonly ICanvas[];
		readonly listCanvases?: () => Promise<readonly ICanvasDefinition[]>;
		readonly pluginName?: string;
		readonly extensionInventory?: IAgentExtensionInventory;
		readonly storageService?: IStorageService;
		readonly visible?: boolean;
		readonly contextAvailable?: boolean;
	}) {
		const container = DOM.append(mainWindow.document.body, DOM.$('.copilot-canvases-test'));
		store.add({ dispose: () => container.remove() });
		const frontendSessionResource = URI.parse('agent-host-copilotcli:/frontend-owner');
		let definitions = options?.definitions ?? [definition()];
		let extensionInventory = options?.extensionInventory ?? inventory(definitions);
		const definitionsChanged = store.add(new Emitter<void>());
		let listCalls = 0;
		let openCalls = 0;
		const context: ICanvasContext = {
			owner: {
				providerId: 'remote/copilotcli',
				session: URI.parse('vendor-session:/opaque-backend'),
				chat: URI.parse('vendor-chat:/opaque-chat'),
			},
			canvases: constObservable(options?.initialCanvases?.(definitions[0]) ?? []),
			definitionProvider: {
				onDidChangeDefinitions: definitionsChanged.event,
				async listCanvases() {
					listCalls++;
					return options?.listCanvases ? options.listCanvases() : definitions;
				},
				async openCanvas() { openCalls++; },
			},
		};
		const enabled = observableValue('enabled', true);
		const reveals: string[] = [];
		const canvasContextService = new class extends mock<ICanvasContextService>() {
			override readonly contexts = constObservable(options?.contextAvailable === false ? [] : [context]);
			override readonly onDidRemoveOwner = Event.None;
			override isOwnerVisible() { return true; }
			override getContext() { return context; }
			override getFrontendSessionResource() { return frontendSessionResource; }
			override getEditorGroup() { return undefined; }
		}();
		const canvasService = new class extends mock<ICanvasService>() {
			override readonly enabled = enabled;
			override readonly reopenableCanvases = constObservable([]);
			override isOwnerPresentable() { return true; }
			override async revealCanvas(reference: ICanvasReference) { reveals.push(reference.canvas.toString()); }
			override async reopenCanvas() { }
		}();
		const listRequests: { session: URI; token: CancellationToken }[] = [];
		const setRequests: { session: URI; extensionId: string; enabled: boolean }[] = [];
		const extensionsChanged = store.add(new Emitter<void>());
		const extensionsService = new class extends mock<ICopilotExtensionsService>() {
			override readonly onDidChange = extensionsChanged.event;
			override async listExtensions(session: URI, token: CancellationToken): Promise<IAgentExtensionInventory> {
				listRequests.push({ session, token });
				return extensionInventory;
			}
			override async setExtensionEnabled(session: URI, extensionId: string, value: boolean): Promise<void> {
				setRequests.push({ session, extensionId, enabled: value });
				extensionInventory = {
					...extensionInventory,
					extensions: extensionInventory.extensions.map(extension => extension.id === extensionId ? {
						...extension,
						status: value ? 'running' : 'disabled',
					} : extension),
				};
				if (!value) {
					definitions = definitions.filter(canvas => canvas.extensionId !== extensionId);
				}
				extensionsChanged.fire();
				definitionsChanged.fire();
			}
		}();
		const commands: { id: string; args: readonly unknown[] }[] = [];
		const menuActions: IAction[] = [];
		let hideMenu = () => { };
		const instantiationService = workbenchInstantiationService({}, store);
		instantiationService.stub(ICanvasContextService, canvasContextService);
		instantiationService.stub(ICanvasService, canvasService);
		instantiationService.stub(ICopilotExtensionsService, extensionsService);
		if (options?.storageService) {
			instantiationService.stub(IStorageService, options.storageService);
		}
		instantiationService.stub(ICustomizationHarnessService, new class extends mock<ICustomizationHarnessService>() {
			override readonly activeSessionResource = constObservable(URI.parse('agent-host-copilotcli:/unrelated-active'));
		}());
		const plugin = options?.pluginName ? upcastPartial<IAgentPlugin>({
			label: options.pluginName,
			uri: URI.file(`/plugins/${options.pluginName}`),
		}) : undefined;
		instantiationService.stub(IAgentPluginService, new class extends mock<IAgentPluginService>() {
			override readonly plugins = constObservable(plugin ? [plugin] : []);
		}());
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
			override executeCommand<R = unknown>(id: string, ...args: unknown[]): Promise<R | undefined> {
				commands.push({ id, args });
				return Promise.resolve(undefined);
			}
		}());
		instantiationService.stub(IContextMenuService, new class extends mock<IContextMenuService>() {
			override showContextMenu(delegate: IContextMenuDelegate): void {
				menuActions.splice(0, menuActions.length, ...delegate.getActions());
				hideMenu = () => delegate.onHide?.(false);
			}
		}());
		const widget = store.add(instantiationService.createInstance(CopilotCanvasesWidget, container));
		const itemCounts: number[] = [];
		const requestedPlugins: string[] = [];
		store.add(widget.onDidChangeItemCount(count => itemCounts.push(count)));
		store.add(widget.onDidRequestShowPlugin(item => requestedPlugins.push(item.name)));
		if (options?.visible !== false) {
			widget.setVisible(true);
		}
		widget.layout(new DOM.Dimension(900, 900));
		return {
			container,
			commands,
			menuActions,
			hideMenu: () => hideMenu(),
			context,
			definitionsChanged,
			enabled,
			frontendSessionResource,
			listRequests,
			setRequests,
			get listCalls() { return listCalls; },
			get openCalls() { return openCalls; },
			reveals,
			itemCounts,
			requestedPlugins,
			widget,
		};
	}

	test('renders extension parents with Canvas children and parent-only switches', async () => {
		const harness = createHarness({
			definitions: [
				definition(),
				definition({ canvasId: 'workspace', extensionId: 'project:workspace', extensionSource: 'project', extensionName: 'Workspace Tools', displayName: 'Workspace Board' }),
				definition({ canvasId: 'plugin', extensionId: 'plugin:diagram:canvas', extensionSource: 'plugin', extensionName: 'Diagram Plugin', displayName: 'Diagram Board' }),
			],
		});

		await timeout(0);
		const extensionRows = [...harness.container.querySelectorAll<HTMLElement>('.copilot-canvas-extension-tree-item')];
		const canvasRows = [...harness.container.querySelectorAll<HTMLElement>('.copilot-canvas-tree-item')];
		const visibleTreeLevels = [...harness.container.querySelectorAll<HTMLElement>('.copilot-customizations-tree .monaco-list-row')]
			.map(row => row.getAttribute('aria-level'));
		const accessible = harness.widget.getAccessibilityContent();
		const search = harness.container.querySelector<HTMLInputElement>('input[aria-label="Search Canvases"]');
		assert.ok(search);
		search.value = 'Workspace Tools';
		search.dispatchEvent(new InputEvent('input', { bubbles: true }));
		await timeout(0);
		const workspaceSwitchDisabled = harness.container.querySelector<HTMLElement>('[aria-label="Disable extension Workspace Tools"]')?.hasAttribute('disabled');

		assert.deepStrictEqual({
			allSourceGroupsAccessible: ['User', 'Workspace', 'Plugins'].every(group => accessible.includes(`${group}. 1 extensions.`)),
			allExtensionsAccessible: ['Preview Extension', 'Workspace Tools', 'Diagram Plugin'].every(extension => accessible.includes(extension)),
			allCanvasesAccessible: ['Preview', 'Workspace Board', 'Diagram Board'].every(canvas => accessible.includes(canvas)),
			extensionSwitchCoverage: extensionRows.length > 0 && extensionRows.every(row => row.querySelector('[role="switch"]') !== null),
			workspaceSwitchDisabled,
			extensionSourceIcons: extensionRows.filter(row => row.querySelector('.copilot-customization-tree-icon') !== null).length,
			canvasSwitches: canvasRows.filter(row => row.querySelector('[role="switch"]') !== null).length,
			sharedMoreButtonStyles: [...harness.container.querySelectorAll<HTMLElement>('[data-customization-action="more"]')]
				.every(button => button.classList.contains('plugin-card-icon-button')),
			visibleTreeLevelsValid: visibleTreeLevels.length > 0 && visibleTreeLevels.every(level => level === '1' || level === '2' || level === '3'),
			refreshInTitle: harness.container.querySelector('.section-title-actions [aria-label="Refresh Registered Canvases"]') !== null,
			refreshInSearch: harness.container.querySelector('.tools-list-search-and-button-container [aria-label="Refresh Registered Canvases"]') !== null,
			listTarget: harness.listRequests.map(request => request.session.toString()),
			itemCounts: harness.itemCounts,
		}, {
			allSourceGroupsAccessible: true,
			allExtensionsAccessible: true,
			allCanvasesAccessible: true,
			extensionSwitchCoverage: true,
			workspaceSwitchDisabled: true,
			extensionSourceIcons: 0,
			canvasSwitches: 0,
			sharedMoreButtonStyles: true,
			visibleTreeLevelsValid: true,
			refreshInTitle: true,
			refreshInSearch: false,
			listTarget: [harness.frontendSessionResource.toString()],
			itemCounts: [3],
		});
	});

	test('distinguishes a missing compatible chat from a chat with no Canvases', async () => {
		const withoutContext = createHarness({ contextAvailable: false });
		const withoutCanvases = createHarness({ definitions: [] });
		await timeout(20);

		assert.deepStrictEqual({
			withoutContext: withoutContext.widget.getAccessibilityContent(),
			withoutCanvases: withoutCanvases.widget.getAccessibilityContent(),
			listRequestsWithoutContext: withoutContext.listRequests.length,
			listRequestsWithoutCanvases: withoutCanvases.listRequests.length,
		}, {
			withoutContext: [
				'Canvases',
				'Canvas availability follows the chats currently visible in this window.',
				'No Compatible Copilot Chat Found',
				'Open or resume a Copilot chat that supports Canvases.',
			].join('\n\n'),
			withoutCanvases: [
				'Canvases',
				'Canvas availability follows the chats currently visible in this window.',
				'No Canvases Available',
				'None of the current Copilot chats provide any Canvases.',
			].join('\n\n'),
			listRequestsWithoutContext: 0,
			listRequestsWithoutCanvases: 1,
		});
	});

	test('ignores session-scoped extensions and Canvases', async () => {
		const harness = createHarness({
			definitions: [
				definition(),
				definition({ canvasId: 'temporary', extensionId: 'session:temporary', extensionSource: 'session', extensionName: 'Temporary', displayName: 'Temporary Canvas' }),
			],
			extensionInventory: {
				mode: 'load_and_augment',
				extensions: [{
					id: 'user:preview',
					name: 'Preview Extension',
					source: 'user',
					status: 'running',
				}],
			},
		});
		await timeout(0);
		const accessible = harness.widget.getAccessibilityContent();

		assert.deepStrictEqual({
			sessionGroup: accessible.includes('Session.'),
			sessionExtension: accessible.includes('Temporary'),
			itemCounts: harness.itemCounts,
		}, {
			sessionGroup: false,
			sessionExtension: false,
			itemCounts: [1],
		});
	});

	test('lists inventory extensions that report no Canvases', async () => {
		const extensionInventory: IAgentExtensionInventory = {
			mode: 'load_and_augment',
			extensions: [{
				id: 'plugin:microsoft-foundry:microsoft-foundry',
				name: 'microsoft-foundry:microsoft-foundry',
				source: 'plugin',
				status: 'running',
				pluginName: 'microsoft-foundry',
			}],
		};
		const harness = createHarness({ definitions: [], extensionInventory });
		await timeout(0);
		const search = harness.container.querySelector<HTMLInputElement>('input[aria-label="Search Canvases"]');
		assert.ok(search);
		search.value = 'microsoft-foundry';
		search.dispatchEvent(new InputEvent('input', { bubbles: true }));
		await timeout(0);
		harness.widget.fireItemCount();

		assert.deepStrictEqual({
			accessible: harness.widget.getAccessibilityContent().includes('microsoft-foundry'),
			label: harness.container.querySelector('.copilot-canvas-extension-tree-item .copilot-customization-tree-label')?.textContent,
			detail: harness.container.querySelector('.copilot-canvas-extension-tree-item .copilot-customization-tree-detail')?.textContent,
			canvasRows: harness.container.querySelectorAll('.copilot-canvas-tree-item').length,
			itemCounts: harness.itemCounts,
		}, {
			accessible: true,
			label: 'microsoft-foundry',
			detail: 'No Canvases Reported',
			canvasRows: 0,
			itemCounts: [0],
		});
	});

	test('loads its item count before the section becomes visible', async () => {
		const harness = createHarness({ visible: false });
		await timeout(20);

		assert.deepStrictEqual({
			listRequests: harness.listRequests.length,
			itemCounts: harness.itemCounts,
		}, {
			listRequests: 1,
			itemCounts: [1],
		});
	});

	test('opens the Canvas extension folder from the extension menu', async () => {
		const harness = createHarness();
		await timeout(0);
		const more = harness.container.querySelector<HTMLElement>('[aria-label="More Actions for Extension Preview Extension"]');
		assert.ok(more);
		more.click();
		const openFolder = harness.menuActions.find(action => action.label === 'Open Canvas Extension Folder');
		assert.ok(openFolder);
		await openFolder.run();
		harness.hideMenu();

		assert.deepStrictEqual(harness.commands.map(command => ({
			id: command.id,
			args: command.args.map(arg => URI.isUri(arg) ? arg.toString() : arg),
		})), [{
			id: 'revealFileInOS',
			args: ['file:///extensions/Preview%20Extension'],
		}]);
	});

	test('disables only at the extension parent and retains its Canvas children', async () => {
		const harness = createHarness({
			definitions: [
				definition({ canvasId: 'review', extensionId: 'user:pr-tools', extensionSource: 'user', extensionName: 'PR Tools', displayName: 'PR Review Board' }),
				definition({ canvasId: 'release', extensionId: 'user:pr-tools', extensionSource: 'user', extensionName: 'PR Tools', displayName: 'Release Notes Draft' }),
			],
		});
		await timeout(0);
		const disable = harness.container.querySelector<HTMLElement>('[aria-label="Disable extension PR Tools"]');
		assert.ok(disable);
		disable.click();
		await timeout(20);
		const accessible = harness.widget.getAccessibilityContent();

		assert.deepStrictEqual({
			requests: harness.setRequests.map(request => ({ session: request.session.toString(), extensionId: request.extensionId, enabled: request.enabled })),
			visibleSwitchChecked: harness.container.querySelector('[aria-label="Enable extension PR Tools"]')?.getAttribute('aria-checked'),
			retainedCanvases: ['PR Review Board', 'Release Notes Draft'].filter(name => accessible.includes(name)),
			canvasSwitches: harness.container.querySelectorAll('.copilot-canvas-tree-item [role="switch"]').length,
		}, {
			requests: [{
				session: harness.frontendSessionResource.toString(),
				extensionId: 'user:pr-tools',
				enabled: false,
			}],
			visibleSwitchChecked: 'false',
			retainedCanvases: ['PR Review Board', 'Release Notes Draft'],
			canvasSwitches: 0,
		});
	});

	test('restores cached children after the Customizations widget is recreated while disabled', async () => {
		const definitions = [
			definition({ canvasId: 'review', extensionId: 'user:pr-tools', extensionSource: 'user', extensionName: 'PR Tools', displayName: 'PR Review Board' }),
			definition({ canvasId: 'release', extensionId: 'user:pr-tools', extensionSource: 'user', extensionName: 'PR Tools', displayName: 'Release Notes Draft' }),
		];
		const storageService = store.add(new InMemoryStorageService());
		const first = createHarness({ definitions, storageService });
		await timeout(20);
		assert.ok(first.widget.getAccessibilityContent().includes('PR Review Board'));
		first.widget.dispose();

		const second = createHarness({
			definitions: [],
			extensionInventory: inventory(definitions, 'disabled'),
			storageService,
		});
		await timeout(100);
		const accessible = second.widget.getAccessibilityContent();

		assert.deepStrictEqual({
			listRequests: second.listRequests.length,
			extensionVisible: accessible.includes('PR Tools'),
			children: ['PR Review Board', 'Release Notes Draft'].filter(name => accessible.includes(name)),
			lastKnown: accessible.includes('Last known:'),
			switchChecked: second.container.querySelector('[aria-label="Enable extension PR Tools"]')?.getAttribute('aria-checked'),
			itemCounts: second.itemCounts,
		}, {
			listRequests: 1,
			extensionVisible: true,
			children: ['PR Review Board', 'Release Notes Draft'],
			lastKnown: true,
			switchChecked: 'false',
			itemCounts: [2],
		});
	});

	test('uses each Canvas frontend target and reveals an existing Canvas', async () => {
		const canvasResource = URI.parse('canvas:/live-preview');
		const harness = createHarness({
			initialCanvases: canvas => [{
				resource: canvasResource,
				instanceId: getCanvasDefinitionInstanceId(canvas),
				title: canvas.displayName,
				source: URI.parse('extension:/live-preview'),
			}],
		});
		await timeout(0);
		const open = harness.container.querySelector<HTMLElement>('.monaco-list-row[aria-label^="Preview."]');
		assert.ok(open);
		open.click();
		await timeout(0);

		assert.deepStrictEqual({
			reveals: harness.reveals,
			openCalls: harness.openCalls,
		}, {
			reveals: [canvasResource.toString()],
			openCalls: 0,
		});
	});

	test('routes input-requiring plugin Canvases to Plugins', async () => {
		const harness = createHarness({
			pluginName: 'Diagram Plugin',
			definitions: [definition({
				canvasId: 'diagram',
				extensionId: 'plugin:diagram:canvas',
				extensionSource: 'plugin',
				extensionName: 'Diagram Plugin',
				displayName: 'Diagram',
				requiresInput: true,
			})],
		});
		await timeout(0);
		const search = harness.container.querySelector<HTMLInputElement>('input[aria-label="Search Canvases"]');
		assert.ok(search);
		search.value = 'Diagram';
		search.dispatchEvent(new InputEvent('input', { bubbles: true }));
		await timeout(0);
		const row = harness.container.querySelector<HTMLElement>('.monaco-list-row[aria-label^="Diagram."]');
		assert.ok(row);
		row.click();

		assert.deepStrictEqual({
			requestedPlugins: harness.requestedPlugins,
			commands: harness.commands,
		}, {
			requestedPlugins: ['Diagram Plugin'],
			commands: [],
		});
	});

	test('ignores a retired Canvas listing for a reactivated owner', async () => {
		const requests: DeferredPromise<readonly ICanvasDefinition[]>[] = [];
		const harness = createHarness({
			listCanvases: () => {
				const request = new DeferredPromise<readonly ICanvasDefinition[]>();
				requests.push(request);
				return request.p;
			},
		});
		await timeout(0);
		assert.strictEqual(requests.length, 1);
		harness.enabled.set(false, undefined);
		harness.enabled.set(true, undefined);
		await timeout(0);
		assert.strictEqual(requests.length, 2);
		requests[0].error(new Error('Retired request failed'));
		await timeout(0);
		requests[1].complete([]);
		await timeout(0);

		assert.deepStrictEqual({
			errorVisible: harness.container.textContent?.includes('Retired request failed'),
			emptyVisible: harness.container.textContent?.includes('No Canvases Available'),
			extensionVisible: harness.container.textContent?.includes('Preview Extension'),
		}, {
			errorVisible: false,
			emptyVisible: false,
			extensionVisible: true,
		});
	});
});
