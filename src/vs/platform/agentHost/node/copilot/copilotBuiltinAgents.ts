/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CustomAgentConfig } from '@github/copilot-sdk';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { getComparisonKey } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import type { IFileService } from '../../../files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { CustomizationType } from '../../common/state/protocol/state.js';
import { CustomizationLoadStatus, customizationId, type DirectoryCustomization } from '../../common/state/sessionState.js';
import { toSdkClientToolName } from './copilotPluginConverters.js';
import type { IActiveClientSnapshot } from './copilotSessionLauncher.js';
import { CopilotToolName } from './copilotToolDisplay.js';

export const COPILOT_BUILTIN_AGENTS_SCHEME = 'copilot-builtin';
const builtinAgentsDirectory = URI.from({ scheme: COPILOT_BUILTIN_AGENTS_SCHEME, path: '/agents' });

/** Describes a provider-owned agent's readable resource and SDK configuration. */
export interface ICopilotBuiltinAgent {
	readonly name: string;
	readonly fileName: string;
	readonly displayName: () => string;
	readonly description: () => string;
	readonly prompt: string;
	readonly tools: readonly string[];
	readonly includeReadOnlyClientTools: boolean;
}

const askAgentPrompt = `You are an ASK AGENT — a knowledgeable assistant that answers questions, explains code, and provides information.

Your job: understand the user's question → research the codebase as needed → provide a clear, thorough answer. You are strictly read-only: NEVER modify files or run commands that change state. Write tools are unavailable by design.

<rules>
- NEVER use file editing tools, terminal commands that modify state, or any write operations
- Focus on answering questions, explaining concepts, and providing information
- Use search and read tools to gather context from the codebase when needed
- Provide code examples in your responses when helpful, but do NOT apply them
- Ask the user for clarification when a question is ambiguous
- When the user's question is about code, reference specific files and symbols
- If a question would require making changes, explain what changes would be needed but do NOT make them. Indicate that the user can switch to a different agent if the changes are to be implemented.
</rules>`;

export const COPILOT_BUILTIN_AGENTS: readonly ICopilotBuiltinAgent[] = [{
	name: 'vscode-ask',
	fileName: 'ask.agent.md',
	displayName: () => localize('copilot.builtinAsk.name', "Ask"),
	description: () => localize('copilot.builtinAsk.description', "Answers questions about your code without making changes"),
	prompt: askAgentPrompt,
	tools: [
		CopilotToolName.View,
		CopilotToolName.Grep,
		CopilotToolName.Glob,
		CopilotToolName.Rg,
		CopilotToolName.Lsp,
		CopilotToolName.WebFetch,
		CopilotToolName.WebSearch,
		CopilotToolName.AskUser,
		CopilotToolName.ReportIntent,
		CopilotToolName.Think,
		CopilotToolName.ShowFile,
		CopilotToolName.FetchCopilotCliDocumentation,
	],
	includeReadOnlyClientTools: true,
}];

export const COPILOT_BUILTIN_AGENT_NAMES: ReadonlySet<string> = new Set(COPILOT_BUILTIN_AGENTS.map(agent => agent.name));
export const COPILOT_BUILTIN_AGENT_NAMES_BY_URI: ReadonlyMap<string, string> = new Map(
	COPILOT_BUILTIN_AGENTS.map(agent => [getComparisonKey(getCopilotBuiltinAgentUri(agent)), agent.name]),
);

/** Returns the host-readable markdown resource for a built-in agent. */
export function getCopilotBuiltinAgentUri(agent: ICopilotBuiltinAgent): URI {
	return URI.joinPath(builtinAgentsDirectory, agent.fileName);
}

/** Generates YAML-safe frontmatter and the prompt from the same descriptor used by the SDK. */
export function buildCopilotBuiltinAgentMarkdown(agent: ICopilotBuiltinAgent): string {
	return [
		'---',
		`name: ${JSON.stringify(agent.displayName())}`,
		`description: ${JSON.stringify(agent.description())}`,
		`tools: ${JSON.stringify(agent.tools)}`,
		'disable-model-invocation: true',
		'---',
		agent.prompt,
	].join('\n');
}

/** Owns read-only built-in agent files served through the host's normal resource-read path. */
export class CopilotBuiltinAgentsStore extends Disposable {
	constructor(fileService: IFileService) {
		super();
		const provider = this._register(new InMemoryFileSystemProvider());
		// These in-memory mutations run synchronously before their promises resolve, so files exist before publication.
		void provider.mkdir(builtinAgentsDirectory);
		for (const agent of COPILOT_BUILTIN_AGENTS) {
			void provider.writeFile(getCopilotBuiltinAgentUri(agent), VSBuffer.fromString(buildCopilotBuiltinAgentMarkdown(agent)).buffer, {
				create: true, overwrite: true, append: false, unlock: false, atomic: false,
			});
		}
		provider.setReadOnly(true);
		this._register(fileService.registerProvider(COPILOT_BUILTIN_AGENTS_SCHEME, provider));
	}
}

/** Publishes readable built-in agents without an SDK plugin directory. */
export function buildCopilotBuiltinAgentsContainer(): DirectoryCustomization {
	const uri = builtinAgentsDirectory.toString();
	return {
		type: CustomizationType.Directory,
		id: customizationId(uri),
		uri,
		name: 'builtin',
		enabled: true,
		contents: CustomizationType.Agent,
		writable: false,
		load: { kind: CustomizationLoadStatus.Loaded },
		children: COPILOT_BUILTIN_AGENTS.map(agent => {
			const agentUri = getCopilotBuiltinAgentUri(agent).toString();
			return {
				type: CustomizationType.Agent,
				id: customizationId(agentUri),
				uri: agentUri,
				name: agent.displayName(),
				description: agent.description(),
				disableModelInvocation: true,
			};
		}),
	};
}

/**
 * The runtime hides agents with `disableModelInvocation` from the default agent's `task` tool, but
 * the SDK's {@link CustomAgentConfig} does not declare it and does not map `infer: false` to it.
 */
export interface ICopilotBuiltinAgentConfig extends CustomAgentConfig {
	readonly disableModelInvocation: true;
}

/** Builds all reserved SDK configurations, including explicitly read-only client tools where requested. */
export function buildCopilotBuiltinAgents(clientTools: IActiveClientSnapshot['tools']): ICopilotBuiltinAgentConfig[] {
	const readOnlyClientTools = clientTools.filter(tool => tool.annotations?.readOnlyHint === true).map(tool => toSdkClientToolName(tool.name));
	return COPILOT_BUILTIN_AGENTS.map(agent => ({
		name: agent.name,
		displayName: agent.displayName(),
		description: agent.description(),
		infer: false,
		disableModelInvocation: true,
		prompt: agent.prompt,
		tools: [...new Set([
			...agent.tools,
			...(agent.includeReadOnlyClientTools ? readOnlyClientTools : []),
		])],
	}));
}
