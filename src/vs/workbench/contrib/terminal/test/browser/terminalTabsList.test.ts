/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spy } from 'sinon';
import { $, append } from '../../../../../base/browser/dom.js';
import { SplitView } from '../../../../../base/browser/ui/splitview/splitview.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, isDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastDeepPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IShellLaunchConfig } from '../../../../../platform/terminal/common/terminal.js';
import { ResourceLabels } from '../../../../browser/labels.js';
import { TestTerminalGroupService, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { ITerminalChatService, ITerminalConfigurationService, ITerminalEditingService, ITerminalGroup, ITerminalGroupService, ITerminalInstance, ITerminalService } from '../../browser/terminal.js';
import { TerminalTabbedView } from '../../browser/terminalTabbedView.js';
import { TerminalTabList, TerminalTabsAccessibilityProvider } from '../../browser/terminalTabsList.js';
import { ITerminalConfiguration } from '../../common/terminal.js';
import '../../browser/media/terminal.css';

function createInstance(instanceId: number, title: string, hostLabel?: string): ITerminalInstance {
	return new class extends mock<ITerminalInstance>() {
		override readonly instanceId = instanceId;
		override readonly title = title;
		override readonly shellLaunchConfig: IShellLaunchConfig = { hostLabel };
	};
}

suite('TerminalTabsAccessibilityProvider', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('labels name the remote host a terminal runs on', () => {
		const local = createInstance(1, 'zsh');
		const remote = createInstance(2, 'bash', 'devbox');
		const split = [createInstance(3, 'node', 'devbox'), createInstance(4, 'zsh')];
		const provider = new TerminalTabsAccessibilityProvider(new class extends mock<ITerminalGroupService>() {
			override getGroupForInstance(instance: ITerminalInstance): ITerminalGroup {
				const terminalInstances = split.includes(instance) ? split : [instance];
				return new class extends mock<ITerminalGroup>() {
					override readonly terminalInstances = terminalInstances;
				};
			}
		});

		assert.deepStrictEqual([local, remote, ...split].map(instance => provider.getAriaLabel(instance)), [
			'Terminal 1 zsh',
			'Terminal 2 bash on devbox',
			'Terminal 3 node on devbox, split 1 of 2',
			'Terminal 4 zsh, split 2 of 2',
		]);
	});
});

suite('TerminalTabbedView', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps the tab list viewport sized when hidden chat terminals change and the pane expands', async () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const registeredTerminal = store.add(new Emitter<ITerminalInstance>());
		const terminal = createInstance(1, 'zsh');
		let hiddenTerminals: ITerminalInstance[] = [];
		instantiationService.stub(ITerminalService, new class extends mock<ITerminalService>() {
			override readonly onAnyInstanceTitleChange = Event.None;
			override readonly onAnyInstanceIconChange = Event.None;
			override readonly onAnyInstancePrimaryStatusChange = Event.None;
			override readonly onDidChangeConnectionState = Event.None;
			override readonly onDidChangeInstances = Event.None;
			override readonly onDidDisposeInstance = Event.None;
			override setContainers(): void { }
			override getPrimaryBackend() { return undefined; }
		});
		instantiationService.stub(ITerminalChatService, new class extends mock<ITerminalChatService>() {
			override readonly onDidRegisterTerminalInstanceWithToolSession = registeredTerminal.event;
			override getToolSessionTerminalInstances() { return hiddenTerminals; }
		});
		instantiationService.stub(ITerminalEditingService, new class extends mock<ITerminalEditingService>() {
			override isEditable() { return false; }
			override getEditableData() { return undefined; }
			override getEditingTerminal() { return undefined; }
		});
		const groupService = new class extends TestTerminalGroupService {
			override getGroupForInstance(instance: ITerminalInstance): ITerminalGroup {
				return new class extends mock<ITerminalGroup>() {
					override readonly terminalInstances = [instance];
				};
			}
		};
		instantiationService.stub(ITerminalGroupService, groupService);
		instantiationService.stub(ITerminalConfigurationService, new class extends mock<ITerminalConfigurationService>() {
			override readonly config = upcastDeepPartial<ITerminalConfiguration>({ tabs: { enabled: true, hideCondition: 'never', location: 'right' } });
		});

		const root = append(document.body, $('.monaco-workbench'));
		root.style.setProperty('--vscode-spacing-size40', '4px');
		store.add(toDisposable(() => root.remove()));
		const container = append(root, $('.pane-body.integrated-terminal'));
		container.style.width = '500px';
		container.style.height = '200px';
		const createInstanceSpy = spy(instantiationService, 'createInstance');
		store.add(toDisposable(() => createInstanceSpy.restore()));
		const view = store.add(instantiationService.createInstance(TerminalTabbedView, container));
		// Clean up existing unowned list and sash disposables without changing their production lifecycle.
		for (const result of createInstanceSpy.returnValues) {
			if (isDisposable(result) && (result instanceof ResourceLabels || result.constructor.name === 'TerminalTabsDragAndDrop')) {
				store.add(result);
			}
		}
		const sashDisposables = Reflect.get(view, '_sashDisposables');
		if (Array.isArray(sashDisposables)) {
			for (const disposable of sashDisposables) {
				if (isDisposable(disposable)) {
					store.add(disposable);
				}
			}
		}
		const splitView = Reflect.get(view, '_splitView');
		assert.ok(splitView instanceof SplitView);
		store.add(splitView);
		const list = Reflect.get(view, '_tabList');
		assert.ok(list instanceof TerminalTabList);
		view.layout(500, 200);

		const tabs = container.querySelector<HTMLElement>('.tabs-container');
		const listElement = container.querySelector<HTMLElement>('.tabs-list');
		assert.ok(tabs && listElement);
		groupService.instances = Array.from({ length: 20 }, (_, index) => new class extends mock<ITerminalInstance>() {
			override readonly instanceId = index + 1;
			override readonly title = `Terminal ${index + 1}`;
			override readonly resource = URI.from({ scheme: Schemas.vscodeTerminal, path: `/${index + 1}` });
			override readonly icon = Codicon.terminal;
			override readonly shellLaunchConfig: IShellLaunchConfig = {};
			override readonly statusList = upcastDeepPartial<ITerminalInstance['statusList']>({ statuses: [] });
		});
		list.refresh();
		list.reveal(19);
		const measure = () => ({
			gap: listElement.getBoundingClientRect().top - tabs.getBoundingClientRect().top,
			viewport: list.renderHeight,
			height: listElement.clientHeight
		});
		const withoutChat = measure();
		hiddenTerminals = [terminal];
		registeredTerminal.fire(terminal);
		const withChat = measure();
		hiddenTerminals = [];
		registeredTerminal.fire(terminal);
		const restored = measure();
		assert.deepStrictEqual([withoutChat, withChat, restored], [
			{ gap: 4, viewport: 196, height: 196 },
			{ gap: 4, viewport: 174, height: 174 },
			{ gap: 4, viewport: 196, height: 196 }
		]);
		list.reveal(19);
		const lastRow = listElement.querySelector<HTMLElement>('.monaco-list-row[data-index="19"]');
		assert.ok(lastRow && list.scrollTop > 0 && lastRow.getBoundingClientRect().bottom <= listElement.getBoundingClientRect().bottom);

		container.style.height = '0px';
		view.layout(500, 200);
		assert.strictEqual(list.renderHeight, 0);
		const expanded = Event.toPromise(Event.filter(list.onDidScroll, e => e.heightChanged && e.height === 196), store.add(new DisposableStore()));
		container.style.transition = 'height 80ms linear';
		container.style.height = '200px';
		// The list measures its rounded offsetHeight, so it can report 196 while the box is still a fraction of a pixel short.
		await Promise.all([expanded, ...container.getAnimations().map(animation => animation.finished)]);
		assert.strictEqual(list.renderHeight, listElement.clientHeight);
		list.reveal(19);
		const lastRowAfterExpansion = listElement.querySelector<HTMLElement>('.monaco-list-row[data-index="19"]');
		assert.ok(lastRowAfterExpansion && lastRowAfterExpansion.getBoundingClientRect().bottom <= listElement.getBoundingClientRect().bottom);
	});
});
