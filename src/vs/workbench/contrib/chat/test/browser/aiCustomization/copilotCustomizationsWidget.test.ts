/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as DOM from '../../../../../../base/browser/dom.js';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentExtensionInventory } from '../../../../../../platform/agentHost/common/agent.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfirmation, IConfirmationResult, IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
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
			const extensionId = canvas.extensionSource === 'session'
				? `session:test-session-1:${canvas.extensionId.replace(/^session:/, '')}`
				: canvas.extensionId;
			extensions.set(extensionId, {
				id: extensionId,
				name: canvas.extensionName ?? canvas.extensionId,
				source: canvas.extensionSource === 'unknown' ? 'user' : canvas.extensionSource,
				status,
				enabled: status !== 'disabled',
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
		readonly confirmDisable?: boolean;
		readonly pluginName?: string;
	}) {
		const container = DOM.append(mainWindow.document.body, DOM.$('.copilot-canvases-test'));
		store.add({ dispose: () => container.remove() });
		const frontendSessionResource = URI.parse('agent-host-copilotcli:/frontend-owner');
		let definitions = options?.definitions ?? [definition()];
		let extensionInventory = inventory(definitions);
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
			override readonly contexts = constObservable([context]);
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
						enabled: value,
					} : extension),
				};
				if (!value) {
					definitions = definitions.filter(canvas => canvas.extensionId !== extensionId);
				}
				extensionsChanged.fire();
				definitionsChanged.fire();
			}
		}();
		const confirmations: IConfirmation[] = [];
		const commands: { id: string; args: readonly unknown[] }[] = [];
		const instantiationService = workbenchInstantiationService({}, store);
		instantiationService.stub(ICanvasContextService, canvasContextService);
		instantiationService.stub(ICanvasService, canvasService);
		instantiationService.stub(ICopilotExtensionsService, extensionsService);
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
		instantiationService.stub(IDialogService, new class extends mock<IDialogService>() {
			override confirm(confirmation: IConfirmation): Promise<IConfirmationResult> {
				confirmations.push(confirmation);
				return Promise.resolve({ confirmed: options?.confirmDisable ?? true });
			}
		}());
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
			override executeCommand<R = unknown>(id: string, ...args: unknown[]): Promise<R | undefined> {
				commands.push({ id, args });
				return Promise.resolve(undefined);
			}
		}());
		const widget = store.add(instantiationService.createInstance(CopilotCanvasesWidget, container));
		const itemCounts: number[] = [];
		const requestedPlugins: string[] = [];
		store.add(widget.onDidChangeItemCount(count => itemCounts.push(count)));
		store.add(widget.onDidRequestShowPlugin(item => requestedPlugins.push(item.name)));
		widget.setVisible(true);
		widget.layout(new DOM.Dimension(900, 900));
		return {
			container,
			commands,
			confirmations,
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

	test('groups Canvases by source with per-row switches and contextual actions', async () => {
		const harness = createHarness({
			definitions: [
				definition(),
				definition({ canvasId: 'workspace', extensionId: 'project:workspace', extensionSource: 'project', extensionName: 'Workspace Tools', displayName: 'Workspace Board' }),
				definition({ canvasId: 'session', extensionId: 'session:one:temporary', extensionSource: 'session', extensionName: 'Temporary Tools', displayName: 'Session Board' }),
				definition({ canvasId: 'plugin', extensionId: 'plugin:diagram:canvas', extensionSource: 'plugin', extensionName: 'Diagram Plugin', displayName: 'Diagram Board' }),
			],
		});
		await timeout(0);
		const rows = [...harness.container.querySelectorAll<HTMLElement>('.copilot-canvas-tree-item')];
		const accessible = harness.widget.getAccessibilityContent();

		assert.deepStrictEqual({
			allGroupsAccessible: ['User', 'Workspace', 'Session', 'Plugins'].every(group => accessible.includes(group)),
			allCanvasesAccessible: ['Preview', 'Workspace Board', 'Session Board', 'Diagram Board'].every(canvas => accessible.includes(canvas)),
			switchCoverage: rows.every(row => row.querySelector('[role="switch"]') !== null),
			moreCoverage: rows.every(row => row.querySelector('[aria-label^="More Actions for"]') !== null),
			refreshInTitle: harness.container.querySelector('.section-title-actions [aria-label="Refresh Registered Canvases"]') !== null,
			refreshInSearch: harness.container.querySelector('.tools-list-search-and-button-container [aria-label="Refresh Registered Canvases"]') !== null,
			copilotExtensionsHeading: harness.container.textContent?.includes('Copilot Extensions'),
			listTarget: harness.listRequests.map(request => request.session.toString()),
			itemCounts: harness.itemCounts,
		}, {
			allGroupsAccessible: true,
			allCanvasesAccessible: true,
			switchCoverage: true,
			moreCoverage: true,
			refreshInTitle: true,
			refreshInSearch: false,
			copilotExtensionsHeading: false,
			listTarget: [harness.frontendSessionResource.toString()],
			itemCounts: [4],
		});
	});

	test('confirms sibling impact and retains disabled Canvas rows', async () => {
		const harness = createHarness({
			definitions: [
				definition({ canvasId: 'review', extensionId: 'project:pr-tools', extensionSource: 'project', extensionName: 'PR Tools', displayName: 'PR Review Board' }),
				definition({ canvasId: 'release', extensionId: 'project:pr-tools', extensionSource: 'project', extensionName: 'PR Tools', displayName: 'Release Notes Draft' }),
			],
		});
		await timeout(0);
		const disable = harness.container.querySelector<HTMLElement>('[aria-label="Disable canvas PR Review Board"]');
		assert.ok(disable);
		disable.click();
		await timeout(20);

		assert.deepStrictEqual({
			confirmation: harness.confirmations.map(confirmation => ({ message: confirmation.message, detail: confirmation.detail })),
			requests: harness.setRequests.map(request => ({ session: request.session.toString(), extensionId: request.extensionId, enabled: request.enabled })),
			rows: [...harness.container.querySelectorAll<HTMLElement>('.copilot-canvas-tree-item')].map(row => ({
				name: row.querySelector('.copilot-customization-tree-label')?.textContent,
				checked: row.querySelector('[role="switch"]')?.getAttribute('aria-checked'),
			})),
		}, {
			confirmation: [{
				message: 'Disable \'PR Review Board\'?',
				detail: 'This also disables Release Notes Draft, because both canvases come from the Copilot extension \'PR Tools\'.',
			}],
			requests: [{
				session: harness.frontendSessionResource.toString(),
				extensionId: 'project:pr-tools',
				enabled: false,
			}],
			rows: [
				{ name: 'PR Review Board', checked: 'false' },
				{ name: 'Release Notes Draft', checked: 'false' },
			],
		});
	});

	test('restores a cancelled sibling disable without mutating the extension', async () => {
		const harness = createHarness({
			confirmDisable: false,
			definitions: [
				definition({ canvasId: 'one', displayName: 'One' }),
				definition({ canvasId: 'two', displayName: 'Two' }),
			],
		});
		await timeout(0);
		const disable = harness.container.querySelector<HTMLElement>('[aria-label="Disable canvas One"]');
		assert.ok(disable);
		disable.click();
		await timeout(0);

		assert.deepStrictEqual({
			requests: harness.setRequests.length,
			checked: harness.container.querySelector('[aria-label="Disable canvas One"]')?.getAttribute('aria-checked'),
		}, {
			requests: 0,
			checked: 'true',
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

	test('uses the exact session extension inventory id for enablement', async () => {
		const harness = createHarness({
			definitions: [definition({
				canvasId: 'temporary',
				extensionId: 'session:temporary',
				extensionSource: 'session',
				extensionName: 'Temporary',
				displayName: 'Temporary Canvas',
			})],
		});
		await timeout(0);
		const disable = harness.container.querySelector<HTMLElement>('[aria-label="Disable canvas Temporary Canvas"]');
		assert.ok(disable);
		disable.click();
		await timeout(0);

		assert.deepStrictEqual(harness.setRequests.map(request => ({
			session: request.session.toString(),
			extensionId: request.extensionId,
			enabled: request.enabled,
		})), [{
			session: harness.frontendSessionResource.toString(),
			extensionId: 'session:test-session-1:temporary',
			enabled: false,
		}]);
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
		harness.widget.setVisible(false);
		harness.widget.setVisible(true);
		await timeout(0);
		assert.strictEqual(requests.length, 2);
		requests[0].error(new Error('Retired request failed'));
		await timeout(0);
		requests[1].complete([]);
		await timeout(0);

		assert.deepStrictEqual({
			errorVisible: harness.container.textContent?.includes('Retired request failed'),
			emptyVisible: harness.container.textContent?.includes('No Canvases Found'),
		}, {
			errorVisible: false,
			emptyVisible: true,
		});
	});
});
