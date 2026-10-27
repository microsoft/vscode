/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { structuralEquals } from '../../../../base/common/equals.js';
import { Emitter } from '../../../../base/common/event.js';
import { Sequencer } from '../../../../base/common/async.js';
import { Disposable, DisposableMap, IDisposable } from '../../../../base/common/lifecycle.js';
import { derivedOpts, IReader, observableSignalFromEvent, runOnChange } from '../../../../base/common/observable.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { AMBIENT_AGENT_HOST_AUTHORITY, IAgentHostConnectionsService } from '../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { AgentHostTcpSupport, getAgentHostTcpSupport } from '../../../../platform/agentHost/common/agentHostTcpSupport.js';
import { agentHostAuthority } from '../../../../platform/agentHost/common/agentHostUri.js';
import { BrowserViewStorageScope, getBrowserViewSessionAffinity, IBrowserViewNetwork, IBrowserViewOwner, toBrowserViewSessionOptions } from '../../../../platform/browserView/common/browserView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { BrowserRemoteProxyEnabledSettingId, IBrowserViewNetworkStatus, IBrowserViewSessionRequest, IBrowserViewWorkbenchService } from '../../../../workbench/contrib/browserView/common/browserView.js';
import { BrowserEditorInput } from '../../../../workbench/contrib/browserView/common/browserEditorInput.js';
import { IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { isAgentHostProvider } from '../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { resolveBrowserOwnerSession } from './sessionBrowserView.js';

/** A browser tab opened from the new-session composer, and the draft it follows (`undefined` until the composer has one). */
interface IComposerTab extends IDisposable {
	draftId: string | undefined;
}

/** The agent host of a view's session and the session, if known. */
interface ISessionHost {
	readonly authority: string | undefined;
	readonly session: ISession | undefined;
}

/**
 * Puts Agents window browsers on the network of the agent host their session
 * runs on. Sessions on the local (ambient) agent host and sessions not backed
 * by an agent host use the local network. Views on a host share a partition
 * of the window's workspace storage per host and folder roots, so a folder's
 * worktrees share it.
 *
 * Registered before editors are restored so restored browser tabs without a
 * saved network resolve one consistently. Reports each host's status: its
 * connection, and whether it can proxy browsers once its handshake says so.
 *
 * Browser tabs opened from the new-session composer follow its draft: when the
 * draft is replaced (another host or folder), or starts on a different host
 * (e.g. a dev container), the tabs are recreated on the new network at the
 * same URL. Tabs merely activated while the composer is shown, tabs of other
 * drafts (e.g. one still starting in the background), and tabs hidden with a
 * session that is not shown are left alone.
 */
export class SessionBrowserNetworkContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionBrowserNetwork';

	/** Browser tabs opened from the new-session composer. */
	private readonly _composerTabs = this._register(new DisposableMap<BrowserEditorInput, IComposerTab>());
	/** Moves of composer tabs run one at a time, so each sees the tabs earlier moves created. */
	private readonly _composerTabMoves = new Sequencer();

	constructor(
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@IAgentHostConnectionsService private readonly _agentHostConnectionsService: IAgentHostConnectionsService,
		@IBrowserViewWorkbenchService private readonly _browserViewService: IBrowserViewWorkbenchService,
		@IEditorService editorService: IEditorService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		// Hosts change status when they connect or disconnect, or when their handshake completes.
		const connectionsChanged = observableSignalFromEvent(this, this._agentHostConnectionsService.onDidChangeConnections);
		const statuses = derivedOpts({ owner: this, equalsFn: structuralEquals }, reader => {
			connectionsChanged.read(reader);
			return this._agentHostConnectionsService.connections.map(({ authority }) => this._getNetworkStatus(authority, reader));
		});
		const onDidChangeNetworkStatus = this._register(new Emitter<void>());
		this._register(runOnChange(statuses, () => onDidChangeNetworkStatus.fire()));

		this._register(this._browserViewService.registerNetworkResolver({
			resolveNetwork: owner => this._getNetwork(this._resolveHost(owner)?.authority),
			resolveStorageAffinity: owner => this._getStorageAffinity(this._resolveHost(owner)),
			getNetworkStatus: network => this._getNetworkStatus(network.authority, undefined),
			onDidChangeNetworkStatus: onDidChangeNetworkStatus.event,
		}));

		// Tabs opened from the composer follow its draft; tabs already open in a group were not opened from it.
		this._register(editorService.onWillOpenEditor(e => {
			const editor = e.editor;
			if (editor instanceof BrowserEditorInput && editor.model?.owner.type !== 'agent' && !this._composerTabs.has(editor) && this._isComposerShown()
				&& !this._editorGroupsService.groups.some(group => group.contains(editor))) {
				this._trackComposerTab(editor, this._sessionsManagementService.newSession.get()?.sessionId);
			}
		}));

		// The composer got a draft, or replaced it without a replacement event (e.g. a quick chat on another host):
		// tabs opened while it had none, or for the previous draft, follow it.
		this._register(runOnChange(this._sessionsManagementService.newSession, (draft, previous) => {
			if (draft) {
				void this._composerTabMoves.queue(() => this._moveComposerTabs(previous?.sessionId, draft, false));
			}
		}));

		// The draft was replaced before sending (another host or folder), including while preparing it for sending.
		this._register(this._sessionsManagementService.onDidReplaceNewDraftSession(({ from, to }) => {
			void this._composerTabMoves.queue(() => this._moveComposerTabs(from.sessionId, to, false));
		}));

		// The draft started: its tabs now belong to the session and stop following it.
		this._register(this._sessionsManagementService.onDidReplaceSession(({ from, to }) => {
			void this._composerTabMoves.queue(() => this._moveComposerTabs(from.sessionId, to, true));
		}));

		// The draft was discarded: its tabs stay where they are.
		this._register(this._sessionsManagementService.onDidDiscardNewSession(draft => {
			void this._composerTabMoves.queue(async () => this._untrackComposerTabs(draft.sessionId));
		}));
	}

	/** Whether the new-session composer is shown: no session is active, or the active one is still the draft. */
	private _isComposerShown(): boolean {
		const active = this._sessionsService.activeSession.get();
		return !active || active.sessionId === this._sessionsManagementService.newSession.get()?.sessionId;
	}

	private _resolveHost(owner: IBrowserViewOwner): ISessionHost | undefined {
		if (owner.type === 'agent') {
			const owning = resolveBrowserOwnerSession(this._sessionsManagementService, owner.sessionId);
			if (!owning) {
				return undefined;
			}
			return owning.session
				? { authority: this._getSessionAuthority(owning.session), session: owning.session }
				: { authority: this._agentHostConnectionsService.resolveSessionResourceIdentity(owning.resource)?.connectionAuthority, session: undefined };
		}
		const session = this._sessionsService.activeSession.get() ?? this._sessionsManagementService.newSession.get();
		return session && { authority: this._getSessionAuthority(session), session };
	}

	private _getSessionAuthority(session: ISession): string | undefined {
		const identity = this._agentHostConnectionsService.resolveSessionResourceIdentity(session.resource);
		if (identity) {
			return identity.connectionAuthority;
		}
		// Drafts are not yet known to the host; use their provider's host.
		const provider = this._sessionsProvidersService.getProvider(session.providerId);
		if (provider && isAgentHostProvider(provider)) {
			return provider.remoteAddress ? agentHostAuthority(provider.remoteAddress) : AMBIENT_AGENT_HOST_AUTHORITY;
		}
		return undefined;
	}

	private _getNetworkStatus(authority: string, reader: IReader | undefined): IBrowserViewNetworkStatus {
		const connection = this._agentHostConnectionsService.getConnectionByAuthority(authority);
		const support = getAgentHostTcpSupport(connection, reader);
		return {
			label: this._agentHostConnectionsService.connections.find(info => info.authority === authority)?.name ?? authority,
			connected: !!connection,
			proxySupported: support === AgentHostTcpSupport.Unknown ? undefined : support === AgentHostTcpSupport.Supported,
		};
	}

	private _getNetwork(authority: string | undefined): IBrowserViewNetwork | undefined {
		return authority && authority !== AMBIENT_AGENT_HOST_AUTHORITY ? { authority } : undefined;
	}

	/** The host and folder roots identify the storage partition; workspace-less sessions have none. */
	private _getStorageAffinity(host: ISessionHost | undefined): string | undefined {
		const network = this._getNetwork(host?.authority);
		const folders = host?.session?.workspace.get()?.folders ?? [];
		if (!network || !folders.length) {
			return undefined;
		}
		const roots = folders.map(folder => this._uriIdentityService.extUri.getComparisonKey(folder.root)).sort();
		return JSON.stringify([network.authority, ...roots]);
	}

	private _trackComposerTab(input: BrowserEditorInput, draftId: string | undefined): void {
		const listener = input.onWillDispose(() => this._composerTabs.deleteAndDispose(input));
		this._composerTabs.set(input, { draftId, dispose: () => listener.dispose() });
	}

	private _untrackComposerTabs(draftId: string | undefined): void {
		for (const [input, tab] of [...this._composerTabs]) {
			if (tab.draftId === draftId) {
				this._composerTabs.deleteAndDispose(input);
			}
		}
	}

	/** Move the tabs that follow a draft (`undefined` for tabs opened before the composer had one) to a session's network. */
	private async _moveComposerTabs(fromDraftId: string | undefined, session: ISession, started: boolean): Promise<void> {
		// With proxying disabled every tab uses the local network, so there is nothing to move.
		const canMove = !!this._configurationService.getValue<boolean>(BrowserRemoteProxyEnabledSettingId);
		for (const [input, tab] of [...this._composerTabs]) {
			if (tab.draftId !== fromDraftId) {
				continue;
			}
			tab.draftId = session.sessionId;
			if (canMove) {
				try {
					await this._reopenOnSessionNetwork(input, session);
				} catch (error) {
					this._logService.error('[SessionBrowserNetwork] Failed to move a browser tab to its session\'s network.', error);
				}
			}
		}
		if (started) {
			this._untrackComposerTabs(session.sessionId);
		}
	}

	/**
	 * A view's session cannot change, so when `input` would get a different one
	 * on `session`'s host and folders, replace it with a new view at the same
	 * URL. The replacement keeps the tab's storage scope, so global storage
	 * (which never uses a remote network) and in-memory storage (which is not
	 * partitioned) only move when their scope can use the difference.
	 */
	private async _reopenOnSessionNetwork(input: BrowserEditorInput, session: ISession): Promise<void> {
		const groups = this._editorGroupsService.groups.filter(group => group.contains(input));
		if (!groups.length) {
			// A hidden tab (e.g. in the saved editors of a session not shown) keeps its network. Replacing it would
			// lose its page, and the saved editors would still restore it.
			return;
		}
		const host: ISessionHost = { authority: this._getSessionAuthority(session), session };
		const network = this._getNetwork(host.authority);
		const affinity = this._getStorageAffinity(host);
		const current = input.session ?? {};
		const target: IBrowserViewSessionRequest = current.scope !== undefined
			? toBrowserViewSessionOptions(current.scope, affinity, network)
			: { ...(affinity !== undefined ? { affinity } : {}), ...(network ? { network } : {}) };
		const key = (request: IBrowserViewSessionRequest) => ({
			network: request.scope === BrowserViewStorageScope.Global ? undefined : request.network?.authority,
			affinity: getBrowserViewSessionAffinity(request),
		});
		if (structuralEquals(key(current), key(target))) {
			return;
		}
		const replacement = this._browserViewService.getOrCreateLazy({
			id: generateUuid(),
			url: input.url,
			title: input.title,
			favicon: input.favicon,
			session: target,
			associatedResource: input.associatedResource,
		});
		this._trackComposerTab(replacement, session.sessionId);
		for (const group of groups) {
			await group.replaceEditors([{
				editor: input,
				replacement,
				options: { pinned: group.isPinned(input), sticky: group.isSticky(input), inactive: !group.isActive(input), preserveFocus: true },
			}]);
		}
		if (!input.isDisposed()) {
			input.dispose(true);
		}
		if (!this._editorGroupsService.groups.some(group => group.contains(replacement))) {
			replacement.dispose(true);
		}
	}
}
