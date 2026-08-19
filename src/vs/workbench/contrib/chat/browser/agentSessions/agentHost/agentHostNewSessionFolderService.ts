/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { extUriBiasedIgnorePathCase, isEqual, type IExtUri } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { RootState, type ISessionFolderPickerDecision } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IChatService } from '../../../common/chatService/chatService.js';

export const IAgentHostNewSessionFolderService = createDecorator<IAgentHostNewSessionFolderService>('agentHostNewSessionFolderService');

/**
 * Computes the ordered working-directory set for a new agent-host session:
 * `[primary, …otherWorkspaceFolders]`, with the primary at index 0. The other
 * workspace folders are included only when the primary is itself a workspace
 * folder and `provider` advertises the `multipleWorkingDirectories` capability
 * in `rootState`; otherwise (single-folder workspace, a standalone primary,
 * unadvertised capability, or an unavailable root state) just `[primary]` is
 * returned. Support is opt-in per the {@link AgentCapabilities} convention, and
 * the node-side guard remains the authoritative backstop. Returns `undefined`
 * when no primary was chosen.
 */
export function computeWorkingDirectories(primary: URI | undefined, workspaceFolders: readonly URI[], rootState: RootState | Error | undefined, provider: string): readonly URI[] | undefined {
	if (!primary) {
		return undefined;
	}
	const supportsMultiple = supportsMultipleWorkingDirectories(rootState, provider);
	if (!supportsMultiple || !workspaceFolders.some(folder => extUriBiasedIgnorePathCase.isEqual(folder, primary))) {
		return [primary];
	}
	return computeDesiredWorkingDirectories(primary, [primary], workspaceFolders);
}

export function supportsMultipleWorkingDirectories(rootState: RootState | Error | undefined, provider: string): boolean {
	const agent = (rootState && !(rootState instanceof Error)) ? rootState.agents.find(a => a.provider === provider) : undefined;
	return !!agent?.capabilities?.multipleWorkingDirectories;
}

/**
 * Whether `provider` pins its first working directory as a fixed process root
 * (`multipleWorkingDirectories.immutablePrimary`). Agents without it treat every
 * working directory as an equal peer.
 */
export function hasImmutablePrimaryWorkingDirectory(rootState: RootState | Error | undefined, provider: string): boolean {
	const agent = (rootState && !(rootState instanceof Error)) ? rootState.agents.find(a => a.provider === provider) : undefined;
	return agent?.capabilities?.multipleWorkingDirectories?.immutablePrimary === true;
}

/**
 * The change a chat widget should apply to the multi-root Folder picker for the
 * harness-owned {@link ISessionFolderPickerDecision}. `noop` means retain the
 * current state (used when a decision transiently disappears during provisional
 * recreation of the *same* session, so the chip does not flash); `apply` carries
 * the new visibility value (the picker is hidden by default and only revealed
 * when the decision says so), the session resource now being tracked, and — only
 * when the harness pins a primary the user hasn't overridden — the folder to
 * auto-select.
 */
export type FolderPickerDecisionUpdate =
	| { readonly kind: 'noop' }
	| { readonly kind: 'apply'; readonly visible: boolean; readonly trackedSessionResource: URI | undefined; readonly selectPrimary: URI | undefined };

/**
 * Pure resolution of {@link FolderPickerDecisionUpdate} from a widget's current
 * inputs. Extracted from the widget so the hidden-by-default reveal, tri-state
 * retain, auto-select gating, after-start suppression, and Agents-window gate are
 * unit-testable without a live chat widget.
 *
 * The picker is hidden until a decision affirmatively reveals it (a decision with
 * `hidden: false`), so it never flashes visible-then-hidden while the decision is
 * still resolving.
 *
 * @param sessionResource the widget's current session, or `undefined`.
 * @param agentHostProviderId the locked Agent Host provider, or `undefined` for a non-Agent-Host widget.
 * @param decision the harness decision for `sessionResource`, or `undefined` when not (yet) known.
 * @param previousTrackedSessionResource the session the current visibility value reflects.
 * @param isSessionsWindow whether the widget lives in the Agents window (which owns folder choice).
 * @param sessionIsEmpty whether the session has no requests yet (its working directory isn't fixed).
 * @param currentSelectedFolder the folder already chosen for `sessionResource`, if any.
 * @param folderExtUri provider-aware comparator (from `IUriIdentityService.extUri`) used to
 * decide whether the pinned primary is already selected, so casing is honored per the folder's
 * actual filesystem instead of assumed.
 */
export function resolveFolderPickerDecisionUpdate(
	sessionResource: URI | undefined,
	agentHostProviderId: string | undefined,
	decision: ISessionFolderPickerDecision | undefined,
	previousTrackedSessionResource: URI | undefined,
	isSessionsWindow: boolean,
	sessionIsEmpty: boolean,
	currentSelectedFolder: URI | undefined,
	folderExtUri: IExtUri,
): FolderPickerDecisionUpdate {
	if (!sessionResource || !agentHostProviderId) {
		return { kind: 'apply', visible: false, trackedSessionResource: undefined, selectPrimary: undefined };
	}
	// Session resources are exact identifiers (their scheme encodes the
	// provider), so compare them case-sensitively.
	const sameSession = isEqual(previousTrackedSessionResource, sessionResource);
	if (!decision) {
		// Retain across a provisional recreation of the same session; stay hidden
		// (the default) for a freshly bound session until a decision reveals it.
		return sameSession
			? { kind: 'noop' }
			: { kind: 'apply', visible: false, trackedSessionResource: sessionResource, selectPrimary: undefined };
	}
	let selectPrimary: URI | undefined;
	// Auto-select the pinned primary only before the session starts (its working
	// directory is fixed once the first request is sent) and never in the Agents
	// window, which owns folder choice through its own workspace picker.
	if (decision.primary && !isSessionsWindow && sessionIsEmpty) {
		const primary = URI.parse(decision.primary);
		// Use the provider-aware comparator so a folder differing only by case is
		// treated as already-selected only when its filesystem is case-insensitive
		// (avoids both a redundant re-select and wrongly suppressing a real change
		// on a case-sensitive remote).
		if (!folderExtUri.isEqual(currentSelectedFolder, primary)) {
			selectPrimary = primary;
		}
	}
	return { kind: 'apply', visible: !decision.hidden, trackedSessionResource: sessionResource, selectPrimary };
}

/**
 * Computes the working-directory set a session should have for the current
 * workspace, as `[primary, ...secondaries]`.
 *
 * A secondary is kept only while it remains a workspace folder, so folders the
 * user removed drop out. Folders the user added are appended. The primary is
 * never dropped, even when it is no longer a workspace folder — an agent's
 * process root is fixed once the session starts.
 *
 * Ordering is stable rather than meaningful: retained secondaries keep their
 * existing order and newly added folders follow workspace order, so an
 * unchanged workspace always recomputes an identical set.
 */
export function computeDesiredWorkingDirectories(
	primary: URI,
	currentWorkingDirectories: readonly URI[],
	workspaceFolders: readonly URI[],
	extUri: IExtUri = extUriBiasedIgnorePathCase,
): readonly URI[] {
	const desired: URI[] = [primary];
	const addIfWorkspaceSecondary = (candidate: URI) => {
		const alreadyIncluded = desired.some(existing => extUri.isEqual(existing, candidate));
		if (alreadyIncluded || !workspaceFolders.some(folder => extUri.isEqual(folder, candidate))) {
			return;
		}
		desired.push(candidate);
	};

	// Retained secondaries first so their existing order survives, then any
	// folder the workspace gained since the set was last computed.
	for (const currentSecondary of currentWorkingDirectories.slice(1)) {
		addIfWorkspaceSecondary(currentSecondary);
	}
	for (const folder of workspaceFolders) {
		addIfWorkspaceSecondary(folder);
	}
	return desired;
}

/**
 * Per-window store of the working directory a user picked for a not-yet-started
 * agent-host session, keyed by the chat session resource it was picked against
 * (including the untitled compose resource). An agent-host session's working
 * directory is an argument to session creation and is immutable afterwards, so
 * in a multi-root window the Folder picker chip records the choice here and the
 * working-directory resolution sites consult it before falling back to the
 * first workspace folder. Keying by the compose resource lets the choice
 * survive the untitled-to-real rebind that happens when the session is created.
 */
export interface IAgentHostNewSessionFolderService {
	readonly _serviceBrand: undefined;

	/**
	 * Fires with the session resource whose chosen folder changed.
	 */
	readonly onDidChangeFolder: Event<URI>;

	/**
	 * The folder chosen for the given session resource, or `undefined` if the
	 * user has not made an explicit choice.
	 */
	getFolder(sessionResource: URI): URI | undefined;

	/**
	 * Record the folder chosen for the given session resource. Fires
	 * {@link onDidChangeFolder} when the value actually changes.
	 */
	setFolder(sessionResource: URI, folder: URI): void;

	/**
	 * Forget any choice recorded for the given session resource.
	 */
	clear(sessionResource: URI): void;

	/**
	 * The most recently chosen folder in this window (across all sessions),
	 * provided it is still a current workspace folder, or `undefined` if the
	 * user has never made an explicit choice (or it is no longer in the
	 * workspace). Unlike {@link getFolder} this is a window-level "sticky"
	 * default that survives session disposal, so a new chat defaults to the
	 * folder the user last picked instead of resetting to the first folder.
	 */
	getDefaultFolder(): URI | undefined;

	/**
	 * The folder a *new* (not-yet-started) session should use, resolved with the
	 * same precedence a freshly created chat would apply: a still-valid explicit
	 * per-session choice, else the still-valid sticky {@link getDefaultFolder},
	 * else the first current workspace folder, else `undefined` (no folders).
	 *
	 * Used to reselect a draft's primary when the folder it pointed at is removed
	 * from the workspace. Every candidate is validated against the *current*
	 * workspace folders, so the removed folder is never returned regardless of the
	 * order in which workspace-change listeners run.
	 */
	resolveNewSessionPrimary(sessionResource: URI): URI | undefined;
}

export class AgentHostNewSessionFolderService extends Disposable implements IAgentHostNewSessionFolderService {
	declare readonly _serviceBrand: undefined;

	private readonly _folders = new ResourceMap<URI>();

	/**
	 * The most recently chosen folder in this window. Window-level "sticky"
	 * default that, unlike {@link _folders}, is not cleared on session
	 * disposal so a new chat can default to the user's last folder choice.
	 */
	private _defaultFolder: URI | undefined;

	private readonly _onDidChangeFolder = this._register(new Emitter<URI>());
	readonly onDidChangeFolder = this._onDidChangeFolder.event;

	constructor(
		@IChatService chatService: IChatService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
	) {
		super();

		// Forget a session's chosen folder once the session is disposed. This
		// bounds the store to live sessions while keeping the choice available
		// for the session's whole lifetime (so the Folder chip keeps showing
		// the right folder after the session has started). The window-level
		// default ({@link _defaultFolder}) is intentionally left untouched.
		this._register(chatService.onDidDisposeSession(e => {
			for (const sessionResource of e.sessionResources) {
				this.clear(sessionResource);
			}
		}));

		// Clear selections for folders actually removed from the workspace while retaining the sticky default.
		this._register(this._workspaceContextService.onDidChangeWorkspaceFolders(e => {
			if (e.removed.length === 0) {
				return;
			}
			const extUri = this._uriIdentityService.extUri;
			const currentFolders = this._workspaceContextService.getWorkspace().folders;
			const staleSessions: URI[] = [];
			for (const [sessionResource, folder] of this._folders) {
				const wasRemoved = e.removed.some(removed => extUri.isEqual(removed.uri, folder));
				const stillPresent = currentFolders.some(current => extUri.isEqual(current.uri, folder));
				if (wasRemoved && !stillPresent) {
					staleSessions.push(sessionResource);
				}
			}
			for (const sessionResource of staleSessions) {
				this.clear(sessionResource);
			}
		}));
	}

	getFolder(sessionResource: URI): URI | undefined {
		return this._folders.get(sessionResource);
	}

	setFolder(sessionResource: URI, folder: URI): void {
		this._defaultFolder = folder;
		const existing = this._folders.get(sessionResource);
		if (existing?.toString() === folder.toString()) {
			return;
		}
		this._folders.set(sessionResource, folder);
		this._onDidChangeFolder.fire(sessionResource);
	}

	clear(sessionResource: URI): void {
		if (this._folders.delete(sessionResource)) {
			this._onDidChangeFolder.fire(sessionResource);
		}
	}

	getDefaultFolder(): URI | undefined {
		const stored = this._defaultFolder;
		if (stored && this._workspaceContextService.getWorkspace().folders.some(folder => this._uriIdentityService.extUri.isEqual(folder.uri, stored))) {
			return stored;
		}
		return undefined;
	}

	resolveNewSessionPrimary(sessionResource: URI): URI | undefined {
		const folders = this._workspaceContextService.getWorkspace().folders;
		// An explicit choice is honored only while it is still a workspace folder;
		// the chip records only workspace folders, so a removed one is skipped here
		// even before the workspace-change listener clears it (order-independent).
		// Uses the same provider-aware comparator as removal detection so both
		// checks agree on case-sensitive remotes.
		const explicit = this._folders.get(sessionResource);
		if (explicit && folders.some(folder => this._uriIdentityService.extUri.isEqual(folder.uri, explicit))) {
			return explicit;
		}
		return this.getDefaultFolder() ?? folders[0]?.uri;
	}
}

registerSingleton(IAgentHostNewSessionFolderService, AgentHostNewSessionFolderService, InstantiationType.Delayed);
