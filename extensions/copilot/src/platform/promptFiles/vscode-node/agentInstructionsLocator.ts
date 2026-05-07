/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'fs';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { ResourceSet } from '../../../util/vs/base/common/map';
import { Schemas } from '../../../util/vs/base/common/network';
import { dirname, isEqual, joinPath } from '../../../util/vs/base/common/resources';
import { equalsIgnoreCase } from '../../../util/vs/base/common/strings';
import { URI } from '../../../util/vs/base/common/uri';
import { ConfigKey, IConfigurationService } from '../../configuration/common/configurationService';
import { INativeEnvService } from '../../env/common/envService';
import { IFileSystemService } from '../../filesystem/common/fileSystemService';
import { FileType } from '../../filesystem/common/fileTypes';
import { ILogService } from '../../log/common/logService';
import { IWorkspaceService } from '../../workspace/common/workspaceService';
import { AgentInstructionFileType, AgentInstructionsLogger, IAgentInstructionFile } from '../common/promptsService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';

// File and folder name constants. Mirrors the values in
// `src/vs/workbench/contrib/chat/common/promptSyntax/config/promptFileLocations.ts`.
const AGENT_MD_FILENAME = 'AGENTS.md';
const CLAUDE_MD_FILENAME = 'CLAUDE.md';
const CLAUDE_LOCAL_MD_FILENAME = 'CLAUDE.local.md';
const CLAUDE_CONFIG_FOLDER = '.claude';
const COPILOT_CUSTOM_INSTRUCTIONS_FILENAME = 'copilot-instructions.md';
const GITHUB_CONFIG_FOLDER = '.github';

export namespace PromptConfig {
	// Configuration keys (non-extension settings — read via getNonExtensionConfig).
	export const USE_AGENT_MD = 'chat.useAgentsMdFile';
	export const USE_NESTED_AGENT_MD = 'chat.useNestedAgentsMdFiles';
	export const USE_CLAUDE_MD = 'chat.useClaudeMdFile';
	export const USE_CUSTOMIZATIONS_IN_PARENT_REPOS = 'chat.useCustomizationsInParentRepositories';
}

interface IWorkspaceInstructionFile {
	readonly fileName: string;
	readonly type: AgentInstructionFileType;
}

/**
 * Extension-side counterpart of the agent instruction file lookups in
 * core's `PromptFilesLocator` / `PromptsService.listAgentInstructions`.
 * Only the methods needed for assembling the customizations index live
 * here; the broader prompt file location logic stays in core.
 */
export class AgentInstructionsLocator extends Disposable {

	constructor(
		@IFileSystemService private readonly fileSystemService: IFileSystemService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@INativeEnvService private readonly envService: INativeEnvService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

	}

	/**
	 * Returns the combined list of `AGENTS.md`, `CLAUDE.md` and
	 * `copilot-instructions.md` files that apply to the current workspace.
	 */
	public async listAgentInstructions(token: CancellationToken, logger?: AgentInstructionsLogger): Promise<IAgentInstructionFile[]> {
		const resolvedAgentFiles: IAgentInstructionFile[] = [];
		const promises: Promise<IAgentInstructionFile[]>[] = [];

		const includeParents = this.configurationService.getNonExtensionConfig<boolean>(PromptConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS) === true;
		const rootFolders = await this.getWorkspaceFolderRoots(includeParents, logger);

		const rootFiles: IWorkspaceInstructionFile[] = [];
		const useAgentMD = this.configurationService.getNonExtensionConfig<boolean>(PromptConfig.USE_AGENT_MD) !== false;
		if (!useAgentMD) {
			logger?.logInfo('Agent MD files are disabled via configuration.');
		} else {
			rootFiles.push({ fileName: AGENT_MD_FILENAME, type: AgentInstructionFileType.agentsMd });
		}

		const useClaudeMD = this.configurationService.getNonExtensionConfig<boolean>(PromptConfig.USE_CLAUDE_MD) === true;
		if (!useClaudeMD) {
			logger?.logInfo('Claude MD files are disabled via configuration.');
		} else {
			const claudeMdFile: IWorkspaceInstructionFile = { fileName: CLAUDE_MD_FILENAME, type: AgentInstructionFileType.claudeMd };
			rootFiles.push(claudeMdFile); // CLAUDE.md in workspace root
			rootFiles.push({ fileName: CLAUDE_LOCAL_MD_FILENAME, type: AgentInstructionFileType.claudeMd }); // CLAUDE.local.md in workspace root

			// CLAUDE.md inside the .claude folder under each workspace root, plus ~/.claude/CLAUDE.md.
			promises.push(this.findFilesInRoots(rootFolders, CLAUDE_CONFIG_FOLDER, [claudeMdFile], token, resolvedAgentFiles));
			promises.push(this.findFilesInRoots([this.envService.userHome], CLAUDE_CONFIG_FOLDER, [claudeMdFile], token, resolvedAgentFiles));
		}

		// `useCopilotInstructionsFiles` gates only `.github/copilot-instructions.md`.
		// Reuses the existing extension config (default true) instead of hard-coding the qualified key.
		const useCopilotInstructionsFiles = this.configurationService.getConfig(ConfigKey.UseInstructionFiles) !== false;
		if (!useCopilotInstructionsFiles) {
			logger?.logInfo('Copilot instructions files are disabled via configuration.');
		} else {
			const githubConfigFiles: IWorkspaceInstructionFile[] = [{ fileName: COPILOT_CUSTOM_INSTRUCTIONS_FILENAME, type: AgentInstructionFileType.copilotInstructionsMd }];
			promises.push(this.findFilesInRoots(rootFolders, GITHUB_CONFIG_FOLDER, githubConfigFiles, token, resolvedAgentFiles));
		}

		// Files at the workspace root itself (AGENTS.md / CLAUDE.md / CLAUDE.local.md).
		promises.push(this.findFilesInRoots(rootFolders, undefined, rootFiles, token, resolvedAgentFiles));

		await Promise.all(promises);
		if (token.isCancellationRequested) {
			return [];
		}

		// Filter out symlinks pointing to files we already included.
		const seenFileURI = new ResourceSet();
		const symlinks: (IAgentInstructionFile & { realPath: URI })[] = [];
		const result: IAgentInstructionFile[] = [];
		for (const file of resolvedAgentFiles) {
			if (file.realPath) {
				symlinks.push(file as IAgentInstructionFile & { realPath: URI });
			} else {
				result.push(file);
				seenFileURI.add(file.uri);
			}
		}
		for (const symlink of symlinks) {
			if (seenFileURI.has(symlink.realPath)) {
				logger?.logInfo(`Skipping symlinked agent instructions file ${symlink.uri} as target already included: ${symlink.realPath}`);
			} else {
				result.push(symlink);
				seenFileURI.add(symlink.realPath);
			}
		}
		return result.sort((a, b) => a.uri.toString().localeCompare(b.uri.toString()));
	}

	/**
	 * Returns nested `AGENTS.md` files anywhere in the workspace, gated by
	 * the `chat.useAgentsMdFile` and `chat.useNestedAgentsMdFiles` settings.
	 */
	public async listNestedAgentMDs(token: CancellationToken): Promise<IAgentInstructionFile[]> {
		const useAgentMD = this.configurationService.getNonExtensionConfig<boolean>(PromptConfig.USE_AGENT_MD) !== false;
		if (!useAgentMD) {
			return [];
		}
		const useNestedAgentMD = this.configurationService.getNonExtensionConfig<boolean>(PromptConfig.USE_NESTED_AGENT_MD) === true;
		if (!useNestedAgentMD) {
			return [];
		}
		// Use the proposed `vscode.workspace.findFiles` glob search so we only pull back
		// `AGENTS.md` paths and respect the user's standard exclude/.gitignore filters.
		const found = await vscode.workspace.findFiles('**/AGENTS.md', undefined, undefined, token);
		if (token.isCancellationRequested) {
			return [];
		}
		return found.map(uri => ({ uri, type: AgentInstructionFileType.agentsMd }));
	}

	/**
	 * Returns the workspace folders, optionally walking up to enclosing
	 * repository roots when {@link includeParents} is `true`.
	 *
	 * Mirrors `PromptFilesLocator.getWorkspaceFolderRoots`, including the
	 * per-URI trust check on the discovered repo root via the workspace
	 * service's `isResourceTrusted` API.
	 */
	private async getWorkspaceFolderRoots(includeParents: boolean, logger?: AgentInstructionsLogger): Promise<URI[]> {
		const workspaceFolders = this.workspaceService.getWorkspaceFolders();
		if (!includeParents) {
			return workspaceFolders;
		}
		const roots = new ResourceSet();
		const userHome = this.envService.userHome;
		for (const workspaceFolder of workspaceFolders) {
			roots.add(workspaceFolder);
			const parents = await this.findParentRepoFolders(workspaceFolder, userHome, roots, logger);
			for (const parent of parents) {
				roots.add(parent);
			}
		}
		return [...roots];
	}

	/**
	 * Walks up from {@link folderUri} collecting parent folders until a
	 * repository root (a folder containing `.git`) is found. Returns the
	 * intermediate parent folders only when a repo root is found.
	 */
	private async findParentRepoFolders(folderUri: URI, userHome: URI, seen: ResourceSet, logger?: AgentInstructionsLogger): Promise<URI[]> {
		const candidates: URI[] = [];
		let current = folderUri;
		while (true) {
			try {
				const gitFolder = joinPath(current, '.git');
				const isRepoRoot = await this.fileSystemService.stat(gitFolder).then(() => true, () => false);
				if (isRepoRoot) {
					// Only include the repo root (and any intermediate parents) if the user has explicitly trusted it.
					const trusted = await this.workspaceService.isResourceTrusted(current);
					if (trusted) {
						candidates.push(current);
						return candidates;
					}
					logger?.logInfo(`Repository root found at ${current.toString()}, but it is not trusted. Skipping parent folder inclusion for this workspace folder.`);
					return [];
				}
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				logger?.logInfo(`Error checking for repo root at ${current.toString()}: ${msg}`);
				return [];
			}
			candidates.push(current);
			const parent = dirname(current);
			// Stop walking up at filesystem root, user home, or already-seen folders.
			if (isEqual(current, parent) || current.path === '/' || isEqual(userHome, parent) || seen.has(parent)) {
				break;
			}
			current = parent;
		}
		logger?.logInfo(`No repository root found for folder ${folderUri.toString()}.`);
		return [];
	}

	/**
	 * For each {@link roots} folder (optionally narrowed to a child {@link folder}),
	 * appends entries to {@link result} for any direct child whose name matches
	 * one of the requested {@link paths}.
	 */
	private async findFilesInRoots(roots: URI[], folder: string | undefined, paths: IWorkspaceInstructionFile[], token: CancellationToken, result: IAgentInstructionFile[]): Promise<IAgentInstructionFile[]> {
		await Promise.all(roots.map(async root => {
			if (token.isCancellationRequested) {
				return;
			}
			const dirUri = folder !== undefined ? joinPath(root, folder) : root;
			let entries: [string, FileType][];
			try {
				entries = await this.fileSystemService.readDirectory(dirUri);
			} catch {
				// Missing folder or permission error; nothing to do.
				return;
			}
			for (const [name, type] of entries) {
				const isFile = (type & FileType.File) !== 0;
				if (!isFile) {
					continue;
				}
				const matchingPath = paths.find(p => equalsIgnoreCase(p.fileName, name));
				if (!matchingPath) {
					continue;
				}
				const childUri = joinPath(dirUri, name);
				const isSymlink = (type & FileType.SymbolicLink) !== 0;
				let realPath: URI | undefined;
				if (isSymlink && childUri.scheme === Schemas.file) {
					try {
						const resolved = await fs.promises.realpath(childUri.fsPath);
						realPath = URI.file(resolved);
					} catch (e) {
						const msg = e instanceof Error ? e.message : String(e);
						this.logService.trace(`[AgentInstructionsLocator] Error resolving symlink ${childUri.toString()}: ${msg}`);
					}
				}
				result.push({ uri: childUri, realPath, type: matchingPath.type });
			}
		}));
		return result;
	}
}
