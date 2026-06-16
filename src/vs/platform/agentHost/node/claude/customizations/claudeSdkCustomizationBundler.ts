/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { hash } from '../../../../../base/common/hash.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IFileService } from '../../../../files/common/files.js';
import { IAgentPluginManager } from '../../../common/agentPluginManager.js';
import { CustomizationLoadStatus, CustomizationType, customizationId, type AgentCustomization, type PluginCustomization, type SkillCustomization } from '../../../common/state/sessionState.js';
import type { ISdkResolvedCustomizations } from '../claudeSdkPipeline.js';

const PLUGIN_NAME = 'claude-discovered';
const DISPLAY_NAME = localize('claude.discovered.displayName', "Discovered in Claude");
const DISCOVERED_DIR = 'claude-discovered';

/**
 * The Claude SDK's built-in default agent. Hidden from the picker:
 * selecting it would be equivalent to "no selection" since the SDK
 * uses it as the fallback when `Options.agent` is omitted.
 */
export const CLAUDE_SDK_DEFAULT_AGENT_NAME = 'general-purpose';

/**
 * Bundles the Claude SDK's currently-resolved customization view
 * (commands + agents from `Query.supportedCommands()` /
 * `supportedAgents()` / `mcpServerStatus()`) into a synthetic on-disk
 * [Open Plugin](https://open-plugins.com/) layout, so the workbench's
 * plugin expander can scan it and emit per-type child items
 * (`PromptsType.agent` / `PromptsType.skill` / `PromptsType.prompt`).
 *
 * Returns a single {@link Customization} (plugin container) whose `name`
 * is `"Discovered in Claude"` and whose URI points at the on-disk bundle
 * root. The `children` array is populated directly from the SDK snapshot
 * so the agent picker can list Claude-native agents and skills without
 * waiting on filesystem expansion.
 *
 * The directory is namespaced by a hash of the working directory so
 * concurrent sessions on different folders don't collide. Repeated
 * {@link bundle} calls with the same SDK snapshot reuse the prior
 * bundle (nonce match) and skip the rewrite.
 */
export class ClaudeSdkCustomizationBundler extends Disposable {

	private readonly _rootUri: URI;
	private _lastNonce: string | undefined;

	constructor(
		workingDirectory: URI,
		@IFileService private readonly _fileService: IFileService,
		@IAgentPluginManager pluginManager: IAgentPluginManager,
	) {
		super();
		const authority = `claude-${hash(workingDirectory.toString())}`;
		this._rootUri = URI.joinPath(pluginManager.basePath, DISCOVERED_DIR, authority);
	}

	async bundle(snapshot: ISdkResolvedCustomizations): Promise<PluginCustomization | undefined> {
		if (snapshot.commands.length === 0 && snapshot.agents.length === 0) {
			return undefined;
		}

		const hashParts: string[] = [];
		for (const agent of snapshot.agents) {
			hashParts.push(`agent:${agent.name}\n${agent.description}\n${agent.model ?? ''}`);
		}
		for (const cmd of snapshot.commands) {
			hashParts.push(`command:${cmd.name}\n${cmd.description}\n${cmd.argumentHint ?? ''}`);
		}
		hashParts.sort();
		const nonce = String(hash(hashParts.join('\n')));

		if (this._lastNonce !== nonce) {
			try {
				await this._fileService.del(this._rootUri, { recursive: true });
			} catch {
				// First bundle — directory may not exist.
			}
			// Vendor-neutral manifest path per Open Plugins spec
			// (`.plugin/plugin.json`). `name` is the only required field
			// and must be lowercase alphanumeric / `-` / `.` only.
			const manifestUri = URI.joinPath(this._rootUri, '.plugin', 'plugin.json');
			await this._fileService.writeFile(manifestUri, VSBuffer.fromString(JSON.stringify({
				name: PLUGIN_NAME,
				description: 'Customizations discovered by the Claude agent',
			}, null, '\t')));

			for (const agent of snapshot.agents) {
				const fileUri = URI.joinPath(this._rootUri, 'agents', `${safeName(agent.name)}.md`);
				await this._fileService.writeFile(fileUri, VSBuffer.fromString(agentMarkdown(agent.name, agent.description)));
			}
			for (const cmd of snapshot.commands) {
				// Treat Claude slash commands as skills: each becomes its
				// own `skills/<name>/SKILL.md` subdirectory per the Agent
				// Skills format. Conceptually they're the same thing —
				// a named, model-invocable capability — and the workbench
				// buckets them under skills.
				const dirName = safeName(cmd.name);
				const fileUri = URI.joinPath(this._rootUri, 'skills', dirName, 'SKILL.md');
				await this._fileService.writeFile(fileUri, VSBuffer.fromString(skillMarkdown(dirName, cmd.description, cmd.argumentHint)));
			}
			this._lastNonce = nonce;
		}

		// Hide the SDK's built-in default agent — see
		// {@link CLAUDE_SDK_DEFAULT_AGENT_NAME} for the full rationale.
		// `uri` is the on-disk path of the file we just wrote — the
		// workbench's customization harness reads it via `parseNew` to
		// hydrate `ICustomAgent`, so a synthetic identity scheme would
		// fail to parse and the agents would never reach the picker.
		const agentChildren: AgentCustomization[] = snapshot.agents
			.filter(agent => agent.name !== CLAUDE_SDK_DEFAULT_AGENT_NAME)
			.map(agent => {
				const agentUri = URI.joinPath(this._rootUri, 'agents', `${safeName(agent.name)}.md`).toString();
				return {
					type: CustomizationType.Agent,
					id: customizationId(agentUri),
					uri: agentUri,
					name: agent.name,
					description: agent.description,
				};
			});
		const skillChildren: SkillCustomization[] = snapshot.commands.map(cmd => {
			const dirName = safeName(cmd.name);
			const skillUri = URI.joinPath(this._rootUri, 'skills', dirName, 'SKILL.md').toString();
			return {
				type: CustomizationType.Skill,
				id: customizationId(skillUri),
				uri: skillUri,
				name: dirName,
				description: cmd.description,
			};
		});

		const rootUriString = this._rootUri.toString();
		return {
			type: CustomizationType.Plugin,
			id: customizationId(rootUriString),
			uri: rootUriString,
			name: DISPLAY_NAME,
			enabled: true,
			load: { kind: CustomizationLoadStatus.Loaded },
			children: [...agentChildren, ...skillChildren],
		};
	}
}

function safeName(name: string): string {
	return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 128) || 'unnamed';
}

/**
 * Open Plugins agent frontmatter: `name` (1-64 chars, kebab-case) and
 * `description` (max 1024 chars). The body is the agent's system
 * prompt; the SDK doesn't surface it, so we leave the body empty.
 */
function agentMarkdown(name: string, description: string): string {
	return `---\nname: ${yamlString(name)}\ndescription: ${yamlString(truncate(description, 1024))}\n---\n`;
}

/**
 * Agent Skills `SKILL.md` frontmatter: `name` (MUST match the
 * containing directory name) and `description`. The SDK's
 * `argumentHint` is rendered as a `$ARGUMENTS` usage hint in the body.
 */
function skillMarkdown(name: string, description: string, argumentHint: string | undefined): string {
	const body = argumentHint ? `\nUsage: \`${argumentHint}\`\n` : '';
	return `---\nname: ${yamlString(name)}\ndescription: ${yamlString(truncate(description, 1024))}\n---\n${body}`;
}

function yamlString(s: string): string {
	// Quote always; escape backslashes and double quotes. Single-line: drop newlines.
	const escaped = s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ');
	return `"${escaped}"`;
}

function truncate(s: string, max: number): string {
	return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
