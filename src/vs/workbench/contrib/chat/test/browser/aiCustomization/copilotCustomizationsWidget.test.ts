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
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentExtensionInventory } from '../../../../../../platform/agentHost/common/agent.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { getCanvasDefinitionInstanceId, ICanvas, ICanvasContext, ICanvasContextService, ICanvasDefinition, ICanvasReference, ICanvasService } from '../../../../canvases/common/canvas.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { AICustomizationManagementCommands, AICustomizationManagementSection } from '../../../common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService } from '../../../common/customizationHarnessService.js';
import { CopilotCanvasesWidget, CopilotExtensionsWidget } from '../../../browser/aiCustomization/copilotCustomizationsWidget.js';
import { ICopilotExtensionsService } from '../../../browser/aiCustomization/copilotExtensionsService.js';

suite('CopilotCustomizationsWidget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function inventory(enabled: boolean, name = 'Preview'): IAgentExtensionInventory {
		return {
			mode: 'load_and_augment',
			extensions: [{
				id: 'user:preview',
				name,
				resource: URI.file('/extensions/preview/extension.mjs'),
				source: 'user',
				enabled,
			}],
		};
	}

	function createExtensionsHarness() {
		const container = DOM.append(mainWindow.document.body, DOM.$('.copilot-customizations-test'));
		store.add({ dispose: () => container.remove() });
		const sessionResource = observableValue('sessionResource', URI.parse('agent-host-copilotcli:/first'));
		const changes = store.add(new Emitter<void>());
		const requests: { session: URI; token: CancellationToken; result: DeferredPromise<IAgentExtensionInventory> }[] = [];
		let setExtensionEnabled = async () => { };
		const extensionsService = new class extends mock<ICopilotExtensionsService>() {
			override readonly onDidChange = changes.event;
			override listExtensions(session: URI, token: CancellationToken): Promise<IAgentExtensionInventory> {
				const result = new DeferredPromise<IAgentExtensionInventory>();
				requests.push({ session, token, result });
				return result.p;
			}
			override setExtensionEnabled(_session: URI, _extensionId: string, _enabled: boolean): Promise<void> {
				return setExtensionEnabled();
			}
		}();
		const harnessService = new class extends mock<ICustomizationHarnessService>() {
			override readonly activeSessionResource = sessionResource;
		}();
		const instantiationService = workbenchInstantiationService({}, store);
		instantiationService.stub(ICopilotExtensionsService, extensionsService);
		instantiationService.stub(ICustomizationHarnessService, harnessService);
		const widget = store.add(instantiationService.createInstance(CopilotExtensionsWidget, container));
		widget.setVisible(true);
		widget.layout(new DOM.Dimension(900, 600));
		return {
			container,
			changes,
			requests,
			sessionResource,
			widget,
			setExtensionEnabled: (handler: () => Promise<void>) => setExtensionEnabled = handler,
		};
	}

	function createCanvasesHarness(options?: {
		readonly enabled?: boolean;
		readonly initialCanvases?: (definition: ICanvasDefinition) => readonly ICanvas[];
		readonly listCanvases?: () => Promise<readonly ICanvasDefinition[]>;
	}) {
		const container = DOM.append(mainWindow.document.body, DOM.$('.copilot-canvases-test'));
		store.add({ dispose: () => container.remove() });
		const frontendSessionResource = URI.parse('agent-host-copilotcli:/frontend-owner');
		const definition: ICanvasDefinition = {
			canvasId: 'preview',
			extensionId: 'user:preview',
			extensionSource: 'user',
			displayName: 'Preview',
			description: 'Preview canvas',
			requiresInput: false,
		};
		let listCalls = 0;
		let openCalls = 0;
		const context: ICanvasContext = {
			owner: {
				providerId: 'remote/copilotcli',
				session: URI.parse('vendor-session:/opaque-backend'),
				chat: URI.parse('vendor-chat:/opaque-chat'),
			},
			frontendSessionResource,
			canvases: constObservable(options?.initialCanvases?.(definition) ?? []),
			definitionProvider: {
				onDidChangeDefinitions: Event.None,
				async listCanvases() {
					listCalls++;
					return options?.listCanvases ? options.listCanvases() : [definition];
				},
				async openCanvas() { openCalls++; },
			},
		};
		const enabled = observableValue('enabled', options?.enabled ?? false);
		const reveals: string[] = [];
		const canvasContextService = new class extends mock<ICanvasContextService>() {
			override readonly contexts = constObservable([context]);
			override readonly onDidRemoveOwner = Event.None;
			override isOwnerVisible() { return true; }
			override getContext() { return context; }
			override getEditorGroup() { return undefined; }
		}();
		const canvasService = new class extends mock<ICanvasService>() {
			override readonly enabled = enabled;
			override readonly reopenableCanvases = constObservable([]);
			override isOwnerPresentable() { return true; }
			override async revealCanvas(reference: ICanvasReference) { reveals.push(reference.canvas.toString()); }
			override async reopenCanvas() { }
		}();
		const commands: { id: string; args: readonly unknown[] }[] = [];
		const instantiationService = workbenchInstantiationService({}, store);
		instantiationService.stub(ICanvasContextService, canvasContextService);
		instantiationService.stub(ICanvasService, canvasService);
		instantiationService.stub(ICustomizationHarnessService, new class extends mock<ICustomizationHarnessService>() {
			override readonly activeSessionResource = constObservable(URI.parse('agent-host-copilotcli:/unrelated-active'));
		}());
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
			override executeCommand<R = unknown>(id: string, ...args: unknown[]): Promise<R | undefined> {
				commands.push({ id, args });
				return Promise.resolve(undefined);
			}
		}());
		const widget = store.add(instantiationService.createInstance(CopilotCanvasesWidget, container));
		widget.setVisible(true);
		widget.layout(new DOM.Dimension(900, 600));
		return {
			container,
			commands,
			context,
			definition,
			enabled,
			frontendSessionResource,
			get listCalls() { return listCalls; },
			get openCalls() { return openCalls; },
			reveals,
			widget,
		};
	}

	test('keeps Extensions independent of Canvas services and rejects stale inventory', async () => {
		const harness = createExtensionsHarness();
		assert.strictEqual(harness.requests.length, 1);
		harness.sessionResource.set(URI.parse('agent-host-copilotcli:/second'), undefined);
		assert.strictEqual(harness.requests.length, 2);
		harness.requests[0].result.complete(inventory(true, 'Stale Preview'));
		await timeout(0);
		harness.requests[1].result.error(new Error('Second host unavailable'));
		await timeout(0);

		assert.deepStrictEqual({
			sessions: harness.requests.map(request => request.session.toString()),
			staleVisible: harness.container.textContent?.includes('Stale Preview'),
			errorVisible: harness.container.textContent?.includes('Second host unavailable'),
		}, {
			sessions: ['agent-host-copilotcli:/first', 'agent-host-copilotcli:/second'],
			staleVisible: false,
			errorVisible: true,
		});
	});

	test('uses customization tree groups, switches, and a separate refresh action', async () => {
		const harness = createExtensionsHarness();
		harness.requests[0].result.complete({
			mode: 'load_and_augment',
			extensions: [
				...inventory(true).extensions,
				{
					id: 'plugin:diagram',
					name: 'Diagram',
					resource: URI.file('/plugins/diagram/extension.mjs'),
					source: 'plugin',
					pluginName: 'Diagram Plugin',
					enabled: false,
				},
			],
		});
		await timeout(0);
		const renderedRows = [...harness.container.querySelectorAll<HTMLElement>('.copilot-customization-tree-item')];

		assert.deepStrictEqual({
			groups: [...harness.container.querySelectorAll<HTMLElement>('.copilot-customizations-tree .group-label')].map(element => element.textContent),
			switchesPresent: harness.container.querySelector('[role="switch"]') !== null,
			switchCoverage: renderedRows.length > 0 && renderedRows.every(row => row.querySelector('[role="switch"]') !== null),
			refreshInTitle: harness.container.querySelector('.section-title-actions [aria-label="Refresh Copilot extensions"]') !== null,
			refreshInSearch: harness.container.querySelector('.tools-list-search-and-button-container [aria-label="Refresh Copilot extensions"]') !== null,
			standardTreeScrollHost: harness.container.querySelector('.copilot-customizations-tree .monaco-scrollable-element') !== null,
			legacyCardScrollHost: harness.container.querySelector('.plugin-card-scrollable') !== null,
			statusPills: harness.container.querySelectorAll('.plugin-list-item-status').length,
		}, {
			groups: ['User', 'Plugins'],
			switchesPresent: true,
			switchCoverage: true,
			refreshInTitle: true,
			refreshInSearch: false,
			standardTreeScrollHost: true,
			legacyCardScrollHost: false,
			statusPills: 0,
		});
	});

	test('preserves collapsed groups while search temporarily expands matches', async () => {
		const harness = createExtensionsHarness();
		harness.requests[0].result.complete(inventory(true));
		await timeout(0);
		const userGroup = harness.container.querySelector<HTMLElement>('.monaco-list-row[aria-label^="User,"]');
		const search = harness.container.querySelector<HTMLInputElement>('[aria-label="Search Copilot extensions"]');
		assert.ok(userGroup && search);
		userGroup.click();
		await timeout(0);
		assert.strictEqual(userGroup.getAttribute('aria-expanded'), 'false');
		search.value = 'preview';
		search.dispatchEvent(new mainWindow.Event('input', { bubbles: true }));
		await timeout(0);
		search.value = '';
		search.dispatchEvent(new mainWindow.Event('input', { bubbles: true }));
		await timeout(0);

		assert.strictEqual(harness.container.querySelector('.monaco-list-row[aria-label^="User,"]')?.getAttribute('aria-expanded'), 'false');
	});

	test('preserves the focused extension action across inventory refreshes', async () => {
		const harness = createExtensionsHarness();
		harness.requests[0].result.complete(inventory(true));
		await timeout(0);
		const disable = harness.container.querySelector<HTMLElement>('[aria-label="Disable extension Preview"]');
		assert.ok(disable);
		disable.focus();
		harness.changes.fire();
		assert.strictEqual(harness.requests.length, 2);
		assert.strictEqual(DOM.getActiveElement()?.getAttribute('aria-label'), 'Disable extension Preview');
		harness.requests[1].result.complete(inventory(false));
		await timeout(0);

		assert.strictEqual(DOM.getActiveElement()?.getAttribute('aria-label'), 'Enable extension Preview');
	});

	test('leaves switch keyboard activation to the switch control', async () => {
		const harness = createExtensionsHarness();
		harness.requests[0].result.complete(inventory(true));
		await timeout(0);
		let mutations = 0;
		harness.setExtensionEnabled(async () => { mutations++; });
		const disable = harness.container.querySelector<HTMLElement>('[aria-label="Disable extension Preview"]');
		assert.ok(disable);
		disable.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', keyCode: 32, bubbles: true }));
		await timeout(0);

		assert.strictEqual(mutations, 0);
	});

	test('keeps retained extension rows in Accessible View while refreshing', async () => {
		const harness = createExtensionsHarness();
		harness.requests[0].result.complete(inventory(true));
		await timeout(0);
		harness.changes.fire();

		const accessible = harness.widget.getAccessibilityContent();
		harness.requests[1].result.complete(inventory(true));
		await timeout(0);

		assert.deepStrictEqual({
			hasExtension: accessible.includes('Preview'),
			hasLoadingState: accessible.includes('Loading Extensions'),
		}, {
			hasExtension: true,
			hasLoadingState: false,
		});
	});

	test('does not render a pending extension request after disposal', async () => {
		const harness = createExtensionsHarness();
		const request = harness.requests[0];
		harness.widget.dispose();
		request.result.complete(inventory(true));
		await timeout(0);

		assert.deepStrictEqual({
			cancelled: request.token.isCancellationRequested,
			rendered: harness.container.textContent?.includes('Preview'),
		}, {
			cancelled: true,
			rendered: false,
		});
	});

	test('restores refresh after an enablement failure without losing focus', async () => {
		const harness = createExtensionsHarness();
		harness.requests[0].result.complete(inventory(true));
		await timeout(0);
		harness.setExtensionEnabled(async () => { throw new Error('Host disconnected'); });
		const disable = harness.container.querySelector<HTMLElement>('[aria-label="Disable extension Preview"]');
		assert.ok(disable);
		disable.focus();
		disable.click();
		await timeout(20);
		const refresh = harness.container.querySelector<HTMLButtonElement>('[aria-label="Refresh Copilot extensions"]');

		assert.deepStrictEqual({
			refreshEnabled: refresh?.getAttribute('aria-disabled') === 'false',
			focus: DOM.getActiveElement()?.getAttribute('aria-label'),
		}, {
			refreshEnabled: true,
			focus: 'Disable extension Preview',
		});
	});

	test('uses each Canvas frontend target and honors shared Canvas enablement', async () => {
		const harness = createCanvasesHarness();
		await timeout(0);
		const disabledListCalls = harness.listCalls;
		harness.enabled.set(true, undefined);
		await timeout(0);
		const open = harness.container.querySelector<HTMLElement>('.monaco-list-row[aria-label^="Preview."]');
		const manage = harness.container.querySelector<HTMLButtonElement>('[aria-label="Manage the provider for canvas Preview"]');
		assert.ok(open && manage);
		manage.click();
		harness.enabled.set(false, undefined);
		await timeout(0);
		open.click();

		assert.deepStrictEqual({
			disabledListCalls,
			enabledListCalls: harness.listCalls,
			openCalls: harness.openCalls,
			commands: harness.commands,
		}, {
			disabledListCalls: 0,
			enabledListCalls: 1,
			openCalls: 0,
			commands: [{
				id: AICustomizationManagementCommands.OpenEditor,
				args: [{
					section: AICustomizationManagementSection.Extensions,
					sessionResource: harness.frontendSessionResource,
				}],
			}],
		});
	});

	test('ignores a retired Canvas listing for a reactivated owner', async () => {
		const requests: DeferredPromise<readonly ICanvasDefinition[]>[] = [];
		const harness = createCanvasesHarness({
			enabled: true,
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

	test('does not render a pending Canvas listing after disposal', async () => {
		const request = new DeferredPromise<readonly ICanvasDefinition[]>();
		const harness = createCanvasesHarness({
			enabled: true,
			listCanvases: () => request.p,
		});
		await timeout(0);
		harness.widget.dispose();
		request.complete([harness.definition]);
		await timeout(0);

		assert.strictEqual(harness.container.querySelector('.copilot-customization-tree-item'), null);
	});

	test('reveals an existing Canvas instead of reopening its definition', async () => {
		const canvasResource = URI.parse('canvas:/live-preview');
		const harness = createCanvasesHarness({
			enabled: true,
			initialCanvases: definition => [{
				resource: canvasResource,
				instanceId: getCanvasDefinitionInstanceId(definition),
				title: definition.displayName,
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
});
