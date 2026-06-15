/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, type IDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../../base/common/map.js';
import { joinPath } from '../../../../base/common/resources.js';
import { compare as compareStrings } from '../../../../base/common/strings.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService, IFileStatWithMetadata } from '../../../files/common/files.js';
import { ILogService } from '../../../log/common/log.js';

/**
 * The kinds of customizations the agent host discovers from disk.
 *
 * Re-declared on the platform side so this module has no dependency on the
 * workbench-side `PromptsType` enum.
 */
export const enum DiscoveredType {
	Agent = 'agent',
	Skill = 'skill',
	Instruction = 'instruction',
	AgentInstruction = 'agentInstruction',
}

export interface IDiscoveredDirectory {
	readonly uri: URI;
	readonly type: DiscoveredType;
	readonly files: readonly IDiscoveredFile[];
}

export interface IDiscoveredFile {
	readonly uri: URI;
	readonly etag: string;
}

export function areDiscoveredDirectoriesEqual(a: readonly IDiscoveredDirectory[], b: readonly IDiscoveredDirectory[]): boolean {
	if (a.length !== b.length) {
		return false;
	}

	for (let i = 0; i < a.length; i++) {
		const left = a[i];
		const right = b[i];
		if (left.type !== right.type || left.uri.toString() !== right.uri.toString() || !areDiscoveredFilesEqual(left.files, right.files)) {
			return false;
		}
	}

	return true;
}

function compareDiscoveredDirectory(a: IDiscoveredDirectory, b: IDiscoveredDirectory): number {
	const byType = compareStrings(a.type, b.type);
	if (byType !== 0) {
		return byType;
	}
	return compareStrings(a.uri.toString(), b.uri.toString());
}

function areDiscoveredFilesEqual(a: readonly IDiscoveredFile[], b: readonly IDiscoveredFile[]): boolean {
	if (a.length !== b.length) {
		return false;
	}

	for (let i = 0; i < a.length; i++) {
		const left = a[i];
		const right = b[i];
		if (left.uri.toString() !== right.uri.toString() || left.etag !== right.etag) {
			return false;
		}
	}

	return true;
}

function compareDiscoveredFile(a: IDiscoveredFile, b: IDiscoveredFile): number {
	return compareStrings(a.uri.toString(), b.uri.toString());
}

/**
 * Maximum recursion depth when traversing subdirectories for instruction files.
 */
const MAX_INSTRUCTIONS_RECURSION_DEPTH = 5;

const AGENT_FILE_SUFFIX = '.agent.md';
const MARKDOWN_SUFFIX = '.md';
const INSTRUCTION_FILE_SUFFIX = '.instructions.md';
const SKILL_FILENAME = 'SKILL.md';
const README_FILENAME = 'README.md';

interface ISearchRoot {
	readonly path: readonly string[];
	readonly type: DiscoveredType;
	readonly recursive?: boolean; // whether to watch recursively for changes (defaults to false)
}

interface IInstructionFile {
	readonly path: readonly string[];
	readonly filenames: string[];
}

/**
 * Builds the list of search roots for a given working directory and user home.
 * Skills require a depth-2 scan (`<skillDir>/SKILL.md`); agents and instructions
 * are flat single-directory scans.
 */
const searchRoots: { workspace: ISearchRoot[]; user: ISearchRoot[] } = {
	workspace: [
		{ path: ['.github', 'agents'], type: DiscoveredType.Agent },
		{ path: ['.agents', 'agents'], type: DiscoveredType.Agent },
		{ path: ['.claude', 'agents'], type: DiscoveredType.Agent },
		{ path: ['.github', 'skills'], recursive: true, type: DiscoveredType.Skill },
		{ path: ['.agents', 'skills'], recursive: true, type: DiscoveredType.Skill },
		{ path: ['.claude', 'skills'], recursive: true, type: DiscoveredType.Skill },
		{ path: ['.github', 'instructions'], recursive: true, type: DiscoveredType.Instruction },
	],
	user: [
		{ path: ['.copilot', 'agents'], type: DiscoveredType.Agent },
		{ path: ['.agents', 'skills'], recursive: true, type: DiscoveredType.Skill },
		{ path: ['.copilot', 'instructions'], recursive: true, type: DiscoveredType.Instruction },
	],
};


/**
 * Builds the list of instruction file candidates used by the Copilot CLI.
 *
 * Returns paths with filenames for workspace and user-home
 * locations
 */
const agentInstructions: { workspace: IInstructionFile[]; user: IInstructionFile[] } = {
	workspace: [
		{ path: ['.github'], filenames: ['copilot-instructions.md'] },
		{ path: [], filenames: ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md'] },
		{ path: ['.claude'], filenames: ['CLAUDE.md'] },
	],
	user: [
		{ path: ['.copilot'], filenames: ['copilot-instructions.md'] },
	],
};

function throwIfCancelled(token: CancellationToken): void {
	if (token.isCancellationRequested) {
		throw new CancellationError();
	}
}

interface IWatchSpec {
	readonly recursive: boolean;
	readonly resourcesToWatch: ResourceSet;
}

/**
 * Register a watcher for `watchUri` and add `resourceToWatch` to its set of
 * trigger URIs. If a non-recursive entry already exists and `recursive` is
 * true, upgrade it to recursive while preserving the accumulated trigger URIs.
 */
function addWatch(map: ResourceMap<IWatchSpec>, watchUri: URI, recursive: boolean, resourceToWatch: URI): void {
	let entry = map.get(watchUri);
	if (!entry) {
		entry = { recursive, resourcesToWatch: new ResourceSet() };
		map.set(watchUri, entry);
	} else if (recursive && !entry.recursive) {
		entry = { recursive: true, resourcesToWatch: entry.resourcesToWatch };
		map.set(watchUri, entry);
	}
	entry.resourcesToWatch.add(resourceToWatch);
}

/**
 * Discovers customization files (agents, skills, and instructions)
 * under well-known directories of the session's working directory and the
 * user's home, and emits {@link onDidChange} when any of those directories
 * change on disk.
 *
 *
 * Workspace roots take precedence over user-home roots when the same URI is
 * discovered through multiple paths (de-duped by URI).
 */
export class SessionCustomizationDiscovery extends Disposable {

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private readonly _watchers = new ResourceMap<IWatchSpec & { readonly disposable: IDisposable }>();

	constructor(
		private readonly _workingDirectory: URI,
		private readonly _userHome: URI,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register({ dispose: () => this._disposeAllWatchers() });
		this._register(this._fileService.onDidFilesChange(e => {
			for (const watcher of this._watchers.values()) {
				for (const uri of watcher.resourcesToWatch) {
					if (e.affects(uri)) {
						this._scheduleRefresh();
						return;
					}
				}
			}
		}));
	}

	private _scheduleRefresh(): void {
		this._onDidChange.fire();
	}

	/**
	 * Returns the list of discovered customization directories and files in a sorted way.
	 * Also sets up watchers for all discovered root directories (recursively if specified by the root or if already watching recursively).
	 * Each call performs a fresh scan scoped to the provided cancellation token.
	 */
	public async scan(token: CancellationToken): Promise<readonly IDiscoveredDirectory[]> {
		throwIfCancelled(token);

		const nextWatchRootUris = new ResourceMap<IWatchSpec>();
		const seen = new ResourceSet();
		const result: IDiscoveredDirectory[] = [];

		// Workspace first so it wins on URI conflicts.
		await Promise.all([
			...searchRoots.workspace.map(root => this._scanRoot(this._workingDirectory, root, seen, result, nextWatchRootUris, token)),
			...searchRoots.user.map(root => this._scanRoot(this._userHome, root, seen, result, nextWatchRootUris, token)),
			this._scanAgentInstructions(this._workingDirectory, agentInstructions.workspace, seen, result, nextWatchRootUris, token),
			this._scanAgentInstructions(this._userHome, agentInstructions.user, seen, result, nextWatchRootUris, token)
		]);

		throwIfCancelled(token);

		this._reconcileWatchers(nextWatchRootUris);
		return result.sort(compareDiscoveredDirectory);
	}

	/**
	 * Walk the ancestor chain of `path` from `base`. For every ancestor
	 * directory that exists, register a non-recursive watcher whose trigger
	 * URI is the next path segment, so the handler fires when an intermediate
	 * directory (e.g. `.github`, `.github/agents`, `.copilot`) is created and
	 * a re-scan is needed to pick up newly-discoverable content.
	 *
	 * Returns true when every ancestor exists as a directory (i.e. the leaf
	 * may exist). Returns false when an ancestor is missing or not a directory,
	 * in which case the caller can short-circuit.
	 */
	private async _watchAncestors(base: URI, path: readonly string[], watchRootUris: ResourceMap<IWatchSpec>, token: CancellationToken): Promise<boolean> {
		let current = base;
		for (const segment of path) {
			const parent = current;
			const child = joinPath(parent, segment);
			if (!watchRootUris.has(parent)) {
				throwIfCancelled(token);
				try {
					const stat = await this._fileService.resolve(parent);
					if (!stat.isDirectory) {
						return false;
					}
				} catch {
					return false;
				}
			}
			addWatch(watchRootUris, parent, false, child);
			current = child;
		}
		return true;
	}

	private _reconcileWatchers(nextWatchRootUris: ResourceMap<IWatchSpec>): void {
		// Dispose watchers that are gone or whose recursive flag changed.
		for (const [rootUri, watcher] of this._watchers.entries()) {
			const next = nextWatchRootUris.get(rootUri);
			if (!next || next.recursive !== watcher.recursive) {
				watcher.disposable.dispose();
				this._watchers.delete(rootUri);
			}
		}

		for (const [rootUri, next] of nextWatchRootUris.entries()) {
			const existing = this._watchers.get(rootUri);
			if (existing) {
				// Refresh trigger URIs in place; the underlying watcher is unchanged.
				existing.resourcesToWatch.clear();
				for (const uri of next.resourcesToWatch) {
					existing.resourcesToWatch.add(uri);
				}
				continue;
			}
			try {
				const disposable = this._fileService.watch(rootUri, { recursive: next.recursive, excludes: [] });
				this._watchers.set(rootUri, { recursive: next.recursive, resourcesToWatch: next.resourcesToWatch, disposable });
			} catch (err) {
				this._logService.warn(`[SessionCustomizationDiscovery] Failed to watch '${rootUri.toString()}': ${err instanceof Error ? err.message : String(err)}`);
			}
		}
	}

	private _disposeAllWatchers(): void {
		for (const watcher of this._watchers.values()) {
			watcher.disposable.dispose();
		}
		this._watchers.clear();
	}

	/**
	 * For agent instructions, create a single root for the base directory.
	 */
	private async _scanAgentInstructions(base: URI, roots: IInstructionFile[], seen: ResourceSet, result: IDiscoveredDirectory[], watchRootUris: ResourceMap<IWatchSpec>, token: CancellationToken): Promise<void> {
		const files: IDiscoveredFile[] = [];
		for (const root of roots) {
			throwIfCancelled(token);

			if (!await this._watchAncestors(base, root.path, watchRootUris, token)) {
				continue;
			}

			const rootUri = joinPath(base, ...root.path);
			let stat: IFileStatWithMetadata;
			try {
				stat = await this._fileService.resolve(rootUri, { resolveMetadata: true });
			} catch {
				// Root does not exist (or is unreadable) — nothing to discover or watch.
				continue;
			}
			if (!stat.isDirectory || !stat.children) {
				continue;
			}

			// Trigger refresh only for the specific filenames this root cares about
			// (e.g. AGENTS.md at the workspace root) — not for every direct child.
			for (const filename of root.filenames) {
				addWatch(watchRootUris, rootUri, false, joinPath(rootUri, filename));
			}
			for (const entry of stat.children) {
				throwIfCancelled(token);

				if (entry.isFile && root.filenames.includes(entry.name)) {
					const uri = joinPath(rootUri, entry.name);
					if (!seen.has(uri)) {
						seen.add(uri);
						files.push({ uri, etag: entry.etag });
					}
				}
			}
		}
		if (files.length > 0) {
			result.push({ uri: base, type: DiscoveredType.AgentInstruction, files: files.sort(compareDiscoveredFile) });
		}
	}

	private async _scanRoot(base: URI, root: ISearchRoot, seen: ResourceSet, result: IDiscoveredDirectory[], watchRootUris: ResourceMap<IWatchSpec>, token: CancellationToken): Promise<void> {
		throwIfCancelled(token);

		if (!await this._watchAncestors(base, root.path, watchRootUris, token)) {
			return;
		}

		const rootUri = joinPath(base, ...root.path);
		let stat: IFileStatWithMetadata;
		try {
			stat = await this._fileService.resolve(rootUri, { resolveMetadata: true });
		} catch {
			// Root does not exist (or is unreadable) — nothing to discover or watch.
			return;
		}
		if (!stat.isDirectory || !stat.children) {
			return;
		}

		// Filenames are dynamic for these roots, so we watch the whole directory.
		// `addWatch` upgrades to recursive if any root requests it.
		addWatch(watchRootUris, rootUri, root.recursive ?? false, rootUri);

		if (root.type === DiscoveredType.Skill) {
			const files: IDiscoveredFile[] = [];
			for (const child of stat.children) {
				throwIfCancelled(token);

				if (child.isDirectory) {
					const skillFile = joinPath(child.resource, SKILL_FILENAME);
					try {
						const skillStat = await this._fileService.resolve(skillFile, { resolveMetadata: true });
						if (skillStat.isFile && !seen.has(skillFile)) {
							seen.add(skillFile);
							files.push({ uri: skillFile, etag: skillStat.etag });
						}
					} catch {
						// SKILL.md missing — skip this skill directory.
					}
				}
			}
			result.push({ uri: rootUri, type: root.type, files: files.sort(compareDiscoveredFile) });
		} else if (root.type === DiscoveredType.Agent) {
			const files: IDiscoveredFile[] = [];
			// agents are markdown files directly under the root (no subdirectory scanning),
			// excluding only exact-case README.md.
			for (const child of stat.children) {
				throwIfCancelled(token);

				if (child.isFile) {
					const filename = child.name;
					if (filename.endsWith(MARKDOWN_SUFFIX) && filename !== README_FILENAME && !seen.has(child.resource)) {
						seen.add(child.resource);
						files.push({ uri: child.resource, etag: child.etag });
					}
				}
			}
			result.push({ uri: rootUri, type: root.type, files: files.sort(compareDiscoveredFile) });

		} else if (root.type === DiscoveredType.Instruction) {
			const files: IDiscoveredFile[] = [];
			// instructions are all .instructions.md files directly under the root or in a subdirectory
			const findInstructions = async (stat: IFileStatWithMetadata, recursionLevel: number): Promise<void> => {
				throwIfCancelled(token);

				for (const child of stat.children ?? []) {
					throwIfCancelled(token);

					if (child.isFile) {
						const name = child.name.toLowerCase();
						if (name.endsWith(INSTRUCTION_FILE_SUFFIX) && !seen.has(child.resource)) {
							seen.add(child.resource);
							files.push({ uri: child.resource, etag: child.etag });
						}
					} else if (child.isDirectory && recursionLevel < MAX_INSTRUCTIONS_RECURSION_DEPTH) {
						let childStat: IFileStatWithMetadata | undefined = undefined;
						try {
							childStat = await this._fileService.resolve(child.resource, { resolveMetadata: true });
						} catch {
							// Ignore unreadable subdirectories.
						}
						if (childStat) {
							await findInstructions(childStat, recursionLevel + 1);
						}
					}
				}
			};
			await findInstructions(stat, 0);
			result.push({ uri: rootUri, type: root.type, files: files.sort(compareDiscoveredFile) });
		} else {
			this._logService.warn(`[SessionCustomizationDiscovery] Unrecognized root type '${root.type}' for root '${rootUri.toString()}'`);
		}

	}
}

// Test-only helpers — exported as `_internal` to discourage production use.
export const _internal = {
	AGENT_FILE_SUFFIX,
	INSTRUCTION_FILE_SUFFIX,
	SKILL_FILENAME,
	searchRoots,
	agentInstructions,
};
