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
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { InstalledAgentPluginsViewId } from '../agentPluginsView.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { IPromptsService, PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { IMcpRegistry } from '../../../mcp/common/mcpRegistryTypes.js';
import { CHAT_CATEGORY } from './chatActions.js';
const VALID_PLUGIN_NAME = /^[a-z0-9]([a-z0-9\-.]*[a-z0-9])?$/;
const INVALID_CONSECUTIVE = /--|[.][.]/;
export function validatePluginName(name) {
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
function isUserDefined(storage) {
    return storage === PromptsStorage.local || storage === PromptsStorage.user;
}
function isUserDefinedMcpCollection(collection) {
    const order = collection.presentation?.order;
    return order === 200 /* McpCollectionSortOrder.User */
        || order === 0 /* McpCollectionSortOrder.WorkspaceFolder */
        || order === 100 /* McpCollectionSortOrder.Workspace */;
}
/**
 * Gets a display label for a prompt resource. Skills need special handling
 * because their URI points to `SKILL.md`, so we use the parent directory name.
 */
export function getResourceLabel(r) {
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
export function getResourceFileName(r) {
    const label = getResourceLabel(r);
    const colonIndex = label.indexOf(':');
    return colonIndex >= 0 ? label.substring(colonIndex + 1) : label;
}
class CreatePluginAction extends Action2 {
    static { this.ID = 'workbench.action.chat.createPlugin'; }
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
                    when: ContextKeyExpr.and(ContextKeyExpr.equals('view', InstalledAgentPluginsViewId), ChatContextKeys.Setup.hidden.negate()),
                    group: 'navigation',
                    order: 2,
                }],
        });
    }
    async run(accessor) {
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
            }
            finally {
                cts.dispose(true);
            }
        })();
        const mcpCollections = mcpRegistry.collections.get();
        // Step 2: Build tree items grouped by resource type
        let showAll = false;
        const buildTree = () => {
            const groups = [];
            const addGroup = (resources, resourceType, groupLabel, icon) => {
                const filtered = showAll ? resources : resources.filter(r => isUserDefined(r.storage));
                if (filtered.length === 0) {
                    return;
                }
                const children = filtered.map(r => ({
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
            const mcpChildren = [];
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
        const tree = disposables.add(quickInputService.createQuickTree());
        tree.placeholder = localize('selectResources', "Select resources to include in the plugin");
        tree.matchOnDescription = true;
        tree.matchOnLabel = true;
        tree.sortByLabel = false;
        tree.title = localize('createPluginTitle', "Create Plugin");
        tree.setItemTree(buildTree());
        const toggleButton = { iconClass: ThemeIcon.asClassName(Codicon.filter), tooltip: localize('showAll', "Show Built-in, Extension, and Plugin Resources") };
        tree.buttons = [toggleButton];
        disposables.add(tree.onDidTriggerButton((button) => {
            if (button === toggleButton) {
                showAll = !showAll;
                tree.setItemTree(buildTree());
            }
        }));
        const selectedItems = await new Promise(resolve => {
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
        const selected = selectedItems.filter((i) => !!i.resourceType);
        // Step 4: Ask for plugin name
        const pluginName = await quickInputService.input({
            prompt: localize('pluginNamePrompt', "Enter a name for the plugin"),
            placeHolder: 'my-plugin',
            validateInput: async (value) => validatePluginName(value),
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
            }
            catch {
                // revealFileInOS may not be available for all URI schemes
            }
            notificationService.info(localize('pluginCreated', "Plugin '{0}' created successfully.", pluginName));
        }
        catch (err) {
            notificationService.error(localize('pluginCreateError', "Failed to create plugin: {0}", String(err)));
        }
    }
}
/**
 * Writes a plugin directory structure to disk from selected resources.
 */
export async function writePluginToDisk(fileService, pluginRoot, pluginName, selected) {
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
        const mergedHooks = {};
        for (const item of byType.hook) {
            if (!item.promptPath) {
                continue;
            }
            try {
                const content = await fileService.readFile(item.promptPath.uri);
                const parsed = parseJSONC(content.value.toString());
                const hooksObj = (parsed?.hooks ?? parsed);
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
            }
            catch {
                // Skip unparseable hook files
            }
        }
        const hooksJson = { hooks: mergedHooks };
        await fileService.writeFile(joinPath(hooksDir, 'hooks.json'), VSBuffer.fromString(JSON.stringify(hooksJson, null, '\t')));
    }
    // Export MCP servers → .mcp.json
    if (byType.mcp.length > 0) {
        const mcpServers = {};
        for (const item of byType.mcp) {
            if (!item.mcpServer) {
                continue;
            }
            const def = item.mcpServer.definition;
            mcpServers[def.label] = serializeMcpLaunch(def.launch);
        }
        const mcpJson = { mcpServers };
        await fileService.writeFile(joinPath(pluginRoot, '.mcp.json'), VSBuffer.fromString(JSON.stringify(mcpJson, null, '\t')));
    }
}
export function serializeHookCommand(cmd) {
    const result = { type: 'command' };
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
    if (cmd.env && typeof cmd.env === 'object' && Object.keys(cmd.env).length > 0) {
        result['env'] = cmd.env;
    }
    if (typeof cmd.timeout === 'number') {
        result['timeout'] = cmd.timeout;
    }
    return result;
}
export function serializeMcpLaunch(launch) {
    if (launch.type === 1 /* McpServerTransportType.Stdio */) {
        const result = {
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
    }
    else {
        const result = {
            type: 'http',
            url: launch.uri.toString(),
        };
        if (launch.headers.length > 0) {
            const headers = {};
            for (const [key, value] of launch.headers) {
                headers[key] = value;
            }
            result['headers'] = headers;
        }
        return result;
    }
}
export async function copyDirectory(fileService, source, target) {
    const stat = await fileService.resolve(source);
    if (stat.isDirectory) {
        await fileService.createFolder(target);
        if (stat.children) {
            for (const child of stat.children) {
                const childName = basename(child.resource);
                await copyDirectory(fileService, child.resource, joinPath(target, childName));
            }
        }
    }
    else {
        const content = await fileService.readFile(source);
        await fileService.writeFile(target, content.value);
    }
}
const MARKETPLACE_PATHS = [
    'marketplace.json',
    '.plugin/marketplace.json',
];
export async function updateMarketplaceIfNeeded(fileService, targetDir, pluginName) {
    for (const relPath of MARKETPLACE_PATHS) {
        const marketplaceUri = joinPath(targetDir, relPath);
        if (await fileService.exists(marketplaceUri)) {
            try {
                const content = await fileService.readFile(marketplaceUri);
                const marketplace = parseJSONC(content.value.toString());
                if (marketplace && typeof marketplace === 'object') {
                    if (!Array.isArray(marketplace['plugins'])) {
                        marketplace['plugins'] = [];
                    }
                    const plugins = marketplace['plugins'];
                    // Skip if a plugin with this name already exists
                    if (plugins.some(p => p.name === pluginName)) {
                        return;
                    }
                    plugins.push({
                        name: pluginName,
                        source: `./${pluginName}/`,
                    });
                    await fileService.writeFile(marketplaceUri, VSBuffer.fromString(JSON.stringify(marketplace, null, '\t')));
                }
            }
            catch {
                // Skip if marketplace.json is unparseable
            }
            return; // Only update the first found marketplace
        }
    }
}
export function registerCreatePluginAction() {
    registerAction2(CreatePluginAction);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3JlYXRlUGx1Z2luQWN0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FjdGlvbnMvY3JlYXRlUGx1Z2luQWN0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNoRSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNyRixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDakUsT0FBTyxFQUFFLEtBQUssSUFBSSxVQUFVLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDMUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDdEYsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxlQUFlLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDekUsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUM1RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxlQUFlLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNyRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDdEYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDdkYsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUV6RixPQUFP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