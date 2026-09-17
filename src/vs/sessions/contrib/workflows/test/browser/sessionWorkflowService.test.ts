/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfirmation, IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { WorkflowRun, WorkflowStartOptions } from '../../../../../platform/workflow/common/workflow.js';
import { IChatWidget, IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { IChatRequestViewModel, IChatViewModel } from '../../../../../workbench/contrib/chat/common/model/chatViewModel.js';
import { IWorkflowAccessibilityService, WorkflowAccessibilityService } from '../../../../../workbench/contrib/workflows/browser/workflowAccessibility.js';
import { IWorkflowUIService } from '../../../../../workbench/contrib/workflows/browser/workflowUIService.js';
import { IWorkflowService } from '../../../../../workbench/contrib/workflows/common/workflowService.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { INotebookDocumentService } from '../../../../../workbench/services/notebook/common/notebookDocumentService.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { testWorkflowRunWithMissingInputs } from '../../../../../workbench/contrib/workflows/test/common/workflowTestData.js';
import { ISessionViewSidebar, SessionView } from '../../../../browser/parts/sessionView.js';
import { ISessionsPartService } from '../../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IChat, ISession, ISessionWorkspace, SessionStatus } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { SessionWorkflowSelection } from '../../../../services/sessions/common/sessionsProvider.js';
import { INewSessionComposer, INewSessionComposerService } from '../../../chat/browser/newSessionComposerService.js';
import { SessionWorkflowService } from '../../browser/sessionWorkflowService.js';

suite('SessionWorkflowService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(options: { confirmed?: boolean; trustDeclined?: boolean; unsupported?: string; supportsWorkflows?: boolean; status?: SessionStatus; enabled?: boolean } = {}) {
		const resource = URI.parse('test:/session');
		const chat = resource.with({ fragment: 'main' });
		const workspace = URI.file('C:\\workspace');
		const selection: SessionWorkflowSelection = {
			snapshot: {
				id: 'workflow', version: 1, label: 'Feature',
				checkpoints: ['plan', 'implement'].map(id => ({
					id, label: id, instructions: id, inputs: {},
					type: { id, version: 1, label: id, instructions: id, proofSchema: { type: 'object' }, completion: { kind: 'reported' } },
				})),
			},
			stopAfter: 'plan',
		};
		const session = upcastPartial<IActiveSession>({
			resource, sessionId: 'session', providerId: 'provider',
			title: constObservable('Existing task'), status: constObservable(options.status ?? SessionStatus.Completed),
			capabilities: constObservable({ supportsMultipleChats: false, supportsWorkflows: options.supportsWorkflows ?? true }),
			isCreated: constObservable(true),
			mainChat: constObservable(upcastPartial<IChat>({ resource: chat, status: constObservable(options.status ?? SessionStatus.Completed) })),
			workspace: constObservable(upcastPartial<ISessionWorkspace>({ folders: [{ root: workspace, workingDirectory: workspace, name: 'workspace', description: '' }] })),
		});
		const run: WorkflowRun = {
			id: 'run', version: 1, revision: 1, session: resource.toString(), chat: chat.toString(),
			task: 'Explicit task', snapshot: selection.snapshot, stopAfter: selection.stopAfter, inputs: {},
			status: 'running', checkpointIndex: 0, receipts: [], firstTurns: {},
			createdAt: 1, updatedAt: 1, activityAt: 1,
		};
		const starts: WorkflowStartOptions[] = [];
		const selections: SessionWorkflowSelection[] = [];
		const confirmations: IConfirmation[] = [];
		const prompts: string[] = [];
		let picked = 0;
		let opened = 0;
		let panels = 0;
		let activeWatches = 0;
		const watched: string[] = [];
		let currentRun: WorkflowRun | undefined;
		const deleted = store.add(new Emitter<ISession>());
		const changes = store.add(new Emitter<WorkflowRun>());
		const instantiation = workbenchInstantiationService(undefined, store);
		instantiation.stub(INotebookDocumentService, new class extends mock<INotebookDocumentService>() { }());
		instantiation.stub(IWorkflowAccessibilityService, instantiation.createInstance(WorkflowAccessibilityService));
		const configuration = new TestConfigurationService({ 'chat.workflows.enabled': options.enabled ?? true });
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiation.stub(IConfigurationService, configuration);
		instantiation.stub(IWorkflowService, new class extends mock<IWorkflowService>() {
			override onDidChangeRun = changes.event;
			override getUnsupportedReason() { return options.unsupported; }
			override watchSession(resource: URI) {
				watched.push(resource.toString());
				activeWatches++;
				return toDisposable(() => { activeWatches--; });
			}
			override async getSessionRun() { return currentRun; }
			override async start(value: WorkflowStartOptions) { starts.push(value); currentRun = run; return run; }
		}());
		instantiation.stub(IWorkflowUIService, new class extends mock<IWorkflowUIService>() {
			override async selectWorkflow() { picked++; return selection; }
		}());
		instantiation.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override onDidDeleteSession = deleted.event;
		}());
		const activeSession = observableValue<IActiveSession | undefined>('activeSession', session);
		const shownSessions: URI[] = [];
		instantiation.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override activeSession = activeSession;
			override showSession(resource: URI) { shownSessions.push(resource); activeSession.set(session, undefined); }
			override async openNewSession() { opened++; return { session: options.trustDeclined ? undefined : session, trustDeclined: options.trustDeclined ?? false }; }
		}());
		const composer = upcastPartial<INewSessionComposer>({
			supportsWorkflows: true,
			selectWorkflow: async value => { if (value) { selections.push(value); } },
			setWorkflowSelection: value => selections.push(value),
			animatePrompt: async value => { prompts.push(value); return true; },
		});
		instantiation.stub(INewSessionComposerService, new class extends mock<INewSessionComposerService>() {
			override activeComposer = constObservable(composer);
		}());
		instantiation.stub(IQuickInputService, new class extends mock<IQuickInputService>() {
			override async input() { return 'Explicit task'; }
		}());
		instantiation.stub(IDialogService, new class extends mock<IDialogService>() {
			override async confirm(value: IConfirmation) { confirmations.push(value); return { confirmed: options.confirmed ?? false }; }
		}());
		const sentiment = observableValue('sentiment', upcastPartial<IChatEntitlementService['sentiment']>({ hidden: false }));
		instantiation.stub(IChatEntitlementService, new class extends mock<IChatEntitlementService>() {
			override get sentiment() { return sentiment.get(); }
			override sentimentObs = sentiment;
			override onDidChangeSentiment = Event.None;
		}());
		const container = dom.append(mainWindow.document.body, dom.$('.session-view'));
		store.add(toDisposable(() => container.remove()));
		const sidebar = store.add(new MutableDisposable<DisposableStore>());
		let viewAvailable = true;
		let focusedChat = 0;
		const view = new class extends mock<SessionView>() {
			override getSession() { return session; }
			override focus() { focusedChat++; }
			override showSidebar(delegate: ISessionViewSidebar) {
				panels++;
				const content = new DisposableStore();
				sidebar.value = content;
				const host = dom.append(container, dom.$('.session-view-sidebar'));
				host.style.width = '360px';
				content.add(toDisposable(() => { host.remove(); delegate.onHide(); }));
				content.add(delegate.render(host));
				delegate.layout(new dom.Dimension(360, 450));
				return toDisposable(() => sidebar.clear());
			}
		}();
		instantiation.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() {
			override getSessionView() { return viewAvailable ? view : undefined; }
		}());
		instantiation.stub(IChatWidgetService, new class extends mock<IChatWidgetService>() { }());
		const service = store.add(instantiation.createInstance(SessionWorkflowService));
		return {
			service, instantiation, configuration, sentiment, session, activeSession, selection, run, workspace,
			starts, selections, confirmations, prompts, watched, container, sidebar, deleted, shownSessions,
			removeView: () => { viewAvailable = false; sidebar.clear(); },
			get focusedChat() { return focusedChat; },
			get activeWatches() { return activeWatches; },
			counts: () => ({ picked, opened, panels }),
		};
	}

	test('template selection and new-session setup do not start a workflow', async () => {
		const test = setup();
		const selection = await test.service.pick({ workspace: test.workspace });
		await test.service.newSession(selection!, test.workspace);
		assert.deepStrictEqual({
			starts: test.starts, selections: test.selections, prompts: test.prompts, counts: test.counts(),
		}, {
			starts: [], selections: [test.selection], prompts: [], counts: { picked: 1, opened: 1, panels: 0 },
		});
	});

	test('a cancelled explicit-start confirmation leaves the existing session untouched', async () => {
		const test = setup();
		await test.service.add(test.session);
		assert.deepStrictEqual({ starts: test.starts, confirmations: test.confirmations.length, counts: test.counts() }, {
			starts: [], confirmations: 1, counts: { picked: 1, opened: 0, panels: 0 },
		});
	});

	for (const status of [SessionStatus.InProgress, SessionStatus.NeedsInput]) {
		test(`requires an explicit start-after-turn confirmation for active status ${status}`, async () => {
			const test = setup({ confirmed: true, status });
			await test.service.add(test.session);
			assert.deepStrictEqual({
				starts: test.starts, confirmation: test.confirmations[0].message, counts: test.counts(),
			}, {
				starts: [{
					...test.selection, task: 'Explicit task', session: test.session.resource.toString(),
					chat: test.session.mainChat.get().resource.toString(), workspace: test.workspace.toString(),
				}],
				confirmation: 'Start the workflow after the current turn finishes?',
				counts: { picked: 1, opened: 0, panels: 1 },
			});
		});
	}

	test('rejects an unsupported runtime before opening selection UI', async () => {
		const test = setup({ unsupported: 'Runtime cannot run workflows' });
		await assert.rejects(test.service.add(test.session), /Runtime cannot run workflows/);
		assert.deepStrictEqual(test.counts(), { picked: 0, opened: 0, panels: 0 });
	});

	test('rejects an unsupported session on a capable runtime before opening selection UI', async () => {
		const test = setup({ supportsWorkflows: false });
		await assert.rejects(test.service.add(test.session), /Workflows are unavailable for this session/);
		assert.deepStrictEqual({ starts: test.starts, counts: test.counts() }, { starts: [], counts: { picked: 0, opened: 0, panels: 0 } });
	});

	test('existing workflows remain inspectable after session execution support disappears', async () => {
		const test = setup({ supportsWorkflows: false });
		test.instantiation.stub(IWorkflowService, 'getSessionRun', async () => test.run);
		await test.service.add(test.session);
		assert.deepStrictEqual({ starts: test.starts, counts: test.counts() }, { starts: [], counts: { picked: 0, opened: 0, panels: 1 } });
	});

	test('disabling workflows rejects execution but still delegates to the picker so a draft can be cleared', async () => {
		const test = setup({ enabled: false });
		test.instantiation.stub(IWorkflowUIService, 'selectWorkflow', async () => null);
		assert.strictEqual(await test.service.pick({ selection: test.selection }), null);
		await assert.rejects(test.service.newSession(test.selection), /disabled/);
		assert.deepStrictEqual(test.counts(), { picked: 0, opened: 0, panels: 0 });
	});

	test('AI hiding rejects workflow discovery', async () => {
		const test = setup();
		test.sentiment.set(upcastPartial<IChatEntitlementService['sentiment']>({ hidden: true }), undefined);
		await assert.rejects(test.service.add(test.session), /disabled/);
		assert.deepStrictEqual(test.counts(), { picked: 0, opened: 0, panels: 0 });
	});

	test('declining workspace trust does not apply a selection or a task', async () => {
		const test = setup({ trustDeclined: true });
		await test.service.newSession(test.selection, test.workspace, 'Independent task');
		assert.deepStrictEqual({ starts: test.starts, selections: test.selections, prompts: test.prompts }, { starts: [], selections: [], prompts: [] });
	});

	test('the template picker receives an independent workflow selection without changing its stopping point', async () => {
		const test = setup();
		const selection = { ...test.selection, origin: { runId: 'source', checkpointId: 'test-plan' } };
		const anchor = document.createElement('button');
		let supplied: SessionWorkflowSelection | undefined;
		let suppliedAnchor: HTMLElement | undefined;
		test.instantiation.stub(IWorkflowUIService, 'selectWorkflow', async (_workspace?: URI, current?: SessionWorkflowSelection, element?: HTMLElement) => { supplied = current; suppliedAnchor = element; return current; });
		const edited = await test.service.pick({ selection, anchor });
		assert.deepStrictEqual({ supplied, edited, anchored: suppliedAnchor === anchor, starts: test.starts }, { supplied: selection, edited: selection, anchored: true, starts: [] });
	});

	test('a linked workflow keeps its independently selected stopping point and only prepares a draft', async () => {
		const test = setup();
		test.instantiation.stub(IWorkflowService, 'getSessionRun', async () => ({ ...test.run, stopAfter: 'implement' }));
		await test.service.createLinked(test.session, 'implement');
		assert.deepStrictEqual({
			starts: test.starts, selections: test.selections, prompts: test.prompts, counts: test.counts(),
		}, {
			starts: [],
			selections: [{ ...test.selection, origin: { runId: 'run', checkpointId: 'implement' } }],
			prompts: ['Explicit task'], counts: { picked: 1, opened: 1, panels: 0 },
		});
	});

	test('cancelling linked-workflow selection does not create or start a session', async () => {
		const test = setup();
		test.instantiation.stub(IWorkflowService, 'getSessionRun', async () => test.run);
		test.instantiation.stub(IWorkflowUIService, 'selectWorkflow', async () => undefined);
		await test.service.createLinked(test.session, 'plan');
		assert.deepStrictEqual({ starts: test.starts, selections: test.selections, prompts: test.prompts, counts: test.counts() }, {
			starts: [], selections: [], prompts: [], counts: { picked: 0, opened: 0, panels: 0 },
		});
	});

	test('a missing linked-workflow origin fails before offering setup', async () => {
		const test = setup();
		test.instantiation.stub(IWorkflowService, 'getSessionRun', async () => test.run);
		await assert.rejects(test.service.createLinked(test.session, 'missing'), /source checkpoint is no longer available/);
		assert.deepStrictEqual({ starts: test.starts, selections: test.selections, counts: test.counts() }, {
			starts: [], selections: [], counts: { picked: 0, opened: 0, panels: 0 },
		});
	});

	test('owns the initial watch before reading and releases it when closed', async () => {
		const test = setup();
		const pending = new DeferredPromise<WorkflowRun>();
		const watchesAtRead: number[] = [];
		test.instantiation.stub(IWorkflowService, 'getSessionRun', () => {
			watchesAtRead.push(test.activeWatches);
			return pending.p;
		});
		const showing = test.service.show(test.session);
		test.service.hide();
		const watchesAfterClosing = test.activeWatches;
		await pending.complete(test.run);
		await showing;
		assert.deepStrictEqual({
			watchesAtRead, watchesAfterClosing, activeWatches: test.activeWatches, watched: test.watched,
			visible: test.service.visibleSession.get(), counts: test.counts(),
		}, {
			watchesAtRead: [1], watchesAfterClosing: 0, activeWatches: 0, watched: [test.session.resource.toString()],
			visible: undefined, counts: { picked: 0, opened: 0, panels: 0 },
		});
	});

	test('transfers the initial watch to the visible view model without retaining another lease', async () => {
		const test = setup();
		const watchesAtRead: number[] = [];
		test.instantiation.stub(IWorkflowService, 'getSessionRun', async () => {
			watchesAtRead.push(test.activeWatches);
			return test.run;
		});
		await test.service.show(test.session);
		const watchesWhileVisible = test.activeWatches;
		test.service.hide();
		assert.deepStrictEqual({
			watchesAtRead, watchesWhileVisible, activeWatches: test.activeWatches, watched: test.watched, counts: test.counts(),
		}, {
			watchesAtRead: [1], watchesWhileVisible: 1, activeWatches: 0,
			watched: [test.session.resource.toString(), test.session.resource.toString()],
			counts: { picked: 0, opened: 0, panels: 1 },
		});
	});

	test('a failed initial read releases its watch and remains an explicit error', async () => {
		const test = setup();
		test.instantiation.stub(IWorkflowService, 'getSessionRun', async () => { throw new Error('Run unavailable'); });
		await assert.rejects(test.service.show(test.session), /Run unavailable/);
		assert.deepStrictEqual({ activeWatches: test.activeWatches, visible: test.service.visibleSession.get(), counts: test.counts() }, {
			activeWatches: 0, visible: undefined, counts: { picked: 0, opened: 0, panels: 0 },
		});
	});

	test('disposing during the initial read releases its watch without opening a panel', async () => {
		const test = setup();
		const pending = new DeferredPromise<WorkflowRun>();
		test.instantiation.stub(IWorkflowService, 'getSessionRun', () => pending.p);
		const showing = test.service.show(test.session);
		test.service.dispose();
		const watchesAfterDisposal = test.activeWatches;
		await pending.complete(test.run);
		await showing;
		assert.deepStrictEqual({ watchesAfterDisposal, activeWatches: test.activeWatches, counts: test.counts() }, {
			watchesAfterDisposal: 0, activeWatches: 0, counts: { picked: 0, opened: 0, panels: 0 },
		});
	});

	test('navigating away while reading does not open a sidebar on a different session', async () => {
		const test = setup();
		const pending = new DeferredPromise<WorkflowRun>();
		test.instantiation.stub(IWorkflowService, 'getSessionRun', () => pending.p);
		const showing = test.service.show(test.session);
		test.activeSession.set(undefined, undefined);
		await pending.complete(test.run);
		await showing;
		assert.deepStrictEqual({ activeWatches: test.activeWatches, visible: test.service.visibleSession.get(), counts: test.counts() }, {
			activeWatches: 0, visible: undefined, counts: { picked: 0, opened: 0, panels: 0 },
		});
	});

	test('the sidebar stays open when clicking in chat and closes on Escape with focus returned to the toggle', async () => {
		const test = setup();
		test.instantiation.stub(IWorkflowService, 'getSessionRun', async () => test.run);
		const anchor = dom.append(test.container, dom.$('.session-workflow-action'));
		const toggle = dom.append(anchor, dom.$('button.action-label'));
		toggle.focus();
		await test.service.show(test.session, toggle);
		const root = test.container.querySelector<HTMLElement>('.session-workflow-sidebar')!;
		test.container.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		const openAfterChatClick = !!test.service.visibleSession.get();
		const ownsFocus = dom.isAncestorOfActiveElement(root);
		root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
		assert.deepStrictEqual({
			openAfterChatClick, ownsFocus, focusedToggle: dom.getActiveElement() === toggle,
			visible: test.service.visibleSession.get(), sidebar: !!test.container.querySelector('.session-workflow-sidebar'), watches: test.activeWatches,
		}, { openAfterChatClick: true, ownsFocus: true, focusedToggle: true, visible: undefined, sidebar: false, watches: 0 });
	});

	for (const target of ['detached', 'unfocusable'] as const) {
		test(`closing with a ${target} header action restores focus to the owning chat`, async () => {
			const test = setup();
			test.instantiation.stub(IWorkflowService, 'getSessionRun', async () => test.run);
			const toggle = dom.append(test.container, dom.$(target === 'detached' ? 'button' : 'div'));
			await test.service.show(test.session, toggle);
			if (target === 'detached') {
				toggle.remove();
			}
			test.service.hide();
			assert.strictEqual(test.focusedChat, 1);
		});
	}

	test('the close toolbar action releases the sidebar and restores focus', async () => {
		const test = setup();
		test.instantiation.stub(IWorkflowService, 'getSessionRun', async () => test.run);
		const toggle = dom.append(test.container, dom.$('button'));
		await test.service.show(test.session, toggle);
		test.container.querySelector<HTMLElement>('.session-workflow-sidebar-toolbar .action-label')!.click();
		await timeout(0);
		assert.deepStrictEqual({
			focusedToggle: dom.getActiveElement() === toggle, visible: test.service.visibleSession.get(),
			sidebar: !!test.container.querySelector('.session-workflow-sidebar'), watches: test.activeWatches,
		}, { focusedToggle: true, visible: undefined, sidebar: false, watches: 0 });
	});

	test('revealing the first chat turn keeps the checkpoint sidebar open', async () => {
		const test = setup();
		const run = { ...test.run, firstTurns: { plan: 'first-turn' } };
		test.instantiation.stub(IWorkflowService, 'getSessionRun', async () => run);
		const calls: string[] = [];
		const request = upcastPartial<IChatRequestViewModel>({ id: 'first-turn', message: { text: 'Plan', parts: [] } });
		test.instantiation.stub(ISessionsService, 'openChat', async (_session: ISession, resource: URI) => { calls.push(`open:${resource}`); });
		test.instantiation.stub(IChatWidgetService, 'getWidgetBySessionResource', () => upcastPartial<IChatWidget>({
			viewModel: upcastPartial<IChatViewModel>({ getItems: () => [request] }),
			reveal: item => { calls.push(`reveal:${item.id}`); },
			focus: item => { calls.push(`focus:${item?.id}`); },
		}));
		await test.service.show(test.session);
		test.container.querySelector<HTMLElement>('[data-workflow-focus="chat-plan"]')!.click();
		await timeout(0);
		assert.deepStrictEqual({
			calls, visible: test.service.visibleSession.get(), sidebar: !!test.container.querySelector('.session-workflow-sidebar'),
		}, { calls: [`open:${run.chat}`, 'reveal:first-turn', 'focus:first-turn'], visible: test.session.resource, sidebar: true });
	});

	test('child Escape handling keeps the sidebar open, and input drafts survive toggling', async () => {
		const test = setup();
		const run = { ...testWorkflowRunWithMissingInputs(), session: test.run.session, chat: test.run.chat };
		test.instantiation.stub(IWorkflowService, 'getSessionRun', async () => run);
		await test.service.show(test.session);
		const input = test.container.querySelector<HTMLInputElement>('.workflow-checkpoint-inputs input')!;
		input.value = 'https://github.com/example/project';
		input.dispatchEvent(new mainWindow.Event('input', { bubbles: true }));
		const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
		escape.preventDefault();
		input.dispatchEvent(escape);
		const keptOpen = !!test.service.visibleSession.get();
		await test.service.show(test.session);
		await test.service.show(test.session);
		assert.deepStrictEqual({
			keptOpen, draft: test.container.querySelector<HTMLInputElement>('.workflow-checkpoint-inputs input')?.value,
			watches: test.activeWatches, panels: test.counts().panels, starts: test.starts,
		}, { keptOpen: true, draft: input.value, watches: 1, panels: 2, starts: [] });
	});

	for (const close of ['switch', 'delete', 'view', 'service'] as const) {
		test(`${close} releases the sidebar and its watch without restoring old-session focus`, async () => {
			const test = setup();
			test.instantiation.stub(IWorkflowService, 'getSessionRun', async () => test.run);
			const toggle = dom.append(test.container, dom.$('button'));
			await test.service.show(test.session, toggle);
			switch (close) {
				case 'switch': test.activeSession.set(undefined, undefined); break;
				case 'delete': test.deleted.fire(test.session); break;
				case 'view': test.removeView(); break;
				case 'service': test.service.dispose(); break;
			}
			assert.deepStrictEqual({
				visible: test.service.visibleSession.get(), watches: test.activeWatches,
				sidebar: !!test.container.querySelector('.session-workflow-sidebar'), restored: dom.getActiveElement() === toggle,
			}, { visible: undefined, watches: 0, sidebar: false, restored: false });
		});
	}

	test('the invoked session is activated before mounting its sidebar', async () => {
		const test = setup();
		test.activeSession.set(undefined, undefined);
		test.instantiation.stub(IWorkflowService, 'getSessionRun', async () => test.run);
		await test.service.show(test.session);
		assert.deepStrictEqual({ shown: test.shownSessions, visible: test.service.visibleSession.get(), panels: test.counts().panels }, {
			shown: [test.session.resource], visible: test.session.resource, panels: 1,
		});
	});

	test('a vanished view is an explicit error rather than an overlay fallback', async () => {
		const test = setup();
		const pending = new DeferredPromise<WorkflowRun>();
		test.instantiation.stub(IWorkflowService, 'getSessionRun', () => pending.p);
		const showing = test.service.show(test.session);
		test.removeView();
		await pending.complete(test.run);
		await assert.rejects(showing, /chat view is no longer available/);
		assert.deepStrictEqual({ visible: test.service.visibleSession.get(), watches: test.activeWatches, panels: test.counts().panels }, {
			visible: undefined, watches: 0, panels: 0,
		});
	});
});
