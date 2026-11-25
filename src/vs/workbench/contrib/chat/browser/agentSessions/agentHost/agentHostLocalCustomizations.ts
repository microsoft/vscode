/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename } from '../../../../../../base/common/resources.js';
import { isDefined } from '../../../../../../base/common/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { isRemoteAgentHostSessionType, parseAgentHostHarness } from '../../../../../../platform/agentHost/common/agentHostSessionType.js';
import { withCustomizationEnablement } from '../../../../../../platform/agentHost/common/customizationEnablement.js';
import { toAgentCustomizationMeta } from '../../../../../../platform/agentHost/common/meta/agentCustomizationMeta.js';
import { CustomizationEnablementKind, type AgentCustomization, CustomizationType, type URI as ProtocolURI } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { customizationId, type ClientPluginCustomization } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { AICustomizationSources } from '../../../common/aiCustomizationWorkspaceService.js';
import { PromptFileParser } from '../../../common/promptSyntax/promptFileParser.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { type IClientCustomizationSnapshot, type IClientPlugin } from './agentHostClientCustomizationsService.js';
import { SYNCED_CUSTOMIZATION_SCHEME, type ISyncableFile, type SyncedCustomizationBundler } from './syncedCustomizationBundler.js';

/*
 * Turns the client customizations collected by IAgentHostClientCustomizationsService into what a session publishes:
 * plugin refs, synthetic bundles, and the custom agents shown before the host reports the session's customizations.
 */

/**
 * Resolves the selectable custom-agent metadata that the client will publish to
 * an agent host.
 *
 * Client customization refs intentionally omit parsed children; the host adds
 * those later in `SessionState.customizations`. New Agents-window drafts need
 * the picker before that state exists, so this mirrors the same eligibility
 * rules used by {@link resolveCustomizationRefs} without waiting for the host
 * to parse the plugin or synthetic bundle.
 */
export async function resolveLocalCustomAgents(fileService: IFileService, snapshot: IClientCustomizationSnapshot): Promise<readonly AgentCustomization[]> {
	const candidates: { readonly uri: URI; readonly name?: string; readonly description?: string }[] = [];
	for (const file of snapshot.files) {
		if (file.type === PromptsType.agent && !file.disabled) {
			candidates.push({ uri: file.uri });
		}
	}
	for (const plugin of snapshot.plugins) {
		candidates.push(...plugin.selectableAgents);
	}

	const parser = new PromptFileParser();
	const result = await Promise.all(candidates.map(async (agent): Promise<AgentCustomization> => {
		let name = agent.name ?? basename(agent.uri, '.agent.md');
		let description = agent.description;
		let disableUserInvocation: boolean | undefined;
		let welcomeMessage: string | undefined;
		try {
			const content = await fileService.readFile(agent.uri);
			const header = parser.parse(agent.uri, content.value.toString()).header;
			name = header?.name ?? name;
			description = header?.description ?? description;
			disableUserInvocation = header?.userInvocable === false || undefined;
			welcomeMessage = header?.welcomeMessage;
		} catch {
			// The host will parse the full agent after session creation. Keep the
			// discovery metadata as a best-effort draft fallback if the file moved.
		}
		return {
			type: CustomizationType.Agent,
			id: agent.uri.toString(),
			uri: agent.uri.toString(),
			name,
			description,
			disableUserInvocation,
			...(welcomeMessage ? { _meta: toAgentCustomizationMeta({ 'vscode.welcomeMessage': welcomeMessage }) } : {}),
		};
	}));
	result.sort((a, b) => a.name.localeCompare(b.name) || a.uri.toString().localeCompare(b.uri.toString()));
	return result;
}

/**
 * The bundlers that package forwarded files and MCP servers for an agent host.
 */
export interface ISyncedCustomizationBundlers {
	/** Bundles the remaining loose files, such as extension and built-in skills and agents, prompt files, and instructions. */
	readonly synced: SyncedCustomizationBundler;
	/** Bundles standalone user and workspace skills and agents, and every forwarded MCP server. */
	readonly standalone: SyncedCustomizationBundler;
}

/**
 * Whether a forwarded file is a standalone user or workspace skill or agent.
 * Extension and built-in skills and agents stay in the synced bundle, as the
 * workbench lockdown blocks only standalone prompt files.
 */
function isStandaloneSkillOrAgent(file: ISyncableFile): boolean {
	return (file.type === PromptsType.skill || file.type === PromptsType.agent)
		&& (file.source === AICustomizationSources.local || file.source === AICustomizationSources.user);
}

/**
 * Resolves the customization refs to include in an `activeClientSet`
 * message.
 *
 * Every forwarded plugin becomes a plugin ref; Copilot discovers its
 * SDK-managed installations natively. Every eligible loose file is synced
 * unless the user opted out, bundled into a synthetic Open Plugin. Standalone
 * user and workspace skills and agents, together with the MCP servers that
 * VS Code forwards (user, workspace, or extension-contributed), go into a
 * separate standalone bundle so that the host does not deliver them as
 * plugin-provided content.
 */
export async function resolveCustomizationRefs(
	fileService: IFileService,
	snapshot: IClientCustomizationSnapshot,
	bundlers: ISyncedCustomizationBundlers,
	sessionType: string,
): Promise<ClientPluginCustomization[]> {
	const looseFiles: ISyncableFile[] = snapshot.files
		.filter(file => !file.disabled)
		.map(({ uri, type, source, extensionId, extensionLabel }) => ({ uri, type, source, extensionId, extensionLabel }));

	const refs: Promise<ClientPluginCustomization | undefined>[] = snapshot.plugins
		.filter(plugin => plugin.forwarded)
		.map(plugin => toPluginRef(fileService, plugin));
	const mcpServers = snapshot.mcpServers;
	const syncedFiles = looseFiles.filter(file => !isStandaloneSkillOrAgent(file));
	if (isRemoteAgentHostSessionType(sessionType) && parseAgentHostHarness(sessionType) === 'copilot') {
		syncedFiles.push({
			uri: URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: '/builtin/vscode-local-images.mdc' }),
			type: PromptsType.instructions,
			source: AICustomizationSources.builtin,
			content: '---\ndescription: Showing image files in VS Code\nalwaysApply: true\n---\n\nTo show the user an image file, reference its absolute path with `![alt](/absolute/path.png)`. If no earlier tool call in this session (such as a screenshot) already returned that image, call `view` on the path once first; never re-view an image just to show it.\n',
		});
	}
	if (syncedFiles.length > 0) {
		refs.push(bundlers.synced.bundle(syncedFiles, []).then(r => r?.ref));
	}
	// Plugin MCP servers travel with their plugin refs, so every server collected here is standalone.
	const standaloneFiles = looseFiles.filter(isStandaloneSkillOrAgent);
	if (standaloneFiles.length > 0 || mcpServers.length > 0) {
		refs.push(bundlers.standalone.bundle(standaloneFiles, mcpServers).then(r => r?.ref));
	}
	return await Promise.all(refs).then(r => r.filter(isDefined));
}

async function toPluginRef(fileService: IFileService, { plugin, enabled }: IClientPlugin): Promise<ClientPluginCustomization> {
	const key = plugin.uri.toString();
	let nonce: number | undefined;
	try {
		nonce = (await fileService.stat(plugin.uri)).mtime;
	} catch {
		// ignored, sync will probably fail later though...
	}
	const ref: ClientPluginCustomization = {
		type: CustomizationType.Plugin,
		id: customizationId(key),
		uri: key as ProtocolURI,
		name: plugin.label,
		enablement: withCustomizationEnablement(undefined, CustomizationEnablementKind.Global, {
			kind: CustomizationEnablementKind.Global,
			enabled,
		}),
	};
	if (nonce !== undefined) {
		ref.nonce = nonce.toString(16);
	}
	return ref;
}
