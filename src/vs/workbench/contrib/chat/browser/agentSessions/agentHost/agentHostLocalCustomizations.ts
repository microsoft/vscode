/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StringSHA1 } from '../../../../../../base/common/hash.js';
import { basename, extUriBiasedIgnorePathCase } from '../../../../../../base/common/resources.js';
import { isDefined } from '../../../../../../base/common/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { isRemoteAgentHostSessionType, parseAgentHostHarness } from '../../../../../../platform/agentHost/common/agentHostSessionType.js';
import { withCustomizationEnablement } from '../../../../../../platform/agentHost/common/customizationEnablement.js';
import { toAgentCustomizationMeta } from '../../../../../../platform/agentHost/common/meta/agentCustomizationMeta.js';
import { CustomizationEnablementKind, type AgentCustomization, CustomizationType, type URI as ProtocolURI } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { customizationId, type ClientPluginCustomization } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { FileOperationResult, IFileService, IFileStat, toFileOperationResult } from '../../../../../../platform/files/common/files.js';
import { AICustomizationSources } from '../../../common/aiCustomizationWorkspaceService.js';
import { type IAgentPlugin, IGNORED_PLUGIN_DIR_NAMES } from '../../../common/plugins/agentPluginService.js';
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

const MAX_PLUGIN_NONCE_ENTRIES = 2000;
const PLUGIN_NONCE_STAT_CONCURRENCY = 16;

const pluginOverflowTokens = new WeakMap<IAgentPlugin, string>();

/**
 * Fallback revision token when a plugin tree exceeds {@link MAX_PLUGIN_NONCE_ENTRIES}.
 * Stable across unrelated customization refreshes for the same plugin instance and
 * `contentVersion`, advances whenever the plugin's watcher sees a content change,
 * and rotates on restart so stale persisted host cache entries are never reused.
 */
function getOverflowPluginNonce(plugin: IAgentPlugin): string {
	let instanceToken = pluginOverflowTokens.get(plugin);
	if (!instanceToken) {
		instanceToken = generateUuid();
		pluginOverflowTokens.set(plugin, instanceToken);
	}
	const sha1 = new StringSHA1();
	sha1.update(`${instanceToken}\0${plugin.contentVersion?.get() ?? 0}`);
	return sha1.digest();
}

async function resolveRealDir(fileService: IFileService, resource: URI): Promise<URI | undefined> {
	if (typeof fileService.realpath !== 'function') {
		return undefined;
	}
	try {
		return await fileService.realpath(resource);
	} catch {
		return undefined;
	}
}

function toRealDirKey(resource: URI): string {
	return extUriBiasedIgnorePathCase.getComparisonKey(resource);
}

/**
 * Computes a deterministic content-metadata SHA-1 hex digest across a plugin
 * directory tree so additions, edits, or deletions at any depth invalidate the
 * Agent Host plugin copy even when the root folder's own `mtime` is unchanged.
 *
 * Skips {@link IGNORED_PLUGIN_DIR_NAMES} (`.git`, `node_modules`) and returns
 * `undefined` if the scanned tree exceeds `maxEntries` so callers can switch
 * to a watcher-backed revision instead of reusing a truncated scan.
 */
export async function computePluginNonce(fileService: IFileService, root: URI, maxEntries = MAX_PLUGIN_NONCE_ENTRIES): Promise<string | undefined> {
	if (typeof fileService.resolve !== 'function') {
		return (await fileService.stat(root)).mtime.toString(16);
	}

	const rootStat = await fileService.resolve(root);
	const rootMeta = typeof rootStat.mtime === 'number' && typeof rootStat.size === 'number'
		? { mtime: rootStat.mtime, size: rootStat.size }
		: await fileService.stat(root);

	if (!rootStat.isDirectory) {
		const sha1 = new StringSHA1();
		sha1.update(`f\0\0${rootMeta.mtime}\0${rootMeta.size}\n`);
		return sha1.digest();
	}

	const parts: string[] = [`d\0\0${rootMeta.mtime}\0${rootMeta.size}`];

	interface IPendingEntry {
		readonly stat: IFileStat;
		readonly relPath: string;
		/** Resolved real URI of the parent directory once symlink tracking is active. */
		readonly parentRealUri?: URI;
	}

	const queue: IPendingEntry[] = [];
	let discovered = 0;
	const enqueueChildren = (children: readonly IFileStat[] | undefined, parentRelPath: string, parentRealUri?: URI): boolean => {
		if (!children || children.length === 0) {
			return true;
		}
		// Sort deterministically so symlink deduplication does not depend on async readdir order.
		const sorted = [...children].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
		for (const child of sorted) {
			if (IGNORED_PLUGIN_DIR_NAMES.has(child.name)) {
				continue;
			}
			if (++discovered > maxEntries) {
				return false;
			}
			queue.push({
				stat: child,
				relPath: parentRelPath ? `${parentRelPath}/${child.name}` : child.name,
				parentRealUri,
			});
		}
		return true;
	};

	if (!enqueueChildren(rootStat.children, '')) {
		return undefined;
	}

	let rootRealUri: URI | undefined;
	let visitedRealDirs: Set<string> | undefined;
	const visitedRegularRelPaths: string[] = [];
	let queueIndex = 0;
	while (queueIndex < queue.length) {
		const batch = queue.slice(queueIndex, queueIndex + PLUGIN_NONCE_STAT_CONCURRENCY);
		queueIndex += batch.length;

		if (!visitedRealDirs && batch.some(entry => entry.stat.isSymbolicLink && entry.stat.isDirectory)) {
			rootRealUri = await resolveRealDir(fileService, root) ?? root;
			visitedRealDirs = new Set([toRealDirKey(rootRealUri)]);
			for (const relPath of visitedRegularRelPaths) {
				visitedRealDirs.add(toRealDirKey(URI.joinPath(rootRealUri, ...relPath.split('/'))));
			}
		}

		const results = await Promise.all(batch.map(async entry => {
			try {
				if (entry.stat.isDirectory) {
					if (entry.stat.isSymbolicLink) {
						const realUri = await resolveRealDir(fileService, entry.stat.resource);
						const realKey = realUri ? toRealDirKey(realUri) : undefined;
						if (!realUri || !realKey || visitedRealDirs!.has(realKey)) {
							const meta = await fileService.stat(entry.stat.resource);
							return { entry, part: `s\0${entry.relPath}\0${meta.mtime}\0${meta.size}` };
						}
						const resolved = await fileService.resolve(entry.stat.resource);
						const meta = typeof resolved.mtime === 'number' && typeof resolved.size === 'number'
							? { mtime: resolved.mtime, size: resolved.size }
							: await fileService.stat(entry.stat.resource);
						return { entry, part: `s\0${entry.relPath}\0${meta.mtime}\0${meta.size}`, children: resolved.children, realUri, realKey };
					}
					const realUri = visitedRealDirs
						? (entry.parentRealUri ? URI.joinPath(entry.parentRealUri, entry.stat.name) : URI.joinPath(rootRealUri!, ...entry.relPath.split('/')))
						: undefined;
					const realKey = realUri ? toRealDirKey(realUri) : undefined;
					if (realKey && visitedRealDirs!.has(realKey)) {
						const meta = await fileService.stat(entry.stat.resource);
						return { entry, part: `d\0${entry.relPath}\0${meta.mtime}\0${meta.size}` };
					}
					const resolved = await fileService.resolve(entry.stat.resource);
					const meta = typeof resolved.mtime === 'number' && typeof resolved.size === 'number'
						? { mtime: resolved.mtime, size: resolved.size }
						: await fileService.stat(entry.stat.resource);
					return { entry, part: `d\0${entry.relPath}\0${meta.mtime}\0${meta.size}`, children: resolved.children, realUri, realKey };
				}
				if (entry.stat.isFile) {
					const meta = await fileService.stat(entry.stat.resource);
					const kind = entry.stat.isSymbolicLink ? 'l' : 'f';
					return { entry, part: `${kind}\0${entry.relPath}\0${meta.mtime}\0${meta.size}` };
				}
				return { entry, part: `u\0${entry.relPath}` };
			} catch (err) {
				if (toFileOperationResult(err) === FileOperationResult.FILE_NOT_FOUND) {
					return undefined;
				}
				return { entry, part: `e\0${entry.relPath}` };
			}
		}));

		for (const result of results) {
			if (!result) {
				continue;
			}
			parts.push(result.part);
			if (result.children) {
				if (visitedRealDirs && result.realKey) {
					if (visitedRealDirs.has(result.realKey)) {
						continue;
					}
					visitedRealDirs.add(result.realKey);
				} else if (!result.entry.stat.isSymbolicLink) {
					visitedRegularRelPaths.push(result.entry.relPath);
				}
				if (!enqueueChildren(result.children, result.entry.relPath, result.realUri)) {
					return undefined;
				}
			}
		}
	}

	parts.sort();
	const sha1 = new StringSHA1();
	for (const part of parts) {
		sha1.update(part);
		sha1.update('\n');
	}
	return sha1.digest();
}

async function toPluginRef(fileService: IFileService, { plugin, enabled }: IClientPlugin): Promise<ClientPluginCustomization> {
	const key = plugin.uri.toString();
	let nonce: string | undefined;
	try {
		nonce = await computePluginNonce(fileService, plugin.uri) ?? getOverflowPluginNonce(plugin);
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
		ref.nonce = nonce;
	}
	return ref;
}
