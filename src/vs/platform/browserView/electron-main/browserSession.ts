/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { session } from 'electron';
import { normalize } from '../../../base/common/path.js';
import { isLinux } from '../../../base/common/platform.js';
import { joinPath } from '../../../base/common/resources.js';
import { TernarySearchTree } from '../../../base/common/ternarySearchTree.js';
import { URI } from '../../../base/common/uri.js';
import { IApplicationStorageMainService } from '../../storage/electron-main/storageMainService.js';
import { BrowserViewStorageScope, IBrowserSessionOptions } from '../common/browserView.js';
import { BrowserSessionTrust, IBrowserSessionTrust } from './browserSessionTrust.js';
import { BrowserSessionHistory, IBrowserSessionHistory } from './browserSessionHistory.js';
import { BrowserSessionPermissions, IBrowserSessionPermissions } from './browserSessionPermissions.js';
import { BrowserSessionRemote, IBrowserSessionRemote } from './browserSessionRemote.js';
import { FileAccess, Schemas } from '../../../base/common/network.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { localize } from '../../../nls.js';

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
	 *  - Ephemeral scope      -> `"ephemeral:${viewId}"` or `"${type}:${viewId}"` for custom types
	 */
	private static readonly _byId = new Map<string, WeakRef<BrowserSession>>();

	/**
	 * Cleans up stale {@link _byId} entries when the Electron session
	 * they point to is garbage-collected.
	 */
	private static readonly _finalizer = new FinalizationRegistry<string>((id) => {
		BrowserSession._byId.delete(id);
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
	 * Get or create an ephemeral session for the given view / target id.
	 */
	static getOrCreateEphemeral(instantiationService: IInstantiationService, viewId: string, type?: string): BrowserSession {
		if (type === 'workspace' || type === 'ephemeral') {
			throw new Error(`Cannot create session with reserved type '${type}'`);
		}

		const sessionId = `${type ?? 'ephemeral'}:${viewId}`;
		const electronSession = session.fromPartition(`vscode-browser-${type}${viewId}`);
		return BrowserSession._bySession.get(electronSession)
			?? instantiationService.createInstance(BrowserSession, sessionId, electronSession, BrowserViewStorageScope.Ephemeral);
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
	 * @param viewId   Used only for ephemeral sessions where every view
	 *                 needs its own Electron session.
	 * @param sessionOptions  Determines the storage scope for the session.
	 * @param workspaceStorageHome  Root folder under which per-workspace
	 *                              browser storage is created
	 *                              (`IEnvironmentMainService.workspaceStorageHome`).
	 * @param workspaceId  Only required when `scope` is `workspace`.
	 */
	static getOrCreate(
		instantiationService: IInstantiationService,
		viewId: string,
		sessionOptions: IBrowserSessionOptions,
		workspaceStorageHome: URI,
		workspaceId?: string,
	): BrowserSession {
		switch (sessionOptions.scope) {
			case BrowserViewStorageScope.Global:
				return BrowserSession.getOrCreateGlobal(instantiationService);
			case BrowserViewStorageScope.Workspace:
				if (workspaceId) {
					return BrowserSession.getOrCreateWorkspace(instantiationService, workspaceId, workspaceStorageHome);
				}
			// fallthrough -- no workspace context -> ephemeral
			case BrowserViewStorageScope.Ephemeral:
			default:
				return BrowserSession.getOrCreateEphemeral(instantiationService, viewId);
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
	) {
		this._trust = new BrowserSessionTrust(this);
		this._history = new BrowserSessionHistory(this);
		this._remote = new BrowserSessionRemote(this);
		this._permissions = new BrowserSessionPermissions(this);
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
	 * Apply the permission policy and preload scripts to the session.
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
