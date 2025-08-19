/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { assertNever } from '../../../../../base/common/assert.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputButton, IQuickInputService, IQuickPickItem, IQuickTreeItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { URI } from '../../../../../base/common/uri.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ExtensionEditorTab, IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { McpCommandIds } from '../../../mcp/common/mcpCommandIds.js';
import { IMcpRegistry } from '../../../mcp/common/mcpRegistryTypes.js';
import { IMcpServer, IMcpService, IMcpWorkbenchService, McpConnectionState, McpServerEditorTab } from '../../../mcp/common/mcpTypes.js';
import { ILanguageModelToolsService, IToolData, ToolDataSource, ToolSet } from '../../common/languageModelToolsService.js';
import { ConfigureToolSets } from '../tools/toolSetsContribution.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import Severity from '../../../../../base/common/severity.js';
import { markdownCommandLink } from '../../../../../base/common/htmlContent.js';

const enum BucketOrdinal { User, BuiltIn, Mcp, Extension }

// Legacy QuickPick types (existing implementation)
type BucketPick = IQuickPickItem & { picked: boolean; ordinal: BucketOrdinal; status?: string; toolset?: ToolSet; children: (ToolPick | ToolSetPick)[] };
type ToolSetPick = IQuickPickItem & { picked: boolean; toolset: ToolSet; parent: BucketPick };
type ToolPick = IQuickPickItem & { picked: boolean; tool: IToolData; parent: BucketPick };
type ActionableButton = IQuickInputButton & { action: () => void };

// New QuickTree types for tree-based implementation

/**
 * Base interface for all tree items in the QuickTree implementation.
 * Extends IQuickTreeItem with common properties for tool picker items.
 */
interface IToolTreeItem extends IQuickTreeItem {
	readonly itemType: 'bucket' | 'toolset' | 'tool' | 'callback';
	readonly ordinal?: BucketOrdinal;
	readonly buttons?: readonly ActionableButton[];
}

/**
 * Bucket tree item - represents a category of tools (User, BuiltIn, MCP Server, Extension).
 * For MCP servers, the bucket directly represents the server and stores the toolset.
 */
interface IBucketTreeItem extends IToolTreeItem {
	readonly itemType: 'bucket';
	readonly ordinal: BucketOrdinal;
	toolset?: ToolSet; // For MCP servers where the bucket represents the ToolSet - mutable
	readonly status?: string;
	readonly children: AnyTreeItem[];
	checked: boolean | 'partial';
}

/**
 * ToolSet tree item - represents a collection of tools that can be managed together.
 * Used for regular (non-MCP) toolsets that appear as intermediate nodes in the tree.
 */
interface IToolSetTreeItem extends IToolTreeItem {
	readonly itemType: 'toolset';
	readonly toolset: ToolSet;
	readonly children: AnyTreeItem[];
	checked: boolean | 'partial';
}

/**
 * Tool tree item - represents an individual tool that can be selected/deselected.
 * This is a leaf node in the tree structure.
 */
interface IToolTreeItemData extends IToolTreeItem {
	readonly itemType: 'tool';
	readonly tool: IToolData;
	checked: boolean;
}

/**
 * Callback tree item - represents action items like "Add MCP Server" or "Configure Tool Sets".
 * These are non-selectable items that execute actions when clicked.
 */
interface ICallbackTreeItem extends IToolTreeItem {
	readonly itemType: 'callback';
	readonly run: () => void;
	readonly pickable: false;
}

type AnyTreeItem = IBucketTreeItem | IToolSetTreeItem | IToolTreeItemData | ICallbackTreeItem;

// Type guards for new QuickTree types
function isBucketTreeItem(item: AnyTreeItem): item is IBucketTreeItem {
	return item.itemType === 'bucket';
}
function isToolSetTreeItem(item: AnyTreeItem): item is IToolSetTreeItem {
	return item.itemType === 'toolset';
}
function isToolTreeItem(item: AnyTreeItem): item is IToolTreeItemData {
	return item.itemType === 'tool';
}
function isCallbackTreeItem(item: AnyTreeItem): item is ICallbackTreeItem {
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
function mapIconToTreeItem(icon: ThemeIcon | { dark: URI; light?: URI } | undefined, useDefaultToolIcon: boolean = false): Pick<IQuickTreeItem, 'iconClass' | 'iconPath'> {
	if (!icon) {
		if (useDefaultToolIcon) {
			return { iconClass: ThemeIcon.asClassName(Codicon.tools) };
		}
		return {};
	}

	if (ThemeIcon.isThemeIcon(icon)) {
		return { iconClass: ThemeIcon.asClassName(icon) };
	} else {
		return { iconPath: icon };
	}
}

function createToolTreeItemFromData(tool: IToolData, checked: boolean): IToolTreeItemData {
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
 * @param onUpdate - Optional callback fired when the selection changes
 * @returns Promise resolving to the final selection map, or undefined if cancelled
 */
export async function showToolsPicker(
	accessor: ServicesAccessor,
	placeHolder: string,
	description?: string,
	toolsEntries?: ReadonlyMap<ToolSet | IToolData, boolean>
): Promise<ReadonlyMap<ToolSet | IToolData, boolean> | undefined> {

	const quickPickService = accessor.get(IQuickInputService);
	const mcpService = accessor.get(IMcpService);
	const mcpRegistry = accessor.get(IMcpRegistry);
	const commandService = accessor.get(ICommandService);
	const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
	const editorService = accessor.get(IEditorService);
	const mcpWorkbenchService = accessor.get(IMcpWorkbenchService);
	const toolsService = accessor.get(ILanguageModelToolsService);
	const toolLimit = accessor.get(IContextKeyService).getContextKeyValue<number>(ChatContextKeys.chatToolGroupingThreshold.key);

	const mcpServerByTool = new Map<string, IMcpServer>();
	for (const server of mcpService.servers.get()) {
		for (const tool of server.tools.get()) {
			mcpServerByTool.set(tool.id, server);
		}
	}

	// Create default entries if none provided
	if (!toolsEntries) {
		const defaultEntries = new Map();
		for (const tool of toolsService.getTools()) {
			if (tool.canBeReferencedInPrompt) {
				defaultEntries.set(tool, false);
			}
		}
		for (const toolSet of toolsService.toolSets.get()) {
			defaultEntries.set(toolSet, false);
		}
		toolsEntries = defaultEntries;
	}

	// Build tree structure
	const treeItems: AnyTreeItem[] = [];
	const bucketMap = new Map<string, IBucketTreeItem>();

	// Process entries and organize into buckets
	for (const [toolSetOrTool, picked] of toolsEntries) {
		let bucketItem: IBucketTreeItem | undefined;

		if (toolSetOrTool.source.type === 'mcp') {
			const key = ToolDataSource.toKey(toolSetOrTool.source);
			bucketItem = bucketMap.get(key);
			if (!bucketItem) {
				const { definitionId } = toolSetOrTool.source;
				const mcpServer = mcpService.servers.get().find(candidate => candidate.definition.id === definitionId);
				if (!mcpServer) {
					continue;
				}

				const buttons: ActionableButton[] = [];
				const collection = mcpRegistry.collections.get().find(c => c.id === mcpServer.collection.id);
				if (collection?.source) {
					buttons.push({
						iconClass: ThemeIcon.asClassName(Codicon.settingsGear),
						tooltip: localize('configMcpCol', "Configure {0}", collection.label),
						action: () => collection.source ? collection.source instanceof ExtensionIdentifier ? extensionsWorkbenchService.open(collection.source.value, { tab: ExtensionEditorTab.Features, feature: 'mcp' }) : mcpWorkbenchService.open(collection.source, { tab: McpServerEditorTab.Configuration }) : undefined
					});
				} else if (collection?.presentation?.origin) {
					buttons.push({
						iconClass: ThemeIcon.asClassName(Codicon.settingsGear),
						tooltip: localize('configMcpCol', "Configure {0}", collection.label),
						action: () => editorService.openEditor({
							resource: collection!.presentation!.origin,
						})
					});
				}
				if (mcpServer.connectionState.get().state === McpConnectionState.Kind.Error) {
					buttons.push({
						iconClass: ThemeIcon.asClassName(Codicon.warning),
						tooltip: localize('mcpShowOutput', "Show Output"),
						action: () => mcpServer.showOutput(),
					});
				}

				bucketItem = {
					itemType: 'bucket',
					ordinal: BucketOrdinal.Mcp,
					id: key,
					label: localize('mcplabel', "MCP Server: {0}", toolSetOrTool.source.label),
					checked: false,
					collapsed: true,
					children: [],
					buttons,
					iconClass: ThemeIcon.asClassName(Codicon.mcp)
				};
				bucketMap.set(key, bucketItem);
			}

			if (toolSetOrTool instanceof ToolSet) {
				// MCP ToolSets are hidden - store in bucket for special handling
				bucketItem.toolset = toolSetOrTool;
				bucketItem.checked = picked;
			} else if (toolSetOrTool.canBeReferencedInPrompt) {
				// Add MCP tools directly as children
				const toolTreeItem = createToolTreeItemFromData(toolSetOrTool, picked);
				bucketItem.children.push(toolTreeItem);
			}

		} else {
			// Handle other tool sources (extension, internal, user)
			let ordinal: BucketOrdinal;
			let label: string;
			let key: string;
			let collapsed: boolean | undefined;
			if (toolSetOrTool.source.type === 'extension') {
				ordinal = BucketOrdinal.Extension;
				label = localize('ext', 'Extension: {0}', toolSetOrTool.source.label);
				// Create separate buckets per extension, similar to MCP servers
				key = ToolDataSource.toKey(toolSetOrTool.source);
				collapsed = true;
			} else if (toolSetOrTool.source.type === 'internal') {
				ordinal = BucketOrdinal.BuiltIn;
				label = localize('defaultBucketLabel', "Built-In");
				// Group all internal tools under one bucket
				key = ordinal.toString();
			} else if (toolSetOrTool.source.type === 'user') {
				ordinal = BucketOrdinal.User;
				label = localize('userBucket', "User Defined Tool Sets");
				// Group all user tools under one bucket
				key = ordinal.toString();
			} else {
				assertNever(toolSetOrTool.source);
			}

			bucketItem = bucketMap.get(key);
			if (!bucketItem) {
				const iconProps = toolSetOrTool.source.type === 'extension'
					? { iconClass: ThemeIcon.asClassName(Codicon.extensions) }
					: {};

				bucketItem = {
					itemType: 'bucket',
					ordinal,
					id: key,
					label,
					checked: false,
					children: [],
					buttons: [],
					collapsed,
					...iconProps
				};
				bucketMap.set(key, bucketItem);
			}

			if (toolSetOrTool instanceof ToolSet) {
				// Add ToolSet as child with its tools as grandchildren - create directly instead of using legacy pick structure
				const iconProps = mapIconToTreeItem(toolSetOrTool.icon);
				const buttons = [];
				if (toolSetOrTool.source.type === 'user') {
					const resource = toolSetOrTool.source.file;
					buttons.push({
						iconClass: ThemeIcon.asClassName(Codicon.edit),
						tooltip: localize('editUserBucket', "Edit Tool Set"),
						action: () => editorService.openEditor({ resource })
					});
				}
				const toolSetTreeItem: IToolSetTreeItem = {
					itemType: 'toolset',
					toolset: toolSetOrTool,
					buttons,
					id: toolSetOrTool.id,
					label: toolSetOrTool.referenceName,
					description: toolSetOrTool.description,
					checked: picked,
					children: [],
					collapsed: true,
					// TODO: Bring this back when tools in toolsets can be enabled/disabled.
					// children: Array.from(toolSetOrTool.getTools()).map(tool => createToolTreeItemFromData(tool, picked)),
					...iconProps
				};
				bucketItem.children.push(toolSetTreeItem);
			} else if (toolSetOrTool.canBeReferencedInPrompt) {
				// Add individual tool as child
				const toolTreeItem = createToolTreeItemFromData(toolSetOrTool, picked);
				bucketItem.children.push(toolTreeItem);
			}
		}
	}

	// Convert bucket map to sorted tree items
	const sortedBuckets = Array.from(bucketMap.values()).sort((a, b) => a.ordinal - b.ordinal);
	treeItems.push(...sortedBuckets);

	// Set up checkbox states based on parent-child relationships
	for (const bucketItem of sortedBuckets) {
		if (bucketItem.checked === true) { // only set for MCP tool sets
			// Check all children if bucket is checked
			bucketItem.children.forEach(child => child.checked = true);
		}
	}

	// Create and configure the tree picker
	const store = new DisposableStore();
	const treePicker = store.add(quickPickService.createQuickTree<AnyTreeItem>());

	treePicker.placeholder = placeHolder;
	treePicker.ignoreFocusOut = true;
	treePicker.description = description;
	treePicker.matchOnDescription = true;
	treePicker.matchOnLabel = true;

	if (treeItems.length === 0) {
		treePicker.placeholder = localize('noTools', "Add tools to chat");
	}

	treePicker.setItemTree(treeItems);

	// Handle button triggers
	store.add(treePicker.onDidTriggerItemButton(e => {
		if (e.button && typeof (e.button as ActionableButton).action === 'function') {
			(e.button as ActionableButton).action();
			store.dispose();
		}
	}));

	const updateToolLimitMessage = () => {
		if (toolLimit) {
			let count = 0;
			const traverse = (items: readonly AnyTreeItem[]) => {
				for (const item of items) {
					if (isBucketTreeItem(item) || isToolSetTreeItem(item)) {
						traverse(item.children);
					} else if (isToolTreeItem(item) && item.checked) {
						count++;
					}
				}
			};
			traverse(treeItems);
			if (count > toolLimit) {
				treePicker.severity = Severity.Warning;
				treePicker.validationMessage = localize('toolLimitExceeded', "{0} tools are enabled. You may experience degraded tool calling above {1} tools.", count, markdownCommandLink({ title: String(toolLimit), id: '_chat.toolPicker.closeAndOpenVirtualThreshold' }));
			} else {
				treePicker.severity = Severity.Ignore;
				treePicker.validationMessage = undefined;
			}
		}
	};
	updateToolLimitMessage();

	const collectResults = () => {

		const result = new Map<IToolData | ToolSet, boolean>();
		const traverse = (items: readonly AnyTreeItem[]) => {
			for (const item of items) {
				if (isBucketTreeItem(item)) {
					if (item.toolset) { // MCP server
						// MCP toolset is enabled only if all tools are enabled
						const allChecked = item.checked === true;
						result.set(item.toolset, allChecked);
					}
					traverse(item.children);
				} else if (isToolSetTreeItem(item)) {
					result.set(item.toolset, item.checked === true);
					traverse(item.children);
				} else if (isToolTreeItem(item)) {
					result.set(item.tool, item.checked);
				}
			}
		};

		traverse(treeItems);
		return result;
	};

	// Temporary command to close the picker and open settings, for use in the validation message
	store.add(CommandsRegistry.registerCommand({
		id: '_chat.toolPicker.closeAndOpenVirtualThreshold',
		handler: () => {
			treePicker.hide();
			commandService.executeCommand('workbench.action.openSettings', 'github.copilot.chat.virtualTools.threshold');
		}
	}));

	// Handle checkbox state changes
	store.add(treePicker.onDidChangeCheckedLeafItems(() => updateToolLimitMessage()));

	// Handle acceptance
	let didAccept = false;
	store.add(treePicker.onDidAccept(() => {
		// Check if a callback item was activated
		const activeItems = treePicker.activeItems;
		const callbackItem = activeItems.find(isCallbackTreeItem);
		if (callbackItem) {
			callbackItem.run();
		} else {
			didAccept = true;
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
			commandService.executeCommand(McpCommandIds.AddConfiguration);
		} else if (button === installExtension) {
			extensionsWorkbenchService.openSearch('@tag:language-model-tools');
		} else if (button === configureToolSets) {
			commandService.executeCommand(ConfigureToolSets.ID);
		}
		treePicker.hide();
	}));

	treePicker.show();

	await Promise.race([Event.toPromise(Event.any(treePicker.onDidAccept, treePicker.onDidHide), store)]);

	store.dispose();

	return didAccept ? collectResults() : undefined;
}
