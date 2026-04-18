/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { parse as parseJSONC } from '../../../../../base/common/jsonc.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { basename, dirname, joinPath } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { isUriComponents, URI } from '../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IQuickInputButton, IQuickInputService, IQuickTreeItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { InstalledAgentPluginsViewId } from '../agentPluginsView.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { IPromptPath, IPromptsService, PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { IMcpRegistry } from '../../../mcp/common/mcpRegistryTypes.js';
import { McpCollectionDefinition, McpCollectionSortOrder, McpServerDefinition, McpServerTransportType } from '../../../mcp/common/mcpTypes.js';
import { CHAT_CATEGORY } from './chatActions.js';

const VALID_PLUGIN_NAME = /^[a-z0-9]([a-z0-9\-.]*[a-z0-9])?$/;
const INVALID_CONSECUTIVE = /--|[.][.]/;

export function validatePluginName(name: string): string | undefined {
	if (!name) {
		return localize('pluginNameRequired', "Plugin name is required.");
	}
	if (name.length > 64) {
		return localize('pluginNameTooLong', "Plugin name must be at most 64 characters.");
	}
	if (!VALID_PLUGIN_NAME.test(name)) {
		return localize('pluginNameInvalid', "Plugin name must contain only lowercase alphanumeric characters, hyphens, and periods, and must start and end with an alphanumeric character.");
	}
	if (INVALID_CONSECUTIVE.test(name)) {
		return localize('pluginNameConsecutive', "Plugin name must not contain consecutive hyphens or periods.");
	}
	return undefined;
}

type ResourceType = 'instruction' | 'prompt' | 'agent' | 'skill' | 'hook' | 'mcp';

export interface IResourceTreeItem extends IQuickTreeItem {
	readonly resourceType: ResourceType;
	readonly promptPath?: IPromptPath;
	readonly mcpServer?: { collection: McpCollectionDefinition; definition: McpServerDefinition };
	children?: readonly IResourceTreeItem[];
}

interface IGroupTreeItem extends IQuickTreeItem {
	readonly resourceType?: undefined;
	children: IResourceTreeItem[];
}

function isUserDefined(storage: PromptsStorage): boolean {
	return storage === PromptsStorage.local || storage === PromptsStorage.user;
}

function isUserDefinedMcpCollection(collection: McpCollectionDefinition): boolean {
	const order = collection.presentation?.order;
	return order === McpCollectionSortOrder.User
		|| order === McpCollectionSortOrder.WorkspaceFolder
		|| order === McpCollectionSortOrder.Workspace;
}

/**
 * Gets a display label for a prompt resource. Skills need special handling
 * because their URI points to `SKILL.md`, so we use the parent directory name.
 */
export function getResourceLabel(r: IPromptPath): string {
	if (r.name) {
		return r.name;
	}
	if (r.type === PromptsType.skill && basename(r.uri).toLowerCase() === 'skill.md') {
		return basename(dirname(r.uri));
	}
	return basename(r.uri);
}

/**
 * Gets a filesystem-safe name for a resource, stripping any namespace prefix
 * (e.g. `plugin:skillname` → `skillname`).
 */
export function getResourceFileName(r: IPromptPath): string {
	const label = getResourceLabel(r);
	const colonIndex = label.indexOf(':');
	return colonIndex >= 0 ? label.substring(colonIndex + 1) : label;
}

class CreatePluginAction extends Action2 {

	static readonly ID = 'workbench.action.chat.createPlugin';

	constructor() {
		super({
			id: CreatePluginAction.ID,
			title: localize2('chat.createPlugin', "Create Plugin"),
			category: CHAT_CATEGORY,
			f1: true,
			precondition: ChatContextKeys.enabled,
			icon: Codicon.save,
			menu: [{
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals('view', InstalledAgentPluginsViewId),
					ChatContextKeys.Setup.hidden.negate(),
					ChatContextKeys.Setup.disabledInWorkspace.negate(),
				),
				group: 'navigation',
				order: 2,
			}],
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const promptsService = accessor.get(IPromptsService);
		const mcpRegistry = accessor.get(IMcpRegistry);
		const fileDialogService = accessor.get(IFileDialogService);
		const fileService = accessor.get(IFileService);
		const commandService = accessor.get(ICommandService);
		const notificationService = accessor.get(INotificationService);

		// Step 1: Gather resources
		const [instructions, prompts, agents, skills, hooks] = await (async () => {
			const cts = new CancellationTokenSource();
			try {
				return await Promise.all([
					promptsService.listPromptFiles(PromptsType.instructions, cts.token),
					promptsService.listPromptFiles(PromptsType.prompt, cts.token),
					promptsService.listPromptFiles(PromptsType.agent, cts.token),
					promptsService.listPromptFiles(PromptsType.skill, cts.token),
					promptsService.listPromptFiles(PromptsType.hook, cts.token),
				]);
			} finally {
				cts.dispose(true);
			}
		})();

		const mcpCollections = mcpRegistry.collections.get();

		// Step 2: Build tree items grouped by resource type
		let showAll = false;

		const buildTree = (): (IGroupTreeItem | IResourceTreeItem)[] => {
			const groups: (IGroupTreeItem | IResourceTreeItem)[] = [];

			const addGroup = (
				resources: readonly IPromptPath[],
				resourceType: ResourceType,
				groupLabel: string,
				icon: ThemeIcon,
			) => {
				const filtered = showAll ? resources : resources.filter(r => isUserDefined(r.storage));
				if (filtered.length === 0) {
					return;
				}
				const children: IResourceTreeItem[] = filtered.map(r => ({
					label: getResourceLabel(r),
					description: r.storage,
					resourceType,
					promptPath: r,
					checked: false,
				}));
				groups.push({
					label: groupLabel,
					iconClass: ThemeIcon.asClassName(icon),
					checked: undefined,
					collapsed: false,
					pickable: false,
					children,
				});
			};

			addGroup(instructions, 'instruction', localize('instructions', "Instructions"), Codicon.book);
			addGroup(prompts, 'prompt', localize('prompts', "Prompts"), Codicon.comment);
			addGroup(agents, 'agent', localize('agents', "Agents"), Codicon.copilot);
			addGroup(skills, 'skill', localize('skills', "Skills"), Codicon.lightbulb);
			addGroup(hooks, 'hook', localize('hooks', "Hooks"), Codicon.zap);

			// MCP servers
			const mcpChildren: IResourceTreeItem[] = [];
			for (const collection of mcpCollections) {
				if (!showAll && !isUserDefinedMcpCollection(collection)) {
					continue;
				}
				const defs = collection.serverDefinitions.get();
				for (const def of defs) {
					mcpChildren.push({
						label: def.label,
						description: collection.label,
						resourceType: 'mcp',
						mcpServer: { collection, definition: def },
						checked: false,
					});
				}
			}
			if (mcpChildren.length > 0) {
				groups.push({
					label: localize('mcpServers', "MCP Servers"),
					iconClass: ThemeIcon.asClassName(Codicon.mcp),
					checked: undefined,
					collapsed: false,
					pickable: false,
					children: mcpChildren,
				});
			}

			return groups;
		};

		// Step 3: Show QuickTree for multi-select with groupings
		const disposables = new DisposableStore();
		const tree = disposables.add(quickInputService.createQuickTree<IGroupTreeItem | IResourceTreeItem>());
		tree.placeholder = localize('selectResources', "Select resources to include in the plugin");
		tree.matchOnDescription = true;
		tree.matchOnLabel = true;
		tree.sortByLabel = false;
		tree.title = localize('createPluginTitle', "Create Plugin");
		tree.setItemTree(buildTree());

		const toggleButton: IQuickInputButton = { iconClass: ThemeIcon.asClassName(Codicon.filter), tooltip: localize('showAll', "Show Built-in, Extension, and Plugin Resources") };
		tree.buttons = [toggleButton];

		disposables.add(tree.onDidTriggerButton((button: IQuickInputButton) => {
			if (button === toggleButton) {
				showAll = !showAll;
				tree.setItemTree(buildTree());
			}
		}));

		const selectedItems = await new Promise<readonly (IGroupTreeItem | IResourceTreeItem)[] | undefined>(resolve => {
			disposables.add(tree.onDidAccept(() => {
				resolve(tree.checkedLeafItems);
				tree.hide();
			}));
			disposables.add(tree.onDidHide(() => {
				resolve(undefined);
			}));
			tree.show();
		});

		disposables.dispose();

		if (!selectedItems || selectedItems.length === 0) {
			return;
		}

		const selected = selectedItems.filter((i): i is IResourceTreeItem => !!i.resourceType);

		// Step 4: Ask for plugin name
		const pluginName = await quickInputService.input({
			prompt: localize('pluginNamePrompt', "Enter a name for the plugin"),
			placeHolder: 'my-plugin',
			validateInput: async (value: string) => validatePluginName(value),
		});

		if (!pluginName) {
			return;
		}

		// Step 5: Ask where to save
		const folderUris = await fileDialogService.showOpenDialog({
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: false,
			title: localize('selectPluginLocation', "Select Plugin Save Location"),
			openLabel: localize('selectFolder', "Select Folder"),
		});

		if (!folderUris || folderUris.length === 0) {
			return;
		}

		const targetDir = folderUris[0];
		const pluginRoot = joinPath(targetDir, pluginName);

		// Check if plugin directory already exists
		if (await fileService.exists(pluginRoot)) {
			notificationService.error(localize('pluginExists', "A directory named '{0}' already exists at this location. Please choose a different name or location.", pluginName));
			return;
		}

		// Step 6: Create plugin structure
		try {
			await writePluginToDisk(fileService, pluginRoot, pluginName, selected);

			// Step 7: Check for marketplace.json and update it
			await updateMarketplaceIfNeeded(fileService, targetDir, pluginName);

			// Step 8: Reveal the plugin directory in the OS file explorer
			try {
				await commandService.executeCommand('revealFileInOS', pluginRoot);
			} catch {
				// revealFileInOS may not be available for all URI schemes
			}

			notificationService.info(localize('pluginCreated', "Plugin '{0}' created successfully.", pluginName));

		} catch (err) {
			notificationService.error(localize('pluginCreateError', "Failed to create plugin: {0}", String(err)));
		}
	}
}

/**
 * Writes a plugin directory structure to disk from selected resources.
 */
export async function writePluginToDisk(
	fileService: IFileService,
	pluginRoot: URI,
	pluginName: string,
	selected: readonly IResourceTreeItem[],
): Promise<void> {
	await fileService.createFolder(pluginRoot);

	// Create .plugin/plugin.json
	const manifestDir = joinPath(pluginRoot, '.plugin');
	await fileService.createFolder(manifestDir);
	const manifest = {
		name: pluginName,
		version: '1.0.0',
		description: '',
	};
	await fileService.writeFile(joinPath(manifestDir, 'plugin.json'), VSBuffer.fromString(JSON.stringify(manifest, null, '\t')));

	// Group selected items by type
	const byType = {
		instruction: selected.filter(i => i.resourceType === 'instruction'),
		prompt: selected.filter(i => i.resourceType === 'prompt'),
		agent: selected.filter(i => i.resourceType === 'agent'),
		skill: selected.filter(i => i.resourceType === 'skill'),
		hook: selected.filter(i => i.resourceType === 'hook'),
		mcp: selected.filter(i => i.resourceType === 'mcp'),
	};

	// Copy instructions → rules/
	if (byType.instruction.length > 0) {
		const rulesDir = joinPath(pluginRoot, 'rules');
		await fileService.createFolder(rulesDir);
		for (const item of byType.instruction) {
			if (!item.promptPath) {
				continue;
			}
			const name = getResourceFileName(item.promptPath);
			const fileName = name.endsWith('.instructions.md') || name.endsWith('.mdc') || name.endsWith('.md')
				? name
				: name + '.instructions.md';
			const content = await fileService.readFile(item.promptPath.uri);
			await fileService.writeFile(joinPath(rulesDir, fileName), content.value);
		}
	}

	// Copy prompts → commands/
	if (byType.prompt.length > 0) {
		const commandsDir = joinPath(pluginRoot, 'commands');
		await fileService.createFolder(commandsDir);
		for (const item of byType.prompt) {
			if (!item.promptPath) {
				continue;
			}
			const name = getResourceFileName(item.promptPath);
			const fileName = name.endsWith('.md') ? name : name + '.md';
			const content = await fileService.readFile(item.promptPath.uri);
			await fileService.writeFile(joinPath(commandsDir, fileName), content.value);
		}
	}

	// Copy agents → agents/
	if (byType.agent.length > 0) {
		const agentsDir = joinPath(pluginRoot, 'agents');
		await fileService.createFolder(agentsDir);
		for (const item of byType.agent) {
			if (!item.promptPath) {
				continue;
			}
			const name = getResourceFileName(item.promptPath);
			const fileName = name.endsWith('.md') ? name : name + '.md';
			const content = await fileService.readFile(item.promptPath.uri);
			await fileService.writeFile(joinPath(agentsDir, fileName), content.value);
		}
	}

	// Copy skills → skills/ (recursive directory copy)
	if (byType.skill.length > 0) {
		const skillsDir = joinPath(pluginRoot, 'skills');
		await fileService.createFolder(skillsDir);
		for (const item of byType.skill) {
			if (!item.promptPath) {
				continue;
			}
			const sourceUri = item.promptPath.uri;
			const skillName = getResourceFileName(item.promptPath);

			// The URI for a skill might point to the SKILL.md file or to the directory
			const sourceName = basename(sourceUri);
			const isFile = sourceName.toLowerCase() === 'skill.md';
			const skillSourceDir = isFile ? joinPath(sourceUri, '..') : sourceUri;

			const destSkillDir = joinPath(skillsDir, skillName);
			await copyDirectory(fileService, skillSourceDir, destSkillDir);
		}
	}

	// Copy hooks → hooks/hooks.json (merge all selected hook files)
	if (byType.hook.length > 0) {
		const hooksDir = joinPath(pluginRoot, 'hooks');
		await fileService.createFolder(hooksDir);

		const mergedHooks: Record<string, Record<string, unknown>[]> = {};
		for (const item of byType.hook) {
			if (!item.promptPath) {
				continue;
			}
			try {
				const content = await fileService.readFile(item.promptPath.uri);
				const parsed = parseJSONC<Record<string, unknown>>(content.value.toString());
				const hooksObj = (parsed?.hooks ?? parsed) as Record<string, unknown> | undefined;
				if (hooksObj && typeof hooksObj === 'object') {
					for (const [hookType, commands] of Object.entries(hooksObj)) {
						if (Array.isArray(commands)) {
							if (!mergedHooks[hookType]) {
								mergedHooks[hookType] = [];
							}
							for (const cmd of commands) {
								mergedHooks[hookType].push(serializeHookCommand(cmd));
							}
						}
					}
				}
			} catch {
				// Skip unparseable hook files
			}
		}

		const hooksJson = { hooks: mergedHooks };
		await fileService.writeFile(
			joinPath(hooksDir, 'hooks.json'),
			VSBuffer.fromString(JSON.stringify(hooksJson, null, '\t'))
		);
	}

	// Export MCP servers → .mcp.json
	if (byType.mcp.length > 0) {
		const mcpServers: Record<string, object> = {};
		for (const item of byType.mcp) {
			if (!item.mcpServer) {
				continue;
			}
			const def = item.mcpServer.definition;
			mcpServers[def.label] = serializeMcpLaunch(def.launch);
		}
		const mcpJson = { mcpServers };
		await fileService.writeFile(
			joinPath(pluginRoot, '.mcp.json'),
			VSBuffer.fromString(JSON.stringify(mcpJson, null, '\t'))
		);
	}
}

export function serializeHookCommand(cmd: Record<string, unknown>): Record<string, unknown> {
	const result: Record<string, unknown> = { type: 'command' };
	if (typeof cmd.command === 'string') {
		result['command'] = cmd.command;
	}
	if (typeof cmd.windows === 'string') {
		result['windows'] = cmd.windows;
	}
	if (typeof cmd.linux === 'string') {
		result['linux'] = cmd.linux;
	}
	if (typeof cmd.osx === 'string') {
		result['osx'] = cmd.osx;
	}
	if (cmd.cwd !== undefined) {
		result['cwd'] = isUriComponents(cmd.cwd) ? URI.revive(cmd.cwd).fsPath : String(cmd.cwd);
	}
	if (cmd.env && typeof cmd.env === 'object' && Object.keys(cmd.env as Record<string, unknown>).length > 0) {
		result['env'] = cmd.env;
	}
	if (typeof cmd.timeout === 'number') {
		result['timeout'] = cmd.timeout;
	}
	return result;
}

export function serializeMcpLaunch(launch: McpServerDefinition['launch']): object {
	if (launch.type === McpServerTransportType.Stdio) {
		const result: Record<string, unknown> = {
			type: 'stdio',
			command: launch.command,
		};
		if (launch.args.length > 0) {
			result['args'] = [...launch.args];
		}
		if (launch.cwd) {
			result['cwd'] = launch.cwd;
		}
		if (Object.keys(launch.env).length > 0) {
			result['env'] = { ...launch.env };
		}
		return result;
	} else {
		const result: Record<string, unknown> = {
			type: 'http',
			url: launch.uri.toString(),
		};
		if (launch.headers.length > 0) {
			const headers: Record<string, string> = {};
			for (const [key, value] of launch.headers) {
				headers[key] = value;
			}
			result['headers'] = headers;
		}
		return result;
	}
}

export async function copyDirectory(fileService: IFileService, source: URI, target: URI): Promise<void> {
	const stat = await fileService.resolve(source);
	if (stat.isDirectory) {
		await fileService.createFolder(target);
		if (stat.children) {
			for (const child of stat.children) {
				const childName = basename(child.resource);
				await copyDirectory(fileService, child.resource, joinPath(target, childName));
			}
		}
	} else {
		const content = await fileService.readFile(source);
		await fileService.writeFile(target, content.value);
	}
}

const MARKETPLACE_PATHS = [
	'marketplace.json',
	'.plugin/marketplace.json',
];

export async function updateMarketplaceIfNeeded(fileService: IFileService, targetDir: URI, pluginName: string): Promise<void> {
	for (const relPath of MARKETPLACE_PATHS) {
		const marketplaceUri = joinPath(targetDir, relPath);
		if (await fileService.exists(marketplaceUri)) {
			try {
				const content = await fileService.readFile(marketplaceUri);
				const marketplace = parseJSONC<Record<string, unknown>>(content.value.toString());
				if (marketplace && typeof marketplace === 'object') {
					if (!Array.isArray(marketplace['plugins'])) {
						marketplace['plugins'] = [];
					}

					const plugins = marketplace['plugins'] as { name?: string; source?: string }[];

					// Skip if a plugin with this name already exists
					if (plugins.some(p => p.name === pluginName)) {
						return;
					}

					plugins.push({
						name: pluginName,
						source: `./${pluginName}/`,
					});

					await fileService.writeFile(
						marketplaceUri,
						VSBuffer.fromString(JSON.stringify(marketplace, null, '\t'))
					);
				}
			} catch {
				// Skip if marketplace.json is unparseable
			}
			return; // Only update the first found marketplace
		}
	}
}

export function registerCreatePluginAction(): DisposableStore {
	const store = new DisposableStore();
	store.add(registerAction2(CreatePluginAction));
	return store;
}
