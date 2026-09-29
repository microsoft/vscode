/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../../base/common/async.js';
import { CancellationTokenSource, type CancellationToken } from '../../../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { appendEscapedMarkdownCodeBlockFence } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableMap, type IDisposable } from '../../../../../base/common/lifecycle.js';
import { isAbsolute, join } from '../../../../../base/common/path.js';
import { compare } from '../../../../../base/common/strings.js';
import { URI } from '../../../../../base/common/uri.js';
import { FileType, IFileService } from '../../../../files/common/files.js';
import { ILogService } from '../../../../log/common/log.js';
import { AgentSession } from '../../../common/agent.js';
import { createChatMementoKey, type IAgentHostChatContribution, type IAgentHostChatContributionContext, type IDispatchedAction, type IHydrationContext, type IOutgoingTurn, type ISendContribution, type ITurnEnd } from '../../../common/agentHostChatContributionsService.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { ChatOriginKind, isAhpChatChannel, isDefaultChatUri, parseRequiredSessionUriFromChatUri, type Turn, type URI as ProtocolURI } from '../../../common/state/sessionState.js';
import { resolveAgentHostFileCompletionRoots } from '../../agentHostFileCompletionUtils.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';
import { AgentHostTelemetryReporter, IAgentHostTelemetryReporter, type AgentHostWorkspaceSnapshotPreparation, type IAgentHostWorkspaceSnapshotEvent } from '../../agentHostTelemetryReporter.js';
import { AgentHostTurnTracker, IAgentHostTurnTracker } from '../../agentHostTurnTracker.js';
import { IAgentHostWorktreeIsolation } from '../../shared/worktreeIsolation.js';

/** Whether a turn of the chat reached the provider, so its provider conversation already exists. */
const providerTurnSeenMemento = createChatMementoKey<boolean>('providerTurnSeen', () => false);
/** Turns of the chat that ended without reaching the provider, such as local commands and turns cancelled before dispatch. */
const undispatchedTurnsMemento = createChatMementoKey<ReadonlySet<string>>('undispatchedTurns', () => new Set());
const MAX_STRUCTURE_LENGTH = 2000;
/**
 * Longest the first send waits for a snapshot that is still being prepared.
 * Preparation starts when the turn is accepted and reads only as many
 * directories as fit the budget, so it normally finishes well before the send.
 */
const SNAPSHOT_WAIT_MS = 1000;
/** Folder names never expanded, mirroring the classic Copilot Chat workspace structure. Hidden entries are always skipped. */
const EXCLUDED_FOLDERS = new Set(['node_modules', 'bower_components', 'out', 'dist', '__pycache__', 'venv', 'pods']);
/** File names never listed, mirroring the classic Copilot Chat workspace structure. */
const EXCLUDED_FILES = new Set(['package-lock.json', 'yarn.lock', 'thumbs.db']);

type RootOutcome = 'pending' | 'included' | 'empty' | 'gitAdministrative' | 'failed';

/** One root's preparation, updated in place when it finishes. */
interface IPreparedRoot {
	readonly root: URI;
	outcome: RootOutcome;
	tree: string | undefined;
	readonly done: Promise<void>;
}

/** A chat's snapshot preparation. Disposing it stops any directory walk still running. */
interface IPreparedSnapshot extends IDisposable {
	/** Identifies the roots it was prepared for, to detect a change before send. */
	readonly key: string;
	readonly roots: readonly IPreparedRoot[];
}

/** Mirrors the send path, where a created worktree replaces only the process root. */
function withProcessRoot(worktree: URI, workingDirectories: readonly URI[]): URI[] {
	return [worktree, ...workingDirectories.slice(1)];
}

/** A first turn being tracked until it reaches the provider or ends. */
interface ICandidateTurn {
	readonly turnId: string;
	/** Set once the outgoing turn added a snapshot; reported only if the turn reaches the provider. */
	report?: { readonly event: IAgentHostWorkspaceSnapshotEvent; readonly detail: string };
}

function snapshotKey(enumerationRoots: readonly URI[]): string {
	return enumerationRoots.map(root => root.toString()).join('\n');
}

/**
 * Supplies a file-name snapshot on the first turn of a new conversation
 * without changing the user's task text.
 */
export class WorkspaceContextContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'workspaceContext';
	/**
	 * Before `QueueDrainContribution` (200): its `onTurnEnd` can start a turn
	 * queued behind a local command, and that turn must already see the local
	 * command as undispatched to start preparing. Instructions still follow
	 * `markdownPlanRichLinks` (100) and precede `chatSurface` (300).
	 */
	readonly order = 175;
	private readonly _prepared = this._register(new DisposableMap<ProtocolURI, IPreparedSnapshot>());
	/** First-turn chats whose session is creating its worktree, keyed by session id. */
	private readonly _awaitingWorktree = new Map<string, Set<ProtocolURI>>();
	private readonly _candidates = new Map<ProtocolURI, ICandidateTurn>();

	constructor(
		private readonly _context: IAgentHostChatContributionContext,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostWorktreeIsolation private readonly _worktreeIsolation: IAgentHostWorktreeIsolation,
		@IFileService private readonly _fileService: IFileService,
		@IAgentHostTelemetryReporter private readonly _telemetryReporter: AgentHostTelemetryReporter,
		@IAgentHostTurnTracker turnTracker: AgentHostTurnTracker,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(_worktreeIsolation.onDidChangeWorkingDirectoryPending(sessionId => this._onWorktreeResolved(sessionId)));
		this._register(turnTracker.onDidDispatchTurn(({ chat, turnId }) => this._onTurnDispatched(chat, turnId)));
		this._register(_stateManager.onDidRemoveSession(session => this._releaseSession(session)));
	}

	/**
	 * Adds the snapshot for the directories the turn runs in. Preparation that
	 * has not finished, or that has not started because the turn's directories
	 * changed, gets at most
	 * {@link SNAPSHOT_WAIT_MS}; roots still unfinished after that are omitted.
	 */
	async onOutgoingTurn(turn: IOutgoingTurn): Promise<ISendContribution | undefined> {
		// A send still unwinding after its turn was cancelled must not touch state that a newer turn may own.
		if (!this._isActiveTurn(turn) || !this._firstTurnWorkingDirectories(turn.chat)) {
			return undefined;
		}
		try {
			// Consumed and reported only when the turn reaches the provider; see _onTurnDispatched.
			const candidate: ICandidateTurn = { turnId: turn.turnId };
			this._candidates.set(turn.chat, candidate);
			// Use the directories the provider will run in, not session state: a worktree created on this send is not in state until the provider materializes.
			const { enumerationRoots } = resolveAgentHostFileCompletionRoots(turn.workingDirectories ?? []);
			if (enumerationRoots.length === 0) {
				return undefined;
			}
			const existing = this._prepared.get(turn.chat);
			const preparation: AgentHostWorkspaceSnapshotPreparation = !existing ? 'startedAtSend' : existing.key === snapshotKey(enumerationRoots) ? 'prepared' : 'directoriesChanged';
			const prepared = this._prepare(turn.chat, enumerationRoots);
			const waitStarted = Date.now();
			const pending = prepared.roots.filter(root => root.outcome === 'pending');
			if (pending.length) {
				await raceTimeout(Promise.all(pending.map(root => root.done)), SNAPSHOT_WAIT_MS);
				if (!this._isActiveTurn(turn)) {
					// Cancelled while waiting: its turn end already released this turn's state.
					return undefined;
				}
			}
			const waitMs = Date.now() - waitStarted;
			const structure = prepared.roots.map(root => root.outcome === 'included' ? root.tree : undefined).filter(Boolean).join('\n\n');
			candidate.report = this._createReport(prepared, preparation, waitMs, structure.length);
			if (!structure) {
				return undefined;
			}
			return {
				instructions: [`<workspace_info>\nInitial workspace structure (file names only):\n${appendEscapedMarkdownCodeBlockFence(structure, 'text')}\nThis snapshot may be truncated or stale. Use tools to inspect file contents and collect more context as needed.\n</workspace_info>`],
			};
		} finally {
			if (this._isActiveTurn(turn)) {
				this._stopPreparing(turn.chat);
			}
		}
	}

	private _isActiveTurn(turn: IOutgoingTurn): boolean {
		return this._stateManager.getActiveTurnId(turn.chat) === turn.turnId;
	}

	/**
	 * A first turn that ends without reaching the provider (a local command, or a
	 * turn rejected, cancelled, or failed before dispatch) leaves the snapshot
	 * unconsumed for the next turn that does.
	 */
	onTurnEnd(turn: ITurnEnd): void {
		const candidate = this._candidates.get(turn.channel);
		if (candidate && candidate.turnId === turn.turnId) {
			const undispatched = this._context.memento(undispatchedTurnsMemento, turn.channel);
			undispatched.set(new Set([...undispatched.get(), candidate.turnId]), undefined);
			if (candidate.report) {
				this._logService.info(`[WorkspaceContext] First turn of ${turn.channel} ended (${turn.reason.kind}) before reaching the provider; the snapshot will be added to the next turn that does`);
			}
		}
		this._release(turn.channel);
	}

	/**
	 * Starts preparing as soon as a first turn is accepted, whether a client or
	 * the host (`create_session`, `send_message`, automations) started it, so
	 * the snapshot is usually complete by the time {@link onOutgoingTurn} needs
	 * it. Also stops preparation for a removed chat; session removal is handled
	 * through {@link AgentHostStateManager.onDidRemoveSession}.
	 */
	onDidDispatchAction({ channel, session, action, rejectionReason }: IDispatchedAction): void {
		if (rejectionReason !== undefined) {
			return;
		}
		if (action.type === ActionType.SessionChatRemoved) {
			this._release(action.chat);
		} else if (action.type === ActionType.ChatTurnStarted && isAhpChatChannel(channel)) {
			this._onTurnStarted(channel, session, action.turnId);
		}
	}

	/** A restored chat with history already has a provider conversation. */
	onHydrateTurns(context: IHydrationContext, turns: readonly Turn[]): readonly Turn[] {
		if (turns.length > 0) {
			this._context.memento(providerTurnSeenMemento, context.chat).set(true, undefined);
		}
		return turns;
	}

	/**
	 * A session still creating its worktree waits for {@link _onWorktreeResolved}
	 * instead: the worktree does not exist yet, and walking the source checkout
	 * would compete with its creation.
	 */
	private _onTurnStarted(chat: ProtocolURI, session: ProtocolURI, turnId: string): void {
		const workingDirectories = this._firstTurnWorkingDirectories(chat);
		if (!workingDirectories) {
			return;
		}
		this._candidates.set(chat, { turnId });
		const sessionId = AgentSession.id(session);
		if (this._worktreeIsolation.isWorkingDirectoryPending(sessionId)) {
			let awaiting = this._awaitingWorktree.get(sessionId);
			if (!awaiting) {
				awaiting = new Set();
				this._awaitingWorktree.set(sessionId, awaiting);
			}
			awaiting.add(chat);
			return;
		}
		// The session's worktree may already exist, e.g. when its creation finished before this turn started.
		const worktree = isDefaultChatUri(chat) ? this._worktreeIsolation.getResolvedWorktree(sessionId) : undefined;
		this._prepare(chat, worktree ? withProcessRoot(worktree, workingDirectories) : workingDirectories);
	}

	/** Records why each root was or was not included, so a missing snapshot can be diagnosed. */
	private _createReport(prepared: IPreparedSnapshot, preparation: AgentHostWorkspaceSnapshotPreparation, waitMs: number, snapshotLength: number): ICandidateTurn['report'] {
		const count = (outcome: RootOutcome) => prepared.roots.filter(root => root.outcome === outcome).length;
		const omitted = prepared.roots.filter(root => root.outcome !== 'included').map(root => `${root.outcome}: ${root.root.fsPath}`);
		return {
			detail: `included ${count('included')}/${prepared.roots.length} roots (${preparation}, waited ${waitMs}ms)${omitted.length ? `; ${omitted.join('; ')}` : ''}`,
			event: {
				preparation,
				rootCount: prepared.roots.length,
				includedRootCount: count('included'),
				pendingRootCount: count('pending'),
				emptyRootCount: count('empty') + count('gitAdministrative'),
				failedRootCount: count('failed'),
				waitMs,
				snapshotLength,
			},
		};
	}

	/** Consumes the snapshot once its turn reaches the provider, then logs and reports it. */
	private _onTurnDispatched(chat: ProtocolURI, turnId: string): void {
		const candidate = this._candidates.get(chat);
		if (candidate?.turnId !== turnId) {
			return;
		}
		this._candidates.delete(chat);
		this._context.memento(providerTurnSeenMemento, chat).set(true, undefined);
		if (candidate.report) {
			this._logService.info(`[WorkspaceContext] First turn of ${chat}: ${candidate.report.detail}`);
			this._telemetryReporter.workspaceSnapshotSent(candidate.report.event);
		}
	}

	/** Starts preparing the first-turn snapshots that were waiting for the worktree their session just created. */
	private _onWorktreeResolved(sessionId: string): void {
		const awaiting = this._awaitingWorktree.get(sessionId);
		if (!awaiting || this._worktreeIsolation.isWorkingDirectoryPending(sessionId)) {
			return;
		}
		this._awaitingWorktree.delete(sessionId);
		const worktree = this._worktreeIsolation.getResolvedWorktree(sessionId);
		for (const chat of awaiting) {
			const workingDirectories = this._firstTurnWorkingDirectories(chat);
			if (workingDirectories) {
				this._prepare(chat, worktree ? withProcessRoot(worktree, workingDirectories) : workingDirectories);
			}
		}
	}

	/** Stops a chat's preparation, including a pending wait for its worktree. */
	private _stopPreparing(chat: ProtocolURI): void {
		for (const [sessionId, awaiting] of this._awaitingWorktree) {
			if (awaiting.delete(chat) && awaiting.size === 0) {
				this._awaitingWorktree.delete(sessionId);
			}
		}
		this._prepared.deleteAndDispose(chat);
	}

	/** Stops a chat's preparation and forgets its tracked first turn. */
	private _release(chat: ProtocolURI): void {
		this._stopPreparing(chat);
		this._candidates.delete(chat);
	}

	private _releaseSession(session: ProtocolURI): void {
		this._awaitingWorktree.delete(AgentSession.id(session));
		for (const chat of new Set([...this._prepared.keys(), ...this._candidates.keys()])) {
			if (parseRequiredSessionUriFromChatUri(chat) === session) {
				this._release(chat);
			}
		}
	}

	/**
	 * Returns the chat's snapshot preparation for `workingDirectories`, starting
	 * it unless it is already being prepared for the same roots. A different set
	 * replaces and stops the previous preparation.
	 */
	private _prepare(chat: ProtocolURI, workingDirectories: readonly URI[]): IPreparedSnapshot {
		const { enumerationRoots } = resolveAgentHostFileCompletionRoots(workingDirectories);
		const key = snapshotKey(enumerationRoots);
		const existing = this._prepared.get(chat);
		if (existing?.key === key) {
			return existing;
		}
		const cancellation = new CancellationTokenSource();
		const budget = enumerationRoots.length ? Math.floor(MAX_STRUCTURE_LENGTH / enumerationRoots.length) : 0;
		const roots = enumerationRoots.map(root => {
			const prepared: { -readonly [K in keyof IPreparedRoot]: IPreparedRoot[K] } = { root, outcome: 'pending', tree: undefined, done: Promise.resolve() };
			prepared.done = this._prepareRoot(root, budget, cancellation.token).then(({ outcome, tree }) => {
				prepared.outcome = outcome;
				prepared.tree = tree;
			});
			return prepared;
		});
		const snapshot: IPreparedSnapshot = { key, roots, dispose: () => cancellation.dispose(true) };
		this._prepared.set(chat, snapshot);
		return snapshot;
	}

	/** Renders one root's tree. Failures are isolated to the root, so other roots still contribute. */
	private async _prepareRoot(root: URI, budget: number, token: CancellationToken): Promise<{ outcome: RootOutcome; tree?: string }> {
		try {
			if (await isGitAdministrativeDirectory(this._fileService, root)) {
				return { outcome: 'gitAdministrative' };
			}
			const heading = JSON.stringify(root.fsPath).slice(1, -1);
			const tree = await renderWorkspaceTree(this._fileService, root, budget - heading.length - 3, token);
			if (tree === undefined) {
				return { outcome: 'pending' };
			}
			return tree ? { outcome: 'included', tree: `${heading}\n${tree}` } : { outcome: 'empty' };
		} catch (err) {
			this._logService.warn(`[WorkspaceContext] Could not list ${root.fsPath} for the initial workspace snapshot: ${toErrorMessage(err)}`);
			return { outcome: 'failed' };
		}
	}

	/**
	 * The chat's working directories when its next turn starts a new Copilot
	 * conversation, otherwise `undefined`. Forks and side chats inherit history
	 * that already carries the source chat's context, and tool-spawned chats
	 * receive a focused task from the chat that delegated it. A restored chat
	 * whose history is not loaded yet is never treated as new: it may already
	 * have a snapshot in its provider conversation. Earlier turns that never
	 * reached the provider, such as local commands, do not count.
	 */
	private _firstTurnWorkingDirectories(chat: ProtocolURI): URI[] | undefined {
		const state = this._stateManager.getSessionState(chat);
		const chatState = this._stateManager.getChatState(chat);
		if (state?.provider !== 'copilotcli' || !chatState || this._context.memento(providerTurnSeenMemento, chat).get()) {
			return undefined;
		}
		const undispatched = this._context.memento(undispatchedTurnsMemento, chat).get();
		if (chatState.turns.some(turn => !undispatched.has(turn.id))) {
			return undefined;
		}
		const origin = this._stateManager.getChatOrigin(chat);
		if ((origin && origin.kind !== ChatOriginKind.User) || this._stateManager.getChatInheritedTurnId(chat) !== undefined) {
			return undefined;
		}
		return (state.workingDirectories ?? []).map(directory => URI.parse(directory));
	}
}

/** A listed file or directory. `children` is read only for directories that are expanded. */
interface IWorkspaceNode {
	readonly name: string;
	readonly resource: URI;
	/** Whether to render a trailing `/`. */
	readonly isDirectory: boolean;
	/** Whether to read its children. Symbolic links are listed but never followed, to avoid cycles. */
	readonly expandable: boolean;
	children?: readonly IWorkspaceNode[];
}

/**
 * Reads a directory's visible entries in display order: files before
 * directories, each sorted by name. Hidden entries and the excluded names are
 * skipped. Reads names and types only, never per-file metadata.
 */
async function readChildren(fileService: IFileService, directory: URI): Promise<IWorkspaceNode[]> {
	const provider = fileService.getProvider(directory.scheme);
	if (!provider) {
		return [];
	}
	const entries = await provider.readdir(directory);
	const nodes: IWorkspaceNode[] = [];
	for (const [name, type] of entries) {
		const isDirectory = (type & FileType.Directory) !== 0;
		if (name.startsWith('.') || (isDirectory ? EXCLUDED_FOLDERS : EXCLUDED_FILES).has(name.toLowerCase())) {
			continue;
		}
		nodes.push({ name, resource: URI.joinPath(directory, name), isDirectory, expandable: type === FileType.Directory });
	}
	return nodes.sort((a, b) => Number(a.isDirectory) - Number(b.isDirectory) || compare(a.name, b.name));
}

/**
 * Renders at most `maxLength` characters of `root`'s file names, breadth
 * first so top-level orientation survives truncation, reading only the
 * directories whose names fit. Like the classic Copilot Chat workspace
 * structure it does not apply `.gitignore`. Returns `undefined` once `token`
 * is cancelled.
 */
async function renderWorkspaceTree(fileService: IFileService, root: URI, maxLength: number, token: CancellationToken): Promise<string | undefined> {
	if (maxLength < 4) {
		return '';
	}
	const selected = new Map<IWorkspaceNode, string>();
	// The root must be readable; an unreadable nested directory is shown without children.
	const topLevel = await readChildren(fileService, root);
	let level = topLevel;
	let length = 0;
	let truncated = false;
	for (let depth = 0; level.length > 0 && !truncated; depth++) {
		if (token.isCancellationRequested) {
			return undefined;
		}
		const expanded: IWorkspaceNode[] = [];
		for (const node of level) {
			const line = `${'\t'.repeat(depth)}${JSON.stringify(node.name).slice(1, -1)}${node.isDirectory ? '/' : ''}`;
			if (length + line.length + 1 > maxLength - 4) {
				truncated = true;
				break;
			}
			selected.set(node, line);
			length += line.length + 1;
			if (node.expandable) {
				expanded.push(node);
			}
		}
		if (!truncated) {
			await Promise.all(expanded.map(async node => { node.children = await readChildren(fileService, node.resource).catch(() => []); }));
			level = expanded.flatMap(node => node.children ?? []);
		}
	}
	if (token.isCancellationRequested) {
		return undefined;
	}
	const lines: string[] = [];
	const render = (nodes: readonly IWorkspaceNode[] | undefined): void => {
		for (const node of nodes ?? []) {
			const line = selected.get(node);
			if (line !== undefined) {
				lines.push(line);
				render(node.children);
			}
		}
	};
	render(topLevel);
	if (truncated) {
		lines.push('...');
	}
	return lines.join('\n');
}

/**
 * Whether `directory` is Git's own storage rather than a work tree: inside a
 * `.git` directory, a bare repository, or a linked worktree's admin directory
 * (`<common>/worktrees/<name>`), which can live under a common directory not
 * named `.git`. Their `HEAD`, `config`, `objects/`, and `refs/` are not source
 * files.
 */
async function isGitAdministrativeDirectory(fileService: IFileService, directory: URI): Promise<boolean> {
	if (directory.path.split('/').includes('.git')) {
		return true;
	}
	const stat = (resource: URI) => fileService.stat(resource).catch(() => undefined);
	const [head, objects, refs, dotGit, gitdir, commondir] = await Promise.all(['HEAD', 'objects', 'refs', '.git', 'gitdir', 'commondir'].map(name => stat(URI.joinPath(directory, name))));
	if (dotGit || !head?.isFile) {
		return false;
	}
	if (objects?.isDirectory && refs?.isDirectory) {
		return true;
	}
	if (!gitdir?.isFile || !commondir?.isFile) {
		return false;
	}
	// A linked worktree's admin directory names its shared repository in `commondir`.
	const common = (await fileService.readFile(URI.joinPath(directory, 'commondir')).then(content => content.value.toString(), () => '')).trim();
	if (!common) {
		return false;
	}
	const commonDirectory = isAbsolute(common) ? URI.file(common) : URI.file(join(directory.fsPath, common));
	return !!(await stat(URI.joinPath(commonDirectory, 'objects')))?.isDirectory;
}
