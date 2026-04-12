/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { session } from 'electron';
import { joinPath } from '../../../base/common/resources.js';
import { BrowserViewStorageScope } from '../common/browserView.js';
import { BrowserSessionTrust } from './browserSessionTrust.js';
import { FileAccess } from '../../../base/common/network.js';
// Same as webviews, minus clipboard-read
const allowedPermissions = new Set([
    'pointerLock',
    'notifications',
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
export class BrowserSession {
    // #region Static registry
    /**
     * Primary store — keyed by Electron session so entries are
     * automatically removed when the Electron session is GC'd.
     *
     * The goal is to ensure that BrowserSessions have the exact same lifespan as their Electron sessions.
     */
    static { this._bySession = new WeakMap(); }
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
    static { this._byId = new Map(); }
    /**
     * Cleans up stale {@link _byId} entries when the Electron session
     * they point to is garbage-collected.
     */
    static { this._finalizer = new FinalizationRegistry((id) => {
        BrowserSession._byId.delete(id);
    }); }
    /**
     * Weak set mirroring the Electron sessions owned by any BrowserSession.
     * Useful for quickly checking whether a given {@link Electron.WebContents}
     * belongs to the integrated browser.
     */
    static { this.knownSessions = new WeakSet(); }
    /**
     * Check if a {@link Electron.WebContents} belongs to an integrated browser
     * view backed by a BrowserSession.
     */
    static isBrowserViewWebContents(contents) {
        return BrowserSession.knownSessions.has(contents.session);
    }
    /**
     * Return an existing session for the given id, or `undefined`.
     */
    static get(id) {
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
    static getBrowserContextIds() {
        const ids = [];
        for (const [id, ref] of BrowserSession._byId) {
            if (ref.deref()) {
                ids.push(id);
            }
            else {
                BrowserSession._byId.delete(id);
            }
        }
        return ids;
    }
    /**
     * Get or create the singleton global-scope session.
     */
    static getOrCreateGlobal() {
        const electronSession = session.fromPartition('persist:vscode-browser');
        return BrowserSession._bySession.get(electronSession)
            ?? new BrowserSession('global', electronSession, BrowserViewStorageScope.Global);
    }
    /**
     * Get or create a workspace-scope session for the given workspace.
     */
    static getOrCreateWorkspace(workspaceId, workspaceStorageHome) {
        const storage = joinPath(workspaceStorageHome, workspaceId, 'browserStorage');
        const electronSession = session.fromPath(storage.fsPath);
        return BrowserSession._bySession.get(electronSession)
            ?? new BrowserSession(`workspace:${workspaceId}`, electronSession, BrowserViewStorageScope.Workspace);
    }
    /**
     * Get or create an ephemeral session for the given view / target id.
     */
    static getOrCreateEphemeral(viewId, type) {
        if (type === 'workspace' || type === 'ephemeral') {
            throw new Error(`Cannot create session with reserved type '${type}'`);
        }
        const sessionId = `${type ?? 'ephemeral'}:${viewId}`;
        const electronSession = session.fromPartition(`vscode-browser-${type}${viewId}`);
        return BrowserSession._bySession.get(electronSession)
            ?? new BrowserSession(sessionId, electronSession, BrowserViewStorageScope.Ephemeral);
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
    static getOrCreate(viewId, scope, workspaceStorageHome, workspaceId) {
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
    constructor(
    /**
     * Unique identifier for this session.  Derived from what makes the
     * underlying Electron session unique (scope key, workspace id, view
     * id, or context uuid) -- NOT from any particular view id.
     */
    id, 
    /** The underlying Electron session. */
    electronSession, 
    /** Resolved storage scope. */
    storageScope) {
        this.id = id;
        this.electronSession = electronSession;
        this.storageScope = storageScope;
        this._trust = new BrowserSessionTrust(this);
        this.configure();
        BrowserSession.knownSessions.add(electronSession);
        BrowserSession._bySession.set(electronSession, this);
        BrowserSession._byId.set(id, new WeakRef(this));
        BrowserSession._finalizer.register(electronSession, id);
    }
    /** Public trust interface for consumers that need cert operations. */
    get trust() {
        return this._trust;
    }
    /**
     * Connect application storage to this session so that preferences
     * (trusted certificates, permissions, etc.) are persisted across
     * restarts. Restores any previously-saved data on first call;
     * subsequent calls are no-ops.
     */
    connectStorage(storage) {
        this._trust.connectStorage(storage);
    }
    /**
     * Apply the permission policy and preload scripts to the session.
     */
    configure() {
        this.electronSession.setPermissionRequestHandler((_webContents, permission, callback) => {
            return callback(allowedPermissions.has(permission));
        });
        this.electronSession.setPermissionCheckHandler((_webContents, permission, _origin) => {
            return allowedPermissions.has(permission);
        });
        this.electronSession.registerPreloadScript({
            type: 'frame',
            filePath: FileAccess.asFileUri('vs/platform/browserView/electron-browser/preload-browserView.js').fsPath
        });
    }
    /**
     * Clear all session data including trust state and all browsing data.
     */
    async clearData() {
        await this._trust.clear();
        await this.electronSession.clearData();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3NlclNlc3Npb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9icm93c2VyVmlldy9lbGVjdHJvbi1tYWluL2Jyb3dzZXJTZXNzaW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFDbkMsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRzdELE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ25FLE9BQU8sRUFBRSxtQkFBbUIsRUFBd0IsTUFBTSwwQkFBMEIsQ0FBQztBQUNyRixPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFFN0QseUNBQXlDO0FBQ3pDLE1BQU0sa0JBQWtCLEdBQUcsSUFBSSxHQUFHLENBQUM7SUFDbEMsYUFBYTtJQUNiLGVBQWU7SUFDZiwyQkFBMkI7Q0FDM0IsQ0FBQyxDQUFDO0FBRUg7Ozs7Ozs7Ozs7Ozs7O0dBY0c7QUFDSCxNQUFNLE9BQU8sY0FBYztJQUUxQiwwQkFBMEI7SUFFMUI7Ozs7O09BS0c7YUFDcUIsZUFBVSxHQUFHLElBQUksT0FBTyxFQUFvQyxDQUFDO0lBRXJGOzs7Ozs7Ozs7T0FTRzthQUNxQixVQUFLLEdBQUcsSUFBSSxHQUFHLEVBQW1DLENBQUM7SUFFM0U7OztPQUdHO2FBQ3FCLGVBQVUsR0FBRyxJQUFJLG9CQUFvQixDQUFTLENBQUMsRUFBRSxFQUFFLEVBQUU7UUFDNUUsY0FBYyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDakMsQ0FBQyxDQUFDLENBQUM7SUFFSDs7OztPQUlHO2FBQ2Esa0JBQWEsR0FBRyxJQUFJLE9BQU8sRUFBb0IsQ0FBQztJQUVoRTs7O09BR0c7SUFDSCxNQUFNLENBQUMs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