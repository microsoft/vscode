/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Delayer } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../files/common/files.js';
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
}

export interface IDiscoveredFile {
	readonly uri: URI;
	readonly type: DiscoveredType;
}

const AGENT_FILE_SUFFIX = '.agent.md';
const INSTRUCTION_FILE_SUFFIX = '.instructions.md';
const SKILL_FILENAME = 'SKILL.md';

interface ISearchRoot {
	readonly path: readonly string[];
	readonly type: DiscoveredType;
}

/**
 * Builds the list of search roots for a given working directory and user home.
 * Skills require a depth-2 scan (`<skillDir>/SKILL.md`); agents and instructions
 * are flat single-directory scans.
 */
function getSearchRoots(workingDirectory: URI, userHome: URI): { workspace: ISearchRoot[]; user: ISearchRoot[] } {
	return {
		workspace: [
			{ path: ['.github', 'agents'], type: DiscoveredType.Agent },
			{ path: ['.agents', 'agents'], type: DiscoveredType.Agent },
			{ path: ['.claude', 'agents'], type: DiscoveredType.Agent },
			{ path: ['.github', 'skills'], type: DiscoveredType.Skill },
			{ path: ['.agents', 'skills'], type: DiscoveredType.Skill },
			{ path: ['.claude', 'skills'], type: DiscoveredType.Skill },
			{ path: ['.github', 'instructions'], type: DiscoveredType.Instruction },
		],
		user: [
			{ path: ['.copilot', 'agents'], type: DiscoveredType.Agent },
			{ path: ['.agents', 'skills'], type: DiscoveredType.Skill },
		],
	};
}

const REFRESH_DEBOUNCE_MS = 100;

/**
 * Discovers customization files (`.agent.md`, `SKILL.md`, `.instructions.md`)
 * under well-known directories of the session's working directory and the
 * user's home, and emits {@link onDidChange} when any of those directories
 * change on disk.
 *
 * The first call to {@link files} performs the scan; subsequent calls return
 * the cached result until a watcher fires (or until {@link refresh} is
 * invoked). Watchers are recreated on each scan so directories that did not
 * exist initially get picked up once they appear.
 *
 * Workspace roots take precedence over user-home roots when the same URI is
 * discovered through multiple paths (de-duped by URI).
 */
export class SessionCustomizationDiscovery extends Disposable {

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private readonly _watchers = this._register(new DisposableStore());
	private readonly _refreshDelayer = this._register(new Delayer<void>(REFRESH_DEBOUNCE_MS));
	private readonly _rootUris: readonly URI[];

	private _cached: Promise<readonly IDiscoveredFile[]> | undefined;

	constructor(
		private readonly _workingDirectory: URI,
		private readonly _userHome: URI,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		const { workspace, user } = getSearchRoots(this._workingDirectory, this._userHome);
		this._rootUris = [
			...workspace.map(root => joinPath(this._workingDirectory, ...root.path)),
			...user.map(root => joinPath(this._userHome, ...root.path)),
		];
		this._register(this._fileService.onDidFilesChange(e => {
			if (this._rootUris.some(rootUri => e.affects(rootUri))) {
				this._scheduleRefresh();
			}
		}));
	}

	files(): Promise<readonly IDiscoveredFile[]> {
		if (!this._cached) {
			this._cached = this._scan();
		}
		return this._cached;
	}

	/**
	 * Forces the next call to {@link files} to re-scan and re-attach watchers.
	 * Does not emit {@link onDidChange} on its own — callers that explicitly
	 * refresh own that responsibility.
	 */
	refresh(): void {
		this._cached = undefined;
		this._watchers.clear();
	}

	private _scheduleRefresh(): void {
		this._refreshDelayer.trigger(() => {
			this.refresh();
			this._onDidChange.fire();
		}).catch(() => { /* delayer cancelled on dispose */ });
	}

	private async _scan(): Promise<readonly IDiscoveredFile[]> {
		this._watchers.clear();
		const seen = new ResourceMap<IDiscoveredFile>();
		const { workspace, user } = getSearchRoots(this._workingDirectory, this._userHome);

		// Workspace first so it wins on URI conflicts.
		await Promise.all([
			...workspace.map(root => this._scanRoot(this._workingDirectory, root, seen)),
			...user.map(root => this._scanRoot(this._userHome, root, seen)),
		]);

		return [...seen.values()];
	}

	private async _scanRoot(base: URI, root: ISearchRoot, seen: ResourceMap<IDiscoveredFile>): Promise<void> {
		const rootUri = joinPath(base, ...root.path);
		let stat;
		try {
			stat = await this._fileService.resolve(rootUri, { resolveMetadata: false });
		} catch {
			// Root does not exist (or is unreadable) — nothing to discover or watch.
			return;
		}
		if (!stat.isDirectory || !stat.children) {
			return;
		}

		// Only watch roots that exist; recursive: true so we pick up edits to
		// files inside skill subdirectories.
		try {
			this._watchers.add(this._fileService.watch(rootUri, { recursive: true, excludes: [] }));
		} catch (err) {
			this._logService.warn(`[SessionCustomizationDiscovery] Failed to watch '${rootUri.toString()}': ${err instanceof Error ? err.message : String(err)}`);
		}

		for (const child of stat.children) {
			if (root.type === DiscoveredType.Skill) {
				if (child.isDirectory) {
					const skillFile = joinPath(child.resource, SKILL_FILENAME);
					try {
						const skillStat = await this._fileService.resolve(skillFile, { resolveMetadata: false });
						if (skillStat.isFile && !seen.has(skillFile)) {
							seen.set(skillFile, { uri: skillFile, type: DiscoveredType.Skill });
						}
					} catch {
						// SKILL.md missing — skip this skill directory.
					}
				}
			} else if (child.isFile) {
				const name = child.name.toLowerCase();
				const suffix = root.type === DiscoveredType.Agent ? AGENT_FILE_SUFFIX : INSTRUCTION_FILE_SUFFIX;
				if (name.endsWith(suffix) && !seen.has(child.resource)) {
					seen.set(child.resource, { uri: child.resource, type: root.type });
				}
			}
		}
	}
}

// Test-only helpers — exported as `_internal` to discourage production use.
export const _internal = {
	AGENT_FILE_SUFFIX,
	INSTRUCTION_FILE_SUFFIX,
	SKILL_FILENAME,
	getSearchRoots,
};
