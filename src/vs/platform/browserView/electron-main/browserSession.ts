/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { session } from 'electron';
import { Disposable, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { joinPath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { BrowserViewStorageScope } from '../common/browserView.js';

// Same as webviews
const allowedPermissions = new Set([
	'pointerLock',
	'notifications',
	'clipboard-read',
	'clipboard-sanitized-write'
]);

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
 * This class uses a private constructor with static factory methods
 * ({@link getOrCreate}, {@link getOrCreateGlobal}, etc.) and maintains
 * an internal registry of live sessions. Use the static methods to
 * obtain instances.
 */
export class BrowserSession extends Disposable {

	// #region Static registry

	/**
	 * All live sessions keyed by their unique id.
	 *
	 * ID derivation rules (one-to-one with Electron sessions):
	 *  - Global scope         -> `"global"`
	 *  - Workspace scope      -> `"workspace:${workspaceId}"`
	 *  - Ephemeral scope      -> `"ephemeral:${viewId}"` or `"${type}:${viewId}"` for custom types
	 */
	private static readonly _sessions = new Map<string, BrowserSession>();

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
		return BrowserSession._sessions.get(id);
	}

	/**
	 * Return all live browser context IDs (i.e. all session {@link id}s).
	 */
	static getBrowserContextIds(): string[] {
		return [...BrowserSession._sessions.keys()];
	}

	/**
	 * Get or create the singleton global-scope session.
	 */
	static getOrCreateGlobal(): BrowserSession {
		const existing = BrowserSession._sessions.get('global');
		if (existing) {
			return existing;
		}
		return new BrowserSession('global', session.fromPartition('persist:vscode-browser'), BrowserViewStorageScope.Global);
	}

	/**
	 * Get or create a workspace-scope session for the given workspace.
	 */
	static getOrCreateWorkspace(workspaceId: string, workspaceStorageHome: URI): BrowserSession {
		const sessionId = `workspace:${workspaceId}`;
		const existing = BrowserSession._sessions.get(sessionId);
		if (existing) {
			return existing;
		}
		const storage = joinPath(workspaceStorageHome, workspaceId, 'browserStorage');
		return new BrowserSession(sessionId, session.fromPath(storage.fsPath), BrowserViewStorageScope.Workspace);
	}

	/**
	 * Get or create an ephemeral session for the given view / target id.
	 */
	static getOrCreateEphemeral(viewId: string, type?: string): BrowserSession {
		if (type === 'workspace' || type === 'ephemeral') {
			throw new Error(`Cannot create session with reserved type '${type}'`);
		}

		const sessionId = `${type ?? 'ephemeral'}:${viewId}`;
		const existing = BrowserSession._sessions.get(sessionId);
		if (existing) {
			return existing;
		}
		return new BrowserSession(sessionId, session.fromPartition(`vscode-browser-${type}${viewId}`), BrowserViewStorageScope.Ephemeral);
	}

	/**
	 * Get or create a session for a workbench-originated browser view.
	 * The session id is derived from the *scope* -- not the view id -- so
	 * multiple views that share a scope (e.g. two Global views) get the
	 * same `BrowserSession`.
	 *
	 * @param viewId   Used only for ephemeral sessions where every view
	 *                 needs its own Electron session.
	 * @param scope    Desired storage scope.
	 * @param workspaceStorageHome  Root folder under which per-workspace
	 *                              browser storage is created
	 *                              (`IEnvironmentMainService.workspaceStorageHome`).
	 * @param workspaceId  Only required when `scope` is `workspace`.
	 */
	static getOrCreate(
		viewId: string,
		scope: BrowserViewStorageScope,
		workspaceStorageHome: URI,
		workspaceId?: string,
	): BrowserSession {
		switch (scope) {
			case BrowserViewStorageScope.Global:
				return BrowserSession.getOrCreateGlobal();
			case BrowserViewStorageScope.Workspace:
				if (workspaceId) {
					return BrowserSession.getOrCreateWorkspace(workspaceId, workspaceStorageHome);
				}
			// fallthrough -- no workspace context -> ephemeral
			case BrowserViewStorageScope.Ephemeral:
			default:
				return BrowserSession.getOrCreateEphemeral(viewId);
		}
	}

	// #endregion

	// #region Instance

	// Reference count how many browser views are currently using this session.
	// When the count drops to zero, the session is removed from the registry.
	private refs = 0;

	private constructor(
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
		super();

		if (BrowserSession._sessions.has(id)) {
			throw new Error(`BrowserSession with id '${id}' already exists`);
		}

		this.configureSession();
		BrowserSession.knownSessions.add(electronSession);
		BrowserSession._sessions.set(id, this);
	}

	/**
	 * Apply the standard permission policy to the session.
	 */
	private configureSession(): void {
		this.electronSession.setPermissionRequestHandler((_webContents, permission, callback) => {
			return callback(allowedPermissions.has(permission));
		});
		this.electronSession.setPermissionCheckHandler((_webContents, permission, _origin) => {
			return allowedPermissions.has(permission);
		});
	}

	public acquire(): IDisposable {
		this.refs++;
		return toDisposable(() => {
			this.refs--;
			if (this.refs === 0) {
				this.dispose();
			}
		});
	}

	override dispose(): void {
		if (this.refs > 0) {
			throw new Error(`Cannot dispose BrowserSession because it is still in use`);
		}

		BrowserSession._sessions.delete(this.id);
		super.dispose();
	}

	// #endregion
}
