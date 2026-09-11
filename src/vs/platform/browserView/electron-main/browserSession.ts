/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { session } from 'electron';
import { createHash } from 'crypto';
import { normalize } from '../../../base/common/path.js';
import { isLinux } from '../../../base/common/platform.js';
import { joinPath } from '../../../base/common/resources.js';
import { TernarySearchTree } from '../../../base/common/ternarySearchTree.js';
import { URI } from '../../../base/common/uri.js';
import { IApplicationStorageMainService } from '../../storage/electron-main/storageMainService.js';
import { BrowserViewStorageScope, IBrowserViewSessionOptions } from '../common/browserView.js';
import { BrowserSessionTrust, IBrowserSessionTrust } from './browserSessionTrust.js';
import { BrowserSessionHistory, IBrowserSessionHistory } from './browserSessionHistory.js';
import { BrowserSessionPermissions, IBrowserSessionPermissions } from './browserSessionPermissions.js';
import { BrowserSessionRemote, IBrowserSessionRemote } from './browserSessionRemote.js';
import { FileAccess, Schemas } from '../../../base/common/network.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { localize } from '../../../nls.js';
import { IAgentNetworkFilterService } from '../../networkFilter/common/networkFilterService.js';
import { BrowserViewAppPolicyDecision, BrowserViewAppPolicyRequestContext, decideBrowserViewAppPolicyNavigation, equalsBrowserViewAppPolicy, IBrowserViewAppPolicy } from '../common/browserAppPolicy.js';

/**
 * Maps an Electron `webRequest` resource type to the {@link BrowserViewAppPolicyRequestContext}
 * it represents for app-policy purposes. Only `mainFrame` is a top-level navigation;
 * `subFrame` is a nested frame; everything else (scripts, xhr, images, `webSocket`,
 * etc.) is a passive subresource load initiated by already-loaded guest content.
 */
function requestContextForResourceType(resourceType: string): BrowserViewAppPolicyRequestContext {
	switch (resourceType) {
		case 'mainFrame':
			return BrowserViewAppPolicyRequestContext.TopLevel;
		case 'subFrame':
			return BrowserViewAppPolicyRequestContext.Frame;
		default:
			return BrowserViewAppPolicyRequestContext.Subresource;
	}
}

/**
 * Holds an Electron session along with its storage scope and unique browser
 * context identifier.  Each instance maps one-to-one to an Electron
 * {@link Electron.Session} -- the {@link id} is derived from what makes the
 * Electron session unique (scope + workspace), **not** from any view id.
 * Multiple browser views may reference the same `BrowserSession`.
 *
 * The class centralises the permission configuration.  The {@link id}
 * doubles as the CDP `browserContextId`.
 *
 * Instances are produced via the static factory methods
 * ({@link getOrCreate}, {@link getOrCreateGlobal}, etc.) which take an
 * {@link IInstantiationService} to inject service dependencies. The
 * constructor is not meant to be called directly; use the factories so
 * the internal registry stays consistent.
 */
export class BrowserSession {

	// #region Static registry

	/**
	 * Primary store — keyed by Electron session so entries are
	 * automatically removed when the Electron session is GC'd.
	 *
	 * The goal is to ensure that BrowserSessions have the exact same lifespan as their Electron sessions.
	 */
	private static readonly _bySession = new WeakMap<Electron.Session, BrowserSession>();

	/**
	 * String-keyed lookup for {@link get} and {@link getBrowserContextIds}.
	 * Values are weak references so they don't prevent GC of the
	 * {@link BrowserSession} (and transitively the Electron session).
	 *
	 * ID derivation rules (one-to-one with Electron sessions):
	 *  - Global scope         -> `"global"`
	 *  - Workspace scope      -> `"workspace:${workspaceId}"`
	 *  - Ephemeral per-view   -> `"ephemeral:${viewId}"`
	 *  - Agent scope          -> `"agent:${identityHash}"`
	 *  - Custom type          -> `"${type}:${viewId}"`
	 */
	private static readonly _byId = new Map<string, WeakRef<BrowserSession>>();

	/**
	 * Cleans up stale {@link _byId} entries when the Electron session
	 * they point to is garbage-collected.
	 */
	private static readonly _finalizer = new FinalizationRegistry<string>(id => {
		this._byId.delete(id);
	});

	/**
	 * Weak set mirroring the Electron sessions owned by any BrowserSession.
	 * Useful for quickly checking whether a given {@link Electron.WebContents}
	 * belongs to the integrated browser.
	 */
	static readonly knownSessions = new WeakSet<Electron.Session>();

	/**
	 * Check if a {@link Electron.WebContents} belongs to an integrated browser
	 * view backed by a BrowserSession.
	 */
	static isBrowserViewWebContents(contents: Electron.WebContents): boolean {
		return BrowserSession.knownSessions.has(contents.session);
	}

	/**
	 * Return an existing session for the given id, or `undefined`.
	 */
	static get(id: string): BrowserSession | undefined {
		const ref = BrowserSession._byId.get(id);
		if (!ref) {
			return undefined;
		}
		const bs = ref.deref();
		if (!bs) {
			BrowserSession._byId.delete(id);
		}
		return bs;
	}

	/**
	 * Return all live browser context IDs (i.e. all session {@link id}s).
	 */
	static getBrowserContextIds(): string[] {
		const ids: string[] = [];
		for (const [id, ref] of BrowserSession._byId) {
			if (ref.deref()) {
				ids.push(id);
			} else {
				BrowserSession._byId.delete(id);
			}
		}
		return ids;
	}

	/** Update network filtering on all live browser sessions. */
	static updateNetworkFiltering(): void {
		for (const [id, ref] of BrowserSession._byId) {
			const browserSession = ref.deref();
			if (browserSession) {
				browserSession.updateNetworkFilter();
			} else {
				BrowserSession._byId.delete(id);
			}
		}
	}

	/**
	 * Get or create the singleton global-scope session.
	 */
	static getOrCreateGlobal(instantiationService: IInstantiationService): BrowserSession {
		const electronSession = session.fromPartition('persist:vscode-browser');
		return BrowserSession._bySession.get(electronSession)
			?? instantiationService.createInstance(BrowserSession, 'global', electronSession, BrowserViewStorageScope.Global);
	}

	/**
	 * Get or create a workspace-scope session for the given workspace.
	 */
	static getOrCreateWorkspace(instantiationService: IInstantiationService, workspaceId: string, workspaceStorageHome: URI): BrowserSession {
		const storage = joinPath(workspaceStorageHome, workspaceId, 'browserStorage');
		const electronSession = session.fromPath(storage.fsPath);
		return BrowserSession._bySession.get(electronSession)
			?? instantiationService.createInstance(BrowserSession, `workspace:${workspaceId}`, electronSession, BrowserViewStorageScope.Workspace);
	}

	/**
	 * Get or create an ephemeral session for the given view or target ID.
	 */
	static getOrCreateEphemeral(instantiationService: IInstantiationService, viewId: string, type?: string): BrowserSession {
		if (type === 'workspace' || type === 'ephemeral' || type === 'agent') {
			throw new Error(`Cannot create session with reserved type '${type}'`);
		}

		const sessionId = `${type ?? 'ephemeral'}:${viewId}`;
		const electronSession = session.fromPartition(`vscode-browser-${type}${viewId}`);
		return BrowserSession._bySession.get(electronSession)
			?? instantiationService.createInstance(BrowserSession, sessionId, electronSession, BrowserViewStorageScope.Ephemeral);
	}

	/** Get or create an in-memory agent session by affinity, workspace, or window. */
	static getOrCreateAgent(instantiationService: IInstantiationService, workspaceId: string | undefined, affinity?: string, windowId?: number): BrowserSession {
		let identity: string;
		if (affinity !== undefined) {
			identity = `affinity:${affinity}`;
		} else if (workspaceId !== undefined) {
			identity = `workspace:${workspaceId}`;
		} else if (windowId !== undefined) {
			identity = `window:${windowId}`;
		} else {
			throw new Error('Agent browser sessions require an affinity, workspace, or window');
		}
		const identityHash = createHash('sha256').update(identity).digest('hex');
		const electronSession = session.fromPartition(`vscode-browser-agent-${identityHash}`);
		return BrowserSession._bySession.get(electronSession)
			?? instantiationService.createInstance(BrowserSession, `agent:${identityHash}`, electronSession, BrowserViewStorageScope.Agent);
	}

	/**
	 * Get or create a session for a workbench-originated browser view.
	 * The session id is derived from the *scope* -- not the view id -- so
	 * multiple views that share a scope (e.g. two Global views) get the
	 * same `BrowserSession`.
	 *
	 * @param instantiationService Used to construct the session and inject
	 *                             its service dependencies (tunnel proxy,
	 *                             log) when a new session is needed.
	 * @param viewId   Used for ephemeral sessions without an explicit affinity.
	 * @param options  Determines the storage scope for the session.
	 * @param workspaceStorageHome  Root folder under which per-workspace
	 *                              browser storage is created
	 *                              (`IEnvironmentMainService.workspaceStorageHome`).
	 * @param workspaceId  Only required when `scope` is `workspace`.
	 */
	static getOrCreate(
		instantiationService: IInstantiationService,
		viewId: string,
		options: IBrowserViewSessionOptions,
		workspaceStorageHome: URI,
		workspaceId?: string,
		windowId?: number,
	): BrowserSession {
		switch (options.scope) {
			case BrowserViewStorageScope.Global:
				return BrowserSession.getOrCreateGlobal(instantiationService);
			case BrowserViewStorageScope.Workspace:
				if (workspaceId) {
					return BrowserSession.getOrCreateWorkspace(instantiationService, workspaceId, workspaceStorageHome);
				}
				return BrowserSession.getOrCreateEphemeral(instantiationService, viewId);
			case BrowserViewStorageScope.Ephemeral:
				return BrowserSession.getOrCreateEphemeral(instantiationService, viewId);
			case BrowserViewStorageScope.Agent:
				return BrowserSession.getOrCreateAgent(instantiationService, workspaceId, options.affinity, windowId);
		}
	}

	private static readonly _trustedFileRoots = TernarySearchTree.forPaths<true>(!isLinux);
	private static _trustAllFiles = false;

	/**
	 * Set trusted file roots for all browser sessions.
	 */
	static setTrustedFileRoots(roots: readonly string[], trustAllFiles: boolean): void {
		BrowserSession._trustAllFiles = trustAllFiles;
		BrowserSession._trustedFileRoots.clear();
		for (const root of roots) {
			if (root) {
				BrowserSession._trustedFileRoots.set(normalize(root), true);
			}
		}
	}

	// #endregion

	// #region Instance

	private readonly _trust: BrowserSessionTrust;
	private readonly _history: BrowserSessionHistory;
	private readonly _remote: BrowserSessionRemote;
	private readonly _permissions: BrowserSessionPermissions;
	private _networkFilterEnabled = false;
	private _appPolicy: IBrowserViewAppPolicy | undefined;
	/**
	 * View ids currently attached to this session (see {@link attachView}/
	 * {@link detachView}). Because Electron's `session.fromPartition()`
	 * caches by partition string, the same `BrowserSession` instance can
	 * legitimately survive a view's destroy+recreate cycle (e.g. a dev
	 * server restarting on a fresh port). {@link setAppPolicy} only rejects
	 * a policy change while a view is still live, so it fails clearly on an
	 * actual ownership change but allows valid recovery once the old view
	 * has fully detached.
	 */
	private readonly _liveViewIds = new Set<string>();

	/**
	 * @deprecated Don't use this directly. Create sessions via the static factory methods.
	 */
	constructor(
		/**
		 * Unique identifier for this session.  Derived from what makes the
		 * underlying Electron session unique (scope key, workspace id, view
		 * id, or context uuid) -- NOT from any particular view id.
		 */
		readonly id: string,
		/** The underlying Electron session. */
		readonly electronSession: Electron.Session,
		/** Resolved storage scope. */
		readonly storageScope: BrowserViewStorageScope,
		@IAgentNetworkFilterService private readonly agentNetworkFilterService: IAgentNetworkFilterService,
	) {
		this._trust = new BrowserSessionTrust(this);
		this._history = new BrowserSessionHistory(this);
		this._remote = new BrowserSessionRemote(this);
		this._permissions = new BrowserSessionPermissions(this);
		this.updateNetworkFilter();
		this.configure();
		BrowserSession.knownSessions.add(electronSession);
		BrowserSession._bySession.set(electronSession, this);
		BrowserSession._byId.set(id, new WeakRef(this));
		BrowserSession._finalizer.register(electronSession, id);
	}

	/** Public trust interface for consumers that need cert operations. */
	get trust(): IBrowserSessionTrust {
		return this._trust;
	}

	/** Public history interface for consumers that record visits. */
	get history(): IBrowserSessionHistory {
		return this._history;
	}

	/** Public remote interface owning the proxy lifecycle for this session. */
	get remote(): IBrowserSessionRemote {
		return this._remote;
	}

	/** Public permissions interface owning per-origin permission state. */
	get permissions(): IBrowserSessionPermissions {
		return this._permissions;
	}

	/** The local custom-app policy confining this session, if any. See {@link IBrowserViewAppPolicy}. */
	get appPolicy(): IBrowserViewAppPolicy | undefined {
		return this._appPolicy;
	}

	/** Whether any browser view is currently attached to this session (see {@link attachView}). */
	get hasLiveViews(): boolean {
		return this._liveViewIds.size > 0;
	}

	/**
	 * Marks `viewId` as attached to this session for the duration of its
	 * native view's lifetime. Must be paired with {@link detachView} when
	 * the view closes. Used to distinguish a genuine app-policy ownership
	 * change on a still-live view (must fail) from a legitimate
	 * destroy-then-recreate cycle for the same view id after full teardown
	 * (must be allowed to re-confine under a fresh policy).
	 */
	attachView(viewId: string): void {
		this._liveViewIds.add(viewId);
	}

	/** Unmarks `viewId` as attached to this session. See {@link attachView}. */
	detachView(viewId: string): void {
		this._liveViewIds.delete(viewId);
	}

	/**
	 * Opt this (necessarily Ephemeral, per-view) session into a local
	 * custom-app confinement policy. Idempotent when called again with an
	 * equal policy; throws if called with a policy that would silently
	 * change the confinement of an already-policed session **while a view
	 * is still live** -- ownership changes and reloads that would alter the
	 * effective origin must fail clearly rather than reuse a view under a
	 * different policy. A policy change is allowed once no view remains
	 * attached (see {@link attachView}/{@link detachView}), so that a
	 * legitimate provider restart on a fresh endpoint can re-confine the
	 * (Electron-cached) session under its new origin instead of being
	 * refused recovery.
	 */
	setAppPolicy(policy: IBrowserViewAppPolicy): void {
		if (this.storageScope !== BrowserViewStorageScope.Ephemeral) {
			throw new Error(localize('browserSession.appPolicyRequiresEphemeral', "An app policy can only be applied to an ephemeral, per-view browser session."));
		}
		if (this._appPolicy && !equalsBrowserViewAppPolicy(this._appPolicy, policy) && this.hasLiveViews) {
			throw new Error(localize('browserSession.appPolicyMismatch', "This session is already confined to a different app policy."));
		}
		this._appPolicy = policy;
		this.updateNetworkFilter();
	}

	/**
	 * Connect application storage to this session so that preferences
	 * (trusted certificates, history, etc.) are persisted across restarts.
	 * Restores any previously-saved data on first call; subsequent calls
	 * are no-ops.
	 */
	connectStorage(storage: IApplicationStorageMainService): void {
		this._trust.connectStorage(storage);
		this._history.connectStorage(storage);
		this._permissions.connectStorage(storage);
	}

	/**
	 * Dynamically apply network filtering to Agent sessions, or install a
	 * fixed subresource/frame filter for an Ephemeral session that has opted
	 * into a local custom-app policy (see {@link setAppPolicy}). These are
	 * mutually exclusive by construction (an Ephemeral session never has the
	 * Agent network filter service enabled path taken), which matters
	 * because Electron only allows a single active `onBeforeRequest`
	 * listener per session.
	 */
	private updateNetworkFilter(): void {
		if (this.storageScope === BrowserViewStorageScope.Ephemeral) {
			if (!this._appPolicy || this._networkFilterEnabled) {
				return;
			}
			this._networkFilterEnabled = true;
			this.electronSession.webRequest.onBeforeRequest((details, callback) => {
				// Read `this._appPolicy` live on every request (not a value captured at
				// install time): finding #6 allows `setAppPolicy` to re-confine this
				// (Electron-cached) session under a fresh origin once no view remains
				// attached, and enforcement must track that new origin immediately,
				// not the one that existed when the listener happened to be installed.
				const policy = this._appPolicy;
				if (!policy) {
					callback({ cancel: true });
					return;
				}
				const context = requestContextForResourceType(details.resourceType);
				const decision = decideBrowserViewAppPolicyNavigation(policy, details.url, context);
				// Passive subresource/frame loads have no user-mediated "open externally"
				// escape hatch -- only a top-level navigation (handled separately in
				// BrowserView's will-navigate/loadURL/popup handling) may hand off to the
				// OS. Here, anything other than an in-policy Allow must be cancelled.
				callback({ cancel: decision !== BrowserViewAppPolicyDecision.Allow });
			});
			// Downloads are not part of the confined UI surface: an app-policed
			// canvas has no user-mediated "Save As" affordance, so cancel outright
			// rather than silently succeeding into an unmanaged download.
			this.electronSession.on('will-download', event => {
				event.preventDefault();
			});
			return;
		}

		if (this.storageScope !== BrowserViewStorageScope.Agent) {
			return;
		}

		const enabled = this.agentNetworkFilterService.isEnabled();
		if (this._networkFilterEnabled === enabled) {
			return;
		}
		this._networkFilterEnabled = enabled;
		this.electronSession.webRequest.onBeforeRequest(enabled ? (details, callback) => {
			let uri: URI;
			try {
				uri = URI.parse(details.url, true);
			} catch {
				callback({ cancel: true });
				return;
			}
			callback({ cancel: !this.agentNetworkFilterService.isUriAllowed(uri) });
		} : null);
	}

	/**
	 * Apply permissions, protocols, and preload scripts to the session.
	 */
	private configure(): void {
		this._permissions.configure(this.electronSession);
		this.electronSession.registerPreloadScript({
			type: 'frame',
			filePath: FileAccess.asFileUri('vs/platform/browserView/electron-browser/preload-browserView.js').fsPath
		});
		this.electronSession.protocol.handle(Schemas.file, request => {
			const filePath = normalize(URI.parse(request.url).fsPath);
			if (!BrowserSession._trustAllFiles && !BrowserSession._trustedFileRoots.findSubstr(filePath)) {
				return new Response(localize('browserSession.untrustedFile', 'Forbidden. File does not reside within a trusted folder.'), { status: 403 });
			}
			return this.electronSession.fetch(request, { bypassCustomProtocolHandlers: true });
		});
	}

	/**
	 * Clear all session data including trust state, history, and all browsing data.
	 */
	async clearData(): Promise<void> {
		await this._trust.clear();
		this._history.delete();
		this._permissions.clear();
		await this.electronSession.clearData();
	}

	// #endregion
}
