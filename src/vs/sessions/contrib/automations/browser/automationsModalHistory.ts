/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableSignalFromEvent, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IAutomationService } from '../../../../workbench/contrib/chat/common/automations/automationService.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ISessionsManagementService } from '../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { AgentsWindowMenus } from '../../../browser/agentsWindowMenus.js';
import { formatAutomationRunStatus } from '../../sessions/browser/views/automationCataloguePresentation.js';
import { AutomationHistorySection, resolveAutomationRunSessions } from './automationRunHistory.js';
import { automationRunWithLocalProgress } from '../../sessions/browser/views/automationRunProgress.js';

export class AutomationsModalHistory extends Disposable {
	private readonly automationId = observableValue<string | undefined>(this, undefined);
	private readonly history: AutomationHistorySection;
	private accessibleContent = '';

	constructor(
		container: HTMLElement,
		focusFallback: HTMLElement,
		openSession: (resource: URI) => Promise<void>,
		@IInstantiationService instantiationService: IInstantiationService,
		@IAutomationService automationService: IAutomationService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@IChatService chatService: IChatService,
	) {
		super();
		const root = dom.append(container, dom.$('section.automations-modal-history', { 'aria-label': localize('automations.modal.history', "Run history") }));
		this._register(toDisposable(() => root.remove()));
		dom.append(root, dom.$('h3')).textContent = localize('automations.modal.history', "Run history");
		const message = dom.append(root, dom.$('.automations-modal-history-message', { role: 'status' }));
		this.history = this._register(instantiationService.createInstance(AutomationHistorySection, root, focusFallback, observableValue(this, false), {
			toolbarMenuId: AgentsWindowMenus.AutomationsModalHistoryItem,
			contextMenuId: AgentsWindowMenus.AutomationsModalHistoryContext,
			toolbarTelemetrySource: 'automationsModal.historyRow',
			showHeader: false,
			openSession,
		}));
		const sessionsChanged = observableSignalFromEvent(this, Event.any(sessionsManagementService.onDidChangeSessions, sessionsManagementService.onDidDeleteSession));
		this._register(autorun(reader => {
			const id = this.automationId.read(reader);
			sessionsChanged.read(reader);
			const automation = automationService.automations.read(reader).find(automation => automation.id === id);
			const runs = automationService.runs.read(reader).filter(run => run.automationId === id).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
			const catalogueState = automationService.catalogueState.read(reader);
			const historyState = automationService.historyState?.read(reader);
			automationService.availableProviders.read(reader);
			const sessions = resolveAutomationRunSessions(runs, sessionsManagementService.getSessions(), uriIdentityService);
			this.history.render(runs, sessions, reader);
			message.textContent = historyState === 'error'
				? localize('automations.modal.historyError', "Run history could not be refreshed. Showing available runs.")
				: historyState === 'loading' || catalogueState === 'loading'
					? localize('automations.modal.historyLoading', "Loading run history...")
					: catalogueState !== 'ready' || historyState === 'unavailable'
						? localize('automations.modal.historyUnavailable', "Some run history may be unavailable.")
						: runs.length === 0
							? localize('automations.modal.historyEmpty', "No runs yet.")
							: runs.every(run => !sessions.has(run.id) && !run.externalResource)
								? localize('automations.modal.historySessionsUnavailable', "Run sessions are not available yet.")
								: '';
			message.hidden = !message.textContent;
			const chatModels = [...chatService.chatModels.read(reader)];
			this.accessibleContent = [
				localize('automations.modal.historyFor', "Run history for {0}", automation?.name ?? ''),
				message.textContent,
				...runs.map(run => localize('automations.modal.historyRun', "{0}. {1}. {2}.",
					sessions.get(run.id)?.title.read(reader) ?? automation?.name ?? '',
					formatAutomationRunStatus(automationRunWithLocalProgress(run, chatModels, reader)),
					new Date(run.startedAt).toLocaleString())),
			].filter(Boolean).join('\n');
			this.history.layout();
		}));
	}

	setAutomation(id: string): void {
		this.automationId.set(id, undefined);
	}

	layout(): void {
		this.history.layout();
	}

	getAccessibilityContent(): string {
		return this.accessibleContent;
	}
}
