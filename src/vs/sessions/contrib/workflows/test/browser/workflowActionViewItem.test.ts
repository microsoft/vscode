/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Action } from '../../../../../base/common/actions.js';
import { timeout } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IActionViewItemFactory, IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { IMenuService, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { WorkflowProgress } from '../../../../../platform/workflow/common/workflow.js';
import { getWorkflowProgress } from '../../../../../platform/workflow/common/workflowProgress.js';
import { testWorkflowRun } from '../../../../../workbench/contrib/workflows/test/common/workflowTestData.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { Menus } from '../../../../browser/menus.js';
import { SessionHeader } from '../../../../browser/parts/sessionHeader.js';
import { ISessionContext } from '../../../../services/sessions/browser/sessionContext.js';
import { ISessionsListModelService } from '../../../../services/sessions/browser/sessionsListModelService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { SessionStatus } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionWorkflowService } from '../../browser/sessionWorkflowService.js';
import { WorkflowActionViewItem } from '../../browser/workflowActionViewItem.js';
import '../../../../browser/parts/media/sessionsPart.css';

suite('Workflow header action', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('pressed styling and accessible expansion follow the owning session only', () => {
		const resource = URI.parse('test-session:/header');
		const visible = observableValue<URI | undefined>('visible workflow', undefined);
		const session = upcastPartial<IActiveSession>({ resource, status: constObservable(SessionStatus.Completed), workflow: constObservable(getWorkflowProgress(testWorkflowRun())) });
		const owningSession = observableValue<IActiveSession | undefined>('owning session', session);
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ISessionContext, new class extends mock<ISessionContext>() { override readonly session = owningSession; });
		instantiationService.stub(ISessionWorkflowService, { visibleSession: visible });
		const action = store.add(new Action('show', 'Show Workflow'));
		const item = store.add(instantiationService.createInstance(WorkflowActionViewItem, action, {}));
		const container = dom.append(mainWindow.document.body, dom.$('div'));
		store.add(toDisposable(() => container.remove()));
		item.render(container);
		const states = [undefined, resource, URI.parse('test-session:/other'), undefined].map(value => {
			visible.set(value, undefined);
			const label = container.querySelector('.action-label');
			return {
				styled: container.classList.contains('expanded'), expanded: label?.getAttribute('aria-expanded'),
				pressed: label?.getAttribute('aria-pressed'), hideLabel: label?.getAttribute('aria-label')?.startsWith('Hide workflow sidebar.'),
			};
		});
		visible.set(resource, undefined);
		owningSession.set(upcastPartial<IActiveSession>({ ...session, workflow: constObservable(undefined) }), undefined);
		const noProgressLabel = container.querySelector('.action-label')?.getAttribute('aria-label');
		owningSession.set(undefined, undefined);
		assert.deepStrictEqual({ states, noProgressLabel, unboundPressed: container.querySelector('.action-label')?.getAttribute('aria-pressed') }, {
			states: [
				{ styled: false, expanded: 'false', pressed: 'false', hideLabel: false }, { styled: true, expanded: 'true', pressed: 'true', hideLabel: true },
				{ styled: false, expanded: 'false', pressed: 'false', hideLabel: false }, { styled: false, expanded: 'false', pressed: 'false', hideLabel: false },
			],
			noProgressLabel: 'Hide Workflow Sidebar', unboundPressed: 'false',
		});
	});

	test('the toggle names only the last dispatched checkpoint, even while input is needed', () => {
		const progress = getWorkflowProgress(testWorkflowRun());
		const workflow = observableValue<WorkflowProgress>('workflow', progress);
		const status = observableValue('status', SessionStatus.Completed);
		const session = upcastPartial<IActiveSession>({ resource: URI.parse('test-session:/header'), workflow, status });
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ISessionContext, { session: constObservable(session) });
		instantiationService.stub(ISessionWorkflowService, { visibleSession: constObservable(undefined) });
		const item = store.add(instantiationService.createInstance(WorkflowActionViewItem, store.add(new Action('show', 'Show Workflow')), {}));
		const container = dom.append(mainWindow.document.body, dom.$('div'));
		store.add(toDisposable(() => container.remove()));
		item.render(container);
		const caption = () => container.querySelector('.action-label')?.textContent;
		const captions = [caption()];
		workflow.set({ ...progress, checkpointLabel: 'Implementation', status: 'waiting' }, undefined);
		status.set(SessionStatus.NeedsInput, undefined);
		captions.push(caption());
		workflow.set({ ...workflow.get(), lastDispatchedCheckpointLabel: 'Implementation' }, undefined);
		captions.push(caption());
		workflow.set({ ...progress, lastDispatchedCheckpointLabel: undefined, firstTurnId: undefined }, undefined);
		captions.push(caption());
		assert.deepStrictEqual(captions, ['Plan', 'Plan', 'Implementation', progress.label]);
	});

	test('the real header places the compact toggle after the toolbar and supports keyboard activation', async () => {
		const resource = URI.parse('test-session:/header');
		const visible = observableValue<URI | undefined>('visible workflow', undefined);
		const session = upcastPartial<IActiveSession>({
			resource, title: constObservable('A session with a long title'), status: constObservable(SessionStatus.Completed),
			isRead: constObservable(true), isArchived: constObservable(false), isCreated: constObservable(true),
			capabilities: constObservable({ supportsMultipleChats: false }),
			workflow: constObservable({ ...getWorkflowProgress(testWorkflowRun()), lastDispatchedCheckpointLabel: 'A long checkpoint label that must truncate' }),
		});
		const instantiation = workbenchInstantiationService(undefined, store);
		instantiation.stub(IContextKeyService, store.add(instantiation.createInstance(ContextKeyService)));
		instantiation.stub(ISessionContext, { session: constObservable(session) });
		instantiation.stub(ISessionWorkflowService, { visibleSession: visible });
		instantiation.stub(ISessionsService, new class extends mock<ISessionsService>() { }());
		instantiation.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() { }());
		instantiation.stub(ISessionsListModelService, new class extends mock<ISessionsListModelService>() {
			override getStatusIcon() { return Codicon.circleFilled; }
		}());
		const invoked: { id: string; context: IActiveSession | undefined }[] = [];
		instantiation.stub(ICommandService, new class extends mock<ICommandService>() {
			override async executeCommand<T>(id: string, context?: IActiveSession): Promise<T | undefined> {
				invoked.push({ id, context });
				visible.set(visible.get() ? undefined : resource, undefined);
				return undefined;
			}
		}());
		instantiation.stub(IMenuService, store.add(instantiation.createInstance(MenuService)));
		const toggleId = 'test.workflow.header.toggle';
		instantiation.stub(IActionViewItemService, new class extends mock<IActionViewItemService>() {
			override readonly onDidChange = Event.None;
			override lookUp(menu: MenuId, id: string | MenuId): IActionViewItemFactory | undefined {
				return menu === Menus.SessionBarToolbarTrailing && id === toggleId
					? (action, options, scoped) => scoped.createInstance(WorkflowActionViewItem, action, options)
					: undefined;
			}
		}());
		store.add(MenuRegistry.appendMenuItem(Menus.SessionBarToolbar, { command: { id: 'test.header.settings', title: 'Settings', icon: Codicon.gear }, group: 'navigation' }));
		store.add(MenuRegistry.appendMenuItem(Menus.SessionBarToolbar, { command: { id: 'test.header.archive', title: 'Archive' }, group: 'manage' }));
		store.add(MenuRegistry.appendMenuItem(Menus.SessionBarToolbarTrailing, { command: { id: toggleId, title: 'Toggle Workflow' }, group: 'navigation' }));
		const container = dom.append(mainWindow.document.body, dom.$('.monaco-workbench.agent-sessions-workbench'));
		store.add(toDisposable(() => container.remove()));
		const part = dom.append(container, dom.$('.part.sessionspart'));
		const sessionContainer = dom.append(part, dom.$('.session-view.modern-ui-editor-tab-group.modern-ui-editor-tab-group-active'));
		for (const value of [20, 60, 200, 280, 320]) {
			container.style.setProperty(`--vscode-spacing-size${value}`, `${value / 10}px`);
		}
		container.style.setProperty('--vscode-strokeThickness', '1px');
		container.style.setProperty('--vscode-widget-border', 'transparent');
		const header = store.add(instantiation.createInstance(SessionHeader));
		sessionContainer.appendChild(header.element);
		header.setSession(session);
		const label = header.element.querySelector<HTMLElement>('.session-workflow-action .action-label');
		assert.ok(label, 'The workflow action should be contributed through the real header toolbar.');
		const states = [false, true].flatMap(compact => [420, 200].map(width => {
			container.classList.toggle('editor-tabs-compact-height', compact);
			container.style.width = `${width}px`;
			const bounds = label.getBoundingClientRect();
			const row = header.element.querySelector('.chat-composite-bar-header')!.getBoundingClientRect();
			const toolbar = header.element.querySelector('.chat-composite-bar-toolbar')!.getBoundingClientRect();
			return {
				contentHeight: mainWindow.getComputedStyle(label).height,
				compactTarget: bounds.height <= 22,
				centered: Math.abs(bounds.top + bounds.height / 2 - row.top - row.height / 2) < 0.5,
				trailing: bounds.left >= toolbar.right,
				fits: bounds.right <= row.right && bounds.width > 0,
				padding: mainWindow.getComputedStyle(label).padding,
			};
		}));
		label.focus();
		assert.strictEqual(dom.getActiveElement(), label, `The workflow toggle must be keyboard focusable (tabIndex: ${label.tabIndex}, disabled: ${label.getAttribute('aria-disabled')}).`);
		label.dispatchEvent(new KeyboardEvent('keyup', { key: 'Tab', keyCode: 9, bubbles: true, cancelable: true }));
		const pressed: (string | null)[] = [];
		for (const [key, keyCode] of [['Enter', 13], [' ', 32]] as const) {
			for (const type of ['keydown', 'keyup']) {
				label.dispatchEvent(new KeyboardEvent(type, { key, keyCode, bubbles: true, cancelable: true }));
			}
			await timeout(0);
			pressed.push(label.getAttribute('aria-pressed'));
		}
		assert.deepStrictEqual({ states, pressed, invoked }, {
			states: Array.from({ length: 4 }, () => ({ contentHeight: '20px', compactTarget: true, centered: true, trailing: true, fits: true, padding: '0px 6px' })),
			pressed: ['true', 'false'], invoked: [{ id: toggleId, context: session }, { id: toggleId, context: session }],
		});
	});
});
