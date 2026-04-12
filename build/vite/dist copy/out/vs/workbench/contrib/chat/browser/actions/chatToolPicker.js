/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { assertNever } from '../../../../../base/common/assert.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { IMcpRegistry } from '../../../mcp/common/mcpRegistryTypes.js';
import { IMcpService, IMcpWorkbenchService } from '../../../mcp/common/mcpTypes.js';
import { startServerAndWaitForLiveTools } from '../../../mcp/common/mcpTypesUtils.js';
import { ILanguageModelToolsConfirmationService } from '../../common/tools/languageModelToolsConfirmationService.js';
import { ILanguageModelToolsService, ToolDataSource } from '../../common/tools/languageModelToolsService.js';
import { ConfigureToolSets } from '../tools/toolSetsContribution.js';
var BucketOrdinal;
(function (BucketOrdinal) {
    BucketOrdinal[BucketOrdinal["User"] = 0] = "User";
    BucketOrdinal[BucketOrdinal["BuiltIn"] = 1] = "BuiltIn";
    BucketOrdinal[BucketOrdinal["Mcp"] = 2] = "Mcp";
    BucketOrdinal[BucketOrdinal["Extension"] = 3] = "Extension";
})(BucketOrdinal || (BucketOrdinal = {}));
// Type guards for new QuickTree types
function isBucketTreeItem(item) {
    return item.itemType === 'bucket';
}
function isToolSetTreeItem(item) {
    return item.itemType === 'toolset';
}
function isToolTreeItem(item) {
    return item.itemType === 'tool';
}
function isCallbackTreeItem(item) {
    return item.itemType === 'callback';
}
/**
 * Maps different icon types (ThemeIcon or URI-based) to QuickTreeItem icon properties.
 * Handles the conversion between ToolSet/IToolData icon formats and tree item requirements.
 * Provides a default tool icon when no icon is specified.
 *
 * @param icon - Icon to map (ThemeIcon, URI object, or undefined)
 * @param useDefaultToolIcon - Whether to use a default tool icon when none is provided
 * @returns Object with iconClass (for ThemeIcon) or iconPath (for URIs) properties
 */
function mapIconToTreeItem(icon, useDefaultToolIcon = false) {
    if (!icon) {
        if (useDefaultToolIcon) {
            return { iconClass: ThemeIcon.asClassName(Codicon.tools) };
        }
        return {};
    }
    if (ThemeIcon.isThemeIcon(icon)) {
        return { iconClass: ThemeIcon.asClassName(icon) };
    }
    else {
        return { iconPath: icon };
    }
}
function createToolTreeItemFromData(tool, checked) {
    const iconProps = mapIconToTreeItem(tool.icon, true); // Use default tool icon if none provided
    return {
        itemType: 'tool',
        tool,
        id: tool.id,
        label: tool.toolReferenceName ?? tool.displayName,
        description: tool.userDescription ?? tool.modelDescription,
        checked,
        ...iconProps
    };
}
function createToolSetTreeItem(toolset, checked, editorService) {
    const iconProps = mapIconToTreeItem(toolset.icon);
    const buttons = [];
    if (toolset.source.type === 'user') {
        const resource = toolset.source.file;
        buttons.push({
            iconClass: ThemeIcon.asClassName(Codicon.edit),
            tooltip: localize('editUserBucket', "Edit Tool Set"),
            action: () => editorService.openEditor({ resource })
        });
    }
    return {
        itemType: 'toolset',
        toolset,
        buttons,
        id: toolset.id,
        label: toolset.referenceName,
        description: toolset.description,
        checked,
        children: undefined,
        collapsed: true,
        ...iconProps
    };
}
/**
 * New QuickTree implementation of the tools picker.
 * Uses IQuickTree to provide a true hierarchical tree structure with:
 * - Collapsible nodes for buckets and toolsets
 * - Checkbox state management with parent-child relationships
 * - Special handling for MCP servers (server as bucket, tools as direct children)
 * - Built-in filtering and search capabilities
 *
 * @param accessor - Service accessor for dependency injection
 * @param placeHolder - Placeholder text shown in the picker
 * @param description - Optional description text shown in the picker
 * @param toolsEntries - Optional initial selection state for tools and toolsets
 * @param modelId - Optional model ID to filter tools by supported models
 * @param onUpdate - Optional callback fired when the selection changes
 * @param token - Optional cancellation token to close the picker when cancelled
 * @returns Promise resolving to the final selection map, or undefined if cancelled
 */
export async function showToolsPicker(accessor, placeHolder, source, description, getToolsEntries, model, token) {
    const quickPickService = accessor.get(IQuickInputService);
    const mcpService = accessor.get(IMcpService);
    const mcpRegistry = accessor.get(IMcpRegistry);
    const commandService = accessor.get(ICommandService);
    const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
    const editorService = accessor.get(IEditorService);
    const mcpWorkbenchService = accessor.get(IMcpWorkbenchService);
    const toolsService = accessor.get(ILanguageModelToolsService);
    const confirmationService = accessor.get(ILanguageModelToolsConfirmationService);
    const telemetryService = accessor.get(ITelemetryService);
    const mcpServerByTool = new Map();
    for (const server of mcpService.servers.get()) {
        for (const tool of server.tools.get()) {
            mcpServerByTool.set(tool.id, server);
        }
    }
    function computeItems(previousToolsEntries) {
        // Create default entries if none provided
        let toolsEntries = getToolsEntries ? new Map([...getToolsEntries()].map(([k, enabled]) => [k.id, enabled])) : undefined;
        if (!toolsEntries) {
            const defaultEntries = new Map();
            for (const tool of toolsService.getTools(model)) {
                if (tool.canBeReferencedInPrompt) {
                    defaultEntries.set(tool, false);
                }
            }
            for (const toolSet of toolsService.getToolSetsForModel(model)) {
                defaultEntries.set(toolSet, false);
            }
            toolsEntries = defaultEntries;
        }
        previousToolsEntries?.forEach((value, key) => {
            toolsEntries.set(key.id, value);
        });
        // Build tree structure
        const treeItems = [];
        const bucketMap = new Map();
        const getKey = (source) => {
            switch (source.type) {
                case 'mcp':
                case 'extension':
                    return ToolDataSource.toKey(source);
                case 'internal':
                    return 1 /* BucketOrdinal.BuiltIn */.toString();
                case 'user':
                    return 0 /* BucketOrdinal.User */.toString();
                case 'external':
                    throw new Error('should not be reachable');
                default:
                    assertNever(source);
            }
        };
        const mcpServers = new Map(mcpService.servers.get().map(s => [s.definition.id, { server: s, seen: false }]));
        const createBucket = (source, key) => {
            if (source.type === 'mcp') {
                const mcpServerEntry = mcpServers.get(source.definitionId);
                if (!mcpServerEntry) {
                    return undefined;
                }
                mcpServerEntry.seen = true;
                const mcpServer = mcpServerEntry.server;
                const buttons = [];
                const collection = mcpRegistry.collections.get().find(c => c.id === mcpServer.collection.id);
                if (collection?.source) {
                    buttons.push({
                        iconClass: ThemeIcon.asClassName(Codicon.settingsGear),
                        tooltip: localize('configMcpCol', "Configure {0}", collection.label),
                        action: () => collection.source ? collection.source instanceof ExtensionIdentifier ? extensionsWorkbenchService.open(collection.source.value, { tab: "features" /* ExtensionEditorTab.Features */, feature: 'mcp' }) : mcpWorkbenchService.open(collection.source, { tab: "configuration" /* McpServerEditorTab.Configuration */ }) : undefined
                    });
                }
                else if (collection?.presentation?.origin) {
                    buttons.push({
                        iconClass: ThemeIcon.asClassName(Codicon.settingsGear),
                        tooltip: localize('configMcpCol', "Configure {0}", collection.label),
                        action: () => editorService.openEditor({
                            resource: collection.presentation.origin,
                        })
                    });
                }
                if (mcpServer.connectionState.get().state === 3 /* McpConnectionState.Kind.Error */) {
                    buttons.push({
                        iconClass: ThemeIcon.asClassName(Codicon.warning),
                        tooltip: localize('mcpShowOutput', "Show Output"),
                        action: () => mcpServer.showOutput(),
                    });
                }
                const cacheState = mcpServer.cacheState.get();
                const children = [];
                let collapsed = true;
                if (cacheState === 0 /* McpServerCacheState.Unknown */ || cacheState === 2 /* McpServerCacheState.Outdated */) {
                    collapsed = false;
                    children.push({
                        itemType: 'callback',
                        iconClass: ThemeIcon.asClassName(Codicon.sync),
                        label: localize('mcpUpdate', "Update Tools"),
                        pickable: false,
                        run: () => {
                            treePicker.busy = true;
                            (async () => {
                                const ok = await startServerAndWaitForLiveTools(mcpServer, { promptType: 'all-untrusted' });
                                if (!ok) {
                                    mcpServer.showOutput();
                                    treePicker.hide();
                                    return;
                                }
                                treePicker.busy = false;
                                computeItems(collectResults());
                            })();
                            return false;
                        },
                    });
                }
                const bucket = {
                    itemType: 'bucket',
                    ordinal: 2 /* BucketOrdinal.Mcp */,
                    id: key,
                    label: source.label,
                    checked: undefined,
                    collapsed,
                    children,
                    buttons,
                    sortOrder: 2,
                };
                const iconPath = mcpServer.serverMetadata.get()?.icons.getUrl(22);
                if (iconPath) {
                    bucket.iconPath = iconPath;
                }
                else {
                    bucket.iconClass = ThemeIcon.asClassName(Codicon.mcp);
                }
                return bucket;
            }
            else if (source.type === 'extension') {
                return {
                    itemType: 'bucket',
                    ordinal: 3 /* BucketOrdinal.Extension */,
                    id: key,
                    label: source.label,
                    checked: undefined,
                    children: [],
                    buttons: [],
                    collapsed: true,
                    iconClass: ThemeIcon.asClassName(Codicon.extensions),
                    sortOrder: 3,
                };
            }
            else if (source.type === 'internal') {
                return {
                    itemType: 'bucket',
                    ordinal: 1 /* BucketOrdinal.BuiltIn */,
                    id: key,
                    label: localize('defaultBucketLabel', "Built-In"),
                    checked: undefined,
                    children: [],
                    buttons: [],
                    collapsed: false,
                    sortOrder: 1,
                };
            }
            else {
                return {
                    itemType: 'bucket',
                    ordinal: 0 /* BucketOrdinal.User */,
                    id: key,
                    label: localize('userBucket', "User Defined Tool Sets"),
                    checked: undefined,
                    children: [],
                    buttons: [],
                    collapsed: true,
                    sortOrder: 4,
                };
            }
        };
        const getBucket = (source) => {
            const key = getKey(source);
            let bucket = bucketMap.get(key);
            if (!bucket) {
                bucket = createBucket(source, key);
                if (bucket) {
                    bucketMap.set(key, bucket);
                }
            }
            return bucket;
        };
        for (const toolSet of toolsService.getToolSetsForModel(model)) {
            if (!toolsEntries.has(toolSet.id)) {
                continue;
            }
            const bucket = getBucket(toolSet.source);
            if (!bucket) {
                continue;
            }
            const toolSetChecked = toolsEntries.get(toolSet.id) === true;
            if (toolSet.source.type === 'mcp') {
                // bucket represents the toolset
                bucket.toolset = toolSet;
                if (toolSetChecked) {
                    bucket.checked = toolSetChecked;
                }
                // all mcp tools are part of toolsService.getTools()
            }
            else {
                const treeItem = createToolSetTreeItem(toolSet, toolSetChecked, editorService);
                bucket.children.push(treeItem);
                const children = [];
                for (const tool of toolSet.getTools()) {
                    const toolChecked = toolSetChecked || toolsEntries.get(tool.id) === true;
                    const toolTreeItem = createToolTreeItemFromData(tool, toolChecked);
                    children.push(toolTreeItem);
                }
                if (children.length > 0) {
                    treeItem.children = children;
                }
            }
        }
        // getting potentially disabled tools is fine here because we filter `toolsEntries.has`
        for (const tool of toolsService.getAllToolsIncludingDisabled()) {
            if (!tool.canBeReferencedInPrompt || !toolsEntries.has(tool.id)) {
                continue;
            }
            const bucket = getBucket(tool.source);
            if (!bucket) {
                continue;
            }
            const toolChecked = bucket.checked === true || toolsEntries.get(tool.id) === true;
            const toolTreeItem = createToolTreeItemFromData(tool, toolChecked);
            bucket.children.push(toolTreeItem);
        }
        // Show entries for MCP servers that don't have any tools in them and might need to be started.
        for (const { server, seen } of mcpServers.values()) {
            const cacheState = server.cacheState.get();
            if (!seen && (cacheState === 0 /* McpServerCacheState.Unknown */ || cacheState === 2 /* McpServerCacheState.Outdated */)) {
                getBucket({ type: 'mcp', definitionId: server.definition.id, label: server.definition.label, instructions: '', serverLabel: '', collectionId: server.collection.id });
            }
        }
        // Convert bucket map to sorted tree items
        const sortedBuckets = Array.from(bucketMap.values()).sort((a, b) => {
            if (a.sortOrder !== b.sortOrder) {
                return a.sortOrder - b.sortOrder;
            }
            return a.label.localeCompare(b.label);
        });
        for (const bucket of sortedBuckets) {
            treeItems.push(bucket);
            // Sort children alphabetically
            bucket.children.sort((a, b) => a.label.localeCompare(b.label));
            for (const child of bucket.children) {
                if (isToolSetTreeItem(child) && child.children) {
                    child.children.sort((a, b) => a.label.localeCompare(b.label));
                }
            }
        }
        // Add approval management buttons to tool items that support confirmation
        for (const bucket of sortedBuckets) {
            const isMcpBucket = bucket.ordinal === 2 /* BucketOrdinal.Mcp */;
            const addConfirmationButton = (toolItem) => {
                if (!confirmationService.toolCanManageConfirmation(toolItem.tool)) {
                    return;
                }
                const tool = toolItem.tool;
                const manageTools = isMcpBucket ? bucket.children.flatMap(c => isToolTreeItem(c) ? [c.tool] : isToolSetTreeItem(c) && c.children ? c.children.filter(isToolTreeItem).map(gc => gc.tool) : []) : [tool];
                const buttons = toolItem.buttons ? [...toolItem.buttons] : [];
                buttons.push({
                    iconClass: ThemeIcon.asClassName(Codicon.pass),
                    tooltip: localize('manageToolApproval', "Manage Approval"),
                    keepOpen: true,
                    action: () => confirmationService.manageConfirmationPreferences(manageTools, { focusToolId: tool.id })
                });
                toolItem.buttons = buttons;
            };
            for (const child of bucket.children) {
                if (isToolTreeItem(child)) {
                    addConfirmationButton(child);
                }
                else if (isToolSetTreeItem(child) && child.children) {
                    for (const grandchild of child.children) {
                        if (isToolTreeItem(grandchild)) {
                            addConfirmationButton(grandchild);
                        }
                    }
                }
            }
        }
        if (treeItems.length === 0) {
            treePicker.placeholder = localize('noTools', "Add tools to chat");
        }
        else {
            treePicker.placeholder = placeHolder;
        }
        treePicker.setItemTree(treeItems);
    }
    // Create and configure the tree picker
    const store = new DisposableStore();
    const treePicker = store.add(quickPickService.createQuickTree());
    treePicker.placeholder = placeHolder;
    treePicker.description = description;
    treePicker.matchOnDescription = true;
    treePicker.matchOnLabel = true;
    treePicker.sortByLabel = false;
    computeItems();
    // Handle button triggers
    store.add(treePicker.onDidTriggerItemButton(e => {
        if (e.button && typeof e.button.action === 'function') {
            const actionableButton = e.button;
            actionableButton.action();
            store.dispose();
        }
    }));
    const collectResults = () => {
        const result = new Map();
        const traverse = (items) => {
            for (const item of items) {
                if (isBucketTreeItem(item)) {
                    if (item.toolset) { // MCP server
                        // MCP toolset is enabled only if all tools are enabled
                        const allChecked = item.checked === true;
                        result.set(item.toolset, allChecked);
                    }
                    traverse(item.children);
                }
                else if (isToolSetTreeItem(item)) {
                    result.set(item.toolset, item.checked === true);
                    if (item.children) {
                        traverse(item.children);
                    }
                }
                else if (isToolTreeItem(item)) {
                    result.set(item.tool, item.checked || result.get(item.tool) === true); // tools can be in user tool sets and other buckets
                }
            }
        };
        traverse(treePicker.itemTree);
        return result;
    };
    // Handle acceptance
    let didAccept = false;
    const didAcceptFinalItem = store.add(new Emitter());
    store.add(treePicker.onDidAccept(() => {
        // Check if a callback item was activated
        const activeItems = treePicker.activeItems;
        const callbackItem = activeItems.find(isCallbackTreeItem);
        if (!callbackItem) {
            didAccept = true;
            treePicker.hide();
            return;
        }
        const ret = callbackItem.run();
        if (ret !== false) {
            didAcceptFinalItem.fire();
        }
    }));
    const addMcpServerButton = {
        iconClass: ThemeIcon.asClassName(Codicon.mcp),
        tooltip: localize('addMcpServer', 'Add MCP Server...')
    };
    const installExtension = {
        iconClass: ThemeIcon.asClassName(Codicon.extensions),
        tooltip: localize('addExtensionButton', 'Install Extension...')
    };
    const configureToolSets = {
        iconClass: ThemeIcon.asClassName(Codicon.gear),
        tooltip: localize('configToolSets', 'Configure Tool Sets...')
    };
    treePicker.title = localize('configureTools', "Configure Tools");
    treePicker.buttons = [addMcpServerButton, installExtension, configureToolSets];
    store.add(treePicker.onDidTriggerButton(button => {
        if (button === addMcpServerButton) {
            commandService.executeCommand("workbench.mcp.addConfiguration" /* McpCommandIds.AddConfiguration */);
        }
        else if (button === installExtension) {
            extensionsWorkbenchService.openSearch('@tag:language-model-tools');
        }
        else if (button === configureToolSets) {
            commandService.executeCommand(ConfigureToolSets.ID);
        }
        treePicker.hide();
    }));
    // Close picker when cancelled (e.g., when mode changes)
    if (token) {
        store.add(token.onCancellationRequested(() => {
            treePicker.hide();
        }));
    }
    // Capture initial state for telemetry comparison
    const initialState = collectResults();
    treePicker.show();
    await Promise.race([Event.toPromise(Event.any(treePicker.onDidHide, didAcceptFinalItem.event), store)]);
    // Send telemetry about tool selection changes
    sendDidChangeEvent(source, telemetryService, initialState, collectResults(), mcpRegistry);
    store.dispose();
    return didAccept ? collectResults() : undefined;
}
/**
 * Categorizes a tool or toolset source for privacy-safe telemetry.
 * Returns identifying info only for built-in/extension tools where names are public.
 * For user-defined and user MCP tools, only the category is returned.
 *
 * @param item - The tool or toolset to categorize
 * @param mcpRegistry - The MCP registry to look up collection sources for MCP tools
 */
function categorizeTool(item, mcpRegistry) {
    const source = item.source;
    switch (source.type) {
        case 'internal':
            // Built-in tools are safe to identify by name
            return { category: 'builtin', name: item.id };
        case 'extension':
            // Extension tools are public, safe to include name and extension ID
            return { category: 'extension', name: item.id, extensionId: source.extensionId.value };
        case 'mcp': {
            // MCP tools: check if the collection comes from an extension
            // Never include tool names for privacy, but include extension ID if from an extension
            const collection = mcpRegistry.collections.get().find(c => c.id === source.collectionId);
            if (collection?.source instanceof ExtensionIdentifier) {
                return { category: 'extension-mcp', extensionId: collection.source.value };
            }
            // User-configured MCP server - don't include any identifying info
            return { category: 'user-mcp' };
        }
        case 'user':
            // User-defined tool sets: don't include names for privacy
            return { category: 'user-toolset' };
        case 'external':
            // External tools shouldn't appear in the picker, treat as user-defined for safety
            return { category: 'user-toolset' };
        default:
            assertNever(source);
    }
}
function computeToolToggleSummary(initialState, finalState, mcpRegistry) {
    const summary = {
        builtinEnabled: 0,
        builtinDisabled: 0,
        extensionEnabled: 0,
        extensionDisabled: 0,
        extensionMcpEnabled: 0,
        extensionMcpDisabled: 0,
        userMcpEnabled: 0,
        userMcpDisabled: 0,
        userToolsetEnabled: 0,
        userToolsetDisabled: 0,
        details: ''
    };
    const detailItems = [];
    // Compare states and record changes
    for (const [item, finalEnabled] of finalState) {
        const initialEnabled = initialState.get(item) ?? false;
        if (initialEnabled === finalEnabled) {
            continue; // No change
        }
        const categorized = categorizeTool(item, mcpRegistry);
        const enabled = finalEnabled;
        switch (categorized.category) {
            case 'builtin':
                if (enabled) {
                    summary.builtinEnabled++;
                }
                else {
                    summary.builtinDisabled++;
                }
                detailItems.push({ category: 'builtin', name: categorized.name, enabled });
                break;
            case 'extension':
                if (enabled) {
                    summary.extensionEnabled++;
                }
                else {
                    summary.extensionDisabled++;
                }
                detailItems.push({ category: 'extension', name: categorized.name, extensionId: categorized.extensionId, enabled });
                break;
            case 'extension-mcp':
                if (enabled) {
                    summary.extensionMcpEnabled++;
                }
                else {
                    summary.extensionMcpDisabled++;
                }
                detailItems.push({ category: 'extension-mcp', extensionId: categorized.extensionId, enabled });
                break;
            case 'user-mcp':
                if (enabled) {
                    summary.userMcpEnabled++;
                }
                else {
                    summary.userMcpDisabled++;
                }
                // Don't include name for privacy
                detailItems.push({ category: 'user-mcp', enabled });
                break;
            case 'user-toolset':
                if (enabled) {
                    summary.userToolsetEnabled++;
                }
                else {
                    summary.userToolsetDisabled++;
                }
                // Don't include name for privacy
                detailItems.push({ category: 'user-toolset', enabled });
                break;
        }
    }
    // Serialize details as JSON
    summary.details = JSON.stringify(detailItems);
    return summary;
}
function sendDidChangeEvent(source, telemetryService, initialState, finalState, mcpRegistry) {
    const summary = computeToolToggleSummary(initialState, finalState, mcpRegistry);
    const changed = summary.builtinEnabled > 0 || summary.builtinDisabled > 0 ||
        summary.extensionEnabled > 0 || summary.extensionDisabled > 0 ||
        summary.extensionMcpEnabled > 0 || summary.extensionMcpDisabled > 0 ||
        summary.userMcpEnabled > 0 || summary.userMcpDisabled > 0 ||
        summary.userToolsetEnabled > 0 || summary.userToolsetDisabled > 0;
    telemetryService.publicLog2('chatToolPickerClosed', {
        source,
        changed,
        builtinEnabled: summary.builtinEnabled,
        builtinDisabled: summary.builtinDisabled,
        extensionEnabled: summary.extensionEnabled,
        extensionDisabled: summary.extensionDisabled,
        extensionMcpEnabled: summary.extensionMcpEnabled,
        extensionMcpDisabled: summary.extensionMcpDisabled,
        userMcpEnabled: summary.userMcpEnabled,
        userMcpDisabled: summary.userMcpDisabled,
        userToolsetEnabled: summary.userToolsetEnabled,
        userToolsetDisabled: summary.userToolsetDisabled,
        details: summary.details,
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFRvb2xQaWNrZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWN0aW9ucy9jaGF0VG9vbFBpY2tlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUNoRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFbkUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDckUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUVwRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDakQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBRTlGLE9BQU8sRUFBcUIsa0JBQWtCLEVBQWtDLE1BQU0seURBQXlELENBQUM7QUFDaEosT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDMUYsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3JGLE9BQU8sRUFBc0IsMkJBQTJCLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUUzRyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDdkUsT0FBTyxFQUFjLFdBQVcsRUFBRSxvQkFBb0IsRUFBK0QsTUFBTSxpQ0FBaUMsQ0FBQztBQUM3SixPQUFPLEVBQUUsOEJBQThCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUV0RixPQUFPLEVB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