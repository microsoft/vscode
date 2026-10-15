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
import { ICanvasContext, ICanvasContextService, ICanvasDefinition, ICanvasService } from '../../../../canvases/common/canvas.js';
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
		const requests: { session: URI; result: DeferredPromise<IAgentExtensionInventory> }[] = [];
		let setExtensionEnabled = async () => { };
		const extensionsService = new class extends mock<ICopilotExtensionsService>() {
			override readonly onDidChange = changes.event;
			override listExtensions(session: URI, _token: CancellationToken): Promise<IAgentExtensionInventory> {
				const result = new DeferredPromise<IAgentExtensionInventory>();
				requests.push({ session, result });
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
		return {
			container,
			changes,
			requests,
			sessionResource,
			widget,
			setExtensionEnabled: (handler: () => Promise<void>) => setExtensionEnabled = handler,
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

	test('preserves the focused extension action across inventory refreshes', async () => {
		const harness = createExtensionsHarness();
		harness.requests[0].result.complete(inventory(true));
		await timeout(0);
		const disable = harness.container.querySelector<HTMLButtonElement>('[aria-label="Disable extension Preview"]');
		assert.ok(disable);
		disable.focus();
		harness.changes.fire();
		assert.strictEqual(harness.requests.length, 2);
		assert.strictEqual(DOM.getActiveElement()?.getAttribute('aria-label'), 'Disable extension Preview');
		harness.requests[1].result.complete(inventory(false));
		await timeout(0);

		assert.strictEqual(DOM.getActiveElement()?.getAttribute('aria-label'), 'Enable extension Preview');
	});

	test('restores refresh after an enablement failure without losing focus', async () => {
		const harness = createExtensionsHarness();
		harness.requests[0].result.complete(inventory(true));
		await timeout(0);
		harness.setExtensionEnabled(async () => { throw new Error('Host disconnected'); });
		const disable = harness.container.querySelector<HTMLButtonElement>('[aria-label="Disable extension Preview"]');
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
			canvases: constObservable([]),
			definitionProvider: {
				onDidChangeDefinitions: Event.None,
				async listCanvases() { listCalls++; return [definition]; },
				async openCanvas() { openCalls++; },
			},
		};
		const enabled = observableValue('enabled', false);
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
			override async revealCanvas() { }
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
		await timeout(0);
		const disabledListCalls = listCalls;
		enabled.set(true, undefined);
		await timeout(0);
		const open = container.querySelector<HTMLButtonElement>('[aria-label="Open canvas Preview"]');
		const manage = container.querySelector<HTMLButtonElement>('[aria-label="Manage the provider for canvas Preview"]');
		assert.ok(open && manage);
		manage.click();
		enabled.set(false, undefined);
		await timeout(0);
		open.click();

		assert.deepStrictEqual({
			disabledListCalls,
			enabledListCalls: listCalls,
			openCalls,
			commands,
		}, {
			disabledListCalls: 0,
			enabledListCalls: 1,
			openCalls: 0,
			commands: [{
				id: AICustomizationManagementCommands.OpenEditor,
				args: [{
					section: AICustomizationManagementSection.Extensions,
					sessionResource: frontendSessionResource,
				}],
			}],
		});
	});
});
