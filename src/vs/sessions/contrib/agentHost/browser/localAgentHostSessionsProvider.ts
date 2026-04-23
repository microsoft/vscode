/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Schemas } from '../../../../base/common/network.js';
import { autorun, IObservable } from '../../../../base/common/observable.js';
import { basename, dirname } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IAgentConnection, IAgentHostService, type IAgentSessionMetadata } from '../../../../platform/agentHost/common/agentService.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionsService } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { BaseAgentHostSessionsProvider } from './baseAgentHostSessionsProvider.js';
import { buildAgentHostSessionWorkspace } from '../../../common/agentHostSessionWorkspace.js';
import { ISessionWorkspace, ISessionWorkspaceBrowseAction } from '../../../services/sessions/common/session.js';
import { toAgentHostUri } from '../../../../platform/agentHost/common/agentHostUri.js';
import { LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../common/agentHostSessionsProvider.js';

const LOCAL_RESOURCE_SCHEME_PREFIX = 'agent-host-';

/**
 * Local-window sessions provider backed by the in-process
 * {@link IAgentHostService}. A thin subclass of
 * {@link BaseAgentHostSessionsProvider} that supplies the local-only
 * variation: a built-in connection that is always present, session-type
 * synchronization from the local agent host's `rootState`, and a local
 * file-picker browse action.
 */
export class LocalAgentHostSessionsProvider extends BaseAgentHostSessionsProvider {

	readonly id = LOCAL_AGENT_HOST_PROVIDER_ID;
	readonly label: string;
	readonly icon: ThemeIcon = Codicon.vm;
	readonly browseActions: readonly ISessionWorkspaceBrowseAction[];

	private readonly _localLabel = localize('localAgentHostSessionTypeLocation', "Local");
	private readonly _localDescription = new MarkdownString(this._localLabel);

	constructor(
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IFileDialogService private readonly _fileDialogService: IFileDialogService,
		@IChatSessionsService chatSessionsService: IChatSessionsService,
		@IChatService chatService: IChatService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
		@ILanguageModelsService languageModelsService: ILanguageModelsService,
		@ILabelService private readonly _labelService: ILabelService,
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
		if (rootStateValue && !(rootStateValue instanceof Error)) {
			this._syncSessionTypesFromRootState(rootStateValue);
		}
		this._register(this._agentHostService.rootState.onDidChange(rootState => {
			this._syncSessionTypesFromRootState(rootState);
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

	/**
	 * Local resource scheme: `agent-host-${provider}`. Must match the type
	 * string registered by AgentHostContribution. Distinct from the logical
	 * {@link ISession.sessionType}, which is the agent provider name itself
	 * (e.g. `copilotcli`) so the same agent shares one session type across
	 * local and remote hosts.
	 */
	protected resourceSchemeForProvider(provider: string): string {
		return `${LOCAL_RESOURCE_SCHEME_PREFIX}${provider}`;
	}

	protected _adapterOptions() {
		return {
			description: this._localDescription,
			buildWorkspace: (project: IAgentSessionMetadata['project'], workingDirectory: URI | undefined) => {
				const uriForDescription = project?.uri ?? workingDirectory;
				const description = uriForDescription ? this._labelService.getUriLabel(dirname(uriForDescription), { relative: false }) : undefined;
				return buildAgentHostSessionWorkspace(project, workingDirectory, { providerLabel: this._localLabel, fallbackIcon: Codicon.folder, requiresWorkspaceTrust: true, description });
			},
		};
	}

	protected _formatSessionTypeLabel(agentLabel: string): string {
		// Use the unadorned agent label (e.g. "Copilot") rather than tagging it
		// with `[Local]`. The session type id is shared with the extension-host
		// Copilot CLI provider, so the filter menu / new-session picker entry
		// covers both sets of sessions; the `[Local]` tag belongs on the
		// per-session workspace label, not the type label.
		return agentLabel;
	}

	protected override _diffUriMapper(): (uri: URI) => URI {
		return uri => toAgentHostUri(uri, 'local');
	}

	// -- Workspaces ----------------------------------------------------------

	resolveWorkspace(repositoryUri: URI): ISessionWorkspace | undefined {
		if (repositoryUri.scheme !== Schemas.file) {
			return undefined;
		}
		const folderName = basename(repositoryUri) || repositoryUri.path;
		return {
			label: `${folderName} [${this._localLabel}]`,
			description: this._labelService.getUriLabel(dirname(repositoryUri), { relative: false }),
			group: this.label,
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
