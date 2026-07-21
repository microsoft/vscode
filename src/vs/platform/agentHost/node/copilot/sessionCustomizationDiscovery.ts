/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotClient } from '@github/copilot-sdk';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, type IDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../../base/common/map.js';
import { joinPath, dirname as uriDirname } from '../../../../base/common/resources.js';
import { compare as compareStrings } from '../../../../base/common/strings.js';
import { URI } from '../../../../base/common/uri.js';
import { basename, isAbsolute } from '../../../../base/common/path.js';
import { IFileService, IFileStatWithMetadata } from '../../../files/common/files.js';
import { ILogService } from '../../../log/common/log.js';
import type { AgentsDiscoverRequest } from './copilotRCP.js';
import { AgentCustomization, ChildCustomization, CustomizationLoadStatus, CustomizationType, DirectoryCustomization, RuleCustomization, SkillCustomization, customizationId } from '../../common/state/sessionState.js';
import { ChildCustomizationType } from '../../common/state/protocol/state.js';
import { toAgentCustomizationMeta } from '../../common/meta/agentCustomizationMeta.js';
import { raceCancellationError } from '../../../../base/common/async.js';

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
	Hook = 'hook',
	AgentInstruction = 'agentInstruction',
}

export interface IDiscoveredDirectory {
	readonly uri: URI;
	readonly type: DiscoveredType;
	readonly name: string;
	readonly writable: boolean;
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

function compareDirectoryCustomization(a: DirectoryCustomization, b: DirectoryCustomization): number {
	const byUri = compareStrings(a.uri, b.uri);
	if (byUri !== 0) {
		return byUri;
	}
	return compareStrings(a.contents, b.contents);
}

/**
 * Maximum recursion depth when traversing subdirectories for instruction files.
 */
const MAX_INSTRUCTIONS_RECURSION_DEPTH = 5;
const MAX_HOOKS_RECURSION_DEPTH = 8;

const AGENT_FILE_SUFFIX = '.agent.md';
const MARKDOWN_SUFFIX = '.md';
const INSTRUCTION_FILE_SUFFIX = '.instructions.md';
const HOOK_FILE_SUFFIX = '.json';
const SKILL_FILENAME = 'SKILL.md';
const README_FILENAME = 'README.md';

interface ISearchRoot {
	readonly path: readonly string[];
	readonly type: DiscoveredType;
	readonly recursive?: boolean; // whether to watch recursively for changes (defaults to false)
	readonly name: string;
}

interface IFixedDiscoveryFile {
	readonly path: readonly string[];
	readonly filenames: string[];
	readonly type: DiscoveredType;
}

/**
 * Builds the list of search roots for a given working directory and user home.
 * Skills require a depth-2 scan (`<skillDir>/SKILL.md`), agents are scanned at
 * a single directory depth, and instructions/hooks are recursively scanned.
 */
const searchRoots: { workspace: ISearchRoot[]; user: ISearchRoot[] } = {
	workspace: [
		{ path: ['.github', 'agents'], type: DiscoveredType.Agent, name: '.github' },
		{ path: ['.agents', 'agents'], type: DiscoveredType.Agent, name: '.agents' },
		{ path: ['.claude', 'agents'], type: DiscoveredType.Agent, name: '.claude' },
		{ path: ['.github', 'skills'], recursive: true, type: DiscoveredType.Skill, name: '.github' },
		{ path: ['.agents', 'skills'], recursive: true, type: DiscoveredType.Skill, name: '.agents' },
		{ path: ['.claude', 'skills'], recursive: true, type: DiscoveredType.Skill, name: '.claude' },
		{ path: ['.github', 'instructions'], recursive: true, type: DiscoveredType.Instruction, name: '.github' },
		{ path: ['.github', 'hooks'], recursive: true, type: DiscoveredType.Hook, name: '.github' },

	],
	user: [
		{ path: ['.copilot', 'agents'], type: DiscoveredType.Agent, name: '~/.copilot' },
		{ path: ['.agents', 'skills'], recursive: true, type: DiscoveredType.Skill, name: '~/.agents' },
		{ path: ['.copilot', 'skills'], recursive: true, type: DiscoveredType.Skill, name: '~/.copilot' },
		{ path: ['.copilot', 'instructions'], recursive: true, type: DiscoveredType.Instruction, name: '~/.copilot' },
		{ path: ['.copilot', 'hooks'], recursive: true, type: DiscoveredType.Hook, name: '~/.copilot' },
	],
};


/**
 * Builds the list of instruction file candidates used by the Copilot CLI.
 *
 * Returns paths with filenames for workspace and user-home
 * locations
 */
const fixedDiscoveryFiles: { workspace: IFixedDiscoveryFile[]; user: IFixedDiscoveryFile[] } = {
	workspace: [
		{ path: ['.github'], filenames: ['copilot-instructions.md'], type: DiscoveredType.AgentInstruction },
		{ path: [], filenames: ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md'], type: DiscoveredType.AgentInstruction },
		{ path: ['.claude'], filenames: ['CLAUDE.md'], type: DiscoveredType.AgentInstruction },
		{ path: ['.github', 'copilot'], filenames: ['settings.json', 'settings.local.json'], type: DiscoveredType.Hook },
		{ path: ['.claude'], filenames: ['settings.json', 'settings.local.json'], type: DiscoveredType.Hook },
	],
	user: [
		{ path: ['.copilot'], filenames: ['copilot-instructions.md'], type: DiscoveredType.AgentInstruction },
	],
};

// Back-compat alias for tests and callers that referenced the old symbol name.
const agentInstructions = fixedDiscoveryFiles;

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
 * Discovers customization files (agents, skills, instructions, and hooks)
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
		private readonly _workingDirectory: URI[],
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

	public async discover(client: CopilotClient, token: CancellationToken): Promise<readonly DirectoryCustomization[]> {
		throwIfCancelled(token);

		const p: AgentsDiscoverRequest = { projectPaths: this._workingDirectory.map(uri => uri.fsPath) };

		try {
			const [agents, rules, skills] = await Promise.all([
				this.discoverAgents(p, client, token),
				this.discoverRules(p, client, token),
				this.discoverSkills(p, client, token)
			]);
			throwIfCancelled(token);

			const result: DirectoryCustomization[] = [];
			this.toDirectoryCustomizations(CustomizationType.Agent, agents, result);
			this.toDirectoryCustomizations(CustomizationType.Rule, rules, result);
			this.toDirectoryCustomizations(CustomizationType.Skill, skills, result);
			return result.sort(compareDirectoryCustomization);
		} catch (err) {
			this._logService.error(`[SessionCustomizationDiscovery] Error during discovery: ${err instanceof Error ? err.message : String(err)}`);
			return [];
		}
	}

	private async discoverAgents(discoveryRequest: AgentsDiscoverRequest, client: CopilotClient, token: CancellationToken): Promise<AgentCustomization[]> {
		const agents: AgentCustomization[] = [];

		const agentDiscovery = await raceCancellationError(client.rpc.agents.discover(discoveryRequest), token);
		for (const agent of agentDiscovery.agents) {
			if (agent.path) {
				const uri = URI.file(agent.path);
				agents.push({ type: CustomizationType.Agent, uri: uri.toString(), id: agent.id, name: agent.name, description: agent.description, _meta: toAgentCustomizationMeta({ userInvocable: agent.userInvocable }) });
			}
		}
		return agents;
	}

	private async discoverRules(discoveryRequest: AgentsDiscoverRequest, client: CopilotClient, token: CancellationToken): Promise<RuleCustomization[]> {
		const rules: RuleCustomization[] = [];
		const projectPaths = discoveryRequest.projectPaths ?? [];
		await Promise.all(projectPaths.map(async projectPath => {
			const perProjectdiscoveryRequest: AgentsDiscoverRequest = { projectPaths: [projectPath], excludeHostAgents: discoveryRequest.excludeHostAgents };
			const instructionDiscovery = await raceCancellationError(client.rpc.instructions.discover(perProjectdiscoveryRequest), token);
			for (const instruction of instructionDiscovery.sources) {
				let uri: URI;
				if (isAbsolute(instruction.sourcePath)) {
					uri = URI.file(instruction.sourcePath);
				} else {
					uri = joinPath(URI.file(projectPath), instruction.sourcePath);
				}
				rules.push({ type: CustomizationType.Rule, uri: uri.toString(), id: instruction.id, name: instruction.label, description: instruction.description, globs: instruction.applyTo, alwaysApply: false });
			}
		}));
		return rules;
	}

	private async discoverSkills(discoveryRequest: AgentsDiscoverRequest, client: CopilotClient, token: CancellationToken): Promise<SkillCustomization[]> {
		const skills: SkillCustomization[] = [];

		const skillDiscovery = await raceCancellationError(client.rpc.skills.discover(discoveryRequest), token);
		for (const skill of skillDiscovery.skills) {
			if (skill.path) {
				const uri = URI.file(skill.path);
				skills.push({ type: CustomizationType.Skill, uri: uri.toString(), id: skill.path, name: skill.name, description: skill.description });
			}
		}
		return skills;
	}

	private toDirectoryCustomizations(type: ChildCustomizationType, customizations: readonly ChildCustomization[], result: DirectoryCustomization[]): void {
		const byParent = new ResourceMap<{ readonly uri: URI; readonly children: ChildCustomization[] }>();
		for (const customization of customizations) {
			if (customization.type !== type) {
				continue;
			}
			const childUri = URI.parse(customization.uri);
			const parentUri = uriDirname(childUri);
			let entry = byParent.get(parentUri);
			if (!entry) {
				entry = { uri: parentUri, children: [] };
				byParent.set(parentUri, entry);
			}
			entry.children.push(customization);
		}

		for (const { uri, children } of byParent.values()) {
			children.sort((a, b) => compareStrings(a.uri, b.uri));
			result.push({
				type: CustomizationType.Directory,
				id: customizationId(uri.toString()),
				uri: uri.toString(),
				name: basename(uri.path),
				enabled: true,
				contents: type,
				writable: true,
				load: { kind: CustomizationLoadStatus.Loaded },
				children,
			});
		}
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
			...searchRoots.workspace.map(root => this._workingDirectory.map(workingDirectory => this._scanRoot(workingDirectory, root, seen, result, nextWatchRootUris, token))).flat(),
			...searchRoots.user.map(root => this._scanRoot(this._userHome, root, seen, result, nextWatchRootUris, token)),
			...this._workingDirectory.map(workingDirectory => this._scanFixedDiscoveryFiles(workingDirectory, fixedDiscoveryFiles.workspace, seen, result, nextWatchRootUris, token)).flat(),
			this._scanFixedDiscoveryFiles(this._userHome, fixedDiscoveryFiles.user, seen, result, nextWatchRootUris, token)
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
	 * For fixed discovery files (e.g. AGENTS.md, copilot-instructions.md,
	 * settings.json), create one discovered directory per type at the base.
	 */
	private async _scanFixedDiscoveryFiles(base: URI, roots: IFixedDiscoveryFile[], seen: ResourceSet, result: IDiscoveredDirectory[], watchRootUris: ResourceMap<IWatchSpec>, token: CancellationToken): Promise<void> {
		const filesByType = new Map<DiscoveredType, IDiscoveredFile[]>();
		await Promise.all(roots.map(async root => {
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
						const files = filesByType.get(root.type) ?? [];
						files.push({ uri, etag: entry.etag });
						filesByType.set(root.type, files);
					}
				}
			}
		}));

		for (const [type, files] of filesByType.entries()) {
			if (files.length > 0) {
				result.push({ uri: base, type, files: files.sort(compareDiscoveredFile), name: '', writable: false });
			}
		}
	}

	private async _scanRoot(base: URI, root: ISearchRoot, seen: ResourceSet, result: IDiscoveredDirectory[], watchRootUris: ResourceMap<IWatchSpec>, token: CancellationToken): Promise<void> {
		throwIfCancelled(token);

		const rootUri = joinPath(base, ...root.path);
		let stat: IFileStatWithMetadata | undefined = undefined;
		let children: IFileStatWithMetadata[] = [];
		try {
			stat = await this._fileService.resolve(rootUri, { resolveMetadata: true });
			children = stat.children ?? [];
		} catch {
			// Root does not exist (or is unreadable) — still discover it as a possible source folder.
		}

		// Filenames are dynamic for these roots, so we watch the whole directory.
		// `addWatch` upgrades to recursive if any root requests it.
		await this._watchAncestors(base, root.path, watchRootUris, token);
		addWatch(watchRootUris, rootUri, root.recursive ?? false, rootUri);

		if (root.type === DiscoveredType.Skill) {
			const files: IDiscoveredFile[] = [];
			await Promise.all(children.map(async child => {
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
			}));
			result.push({ uri: rootUri, type: root.type, files: files.sort(compareDiscoveredFile), name: root.name, writable: true });
		} else if (root.type === DiscoveredType.Agent) {
			const files: IDiscoveredFile[] = [];
			// agents are markdown files directly under the root (no subdirectory scanning),
			// excluding only exact-case README.md.
			for (const child of children) {
				throwIfCancelled(token);

				if (child.isFile) {
					const filename = child.name;
					if (filename.endsWith(MARKDOWN_SUFFIX) && filename !== README_FILENAME && !seen.has(child.resource)) {
						seen.add(child.resource);
						files.push({ uri: child.resource, etag: child.etag });
					}
				}
			}
			result.push({ uri: rootUri, type: root.type, files: files.sort(compareDiscoveredFile), name: root.name, writable: true });

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
			if (stat) {
				await findInstructions(stat, 0);
			}
			result.push({ uri: rootUri, type: root.type, files: files.sort(compareDiscoveredFile), name: root.name, writable: true });
		} else if (root.type === DiscoveredType.Hook) {
			const files: IDiscoveredFile[] = [];
			// hooks are recursively discovered as `*.json` under the root.
			const findHooks = async (directoryStat: IFileStatWithMetadata, recursionLevel: number): Promise<void> => {
				throwIfCancelled(token);

				for (const child of directoryStat.children ?? []) {
					throwIfCancelled(token);

					if (child.isFile) {
						const name = child.name.toLowerCase();
						if (name.endsWith(HOOK_FILE_SUFFIX) && !seen.has(child.resource)) {
							seen.add(child.resource);
							files.push({ uri: child.resource, etag: child.etag });
						}
					} else if (child.isDirectory && recursionLevel < MAX_HOOKS_RECURSION_DEPTH) {
						let childStat: IFileStatWithMetadata | undefined = undefined;
						try {
							childStat = await this._fileService.resolve(child.resource, { resolveMetadata: true });
						} catch {
							// Ignore unreadable subdirectories.
						}
						if (childStat) {
							await findHooks(childStat, recursionLevel + 1);
						}
					}
				}
			};
			if (stat) {
				await findHooks(stat, 0);
			}
			result.push({ uri: rootUri, type: root.type, files: files.sort(compareDiscoveredFile), name: root.name, writable: true });

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
	fixedDiscoveryFiles,
	agentInstructions,
};


