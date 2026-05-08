/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import type { Disposable as CoreDisposable, ProjectContextProvider } from 'son-of-anton-core/host';

/**
 * Identifies which on-disk file the project context was sourced from. The
 * order of these literals also encodes preference: higher-listed values are
 * tried first when multiple are present.
 */
export type ProjectContextSource =
	| '.son-of-anton/AGENTS.md'
	| 'AGENTS.md'
	| 'CLAUDE.md'
	| 'none';

/**
 * Snapshot of the project-context file that was loaded for the current
 * workspace turn. `contents` is the raw markdown body (already truncated to
 * the size cap if necessary); callers are expected to embed it into the
 * system prompt.
 */
export interface ProjectContext {
	readonly source: ProjectContextSource;
	/** Absolute filesystem path of the loaded file, or `undefined` for `'none'`. */
	readonly path?: string;
	/** Raw markdown contents, possibly truncated. Empty when `source === 'none'`. */
	readonly contents: string;
	/** True when the on-disk file exceeded the cap and was truncated. */
	readonly truncated: boolean;
}

/** Hard cap for the loaded body. Roughly ~2000 tokens. */
export const PROJECT_CONTEXT_BYTE_CAP = 8 * 1024;

interface Candidate {
	readonly relPath: string;
	readonly source: ProjectContextSource;
}

/**
 * Priority-ordered list of candidate file paths (relative to the workspace
 * root). The first existing entry wins. Order is significant: the fork-private
 * `.son-of-anton/AGENTS.md` should always shadow a generic `AGENTS.md`, which
 * in turn should shadow a project `CLAUDE.md`.
 *
 * @internal exported for unit tests; treat as private to this module.
 */
export const CANDIDATES: ReadonlyArray<Candidate> = [
	{ relPath: '.son-of-anton/AGENTS.md', source: '.son-of-anton/AGENTS.md' },
	{ relPath: 'AGENTS.md', source: 'AGENTS.md' },
	{ relPath: 'CLAUDE.md', source: 'CLAUDE.md' },
];

const EMPTY_CONTEXT: ProjectContext = {
	source: 'none',
	contents: '',
	truncated: false,
};

/**
 * Locates and loads the highest-priority project-context file in the
 * workspace. Files are watched so that subsequent edits — or the appearance
 * of a higher-priority file — refresh the cached snapshot and fire
 * `onDidChange`.
 *
 * The loader is intentionally self-contained: callers (e.g. the workspace
 * context provider) only need to construct one and call `load()` per chat
 * turn. There are no shared singletons or activation-side wiring.
 */
export class AgentsMdLoader implements vscode.Disposable {
	private readonly disposables: vscode.Disposable[] = [];
	private readonly watchers: vscode.FileSystemWatcher[] = [];
	private readonly _onDidChange = new vscode.EventEmitter<ProjectContext>();
	private cached: ProjectContext | undefined;
	private readonly workspaceFolder: vscode.WorkspaceFolder | undefined;

	/**
	 * Fires whenever the loaded project-context file changes on disk, is
	 * deleted, or when a higher-priority file appears that supersedes the
	 * current one.
	 */
	readonly onDidChange: vscode.Event<ProjectContext> = this._onDidChange.event;

	/**
	 * @param workspaceFolder Folder to scan for context files. Defaults to the
	 * first workspace folder; if there are no folders the loader returns
	 * `'none'` from every call without watching anything.
	 */
	constructor(workspaceFolder?: vscode.WorkspaceFolder) {
		this.workspaceFolder = workspaceFolder ?? vscode.workspace.workspaceFolders?.[0];
		if (this.workspaceFolder) {
			this.installWatchers(this.workspaceFolder);
		}
		this.disposables.push(this._onDidChange);
	}

	/**
	 * Display name of the workspace folder this loader is bound to, or
	 * `undefined` when no folder is open. Used by `WorkspaceAgentsMdProvider`
	 * to label per-root sections in the assembled multi-root markdown.
	 */
	get folderName(): string | undefined {
		return this.workspaceFolder?.name;
	}

	/**
	 * Load (or re-load) the highest-priority context file. Subsequent calls
	 * re-read from disk so callers always observe fresh content; if you need
	 * a memoised value, use `onDidChange` and store the most recent payload.
	 */
	async load(): Promise<ProjectContext> {
		const folder = this.workspaceFolder;
		if (!folder) {
			this.cached = EMPTY_CONTEXT;
			return EMPTY_CONTEXT;
		}

		const result = await pickFirst(CANDIDATES, (relPath, source) =>
			tryLoad(vscode.Uri.joinPath(folder.uri, relPath), source),
		);
		this.cached = result;
		return result;
	}

	dispose(): void {
		for (const watcher of this.watchers) {
			watcher.dispose();
		}
		this.watchers.length = 0;
		for (const d of this.disposables) {
			d.dispose();
		}
		this.disposables.length = 0;
	}

	private installWatchers(folder: vscode.WorkspaceFolder): void {
		// One watcher per candidate so we react to creation/deletion of any
		// of the three independently. Using a single broad glob would also
		// work but would force us to dispatch by path on every event.
		for (const { relPath } of CANDIDATES) {
			const pattern = new vscode.RelativePattern(folder, relPath);
			const watcher = vscode.workspace.createFileSystemWatcher(pattern);
			const refire = () => { void this.refresh(); };
			watcher.onDidChange(refire);
			watcher.onDidCreate(refire);
			watcher.onDidDelete(refire);
			this.watchers.push(watcher);
			this.disposables.push(watcher);
		}
	}

	private async refresh(): Promise<void> {
		const next = await this.load();
		const prev = this.cached;
		// Suppress no-op events when nothing observable has changed.
		if (
			prev &&
			prev.source === next.source &&
			prev.path === next.path &&
			prev.contents === next.contents &&
			prev.truncated === next.truncated
		) {
			return;
		}
		this._onDidChange.fire(next);
	}
}

/**
 * Read `uri` if it exists and convert it into a `ProjectContext`. Returns
 * `undefined` if the file cannot be read (most commonly: it does not exist),
 * letting the caller try the next candidate in the priority list.
 *
 * @internal exported for unit tests; treat as private to this module.
 */
export async function tryLoad(
	uri: vscode.Uri,
	source: ProjectContextSource,
): Promise<ProjectContext | undefined> {
	try {
		const bytes = await vscode.workspace.fs.readFile(uri);
		const text = new TextDecoder('utf-8').decode(bytes);
		const { contents, truncated } = capContents(text, PROJECT_CONTEXT_BYTE_CAP);
		return {
			source,
			path: uri.fsPath,
			contents,
			truncated,
		};
	} catch {
		return undefined;
	}
}

/**
 * Walks `candidates` in order, calling `tryRead` for each, and returns the
 * first non-`undefined` result. If every candidate is missing, returns the
 * empty `'none'` context. Decoupled from `vscode.workspace.fs` so that unit
 * tests can drive the priority logic with an in-memory file map.
 *
 * @internal exported for unit tests; treat as private to this module.
 */
export async function pickFirst(
	candidates: ReadonlyArray<Candidate>,
	tryRead: (relPath: string, source: ProjectContextSource) => Promise<ProjectContext | undefined>,
): Promise<ProjectContext> {
	for (const { relPath, source } of candidates) {
		const result = await tryRead(relPath, source);
		if (result) {
			return result;
		}
	}
	return EMPTY_CONTEXT;
}

/**
 * Minimal output sink used by `WorkspaceAgentsMdProvider` to log when project
 * context files are picked up or change. The extension passes a real
 * `vscode.OutputChannel`; tests can pass an in-memory recorder.
 */
export interface AgentsMdLogger {
	appendLine(line: string): void;
}

/**
 * Multi-root project-context provider used to feed `BaseAgent.buildSystemPrompt`
 * (Phase 67). Wraps one `AgentsMdLoader` per workspace root and assembles the
 * loaded snapshots into a single markdown blob with one section per root that
 * yielded a file.
 *
 * Differences from {@link AgentsMdLoader} (which is consumed by
 * `WorkspaceContextProvider` as an inline chat-turn excerpt):
 *
 * - Operates over **all** workspace roots (multi-root workspaces concatenate
 *   sections, headed with the root folder name).
 * - Exposes a synchronous `get()` because the system-prompt builder runs on
 *   every chat turn and shouldn't await disk I/O. The cached value is
 *   refreshed whenever any underlying file watcher fires.
 * - Logs a single INFO line per file picked up so users can confirm via the
 *   Output channel which AGENTS.md the agents are seeing.
 *
 * The class is structurally identical to a `ProjectContextProvider` so the
 * core package's `CoreHost.projectContext` slot accepts it directly.
 */
export class WorkspaceAgentsMdProvider implements vscode.Disposable, ProjectContextProvider {
	private readonly disposables: vscode.Disposable[] = [];
	private readonly perRootLoaders: AgentsMdLoader[] = [];
	private readonly _onDidChange = new vscode.EventEmitter<void>();
	private cached: string | undefined;
	private readonly logger?: AgentsMdLogger;
	private readonly loggedPaths = new Set<string>();

	readonly onDidChange = (listener: () => void): CoreDisposable => {
		const sub = this._onDidChange.event(listener);
		return { dispose: () => sub.dispose() };
	};

	/**
	 * @param folders Workspace folders to scan. Defaults to
	 * `vscode.workspace.workspaceFolders ?? []`.
	 * @param logger Optional output sink for INFO lines when files are loaded.
	 */
	constructor(folders?: ReadonlyArray<vscode.WorkspaceFolder>, logger?: AgentsMdLogger) {
		this.logger = logger;
		const roots = folders ?? vscode.workspace.workspaceFolders ?? [];
		for (const folder of roots) {
			const loader = new AgentsMdLoader(folder);
			this.perRootLoaders.push(loader);
			this.disposables.push(loader);
			this.disposables.push(
				loader.onDidChange(() => { void this.refresh(); }),
			);
		}
		this.disposables.push(this._onDidChange);
		// Initial load is fire-and-forget; the system prompt will see undefined
		// until the first refresh resolves, which is acceptable: the next chat
		// turn after activation lands well after disk I/O completes.
		void this.refresh();
	}

	/**
	 * Returns the assembled multi-root markdown, or `undefined` if no
	 * workspace root yielded an `AGENTS.md` / `CLAUDE.md`. Synchronous because
	 * `BaseAgent.buildSystemPrompt` runs on every chat turn.
	 */
	get(): string | undefined {
		const value = this.cached;
		if (!value || !value.trim()) {
			return undefined;
		}
		return value;
	}

	dispose(): void {
		for (const d of this.disposables) {
			d.dispose();
		}
		this.disposables.length = 0;
		this.perRootLoaders.length = 0;
	}

	private async refresh(): Promise<void> {
		const sections: string[] = [];
		for (const loader of this.perRootLoaders) {
			const ctx = await loader.load();
			if (ctx.source === 'none' || !ctx.contents.trim()) {
				continue;
			}
			const folderName = loader.folderName ?? 'workspace';
			let body = ctx.contents.trimEnd();
			if (ctx.truncated) {
				body = `${body}\n\n[truncated — file longer than 8KB]`;
			}
			sections.push(`### From ${folderName}\n\n${body}`);

			// One INFO line per file the first time it's seen this session, so
			// the Output channel doesn't churn on every keystroke-driven save.
			if (this.logger && ctx.path && !this.loggedPaths.has(ctx.path)) {
				this.loggedPaths.add(ctx.path);
				this.logger.appendLine(`[AGENTS.md] Loaded project context from ${ctx.path} (source: ${ctx.source})`);
			}
		}
		const next = sections.length > 0 ? sections.join('\n\n') : undefined;
		const changed = (this.cached ?? '') !== (next ?? '');
		this.cached = next;
		if (changed) {
			this._onDidChange.fire();
		}
	}
}

/**
 * Cap `raw` to at most `byteCap` UTF-8 bytes. When truncation is needed we
 * try to break at a paragraph boundary (a blank line) so the embedded prompt
 * doesn't terminate mid-sentence; if no paragraph boundary is found we fall
 * back to the nearest line boundary.
 *
 * @internal exported for unit tests; treat as private to this module.
 */
export function capContents(raw: string, byteCap: number): { contents: string; truncated: boolean } {
	const initial = new TextEncoder().encode(raw);
	if (initial.length <= byteCap) {
		return { contents: raw, truncated: false };
	}

	// Walk back from the cap until we land on a UTF-8 character boundary,
	// then prefer paragraph (\n\n), then line (\n) breaks above that.
	let cut = byteCap;
	while (cut > 0 && (initial[cut] & 0xc0) === 0x80) {
		cut--;
	}
	const decoded = new TextDecoder('utf-8').decode(initial.subarray(0, cut));

	const paragraph = decoded.lastIndexOf('\n\n');
	if (paragraph >= byteCap / 2) {
		return { contents: decoded.slice(0, paragraph).trimEnd(), truncated: true };
	}
	const line = decoded.lastIndexOf('\n');
	if (line >= byteCap / 2) {
		return { contents: decoded.slice(0, line).trimEnd(), truncated: true };
	}
	return { contents: decoded.trimEnd(), truncated: true };
}
