/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { extname } from '../../../../../../base/common/path.js';
import { joinPath } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { parseFrontMatter } from '../../../../../../base/common/yaml.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { AICustomizationSource } from '../../../common/aiCustomizationWorkspaceService.js';
import { ICustomizationItem } from '../../../common/customizationHarnessService.js';
import { SKILL_FILENAME } from '../../../common/promptSyntax/config/promptFileLocations.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';

/**
 * Expands plugin roots into individual customization items by scanning the
 * canonical subfolders (agents/skills/commands/rules).
 */
export class AgentCustomizationContentExpander {

	constructor(
		private readonly fileService: IFileService,
		private readonly logService: ILogService,
	) {
	}

	async expandPluginContents(pluginUri: URI, groupKey: string, isBundleItem: boolean, source: AICustomizationSource, token: CancellationToken): Promise<readonly ICustomizationItem[]> {
		// pluginUri is already an agent-host:// URI (from toRemoteUri),
		// so use it directly as the filesystem root.
		const fsRoot = pluginUri;
		const children: ICustomizationItem[] = [];
		try {
			if (!await this.fileService.canHandleResource(fsRoot)) {
				return [];
			}
			if (token.isCancellationRequested) {
				return [];
			}

			const dirNames = ['agents', 'skills', 'commands', 'rules'] as const;
			const promptTypes = [PromptsType.agent, PromptsType.skill, PromptsType.prompt, PromptsType.instructions] as const;
			const stats = await this.fileService.resolveAll(dirNames.map(name => ({ resource: URI.joinPath(fsRoot, name) })));

			if (token.isCancellationRequested) {
				return [];
			}

			for (let i = 0; i < dirNames.length; i++) {
				const stat = stats[i];
				const promptType = promptTypes[i];
				if (!stat.success || !stat.stat?.isDirectory || !stat.stat.children) {
					continue;
				}
				if (promptType === PromptsType.skill) {
					children.push(...await this.collectFromSkillDir(stat.stat.children, pluginUri, source, groupKey, isBundleItem, token));
				} else {
					children.push(...await this.collectFromRegularDir(stat.stat.children, pluginUri, source, promptType, groupKey, isBundleItem, token));
				}
			}
			children.sort((a, b) => `${a.type}:${a.name}`.localeCompare(`${b.type}:${b.name}`));
		} catch (err) {
			this.logService.trace(`[AgentCustomizationContentExpander] Failed to expand plugin ${pluginUri.toString()}: ${err}`);
			return [];
		}
		return children;
	}

	/**
	 * Emits one item per skill subfolder that contains a SKILL.md file.
	 * The skill metadata comes from SKILL.md frontmatter.
	 */
	private async collectFromSkillDir(entries: readonly { name: string; resource: URI; isDirectory: boolean }[], pluginUri: URI, source: AICustomizationSource, groupKey: string, isBundleItem: boolean, token: CancellationToken): Promise<ICustomizationItem[]> {
		type Entry = { name: string; resource: URI; isDirectory: boolean };
		const eligible: Entry[] = [];
		const readMetaDataPromises = [];
		for (const child of entries) {
			// Skip dotfiles (e.g. .DS_Store)
			if (child.name.startsWith('.')) {
				continue;
			}
			if (!child.isDirectory) {
				continue;
			}
			eligible.push(child);
			readMetaDataPromises.push(this.readPromptMetadata(joinPath(child.resource, SKILL_FILENAME), token));
		}

		const promptMetadata = await Promise.all(readMetaDataPromises);
		if (token.isCancellationRequested) {
			return [];
		}

		const items: ICustomizationItem[] = [];
		for (let i = 0; i < eligible.length; i++) {
			const child = eligible[i];
			const meta = promptMetadata[i];
			if (!meta) {
				continue;
			}
			const uri = joinPath(child.resource, SKILL_FILENAME);
			const name = meta.name ?? child.name;
			const description = meta.description;
			const userInvocable = meta.userInvocable;
			items.push({
				uri,
				type: PromptsType.skill,
				name: name,
				description,
				source,
				groupKey,
				extensionId: undefined,
				pluginUri: isBundleItem ? undefined : pluginUri,
				userInvocable
			} satisfies ICustomizationItem);
		}
		return items;
	}

	/**
	 * Emits one item per markdown file for agent/rules/command folders.
	 * Agents and instructions read frontmatter name/description, and
	 * agents additionally surface userInvocable. Instruction (rules)
	 * folders additionally accept `.mdc` files per the Open Plugins spec.
	 */
	private async collectFromRegularDir(entries: readonly { name: string; resource: URI; isDirectory: boolean }[], pluginUri: URI, source: AICustomizationSource, promptType: PromptsType, groupKey: string, isBundleItem: boolean, token: CancellationToken): Promise<ICustomizationItem[]> {
		type Entry = { name: string; resource: URI; isDirectory: boolean };
		const eligible: Entry[] = [];
		for (const child of entries) {
			if (child.name.startsWith('.')) {
				continue;
			}
			if (child.isDirectory) {
				continue;
			}
			const ext = extname(child.name);
			if (ext !== '.md' && !(promptType === PromptsType.instructions && ext === '.mdc')) {
				continue;
			}
			eligible.push(child);
		}

		const parseMetadata = promptType === PromptsType.agent || promptType === PromptsType.instructions;
		const promptMetadata = parseMetadata ? await Promise.all(eligible.map(child => this.readPromptMetadata(child.resource, token))) : undefined;

		if (token.isCancellationRequested) {
			return [];
		}

		const items: ICustomizationItem[] = [];
		for (let i = 0; i < eligible.length; i++) {
			const child = eligible[i];
			const meta = promptMetadata?.[i];
			items.push({
				uri: child.resource,
				type: promptType,
				name: meta?.name ?? stripPromptFileExtensions(child.name),
				description: meta?.description,
				source,
				groupKey,
				extensionId: undefined,
				pluginUri: isBundleItem ? undefined : pluginUri,
				userInvocable: promptType === PromptsType.agent ? meta?.userInvocable : undefined,
			} satisfies ICustomizationItem);
		}
		return items;
	}

	/**
	 * Reads a prompt markdown file and returns selected frontmatter
	 * metadata. Returns `undefined` when the file is not markdown, or
	 * when it cannot be read/parsed.
	 */
	private async readPromptMetadata(promptFileUri: URI, token: CancellationToken): Promise<{ name: string | undefined; description: string | undefined; userInvocable: boolean | undefined } | undefined> {
		if (extname(promptFileUri.path) !== '.md') {
			return undefined;
		}
		try {
			const content = await this.fileService.readFile(promptFileUri);
			if (token.isCancellationRequested) {
				return undefined;
			}
			const frontmatter = parseFrontMatter(content.value.toString());
			if (frontmatter) {
				const name = frontmatter.getStringValue('name');
				const description = frontmatter.getStringValue('description');
				const userInvocableStr = frontmatter.getStringValue('user-invocable');
				const userInvocable = userInvocableStr === 'true' ? true : userInvocableStr === 'false' ? false : undefined;
				return { name, description, userInvocable };
			}
			return { name: undefined, description: undefined, userInvocable: undefined };
		} catch (err) {
			this.logService.trace(`[AgentCustomizationContentExpander] Failed to read prompt metadata ${promptFileUri.toString()}: ${err}`);
			return undefined;
		}
	}
}

/**
 * Strips conventional prompt file extensions so we can show `foo`
 * for `foo.prompt.md`, `foo.instructions.md`, etc.
 */
function stripPromptFileExtensions(filename: string): string {
	const ext = extname(filename);
	if (!ext) {
		return filename;
	}
	const stem = filename.slice(0, -ext.length);
	const dotInStem = stem.lastIndexOf('.');
	return dotInStem > 0 ? stem.slice(0, dotInStem) : stem;
}
