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
import { createChatMementoKey, type IAgentHostChatContribution, type IAgentHostChatContributionContext, type IAppliedClientAction, type IDispatchedAction, type IHydrationContext, type IOutgoingTurn, type ISendContribution, type ITurnEnd } from '../../../common/agentHostChatContributionsService.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { ChatOriginKind, isAhpChatChannel, isDefaultChatUri, parseRequiredSessionUriFromChatUri, type Turn, type URI as ProtocolURI } from '../../../common/state/sessionState.js';
import { resolveAgentHostFileCompletionRoots } from '../../agentHostFileCompletionUtils.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';
import { AgentHostTelemetryReporter, IAgentHostTelemetryReporter, type AgentHostWorkspaceSnapshotPreparation } from '../../agentHostTelemetryReporter.js';
import { IAgentHostWorktreeIsolation } from '../../shared/worktreeIsolation.js';

const firstTurnSeenMemento = createChatMementoKey<boolean>('firstTurnSeen', () => false);
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

function snapshotKey(enumerationRoots: readonly URI[]): string {
	return enumerationRoots.map(root => root.toString()).join('\n');
}

/**
 * Supplies a file-name snapshot on the first turn of a new conversation
 * without changing the user's task text.
 */
export class WorkspaceContextContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'workspaceContext';
	readonly order = 200;
	private readonly _prepared = this._register(new DisposableMap<ProtocolURI, IPreparedSnapshot>());
	/** First-turn chats whose session is creating its worktree, keyed by session id. */
	private readonly _awaitingWorktree = new Map<string, Set<ProtocolURI>>();

	constructor(
		private readonly _context: IAgentHostChatContributionContext,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostWorktreeIsolation private readonly _worktreeIsolation: IAgentHostWorktreeIsolation,
		@IFileService private readonly _fileService: IFileService,
		@IAgentHostTelemetryReporter private readonly _telemetryReporter: AgentHostTelemetryReporter,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(_worktreeIsolation.onDidChangeWorkingDirectoryPending(sessionId => this._onWorktreeResolved(sessionId)));
		this._register(_stateManager.onDidRemoveSession(session => this._releaseSession(session)));
	}

	/**
	 * Starts preparing as soon as a first turn is accepted, so the snapshot is
	 * usually complete by the time {@link onOutgoingTurn} needs it. A session still
	 * creating its worktree waits for {@link _onWorktreeResolved} instead: the
	 * worktree does not exist yet, and walking the source checkout would
	 * compete with its creation.
	 */
	onDidApplyClientAction({ channel, session, action }: IAppliedClientAction): void {
		if (action.type !== ActionType.ChatTurnStarted || !isAhpChatChannel(channel)) {
			return;
		}
		const workingDirectories = this._firstTurnWorkingDirectories(channel);
		if (!workingDirectories) {
			return;
		}
		const sessionId = AgentSession.id(session);
		if (this._worktreeIsolation.isWorkingDirectoryPending(sessionId)) {
			let awaiting = this._awaitingWorktree.get(sessionId);
			if (!awaiting) {
				awaiting = new Set();
				this._awaitingWorktree.set(sessionId, awaiting);
			}
			awaiting.add(channel);
			return;
		}
		// The session's worktree may already exist, e.g. when its creation finished before this hook ran.
		const worktree = isDefaultChatUri(channel) ? this._worktreeIsolation.getResolvedWorktree(sessionId) : undefined;
		this._prepare(channel, worktree ? withProcessRoot(worktree, workingDirectories) : workingDirectories);
	}

	/**
	 * Adds the snapshot for the directories the turn runs in. Preparation that
	 * has not finished, or that has not started because the turn bypassed
	 * `ChatTurnStarted` or its directories changed, gets at most
	 * {@link SNAPSHOT_WAIT_MS}; roots still unfinished after that are omitted.
	 */
	async onOutgoingTurn(turn: IOutgoingTurn): Promise<ISendContribution | undefined> {
		try {
			if (!this._firstTurnWorkingDirectories(turn.chat)) {
				return undefined;
			}
			this._context.memento(firstTurnSeenMemento, turn.chat).set(true, undefined);
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
			}
			const waitMs = Date.now() - waitStarted;
			const structure = prepared.roots.map(root => root.outcome === 'included' ? root.tree : undefined).filter(Boolean).join('\n\n');
			this._report(turn.chat, prepared, preparation, waitMs, structure.length);
			if (!structure) {
				return undefined;
			}
			return {
				instructions: [`<workspace_info>\nInitial workspace structure (file names only):\n${appendEscapedMarkdownCodeBlockFence(structure, 'text')}\nThis snapshot may be truncated or stale. Use tools to inspect file contents and collect more context as needed.\n</workspace_info>`],
			};
		} finally {
			this._release(turn.chat);
		}
	}

	/** Releases preparation for a first turn that ended before it was sent (rejected, cancelled, or failed). */
	onTurnEnd(turn: ITurnEnd): void {
		this._release(turn.channel);
	}

	/** Stops preparation for a removed chat. Session removal is handled through {@link AgentHostStateManager.onDidRemoveSession}. */
	onDidDispatchAction({ action, rejectionReason }: IDispatchedAction): void {
		if (action.type === ActionType.SessionChatRemoved && rejectionReason === undefined) {
			this._release(action.chat);
		}
	}

	onHydrateTurns(context: IHydrationContext, turns: readonly Turn[]): readonly Turn[] {
		if (turns.length > 0) {
			this._context.memento(firstTurnSeenMemento, context.chat).set(true, undefined);
		}
		return turns;
	}

	/** Logs and reports why each root was or was not included, so a missing snapshot can be diagnosed. */
	private _report(chat: ProtocolURI, prepared: IPreparedSnapshot, preparation: AgentHostWorkspaceSnapshotPreparation, waitMs: number, snapshotLength: number): void {
		const count = (outcome: RootOutcome) => prepared.roots.filter(root => root.outcome === outcome).length;
		const omitted = prepared.roots.filter(root => root.outcome !== 'included').map(root => `${root.outcome}: ${root.root.fsPath}`);
		this._logService.info(`[WorkspaceContext] First turn of ${chat}: included ${count('included')}/${prepared.roots.length} roots (${preparation}, waited ${waitMs}ms)${omitted.length ? `; ${omitted.join('; ')}` : ''}`);
		this._telemetryReporter.workspaceSnapshotSent({
			preparation,
			rootCount: prepared.roots.length,
			includedRootCount: count('included'),
			pendingRootCount: count('pending'),
			emptyRootCount: count('empty') + count('gitAdministrative'),
			failedRootCount: count('failed'),
			waitMs,
			snapshotLength,
		});
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
	private _release(chat: ProtocolURI): void {
		for (const [sessionId, awaiting] of this._awaitingWorktree) {
			if (awaiting.delete(chat) && awaiting.size === 0) {
				this._awaitingWorktree.delete(sessionId);
			}
		}
		this._prepared.deleteAndDispose(chat);
	}

	private _releaseSession(session: ProtocolURI): void {
		this._awaitingWorktree.delete(AgentSession.id(session));
		for (const chat of [...this._prepared.keys()]) {
			if (parseRequiredSessionUriFromChatUri(chat) === session) {
				this._prepared.deleteAndDispose(chat);
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
	 * have a snapshot in its provider conversation.
	 */
	private _firstTurnWorkingDirectories(chat: ProtocolURI): URI[] | undefined {
		const state = this._stateManager.getSessionState(chat);
		const chatState = this._stateManager.getChatState(chat);
		if (state?.provider !== 'copilotcli' || !chatState || chatState.turns.length > 0 || this._context.memento(firstTurnSeenMemento, chat).get()) {
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
