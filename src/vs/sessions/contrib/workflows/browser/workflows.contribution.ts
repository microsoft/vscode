/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableMap, IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IWorkflowUIService } from '../../../../workbench/contrib/workflows/browser/workflowUIService.js';
import { IWorkflowService } from '../../../../workbench/contrib/workflows/common/workflowService.js';
import { Menus } from '../../../browser/menus.js';
import { SessionsCategories } from '../../../common/categories.js';
import { SessionHasWorkflowContext, SessionIsArchivedContext, SessionIsCreatedContext, SessionSupportsWorkflowsContext } from '../../../common/contextkeys.js';
import { ISessionContext } from '../../../services/sessions/browser/sessionContext.js';
import { ISessionGroupsService } from '../../../services/sessions/browser/sessionGroupsService.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvider, SessionWorkflowSelection } from '../../../services/sessions/common/sessionsProvider.js';
import { ISessionWorkflowService, SessionWorkflowPickOptions, SessionWorkflowService } from './sessionWorkflowService.js';
import { WorkflowActionViewItem } from './workflowActionViewItem.js';
import './sessionWorkflowPlacement.js';

const addWorkflowId = 'sessions.workflows.add';
const showWorkflowId = 'sessions.workflows.show';
const enabled = ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals('config.chat.workflows.enabled', true));
const attached = ContextKeyExpr.and(ChatContextKeys.enabled, SessionHasWorkflowContext);

registerSingleton(ISessionWorkflowService, SessionWorkflowService, InstantiationType.Delayed);

class SessionWorkflowsContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'sessions.workflows';
	private readonly runtimes = this._register(new DisposableMap<string, IDisposable>());

	constructor(
		@ISessionsProvidersService providersService: ISessionsProvidersService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@IWorkflowService private readonly workflowService: IWorkflowService,
		@ISessionWorkflowService sessionWorkflowService: ISessionWorkflowService,
		@IWorkflowUIService workflowUIService: IWorkflowUIService,
		@ISessionGroupsService groupsService: ISessionGroupsService,
		@IActionViewItemService actionViewItemService: IActionViewItemService,
	) {
		super();
		for (const provider of providersService.getProviders()) {
			this.registerProvider(provider);
		}
		this._register(providersService.onDidChangeProviders(event => {
			for (const provider of event.removed) {
				this.runtimes.deleteAndDispose(provider.id);
			}
			for (const provider of event.added) {
				this.registerProvider(provider);
			}
		}));
		this._register(workflowUIService.registerGroupProvider(() => groupsService.getGroups().map(group => ({ id: group.id, label: group.name }))));
		this._register(workflowUIService.registerSessionStarter((selection, workspace) => sessionWorkflowService.newSession(selection, workspace)));
		this._register(actionViewItemService.register(Menus.SessionBarToolbarTrailing, showWorkflowId,
			(action, options, scopedInstantiationService) => scopedInstantiationService.createInstance(WorkflowActionViewItem, action, options)));
	}

	private registerProvider(provider: ISessionsProvider): void {
		if (!provider.workflows) {
			return;
		}
		this.runtimes.set(provider.id, this.workflowService.registerRuntime({
			id: provider.id,
			runtime: provider.workflows,
			supportsSession: resource => this.sessionsManagementService.getSession(resource.with({ fragment: '' }))?.providerId === provider.id,
			getUnsupportedReason: resource => {
				const session = this.sessionsManagementService.getSession(resource.with({ fragment: '' }));
				return session?.capabilities.get().supportsWorkflows
					? undefined
					: localize('workflow.providerUnavailable', "This session's runtime does not currently support workflows. Reconnect to a compatible host.");
			},
		}));
	}
}

function resolveSession(accessor: ServicesAccessor, context?: ISession | ISession[] | URI): ISession {
	if (Array.isArray(context) && context.length !== 1) {
		throw new Error(localize('workflow.singleSession', "Choose a single session for this workflow action."));
	}
	const selected = Array.isArray(context) ? context[0] : context;
	const session = URI.isUri(selected)
		? accessor.get(ISessionsManagementService).getSession(selected)
		: selected ?? accessor.get(ISessionContext).session.get();
	if (!session) {
		throw new Error(localize('workflow.noSession', "Open a session first."));
	}
	return session;
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: addWorkflowId, title: localize2('workflow.add', "Add Workflow..."), category: SessionsCategories.Sessions,
			precondition: enabled, f1: true, icon: Codicon.listOrdered,
			menu: [Menus.SessionHeaderContext, Menus.SessionItemContextMenu].map(id => ({
				id, group: '2_workflow', order: 1,
				when: ContextKeyExpr.and(enabled, SessionSupportsWorkflowsContext, SessionHasWorkflowContext.negate(), SessionIsCreatedContext, SessionIsArchivedContext.negate()),
			})),
		});
	}
	override async run(accessor: ServicesAccessor, context?: ISession | ISession[] | URI): Promise<void> {
		await accessor.get(ISessionWorkflowService).add(context ? resolveSession(accessor, context) : undefined);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: showWorkflowId, title: localize2('workflow.toggle', "Toggle Workflow"), category: SessionsCategories.Sessions,
			precondition: attached, f1: true, icon: Codicon.listTree,
			menu: [
				{ id: Menus.SessionBarToolbarTrailing, group: 'navigation', order: 1, when: attached },
				{ id: Menus.SessionHeaderContext, group: '2_workflow', order: 1, when: attached },
				{ id: Menus.SessionItemContextMenu, group: '2_workflow', order: 1, when: attached },
			],
		});
	}
	override async run(accessor: ServicesAccessor, context?: ISession | ISession[] | URI): Promise<void> {
		const focused = dom.getActiveElement();
		const anchor = dom.isHTMLElement(focused) && focused.closest('.session-workflow-action') ? focused : undefined;
		await accessor.get(ISessionWorkflowService).show(resolveSession(accessor, context), anchor);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'sessions.workflows.createLinked', title: localize2('workflow.createLinked', "New Linked Workflow..."), category: SessionsCategories.Sessions,
			precondition: ContextKeyExpr.and(enabled, SessionHasWorkflowContext), f1: true,
			menu: { id: Menus.SessionHeaderContext, group: '2_workflow', order: 2, when: ContextKeyExpr.and(enabled, SessionHasWorkflowContext) },
		});
	}
	override async run(accessor: ServicesAccessor, context?: ISession | URI, checkpointId?: string): Promise<void> {
		await accessor.get(ISessionWorkflowService).createLinked(resolveSession(accessor, context), checkpointId);
	}
});

CommandsRegistry.registerCommand('sessions.workflows.pick', (accessor, options?: SessionWorkflowPickOptions) => accessor.get(ISessionWorkflowService).pick(options));
CommandsRegistry.registerCommand('sessions.workflows.newSession', (accessor, selection: SessionWorkflowSelection, workspace?: URI) => accessor.get(ISessionWorkflowService).newSession(selection, workspace));
registerWorkbenchContribution2(SessionWorkflowsContribution.ID, SessionWorkflowsContribution, WorkbenchPhase.AfterRestored);
