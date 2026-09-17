/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Action } from '../../../../base/common/actions.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { autorun, IObservable, observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { WorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { WorkflowRun } from '../../../../platform/workflow/common/workflow.js';
import { IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { isRequestVM } from '../../../../workbench/contrib/chat/common/model/chatViewModel.js';
import { WorkflowRunWidget } from '../../../../workbench/contrib/workflows/browser/workflowRunWidget.js';
import { IWorkflowUIService } from '../../../../workbench/contrib/workflows/browser/workflowUIService.js';
import { WorkflowRunViewModel } from '../../../../workbench/contrib/workflows/common/workflowRunViewModel.js';
import { IWorkflowService } from '../../../../workbench/contrib/workflows/common/workflowService.js';
import { IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { SessionView } from '../../../browser/parts/sessionView.js';
import { ISessionsPartService } from '../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { SessionWorkflowSelection } from '../../../services/sessions/common/sessionsProvider.js';
import { INewSessionComposerService } from '../../chat/browser/newSessionComposerService.js';
import './media/sessionWorkflows.css';

export interface SessionWorkflowPickOptions {
	readonly workspace?: URI;
	readonly selection?: SessionWorkflowSelection;
	readonly anchor?: HTMLElement;
}

export const ISessionWorkflowService = createDecorator<ISessionWorkflowService>('sessionWorkflowService');

export interface ISessionWorkflowService {
	readonly _serviceBrand: undefined;
	readonly visibleSession: IObservable<URI | undefined>;
	pick(options?: SessionWorkflowPickOptions): Promise<SessionWorkflowSelection | null | undefined>;
	add(session?: ISession): Promise<void>;
	newSession(selection: SessionWorkflowSelection, workspace?: URI, task?: string): Promise<void>;
	createLinked(session: ISession, checkpointId?: string): Promise<void>;
	show(session: ISession, anchor?: HTMLElement): Promise<void>;
	hide(): void;
}

interface WorkflowPanelDraft {
	readonly runId: string;
	readonly proposedStopAfter?: string;
	readonly expandedCheckpoints: readonly string[];
	readonly inputDrafts: Readonly<Record<string, string>>;
}

export class SessionWorkflowService extends Disposable implements ISessionWorkflowService {
	declare readonly _serviceBrand: undefined;

	readonly visibleSession = observableValue<URI | undefined>(this, undefined);
	private readonly panelContent = this._register(new MutableDisposable<DisposableStore>());
	private readonly drafts = new ResourceMap<WorkflowPanelDraft>();
	private panelFocus: (() => void) | undefined;
	private generation = 0;

	constructor(
		@IWorkflowService private readonly workflowService: IWorkflowService,
		@IWorkflowUIService private readonly workflowUIService: IWorkflowUIService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@INewSessionComposerService private readonly composerService: INewSessionComposerService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IDialogService private readonly dialogService: IDialogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IChatEntitlementService private readonly entitlementService: IChatEntitlementService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ISessionsPartService private readonly sessionsPartService: ISessionsPartService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
	) {
		super();
		this._register(toDisposable(() => { this.hide(false); this.drafts.clear(); }));
		this._register(sessionsManagementService.onDidDeleteSession(session => {
			if (isEqual(this.visibleSession.get(), session.resource)) {
				this.hide(false);
			}
			this.drafts.delete(session.resource);
		}));
		this._register(autorun(reader => {
			const active = sessionsService.activeSession.read(reader);
			const visible = this.visibleSession.read(undefined);
			if (visible && !isEqual(visible, active?.resource)) {
				this.hide(false);
			}
		}));
		this._register(entitlementService.onDidChangeSentiment(() => {
			if (entitlementService.sentiment.hidden) {
				this.hide(false);
			}
		}));
	}

	async pick(options: SessionWorkflowPickOptions = {}): Promise<SessionWorkflowSelection | null | undefined> {
		return this.workflowUIService.selectWorkflow(options.workspace, options.selection, options.anchor);
	}

	async add(session: ISession | undefined = this.sessionsService.activeSession.get()): Promise<void> {
		this.requireEnabled();
		if (!session || session.status.get() === SessionStatus.Untitled) {
			const composer = this.composerService.activeComposer.get();
			if (!composer?.supportsWorkflows || !composer.selectWorkflow) {
				throw new Error(localize('workflow.noComposer', "Open a new session with a workflow-capable provider first."));
			}
			await composer.selectWorkflow();
			return;
		}
		const existing = await this.workflowService.getSessionRun(session.resource);
		if (existing) {
			await this.show(session);
			return;
		}
		const unsupported = this.workflowService.getUnsupportedReason(session.resource);
		if (unsupported) {
			throw new Error(unsupported);
		}
		if (!session.capabilities.get().supportsWorkflows) {
			throw new Error(localize('workflow.sessionUnsupported', "Workflows are unavailable for this session."));
		}
		const workspace = session.workspace.get()?.folders[0]?.root;
		const selection = await this.pick({ workspace });
		if (!selection) {
			return;
		}
		const task = await this.quickInputService.input({
			title: localize('workflow.taskTitle', "Workflow Task"),
			value: session.title.get(),
			prompt: localize('workflow.taskPrompt', "Describe the task. The existing conversation and workspace are kept."),
			validateInput: async value => value.trim() ? undefined : localize('workflow.taskRequired', "Enter a task for this workflow."),
		});
		if (task === undefined) {
			return;
		}
		const stop = selection.snapshot.checkpoints.find(checkpoint => checkpoint.id === selection.stopAfter);
		if (!stop) {
			throw new Error(localize('workflow.unknownStop', "The stopping point is not part of the selected workflow."));
		}
		const chatStatus = session.mainChat.get().status.get();
		const activeTurn = chatStatus === SessionStatus.InProgress || chatStatus === SessionStatus.NeedsInput;
		const confirmation = await this.dialogService.confirm({
			message: activeTurn
				? localize('workflow.startAfterTurn', "Start the workflow after the current turn finishes?")
				: localize('workflow.startConfirm', "Start the workflow?"),
			detail: localize('workflow.startScope', "{0}: work through {1}. Existing tool permissions remain unchanged.", selection.snapshot.label, stop.label),
			primaryButton: localize('workflow.start', "Start Workflow"),
		});
		if (!confirmation.confirmed) {
			return;
		}
		this.requireEnabled();
		await this.workflowService.start({
			...selection, task: task.trim(), session: session.resource.toString(),
			chat: session.mainChat.get().resource.toString(), workspace: workspace?.toString(),
		});
		await this.show(session);
	}

	async newSession(selection: SessionWorkflowSelection, workspace?: URI, task?: string): Promise<void> {
		this.requireEnabled();
		const result = await this.sessionsService.openNewSession({ folderUri: workspace, cancelRestore: true });
		if (result.trustDeclined) {
			return;
		}
		if (workspace && !result.session) {
			throw new Error(localize('workflow.noDraft', "The workspace could not be opened with a workflow-capable provider."));
		}
		if (result.session && !isEqual(result.session.resource, this.sessionsService.activeSession.get()?.resource)) {
			throw new Error(localize('workflow.draftChanged', "The new session changed before the workflow could be added."));
		}
		const composer = this.composerService.activeComposer.get();
		if (!composer?.supportsWorkflows || !composer.setWorkflowSelection) {
			throw new Error(localize('workflow.noComposer', "Open a new session with a workflow-capable provider first."));
		}
		if (task && !await composer.animatePrompt(task, 0, '', CancellationToken.None)) {
			throw new Error(localize('workflow.keptDraft', "The existing draft input has been kept. Clear it before creating this linked workflow."));
		}
		composer.setWorkflowSelection(selection);
	}

	async createLinked(session: ISession, checkpointId?: string): Promise<void> {
		this.requireEnabled();
		const run = await this.workflowService.getSessionRun(session.resource);
		const originCheckpoint = checkpointId ?? session.workflow?.get()?.checkpointId;
		if (!run || !originCheckpoint || !run.snapshot.checkpoints.some(checkpoint => checkpoint.id === originCheckpoint)) {
			throw new Error(localize('workflow.noOrigin', "The source checkpoint is no longer available."));
		}
		const workspace = session.workspace.get()?.folders[0]?.root;
		const selection = await this.pick({ workspace });
		if (!selection) {
			return;
		}
		const task = await this.quickInputService.input({
			title: localize('workflow.linkedTask', "Linked Workflow Task"),
			prompt: localize('workflow.linkedTaskPrompt', "Describe the independent task. Its stopping point and permissions are not inherited."),
			validateInput: async value => value.trim() ? undefined : localize('workflow.taskRequired', "Enter a task for this workflow."),
		});
		if (task !== undefined) {
			await this.newSession({ ...selection, origin: { runId: run.id, checkpointId: originCheckpoint } }, workspace, task.trim());
		}
	}

	async show(session: ISession, anchor?: HTMLElement): Promise<void> {
		if (this.entitlementService.sentiment.hidden) {
			throw new Error(localize('workflow.aiDisabled', "AI features are disabled."));
		}
		if (isEqual(this.visibleSession.get(), session.resource)) {
			this.hide();
			return;
		}
		this.hide(false);
		if (!isEqual(this.sessionsService.activeSession.get()?.resource, session.resource) || !this.sessionsPartService.getSessionView(session.sessionId)) {
			this.sessionsService.showSession(session.resource, { preserveFocus: true });
		}
		const generation = ++this.generation;
		this.visibleSession.set(session.resource, undefined);
		const store = new DisposableStore();
		this.panelContent.value = store;
		try {
			const initialWatch = store.add(this.workflowService.watchSession(session.resource));
			const run = await this.workflowService.getSessionRun(session.resource);
			if (generation !== this.generation || this._store.isDisposed) {
				return;
			}
			if (!run) {
				throw new Error(localize('workflow.noRun', "This session does not have a workflow."));
			}
			const view = this.sessionsPartService.getSessionView(session.sessionId);
			if (!view || !isEqual(view.getSession()?.resource, session.resource)) {
				throw new Error(localize('workflow.viewUnavailable', "The session's chat view is no longer available."));
			}
			this.openPanel(session, run, view, store, anchor);
			store.delete(initialWatch);
		} catch (error) {
			if (generation === this.generation) {
				this.hide();
			}
			throw error;
		}
	}

	hide(restoreFocus = true): void {
		this.generation++;
		const focus = restoreFocus ? this.panelFocus : undefined;
		this.panelFocus = undefined;
		this.visibleSession.set(undefined, undefined);
		this.panelContent.clear();
		focus?.();
	}

	private openPanel(session: ISession, run: WorkflowRun, view: SessionView, store: DisposableStore, anchor?: HTMLElement): void {
		const model = store.add(this.instantiationService.createInstance(WorkflowRunViewModel, session.resource, run));
		const draft = this.drafts.get(session.resource);
		if (draft?.runId === run.id) {
			if (draft.proposedStopAfter) {
				model.proposeStop(draft.proposedStopAfter);
			}
			model.expandedCheckpoints.set(new Set(draft.expandedCheckpoints), undefined);
			model.inputDrafts.set(draft.inputDrafts, undefined);
		}
		const returnFocus = anchor ?? dom.getActiveElement();
		const content = store.add(new DisposableStore());
		let widget!: WorkflowRunWidget;
		let toolbarContainer: HTMLElement;
		store.add(view.showSidebar({
			render: container => {
				const root = dom.append(container, dom.$('.session-workflow-sidebar', {
					role: 'complementary', 'aria-label': localize('workflow.sidebar', "Workflow sidebar"),
				}));
				this.panelFocus = () => {
					if (dom.isHTMLElement(returnFocus) && returnFocus.isConnected) {
						returnFocus.focus();
					}
					if (dom.getActiveElement() !== returnFocus) {
						view.focus();
					}
				};
				toolbarContainer = dom.append(root, dom.$('.session-workflow-sidebar-toolbar'));
				const toolbar = content.add(this.instantiationService.createInstance(WorkbenchToolBar, toolbarContainer, { ariaLabel: localize('workflow.sidebarActions', "Workflow sidebar actions") }));
				toolbar.setActions([content.add(new Action('sessions.workflows.close', localize('workflow.closeSidebar', "Close Workflow Sidebar"), ThemeIcon.asClassName(Codicon.close), true, () => this.hide()))]);
				widget = content.add(this.instantiationService.createInstance(WorkflowRunWidget, root, model, {
					createLinkedWorkflow: checkpointId => this.createLinked(session, checkpointId),
					revealTurn: turnId => this.revealTurn(session, run, turnId),
				}));
				content.add(dom.addDisposableListener(root, dom.EventType.KEY_DOWN, event => {
					if (!event.defaultPrevented && event.key === 'Escape') {
						event.stopPropagation();
						event.preventDefault();
						this.hide();
					}
				}));
				return toDisposable(() => content.clear());
			},
			layout: dimension => widget.layout(new dom.Dimension(dimension.width, Math.max(0, dimension.height - toolbarContainer.offsetHeight))),
			onHide: () => {
				this.drafts.set(session.resource, {
					runId: run.id, proposedStopAfter: model.proposedStopAfter.get(),
					expandedCheckpoints: [...model.expandedCheckpoints.get()], inputDrafts: model.inputDrafts.get(),
				});
				this.hide(false);
			},
		}));
		widget.focus();
	}

	private async revealTurn(session: ISession, run: WorkflowRun, turnId: string): Promise<void> {
		const chat = URI.parse(run.chat);
		await this.sessionsService.openChat(session, chat);
		const widget = this.chatWidgetService.getWidgetBySessionResource(chat);
		const request = widget?.viewModel?.getItems().find(item => isRequestVM(item) && item.id === turnId);
		if (!widget || !request) {
			throw new Error(localize('workflow.turnUnavailable', "The first chat turn for this checkpoint is unavailable. No replacement turn was created."));
		}
		widget.reveal(request);
		widget.focus(request);
	}

	private requireEnabled(): void {
		if (this.entitlementService.sentiment.hidden || !this.configurationService.getValue<boolean>('chat.workflows.enabled')) {
			throw new Error(localize('workflow.disabled', "Workflows are disabled."));
		}
	}
}
