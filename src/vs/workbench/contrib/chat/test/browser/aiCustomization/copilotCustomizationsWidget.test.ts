/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as DOM from '../../../../../../base/browser/dom.js';
import { IContextMenuDelegate } from '../../../../../../base/browser/contextmenu.js';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { IAction, Separator } from '../../../../../../base/common/actions.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentExtensionInventory } from '../../../../../../platform/agentHost/common/agent.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { getCanvasDefinitionInstanceId, ICanvas, ICanvasContext, ICanvasContextService, ICanvasDefinition, ICanvasReference, ICanvasService } from '../../../../canvases/common/canvas.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { AICustomizationManagementCommands } from '../../../common/aiCustomizationWorkspaceService.js';
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
				...(canvas.extensionSource === 'plugin' ? { pluginName: canvas.extensionName, resource: URI.file(`/plugins/${canvas.extensionName}/extension.mjs`) } : {}),
			});
		}
		return { mode: 'load_and_augment', extensions: [...extensions.values()] };
	}

	function createHarness(options?: {
		readonly definitions?: readonly ICanvasDefinition[];
		readonly initialCanvases?: (definition: ICanvasDefinition) => readonly ICanvas[];
		readonly listCanvases?: () => Promise<readonly ICanvasDefinition[]>;
		readonly extensionInventory?: IAgentExtensionInventory;
		readonly storageService?: IStorageService;
		readonly visible?: boolean;
		readonly contextAvailable?: boolean;
		readonly ownerSuffix?: string;
		readonly mutationGate?: Promise<void>;
		readonly plugins?: readonly IAgentPlugin[];
	}) {
		const container = DOM.append(mainWindow.document.body, DOM.$('.copilot-canvases-test.ai-customization-management-editor'));
		container.style.width = '900px';
		container.style.height = '900px';
		store.add({ dispose: () => container.remove() });
		const ownerSuffix = options?.ownerSuffix ?? 'owner';
		const frontendSessionResource = URI.parse(`agent-host-copilotcli:/frontend-${ownerSuffix}`);
		let definitions = options?.definitions ?? [definition()];
		let extensionInventory = options?.extensionInventory ?? inventory(definitions);
		const definitionsChanged = store.add(new Emitter<void>());
		let listCalls = 0;
		let openCalls = 0;
		const context: ICanvasContext = {
			owner: {
				providerId: 'remote/copilotcli',
				session: URI.parse(`vendor-session:/opaque-${ownerSuffix}`),
				chat: URI.parse(`vendor-chat:/opaque-${ownerSuffix}`),
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
		const contexts = observableValue<readonly ICanvasContext[]>('contexts', options?.contextAvailable === false ? [] : [context]);
		const reveals: string[] = [];
		const canvasContextService = new class extends mock<ICanvasContextService>() {
			override readonly contexts = contexts;
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
		const extensionsService = new class extends mock<ICopilotExtensionsService>() {
			override async listExtensions(session: URI, token: CancellationToken): Promise<IAgentExtensionInventory> {
				listRequests.push({ session, token });
				return extensionInventory;
			}
			override async setExtensionEnabled(session: URI, extensionId: string, value: boolean): Promise<void> {
				await options?.mutationGate;
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
				definitionsChanged.fire();
			}
		}();
		const commands: { id: string; args: readonly unknown[] }[] = [];
		const openedLinks: string[] = [];
		const notifications: string[] = [];
		const plugins = observableValue<readonly IAgentPlugin[]>('plugins', options?.plugins ?? []);
		const menuActions: IAction[] = [];
		let hideMenu = () => { };
		const instantiationService = workbenchInstantiationService({}, store);
		instantiationService.stub(ICanvasContextService, canvasContextService);
		instantiationService.stub(ICanvasService, canvasService);
		instantiationService.stub(ICopilotExtensionsService, extensionsService);
		instantiationService.stub(IOpenerService, new class extends mock<IOpenerService>() {
			override async open(resource: URI | string): Promise<boolean> {
				openedLinks.push(resource.toString());
				return true;
			}
		}());
		if (options?.storageService) {
			instantiationService.stub(IStorageService, options.storageService);
		}
		instantiationService.stub(IAgentPluginService, new class extends mock<IAgentPluginService>() {
			override readonly plugins = plugins;
		}());
		instantiationService.stub(INotificationService, new class extends mock<INotificationService>() {
			override info(message: string): void { notifications.push(message); }
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
		let closeCalls = 0;
		widget.setCloseCustomizationEditor(async () => {
			closeCalls++;
			return true;
		});
		const itemCounts: number[] = [];
		store.add(widget.onDidChangeItemCount(count => itemCounts.push(count)));
		if (options?.visible !== false) {
			widget.setVisible(true);
		}
		widget.layout(new DOM.Dimension(900, 900));
		return {
			container,
			commands,
			openedLinks,
			notifications,
			plugins,
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
			get closeCalls() { return closeCalls; },
			reveals,
			itemCounts,
			setContextAvailable(value: boolean) { contexts.set(value ? [context] : [], undefined); },
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
		const userSwitchVisible = harness.container.querySelector('[aria-label="Disable canvas extension \'Preview Extension\'"]')?.checkVisibility();
		const canvasRows = [...harness.container.querySelectorAll<HTMLElement>('.copilot-canvas-tree-item')];
		const visibleTreeLevels = [...harness.container.querySelectorAll<HTMLElement>('.copilot-customizations-tree .monaco-list-row')]
			.map(row => row.getAttribute('aria-level'));
		const accessible = harness.widget.getAccessibilityContent();
		const search = harness.container.querySelector<HTMLInputElement>('input[aria-label="Search Canvases"]');
		assert.ok(search);
		search.value = 'Workspace Tools';
		search.dispatchEvent(new InputEvent('input', { bubbles: true }));
		await timeout(0);
		const workspaceSwitch = harness.container.querySelector<HTMLElement>('[aria-label="Disable canvas extension \'Workspace Tools\'"]');
		assert.ok(workspaceSwitch);
		workspaceSwitch.closest<HTMLElement>('.monaco-list-row')?.click();
		const workspaceSwitchVisible = workspaceSwitch.checkVisibility();
		const workspaceSwitchTabIndex = workspaceSwitch.tabIndex;
		const workspaceDetail = harness.container.querySelector('.copilot-canvas-extension-tree-item .copilot-customization-tree-detail')?.textContent;
		search.value = 'Diagram Plugin';
		search.dispatchEvent(new InputEvent('input', { bubbles: true }));
		await timeout(0);
		const pluginSwitchVisible = harness.container.querySelector('[aria-label="Disable canvas extension \'Diagram Plugin\'"]')?.checkVisibility();

		assert.deepStrictEqual({
			allSourceGroupsAccessible: ['User', 'Workspace', 'Plugins'].every(group => accessible.includes(`${group}. 1 canvas extensions.`)),
			allExtensionsAccessible: ['Preview Extension', 'Workspace Tools', 'Diagram Plugin'].every(extension => accessible.includes(extension)),
			allCanvasesAccessible: ['Preview', 'Workspace Board', 'Diagram Board'].every(canvas => accessible.includes(canvas)),
			userSwitchVisible,
			workspaceSwitchVisible,
			workspaceSwitchTabIndex,
			pluginSwitchVisible,
			workspaceDetail,
			workspaceEnablementExplanation: accessible.includes('Workspace canvas extension enablement is not available.'),
			extensionSourceIcons: extensionRows.filter(row => row.querySelector('.copilot-customization-tree-icon') !== null).length,
			canvasSwitches: canvasRows.filter(row => row.querySelector('[role="switch"]') !== null).length,
			sharedMoreButtonStyles: [...harness.container.querySelectorAll<HTMLElement>('[data-customization-action="more"]')]
				.every(button => button.classList.contains('plugin-card-icon-button')),
			visibleTreeLevelsValid: visibleTreeLevels.length > 0 && visibleTreeLevels.every(level => level === '1' || level === '2' || level === '3'),
			refreshButton: harness.container.querySelector('[aria-label="Refresh Registered Canvases"]') !== null,
			listTarget: harness.listRequests.map(request => request.session.toString()),
			itemCounts: harness.itemCounts,
		}, {
			allSourceGroupsAccessible: true,
			allExtensionsAccessible: true,
			allCanvasesAccessible: true,
			userSwitchVisible: true,
			workspaceSwitchVisible: false,
			workspaceSwitchTabIndex: -1,
			pluginSwitchVisible: true,
			workspaceDetail: 'Workspace Canvas Extension',
			workspaceEnablementExplanation: true,
			extensionSourceIcons: 0,
			canvasSwitches: 0,
			sharedMoreButtonStyles: true,
			visibleTreeLevelsValid: true,
			refreshButton: false,
			listTarget: [harness.frontendSessionResource.toString()],
			itemCounts: [3],
		});
	});

	test('expands groups and extensions without retaining a previous selection', async () => {
		const harness = createHarness({
			definitions: [
				definition(),
				definition({ extensionId: 'plugin:diagram', extensionSource: 'plugin', extensionName: 'Diagram Plugin' }),
			],
		});
		await timeout(0);
		const row = (name: string) => {
			const element = harness.container.querySelector<HTMLElement>(`.monaco-list-row[aria-label^="${name}"]`);
			assert.ok(element);
			return element;
		};
		const click = (name: string, selector: string) => {
			const target = row(name).querySelector<HTMLElement>(selector);
			assert.ok(target);
			target.click();
			return row(name).getAttribute('aria-expanded');
		};

		const userCollapsed = click('User,', '.group-label');
		const pluginsCollapsed = click('Plugins,', '.monaco-tl-twistie');
		const pluginsExpanded = click('Plugins,', '.monaco-tl-twistie');
		const userStillSelected = row('User,').getAttribute('aria-selected');
		const pluginsFocused = row('Plugins,').classList.contains('focused');
		const pluginsSelected = row('Plugins,').getAttribute('aria-selected');
		const extensionCollapsed = click('Diagram Plugin.', '.copilot-customization-tree-label');
		const extensionExpanded = click('Diagram Plugin.', '.monaco-tl-twistie');

		assert.deepStrictEqual({
			userCollapsed, pluginsCollapsed, pluginsExpanded, userStillSelected, pluginsFocused, pluginsSelected,
			extensionCollapsed, extensionExpanded,
			selectedRows: harness.container.querySelectorAll('.monaco-list-row.selected').length,
		}, {
			userCollapsed: 'false', pluginsCollapsed: 'false', pluginsExpanded: 'true',
			userStillSelected: 'false', pluginsFocused: true, pluginsSelected: 'true',
			extensionCollapsed: 'false', extensionExpanded: 'true',
			selectedRows: 1,
		});
	});

	test('opens Canvas documentation from the subtitle', () => {
		const harness = createHarness({ contextAvailable: false });
		const link = harness.container.querySelector<HTMLAnchorElement>('.section-title-description a');
		assert.ok(link);
		link.click();

		assert.deepStrictEqual({
			description: harness.container.querySelector('.section-title-description-text')?.textContent,
			label: link.textContent,
			href: link.href,
			openedLinks: harness.openedLinks,
		}, {
			description: 'Canvases are interactive visual surfaces shared by you and the agent.',
			label: 'Learn more about canvases',
			href: 'https://code.visualstudio.com/docs/agents/run/agent-harnesses#_use-canvases-with-the-copilot-harness',
			openedLinks: ['https://code.visualstudio.com/docs/agents/run/agent-harnesses#_use-canvases-with-the-copilot-harness'],
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
				'Canvases are only available inside a session',
				'Select an active Copilot session and then open this Customizations menu again',
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

	test('shows No Canvases Reported only while an empty inventory extension is enabled', async () => {
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
		const enabledDetail = harness.container.querySelector('.copilot-canvas-extension-tree-item .copilot-customization-tree-detail')?.textContent;
		const enabledDetailParts = {
			plugin: harness.container.querySelector('.copilot-customization-tree-source-link')?.textContent,
			separator: harness.container.querySelector('.copilot-customization-tree-detail-separator')?.textContent,
			status: harness.container.querySelector('.copilot-customization-tree-detail-text')?.textContent,
		};
		const disable = harness.container.querySelector<HTMLElement>('[aria-label="Disable canvas extension \'microsoft-foundry\'"]');
		assert.ok(disable);
		disable.click();
		await timeout(0);

		assert.deepStrictEqual({
			accessible: harness.widget.getAccessibilityContent().includes('microsoft-foundry'),
			label: harness.container.querySelector('.copilot-canvas-extension-tree-item .copilot-customization-tree-label')?.textContent,
			enabledDetail,
			enabledDetailParts,
			disabledDetail: harness.container.querySelector('.copilot-canvas-extension-tree-item .copilot-customization-tree-detail')?.textContent,
			canvasRows: harness.container.querySelectorAll('.copilot-canvas-tree-item').length,
			itemCounts: harness.itemCounts,
		}, {
			accessible: true,
			label: 'microsoft-foundry',
			enabledDetail: 'Plugin: microsoft-foundry·No Canvases Reported',
			enabledDetailParts: {
				plugin: 'Plugin: microsoft-foundry',
				separator: '·',
				status: 'No Canvases Reported',
			},
			disabledDetail: 'Plugin: microsoft-foundry',
			canvasRows: 0,
			itemCounts: [0],
		});
	});

	test('loads its item count before the section becomes visible', async () => {
		const harness = createHarness({ visible: false });
		await timeout(20);
		const rowsBeforeVisible = harness.container.querySelectorAll('.monaco-list-row').length;
		harness.widget.setVisible(true);
		harness.widget.layout(new DOM.Dimension(900, 900));
		await timeout(20);

		assert.deepStrictEqual({
			listRequests: harness.listRequests.length,
			itemCounts: harness.itemCounts,
			rowsBeforeVisible,
		}, {
			listRequests: 1,
			itemCounts: [1],
			rowsBeforeVisible: 0,
		});
	});

	test('opens the Canvas extension folder from the extension menu', async () => {
		const harness = createHarness();
		await timeout(0);
		const more = harness.container.querySelector<HTMLElement>('[aria-label="More Actions for Canvas Extension \'Preview Extension\'"]');
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

	test('does not offer a local folder action for a remote extension resource', async () => {
		const harness = createHarness({
			extensionInventory: {
				mode: 'load_and_augment',
				extensions: [{
					id: 'user:preview',
					name: 'Preview Extension',
					resource: URI.parse('vscode-agent-host:/extensions/preview/extension.mjs'),
					source: 'user',
					status: 'running',
				}],
			},
		});
		await timeout(0);
		const more = harness.container.querySelector<HTMLElement>('[aria-label="More Actions for Canvas Extension \'Preview Extension\'"]');
		assert.ok(more);
		more.click();

		assert.deepStrictEqual(harness.menuActions.map(action => action.label), ['Disable Canvas Extension']);
		harness.hideMenu();
	});

	test('does not restore mutation focus after the user moves to search', async () => {
		const gate = new DeferredPromise<void>();
		const harness = createHarness({ mutationGate: gate.p });
		await timeout(0);
		const disable = harness.container.querySelector<HTMLElement>('[aria-label="Disable canvas extension \'Preview Extension\'"]');
		const search = harness.container.querySelector<HTMLInputElement>('input[aria-label="Search Canvases"]');
		assert.ok(disable);
		assert.ok(search);
		disable.focus();
		disable.click();
		await timeout(0);
		search.focus();
		gate.complete();
		await timeout(20);

		assert.strictEqual(mainWindow.document.activeElement, search);
	});

	test('disables only at the extension parent and retains its Canvas children', async () => {
		const harness = createHarness({
			definitions: [
				definition({ canvasId: 'review', extensionId: 'user:pr-tools', extensionSource: 'user', extensionName: 'PR Tools', displayName: 'PR Review Board' }),
				definition({ canvasId: 'release', extensionId: 'user:pr-tools', extensionSource: 'user', extensionName: 'PR Tools', displayName: 'Release Notes Draft' }),
			],
		});
		await timeout(0);
		const disable = harness.container.querySelector<HTMLElement>('[aria-label="Disable canvas extension \'PR Tools\'"]');
		assert.ok(disable);
		disable.click();
		await timeout(20);
		const accessible = harness.widget.getAccessibilityContent();

		assert.deepStrictEqual({
			requests: harness.setRequests.map(request => ({ session: request.session.toString(), extensionId: request.extensionId, enabled: request.enabled })),
			visibleSwitchChecked: harness.container.querySelector('[aria-label="Enable canvas extension \'PR Tools\'"]')?.getAttribute('aria-checked'),
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
			switchChecked: second.container.querySelector('[aria-label="Enable canvas extension \'PR Tools\'"]')?.getAttribute('aria-checked'),
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

	test('keeps cached definitions isolated between chat owners with the same extension id', async () => {
		const storageService = store.add(new InMemoryStorageService());
		const first = createHarness({ ownerSuffix: 'first', storageService });
		await timeout(20);
		first.widget.dispose();

		const second = createHarness({
			ownerSuffix: 'second',
			definitions: [],
			extensionInventory: inventory([definition()], 'running'),
			storageService,
		});
		await timeout(20);
		second.widget.dispose();

		const restored = createHarness({
			ownerSuffix: 'first',
			definitions: [],
			extensionInventory: inventory([definition()], 'disabled'),
			storageService,
		});
		await timeout(20);

		const accessible = restored.widget.getAccessibilityContent();
		assert.deepStrictEqual({
			canvas: accessible.includes('Preview. Last known:'),
			lastKnown: accessible.includes('Last known:'),
		}, {
			canvas: true,
			lastKnown: true,
		});
	});

	test('removes cached children after a running extension authoritatively reports none', async () => {
		const storageService = store.add(new InMemoryStorageService());
		const first = createHarness({ storageService });
		await timeout(20);
		first.widget.dispose();

		const refreshed = createHarness({
			definitions: [],
			extensionInventory: inventory([definition()], 'running'),
			storageService,
		});
		await timeout(20);
		refreshed.widget.fireItemCount();
		const accessible = refreshed.widget.getAccessibilityContent();

		assert.deepStrictEqual({
			canvas: accessible.includes('Preview. Last known:'),
			lastKnown: accessible.includes('Last known:'),
			itemCounts: refreshed.itemCounts,
		}, {
			canvas: false,
			lastKnown: false,
			itemCounts: [0],
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
			selected: open.getAttribute('aria-selected'),
			reveals: harness.reveals,
			openCalls: harness.openCalls,
			closeCalls: harness.closeCalls,
		}, {
			selected: 'true',
			reveals: [],
			openCalls: 0,
			closeCalls: 0,
		});

		open.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 }));
		await timeout(0);

		assert.deepStrictEqual({
			reveals: harness.reveals,
			openCalls: harness.openCalls,
			closeCalls: harness.closeCalls,
		}, {
			reveals: [canvasResource.toString()],
			openCalls: 0,
			closeCalls: 1,
		});
	});

	test('does not run a retained Canvas action after its owner retires', async () => {
		const harness = createHarness();
		await timeout(0);
		const more = harness.container.querySelector<HTMLElement>('[aria-label="More Actions for Canvas Preview"]');
		assert.ok(more);
		more.click();
		const show = harness.menuActions.find(action => action.id === 'canvas.show' && action.label === 'Open Canvas');
		assert.ok(show);

		harness.setContextAvailable(false);
		await timeout(0);
		await show.run();
		harness.hideMenu();

		assert.strictEqual(harness.openCalls, 0);
	});

	test('opens the owning plugin details rather than a same-named plugin', async () => {
		const pluginUri = URI.file('/plugins/Diagram Plugin');
		const harness = createHarness({
			plugins: [
				new class extends mock<IAgentPlugin>() {
					override readonly uri = URI.file('/plugins/other');
					override readonly label = 'Diagram Plugin';
				}(),
				new class extends mock<IAgentPlugin>() {
					override readonly uri = pluginUri;
					override readonly label = 'Diagram Plugin';
				}(),
			],
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
		row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 }));

		const pluginLink = harness.container.querySelector<HTMLAnchorElement>('[aria-label="Open plugin details for Diagram Plugin"]');
		assert.ok(pluginLink);
		const pluginLinkTabIndexBeforeFocus = pluginLink.tabIndex;
		pluginLink.closest<HTMLElement>('.monaco-list-row')?.click();
		const pluginLinkTabIndexAfterFocus = pluginLink.tabIndex;
		pluginLink.click();

		const more = harness.container.querySelector<HTMLElement>('[aria-label="More Actions for Canvas Extension \'Diagram Plugin\'"]');
		assert.ok(more);
		more.click();
		const show = harness.menuActions.find(action => action.id === 'canvas.showPlugin');
		assert.ok(show);
		const menuOrder = harness.menuActions.filter(action => action.id !== Separator.ID).map(action => action.label);
		await show.run();
		harness.plugins.set([], undefined);
		await show.run();
		harness.hideMenu();

		const command = {
			id: AICustomizationManagementCommands.ShowPlugin,
			args: [{ pluginUri }],
		};
		assert.deepStrictEqual({
			pluginLink: {
				label: pluginLink.textContent,
				href: pluginLink.getAttribute('href'),
				sourceLink: pluginLink.classList.contains('source-link'),
				tabIndexBeforeFocus: pluginLinkTabIndexBeforeFocus,
				tabIndexAfterFocus: pluginLinkTabIndexAfterFocus,
			},
			menuOrder,
			commands: harness.commands,
			notifications: harness.notifications,
		}, {
			pluginLink: {
				label: 'Plugin: Diagram Plugin',
				href: '#',
				sourceLink: true,
				tabIndexBeforeFocus: -1,
				tabIndexAfterFocus: 0,
			},
			menuOrder: ['Disable Canvas Extension', 'Show Plugin'],
			commands: [command, command, command],
			notifications: ['Plugin details for Diagram Plugin are not available in this window.'],
		});
	});

	test('does not guess a plugin from its name or another host', async () => {
		const harness = createHarness({
			definitions: [definition({ extensionId: 'plugin:diagram', extensionSource: 'plugin', extensionName: 'Diagram Plugin' })],
			plugins: [
				new class extends mock<IAgentPlugin>() {
					override readonly uri = URI.from({ scheme: 'vscode-remote', authority: 'other-host', path: '/plugins/Diagram Plugin' });
					override readonly label = 'Diagram Plugin';
				}(),
			],
		});
		await timeout(0);
		const pluginLink = harness.container.querySelector<HTMLAnchorElement>('[aria-label="Open plugin details for Diagram Plugin"]');
		assert.ok(pluginLink);
		pluginLink.click();

		assert.deepStrictEqual({ link: pluginLink.textContent, commands: harness.commands, notifications: harness.notifications }, {
			link: 'Plugin: Diagram Plugin',
			commands: [],
			notifications: ['Plugin details for Diagram Plugin are not available in this window.'],
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
