/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IViewDescriptor, IViewsRegistry, Extensions as ViewContainerExtensions, IViewContainersRegistry } from '../../../../workbench/common/views.js';
import { IViewDescriptorService } from '../../../../workbench/common/views.js';
import { localize2 } from '../../../../nls.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { URI } from '../../../../base/common/uri.js';
import { autorun } from '../../../../base/common/observable.js';
import { IViewPaneOptions, ViewPane } from '../../../../workbench/browser/parts/views/viewPane.js';
import { IAgentSessionsService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { IAgentSession } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsModel.js';
import { ChatSessionStatus } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ISessionsManagementService } from './sessionsManagementService.js';
import { MultiSessionListPanel } from './multiSessionListPanel.js';
import {
	MultiSessionInputRow,
	MultiSessionListRowStatus,
	PARENT_SESSION_METADATA_KEY,
	buildMultiSessionList,
} from '../common/multiSessionListModel.js';

const MULTI_SESSION_VIEW_ID = 'agentic.workbench.view.multiSessionList';
const MULTI_SESSION_VIEW_TITLE = localize2('multiSession.viewTitle', "Active Sessions");
const SESSIONS_CONTAINER_ID = 'agentic.workbench.view.sessionsContainer';

/** Refresh cadence for elapsed-time updates. */
const REFRESH_INTERVAL_MS = 5_000;

/**
 * View pane that renders a live list of agent sessions, including
 * orchestrator/specialist nesting via the `parentSessionResource` metadata
 * convention. Selecting a row opens that session via the existing
 * `ISessionsManagementService.openSession`, which is non-disruptive: in-flight
 * requests on other sessions keep streaming.
 */
export class MultiSessionListViewPane extends ViewPane {

	private panel: MultiSessionListPanel | undefined;
	private refreshTimer: ReturnType<typeof setInterval> | undefined;

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ILogService private readonly logService: ILogService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
	}

	protected override renderBody(parent: HTMLElement): void {
		super.renderBody(parent);

		this.panel = this._register(new MultiSessionListPanel(parent, {
			openSession: resource => this.handleOpenSession(resource),
		}));

		this.refreshRows();

		this._register(this.agentSessionsService.model.onDidChangeSessions(() => this.refreshRows()));
		this._register(this.agentSessionsService.onDidChangeSessionArchivedState(() => this.refreshRows()));

		this._register(autorun(reader => {
			const active = this.sessionsManagementService.activeSession.read(reader);
			this.panel?.setActiveResource(active?.resource);
		}));

		this.refreshTimer = setInterval(() => this.refreshRows(), REFRESH_INTERVAL_MS);
		this._register({ dispose: () => clearInterval(this.refreshTimer) });
	}

	override dispose(): void {
		clearInterval(this.refreshTimer);
		super.dispose();
	}

	private refreshRows(): void {
		if (!this.panel) {
			return;
		}
		const sessions = this.agentSessionsService.model.sessions;
		const inputs = sessions.map(s => toInputRow(s));
		const rows = buildMultiSessionList(inputs, { now: Date.now(), maxDepth: 5, limit: 200 });
		this.panel.setRows(rows);
	}

	private handleOpenSession(resource: URI): void {
		void this.sessionsManagementService.openSession(resource).catch(err => {
			this.logService.error(`[MultiSessionListViewPane] Failed to open session ${resource.toString()}:`, err);
		});
	}
}

function toInputRow(session: IAgentSession): MultiSessionInputRow {
	const description = renderDescription(session.description);
	const parentResource = readParentResource(session.metadata);
	return {
		resource: session.resource,
		label: session.label,
		providerType: session.providerType,
		status: mapStatus(session.status),
		archived: session.isArchived(),
		description,
		created: session.timing.created,
		lastActivity: session.timing.lastRequestEnded ?? session.timing.lastRequestStarted,
		parentResource,
	};
}

function renderDescription(description: IAgentSession['description']): string | undefined {
	if (!description) {
		return undefined;
	}
	if (typeof description === 'string') {
		return description;
	}
	return description.value;
}

function readParentResource(metadata: { [key: string]: unknown } | undefined): URI | undefined {
	if (!metadata) {
		return undefined;
	}
	const raw = metadata[PARENT_SESSION_METADATA_KEY];
	if (typeof raw !== 'string' || raw.length === 0) {
		return undefined;
	}
	try {
		return URI.parse(raw);
	} catch {
		return undefined;
	}
}

function mapStatus(status: ChatSessionStatus): MultiSessionListRowStatus {
	switch (status) {
		case ChatSessionStatus.Failed: return MultiSessionListRowStatus.Failed;
		case ChatSessionStatus.Completed: return MultiSessionListRowStatus.Completed;
		case ChatSessionStatus.NeedsInput: return MultiSessionListRowStatus.NeedsInput;
		case ChatSessionStatus.InProgress:
		default:
			return MultiSessionListRowStatus.InProgress;
	}
}

// ── View registration ─────────────────────────────────────────────────────────

const multiSessionViewDescriptor: IViewDescriptor = {
	id: MULTI_SESSION_VIEW_ID,
	name: MULTI_SESSION_VIEW_TITLE,
	ctorDescriptor: new SyncDescriptor(MultiSessionListViewPane),
	canToggleVisibility: true,
	canMoveView: false,
	collapsed: false,
	order: 5,
};

const sessionsContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry)
	.get(SESSIONS_CONTAINER_ID);

if (sessionsContainer) {
	Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry)
		.registerViews([multiSessionViewDescriptor], sessionsContainer);
}
