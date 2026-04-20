/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { autorun, IObservable } from '../../../../base/common/observable.js';
import { basename } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { AgentSession, IAgentConnection, IAgentHostService, type IAgentSessionMetadata } from '../../../../platform/agentHost/common/agentService.js';
import type { IRootState } from '../../../../platform/agentHost/common/state/protocol/state.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionsService } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { AgentHostSessionAdapter, BaseAgentHostSessionsProvider } from './baseAgentHostSessionsProvider.js';
import { buildAgentHostSessionWorkspace } from '../../../common/agentHostSessionWorkspace.js';
import { ISessionType, ISessionWorkspace, ISessionWorkspaceBrowseAction } from '../../../services/sessions/common/session.js';

const LOCAL_PROVIDER_ID = 'local-agent-host';

/**
 * Derives the session type / URI scheme from an agent provider name.
 * Must match the type string registered by AgentHostContribution
 * (`agent-host-${agent.provider}`).
 */
function sessionTypeForProvider(provider: string): string {
	return `agent-host-${provider}`;
}

/**
 * Local-window sessions provider backed by the in-process
 * {@link IAgentHostService}. A thin subclass of
 * {@link BaseAgentHostSessionsProvider} that supplies the local-only
 * variation: a built-in connection that is always present, session-type
 * synchronization from the local agent host's `rootState`, a
 * contributions-based session-type fallback for the pre-hydration window,
 * and a local file-picker browse action.
 */
export class LocalAgentHostSessionsProvider extends BaseAgentHostSessionsProvider {

	readonly id = LOCAL_PROVIDER_ID;
	readonly label: string;
	readonly icon: ThemeIcon = Codicon.vm;
	readonly browseActions: readonly ISessionWorkspaceBrowseAction[];

	private readonly _localLabel = localize('localAgentHostSessionTypeLocation', "Local");
	private readonly _localDescription = new MarkdownString(this._localLabel);
	private _hasRootStateSnapshot = false;

	override get sessionTypes(): readonly ISessionType[] {
		const rootStateValue = this._agentHostService.rootState.value;
		return this._hasRootStateSnapshot || rootStateValue !== undefined ? this._sessionTypes : this._getSessionTypesFromContributions();
	}

	constructor(
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IFileDialogService private readonly _fileDialogService: IFileDialogService,
		@IChatSessionsService chatSessionsService: IChatSessionsService,
		@IChatService chatService: IChatService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
		@ILanguageModelsService languageModelsService: ILanguageModelsService,
	) {
		super(chatSessionsService, chatService, chatWidgetService, languageModelsService);

		this.label = localize('localAgentHostLabel', "Local Agent Host");

		this.browseActions = [{
			label: localize('folders', "Folders"),
			icon: Codicon.folderOpened,
			providerId: this.id,
			run: () => this._browseForFolder(),
		}];

		this._attachConnectionListeners(this._agentHostService, this._store);

		const rootStateValue = this._agentHostService.rootState.value;
		if (rootStateValue !== undefined) {
			this._hasRootStateSnapshot = true;
		}
		if (rootStateValue && !(rootStateValue instanceof Error)) {
			this._syncSessionTypesFromRootState(rootStateValue);
		}
		this._register(this._agentHostService.rootState.onDidChange(rootState => {
			const didHydrate = !this._hasRootStateSnapshot;
			this._hasRootStateSnapshot = true;
			this._syncSessionTypesFromRootState(rootState, didHydrate);
		}));

		// Eagerly populate the session cache once authentication has settled.
		// Without this, the sidebar would only call `getSessions()` after some
		// other event (e.g. a `notify/sessionAdded` after the user sends a
		// message) forced a refresh. We wait for `authenticationPending` to
		// settle because the underlying agent (e.g. CopilotAgent) throws
		// `AHP_AUTH_REQUIRED` from `listSessions()` until its auth token is
		// resolved. The `authenticationPending` observable is sticky (once
		// it goes false it stays false), so this autorun fires
		// `_refreshSessions()` at most once for the eager-load case.
		this._register(autorun(reader => {
			if (this._agentHostService.authenticationPending.read(reader)) {
				return;
			}
			this._cacheInitialized = true;
			this._refreshSessions();
		}));
	}

	// -- BaseAgentHostSessionsProvider hooks ---------------------------------

	protected get connection(): IAgentConnection { return this._agentHostService; }

	protected get authenticationPending(): IObservable<boolean> { return this._agentHostService.authenticationPending; }

	protected createAdapter(meta: IAgentSessionMetadata): AgentHostSessionAdapter {
		const agentProvider = AgentSession.provider(meta.session) ?? 'copilot';
		const sessionType = sessionTypeForProvider(agentProvider);
		return new AgentHostSessionAdapter(meta, this.id, sessionType, sessionType, {
			icon: this.icon,
			description: this._localDescription,
			loading: this._agentHostService.authenticationPending,
			buildWorkspace: (project, workingDirectory) => LocalAgentHostSessionsProvider.buildWorkspace(project, workingDirectory),
		});
	}

	protected resourceSchemeForSessionType(sessionTypeId: string): string {
		return sessionTypeId;
	}

	protected agentProviderFromSessionType(sessionType: string): string {
		const prefix = 'agent-host-';
		return sessionType.startsWith(prefix) ? sessionType.substring(prefix.length) : sessionType;
	}

	// -- Session type sync from root state -----------------------------------

	private _syncSessionTypesFromRootState(rootState: IRootState, forceFire = false): void {
		const next = rootState.agents.map((agent): ISessionType => ({
			id: sessionTypeForProvider(agent.provider),
			label: this._formatSessionTypeLabel(agent.displayName || agent.provider),
			icon: Codicon.vm,
		}));

		const prev = this._sessionTypes;
		if (!forceFire && prev.length === next.length && prev.every((t, i) => t.id === next[i].id && t.label === next[i].label)) {
			return;
		}
		this._sessionTypes = next;
		this._onDidChangeSessionTypes.fire();
	}

	private _formatSessionTypeLabel(agentLabel: string): string {
		return localize('localAgentHostSessionType', "{0} [{1}]", agentLabel, this._localLabel);
	}

	private _getSessionTypesFromContributions(): ISessionType[] {
		return this._chatSessionsService.getAllChatSessionContributions()
			.filter(contribution => contribution.type.startsWith('agent-host-'))
			.map((contribution): ISessionType => ({
				id: contribution.type,
				label: this._formatSessionTypeLabel(contribution.displayName),
				icon: Codicon.vm,
			}));
	}

	// -- Workspaces ----------------------------------------------------------

	static buildWorkspace(project: IAgentSessionMetadata['project'], workingDirectory: URI | undefined): ISessionWorkspace | undefined {
		return buildAgentHostSessionWorkspace(project, workingDirectory, { fallbackIcon: Codicon.folder, requiresWorkspaceTrust: true });
	}

	resolveWorkspace(repositoryUri: URI): ISessionWorkspace {
		const folderName = basename(repositoryUri) || repositoryUri.path;
		return {
			label: folderName,
			icon: Codicon.folder,
			repositories: [{ uri: repositoryUri, workingDirectory: undefined, detail: undefined, baseBranchName: undefined, baseBranchProtected: undefined }],
			requiresWorkspaceTrust: true,
		};
	}

	// -- Browse --------------------------------------------------------------

	private async _browseForFolder(): Promise<ISessionWorkspace | undefined> {
		try {
			const selected = await this._fileDialogService.showOpenDialog({
				canSelectFiles: false,
				canSelectFolders: true,
				canSelectMany: false,
				title: localize('selectLocalFolder', "Select Folder"),
			});
			if (selected?.[0]) {
				return this.resolveWorkspace(selected[0]);
			}
		} catch {
			// dialog was cancelled or failed
		}
		return undefined;
	}
}
