/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { assertNever } from '../../../../../base/common/assert.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { diffSets } from '../../../../../base/common/collections.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { assertType } from '../../../../../base/common/types.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputButton, IQuickInputService, IQuickPickItem, IQuickPickSeparator, IQuickTreeItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { URI } from '../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ExtensionEditorTab, IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { McpCommandIds } from '../../../mcp/common/mcpCommandIds.js';
import { IMcpRegistry } from '../../../mcp/common/mcpRegistryTypes.js';
import { IMcpServer, IMcpService, IMcpWorkbenchService, McpConnectionState, McpServerEditorTab } from '../../../mcp/common/mcpTypes.js';
import { ILanguageModelToolsService, IToolData, ToolDataSource, ToolSet } from '../../common/languageModelToolsService.js';
import { ConfigureToolSets } from '../tools/toolSetsContribution.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { Iterable } from '../../../../../base/common/iterator.js';
import Severity from '../../../../../base/common/severity.js';
import { markdownCommandLink } from '../../../../../base/common/htmlContent.js';

/**
 * Chat Tools Picker - Dual Implementation
 *
 * This module provides a tools picker for the chat interface with two implementations:
 * 1. Legacy QuickPick implementation (showToolsPickerLegacy) - the original flat list approach
 * 2. New QuickTree implementation (showToolsPickerTree) - hierarchical tree approach
 *
 * The implementation is controlled by the workspace setting 'chat.tools.useTreePicker':
 * - false (default): Uses the legacy QuickPick implementation for backward compatibility
 * - true: Uses the new QuickTree implementation for improved UX with hierarchical structure
 *
 * Key differences between implementations:
 * - QuickPick: Flat list with indentation to show hierarchy
 * - QuickTree: True hierarchical tree with collapsible nodes and checkboxes
 *
 * MCP Server Special Case: MCP servers are represented differently in the tree:
 * - MCP Server appears as a bucket (parent node)
 * - Tools appear as direct children of the server bucket
 * - The MCP ToolSet is stored in bucket.toolset but not shown as separate tree node
 *
 * Both implementations maintain the same external API and return the same result format:
 * Map<IToolData | ToolSet, boolean> representing selected tools and toolsets.
 */

const enum BucketOrdinal { User, BuiltIn, Mcp, Extension }

// Legacy QuickPick types (existing implementation)
type BucketPick = IQuickPickItem & { picked: boolean; ordinal: BucketOrdinal; status?: string; toolset?: ToolSet; children: (ToolPick | ToolSetPick)[] };
type ToolSetPick = IQuickPickItem & { picked: boolean; toolset: ToolSet; parent: BucketPick };
type ToolPick = IQuickPickItem & { picked: boolean; tool: IToolData; parent: BucketPick };
type CallbackPick = IQuickPickItem & { pickable: false; run: () => void };
type AnyPick = BucketPick | ToolSetPick | ToolPick | CallbackPick;
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
}

/**
 * ToolSet tree item - represents a collection of tools that can be managed together.
 * Used for regular (non-MCP) toolsets that appear as intermediate nodes in the tree.
 */
interface IToolSetTreeItem extends IToolTreeItem {
	readonly itemType: 'toolset';
	readonly toolset: ToolSet;
}

/**
 * Tool tree item - represents an individual tool that can be selected/deselected.
 * This is a leaf node in the tree structure.
 */
interface IToolTreeItemData extends IToolTreeItem {
	readonly itemType: 'tool';
	readonly tool: IToolData;
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

// Type guards for legacy QuickPick types
function isBucketPick(obj: any): obj is BucketPick {
	return Boolean((obj as BucketPick).children);
}
function isToolSetPick(obj: AnyPick): obj is ToolSetPick {
	return Boolean((obj as ToolSetPick).toolset);
}
function isToolPick(obj: AnyPick): obj is ToolPick {
	return Boolean((obj as ToolPick).tool);
}
function isCallbackPick(obj: AnyPick): obj is CallbackPick {
	return Boolean((obj as CallbackPick).run);
}
function isActionableButton(obj: IQuickInputButton): obj is ActionableButton {
	return typeof (obj as ActionableButton).action === 'function';
}

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
 * This implementation provides improved UX over the legacy flat list approach.
 */
async function showToolsPickerTree(
	accessor: ServicesAccessor,
	placeHolder: string,
	description?: string,
	toolsEntries?: ReadonlyMap<ToolSet | IToolData, boolean>,
	onUpdate?: (toolsEntries: ReadonlyMap<ToolSet | IToolData, boolean>) => void
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
		const buttons: ActionableButton[] = [];

		if (toolSetOrTool.source.type === 'mcp') {
			const key = ToolDataSource.toKey(toolSetOrTool.source);
			const { definitionId } = toolSetOrTool.source;
			const mcpServer = mcpService.servers.get().find(candidate => candidate.definition.id === definitionId);
			if (!mcpServer) {
				continue;
			}

			bucketItem = bucketMap.get(key);
			if (!bucketItem) {
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
					alwaysShow: true,
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
				bucketItem.children = [...(bucketItem.children || []), toolTreeItem];
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
				buttons.push({
					iconClass: ThemeIcon.asClassName(Codicon.edit),
					tooltip: localize('editUserBucket', "Edit Tool Set"),
					action: () => {
						assertType(toolSetOrTool.source.type === 'user');
						editorService.openEditor({ resource: toolSetOrTool.source.file });
					}
				});
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
					buttons,
					collapsed,
					alwaysShow: true,
					...iconProps
				};
				bucketMap.set(key, bucketItem);
			}

			if (toolSetOrTool instanceof ToolSet) {
				// Add ToolSet as child with its tools as grandchildren - create directly instead of using legacy pick structure
				const iconProps = mapIconToTreeItem(toolSetOrTool.icon);
				const toolSetTreeItem: IToolSetTreeItem = {
					itemType: 'toolset',
					toolset: toolSetOrTool,
					buttons,
					id: toolSetOrTool.id,
					label: toolSetOrTool.referenceName,
					description: toolSetOrTool.description,
					checked: picked,
					collapsed: true,
					// TODO: Bring this back when tools in toolsets can be enabled/disabled.
					// children: Array.from(toolSetOrTool.getTools()).map(tool => createToolTreeItemFromData(tool, picked)),
					...iconProps
				};
				bucketItem.children = [...(bucketItem.children || []), toolSetTreeItem];
			} else if (toolSetOrTool.canBeReferencedInPrompt) {
				// Add individual tool as child
				const toolTreeItem = createToolTreeItemFromData(toolSetOrTool, picked);
				bucketItem.children = [...(bucketItem.children || []), toolTreeItem];
			}
		}
	}

	// Convert bucket map to sorted tree items
	const sortedBuckets = Array.from(bucketMap.values()).sort((a, b) => a.ordinal - b.ordinal);
	treeItems.push(...sortedBuckets);

	// Set up checkbox states based on parent-child relationships
	for (const bucketItem of treeItems.filter(isBucketTreeItem)) {
		if (bucketItem.checked) {
			// Check all children if bucket is checked
			bucketItem.children?.forEach(child => {
				(child as any).checked = true;
			});
		} else {
			// Check bucket if any child is checked
			bucketItem.checked = bucketItem.children?.some(child => (child as any).checked) || false;
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

	// Result collection
	const result = new Map<IToolData | ToolSet, boolean>();

	const collectResults = () => {
		result.clear();

		let count = 0;
		const traverse = (items: readonly AnyTreeItem[]) => {
			for (const item of items) {
				if (isBucketTreeItem(item)) {
					if (item.toolset) {
						// MCP server bucket represents a ToolSet
						const checked = typeof item.checked === 'boolean' ? item.checked : false;
						result.set(item.toolset, checked);
					}
					if (item.children) {
						traverse(item.children as readonly AnyTreeItem[]);
					}
				} else if (isToolSetTreeItem(item)) {
					const checked = typeof item.checked === 'boolean' ? item.checked : false;
					result.set(item.toolset, checked);
					if (item.children) {
						traverse(item.children as readonly AnyTreeItem[]);
					}
				} else if (isToolTreeItem(item)) {
					const checked = typeof item.checked === 'boolean' ? item.checked : false;
					if (checked) { count++; }
					result.set(item.tool, checked);
				}
			}
		};

		traverse(treeItems);

		if (toolLimit) {
			if (count > toolLimit) {
				treePicker.severity = Severity.Warning;
				treePicker.validationMessage = localize('toolLimitExceeded', "{0} tools are enabled. You may experience degraded tool calling above {1} tools.", count, markdownCommandLink({ title: String(toolLimit), id: '_chat.toolPicker.closeAndOpenVirtualThreshold' }));
			} else {
				treePicker.severity = Severity.Ignore;
				treePicker.validationMessage = undefined;
			}
		}

		// Special MCP handling: MCP toolset is enabled only if all tools are enabled
		for (const item of toolsService.toolSets.get()) {
			if (item.source.type === 'mcp') {
				const toolsInSet = Array.from(item.getTools());
				result.set(item, toolsInSet.every(tool => result.get(tool)));
			}
		}
	};
	collectResults();

	// Temporary command to close the picker and open settings, for use in the validation message
	store.add(CommandsRegistry.registerCommand({
		id: '_chat.toolPicker.closeAndOpenVirtualThreshold',
		handler: () => {
			treePicker.hide();
			commandService.executeCommand('workbench.action.openSettings', 'github.copilot.chat.virtualTools.threshold');
		}
	}));

	// Handle checkbox state changes
	store.add(treePicker.onDidChangeCheckedLeafItems(() => {
		collectResults();

		if (onUpdate) {
			// Check if results changed
			let didChange = toolsEntries.size !== result.size;
			for (const [key, value] of toolsEntries) {
				if (didChange) {
					break;
				}
				didChange = result.get(key) !== value;
			}

			if (didChange) {
				onUpdate(result);
			}
		}
	}));

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

	collectResults();
	return didAccept ? result : undefined;
}

/**
 * Main entry point for the tools picker. Supports both QuickPick and QuickTree implementations
 * based on the 'chat.tools.useTreePicker' workspace setting.
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
	toolsEntries?: ReadonlyMap<ToolSet | IToolData, boolean>,
	onUpdate?: (toolsEntries: ReadonlyMap<ToolSet | IToolData, boolean>) => void
): Promise<ReadonlyMap<ToolSet | IToolData, boolean> | undefined> {

	// Feature flag logic: Choose between QuickTree and QuickPick implementations
	const configurationService = accessor.get(IConfigurationService);
	const useTreePicker = configurationService.getValue<boolean>('chat.tools.useTreePicker');

	if (useTreePicker) {
		// New implementation: Use IQuickTree for hierarchical tree structure with checkboxes
		return showToolsPickerTree(accessor, placeHolder, description, toolsEntries, onUpdate);
	} else {
		// Legacy implementation: Use QuickPick for backward compatibility
		return showToolsPickerLegacy(accessor, placeHolder, description, toolsEntries, onUpdate);
	}
}

/**
 * Legacy QuickPick implementation (renamed from original showToolsPicker).
 * Uses a flat list with indentation to represent hierarchy.
 * Maintained for backward compatibility when 'chat.tools.useTreePicker' is false.
 */
async function showToolsPickerLegacy(
	accessor: ServicesAccessor,
	placeHolder: string,
	description?: string,
	toolsEntries?: ReadonlyMap<ToolSet | IToolData, boolean>,
	onUpdate?: (toolsEntries: ReadonlyMap<ToolSet | IToolData, boolean>) => void
): Promise<ReadonlyMap<ToolSet | IToolData, boolean> | undefined> {

	const quickPickService = accessor.get(IQuickInputService);
	const mcpService = accessor.get(IMcpService);
	const mcpRegistry = accessor.get(IMcpRegistry);
	const commandService = accessor.get(ICommandService);
	const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
	const editorService = accessor.get(IEditorService);
	const mcpWorkbenchService = accessor.get(IMcpWorkbenchService);
	const toolsService = accessor.get(ILanguageModelToolsService);

	const mcpServerByTool = new Map<string, IMcpServer>();
	for (const server of mcpService.servers.get()) {
		for (const tool of server.tools.get()) {
			mcpServerByTool.set(tool.id, server);
		}
	}
	const builtinBucket: BucketPick = {
		type: 'item',
		children: [],
		label: localize('defaultBucketLabel', "Built-In"),
		ordinal: BucketOrdinal.BuiltIn,
		picked: false,
	};

	const userBucket: BucketPick = {
		type: 'item',
		children: [],
		label: localize('userBucket', "User Defined Tool Sets"),
		ordinal: BucketOrdinal.User,
		alwaysShow: true,
		picked: false,
	};

	const toolLimit = accessor.get(IContextKeyService).getContextKeyValue<number>(ChatContextKeys.chatToolGroupingThreshold.key);
	const addMcpPick: CallbackPick = { type: 'item', label: localize('addServer', "Add MCP Server..."), iconClass: ThemeIcon.asClassName(Codicon.add), pickable: false, run: () => commandService.executeCommand(McpCommandIds.AddConfiguration) };
	const configureToolSetsPick: CallbackPick = { type: 'item', label: localize('configToolSet', "Configure Tool Sets..."), iconClass: ThemeIcon.asClassName(Codicon.gear), pickable: false, run: () => commandService.executeCommand(ConfigureToolSets.ID) };
	const addExpPick: CallbackPick = { type: 'item', label: localize('addExtension', "Install Extension..."), iconClass: ThemeIcon.asClassName(Codicon.add), pickable: false, run: () => extensionsWorkbenchService.openSearch('@tag:language-model-tools') };
	const addPick: CallbackPick = {
		type: 'item', label: localize('addAny', "Add More Tools..."), iconClass: ThemeIcon.asClassName(Codicon.add), pickable: false, run: async () => {
			const pick = await quickPickService.pick(
				[addMcpPick, addExpPick],
				{
					canPickMany: false,
					placeHolder: localize('noTools', "Add tools to chat")
				}
			);
			pick?.run();
		}
	};

	const toolBuckets = new Map<string, BucketPick>();

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

	for (const [toolSetOrTool, picked] of toolsEntries) {

		let bucket: BucketPick | undefined;
		const buttons: ActionableButton[] = [];

		if (toolSetOrTool.source.type === 'mcp') {
			const key = ToolDataSource.toKey(toolSetOrTool.source);

			const { definitionId } = toolSetOrTool.source;
			const mcpServer = mcpService.servers.get().find(candidate => candidate.definition.id === definitionId);
			if (!mcpServer) {
				continue;
			}

			const buttons: ActionableButton[] = [];

			bucket = toolBuckets.get(key) ?? {
				type: 'item',
				label: localize('mcplabel', "MCP Server: {0}", toolSetOrTool.source.label),
				ordinal: BucketOrdinal.Mcp,
				picked: false,
				alwaysShow: true,
				children: [],
				buttons
			};
			toolBuckets.set(key, bucket);

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

		} else if (toolSetOrTool.source.type === 'extension') {
			const key = ToolDataSource.toKey(toolSetOrTool.source);
			bucket = toolBuckets.get(key) ?? {
				type: 'item',
				label: localize('ext', 'Extension: {0}', toolSetOrTool.source.label),
				ordinal: BucketOrdinal.Extension,
				picked: false,
				alwaysShow: true,
				children: []
			};
			toolBuckets.set(key, bucket);
		} else if (toolSetOrTool.source.type === 'internal') {
			bucket = builtinBucket;
		} else if (toolSetOrTool.source.type === 'user') {
			bucket = userBucket;
			buttons.push({
				iconClass: ThemeIcon.asClassName(Codicon.edit),
				tooltip: localize('editUserBucket', "Edit Tool Set"),
				action: () => {
					assertType(toolSetOrTool.source.type === 'user');
					editorService.openEditor({ resource: toolSetOrTool.source.file });
				}
			});
		} else {
			assertNever(toolSetOrTool.source);
		}

		if (toolSetOrTool instanceof ToolSet) {
			if (toolSetOrTool.source.type !== 'mcp') { // don't show the MCP toolset
				bucket.children.push({
					parent: bucket,
					type: 'item',
					picked,
					toolset: toolSetOrTool,
					label: toolSetOrTool.referenceName,
					description: toolSetOrTool.description,
					indented: true,
					buttons
				});
			} else {
				// stash the MCP toolset into the bucket item
				bucket.toolset = toolSetOrTool;
				bucket.picked = picked;
			}
		} else if (toolSetOrTool.canBeReferencedInPrompt) {
			bucket.children.push({
				parent: bucket,
				type: 'item',
				picked,
				tool: toolSetOrTool,
				label: toolSetOrTool.toolReferenceName ?? toolSetOrTool.displayName,
				description: toolSetOrTool.userDescription ?? toolSetOrTool.modelDescription,
				indented: true,
			});
		}
	}

	for (const bucket of [builtinBucket, userBucket]) {
		if (bucket.children.length > 0) {
			toolBuckets.set(generateUuid(), bucket);
		}
	}

	// set the checkmarks in the UI:
	// bucket is checked if at least one of the children is checked
	// tool is checked if the bucket is checked or the tool itself is checked
	for (const bucket of toolBuckets.values()) {
		if (bucket.picked) {
			// check all children if the bucket is checked
			for (const child of bucket.children) {
				child.picked = true;
			}
		} else {
			// check the bucket if one of the children is checked
			bucket.picked = bucket.children.some(child => child.picked);
		}
	}

	const store = new DisposableStore();

	const picks: (AnyPick | IQuickPickSeparator)[] = [];

	for (const bucket of Array.from(toolBuckets.values()).sort((a, b) => a.ordinal - b.ordinal)) {
		picks.push({
			type: 'separator',
			label: bucket.status
		});

		picks.push(bucket);
		picks.push(...bucket.children.sort((a, b) => a.label.localeCompare(b.label)));
	}

	const picker = store.add(quickPickService.createQuickPick<AnyPick>({ useSeparators: true }));
	picker.placeholder = placeHolder;
	picker.ignoreFocusOut = true;
	picker.description = description;
	picker.canSelectMany = true;
	picker.keepScrollPosition = true;
	picker.sortByLabel = false;
	picker.matchOnDescription = true;

	if (picks.length === 0) {
		picker.placeholder = localize('noTools', "Add tools to chat");
		picker.canSelectMany = false;
		picks.push(
			addMcpPick,
			addExpPick,
		);
	} else {
		picks.push(
			{ type: 'separator' },
			configureToolSetsPick,
			addPick,
		);
	}

	let lastSelectedItems = new Set<AnyPick>();
	let ignoreEvent = false;

	const result = new Map<IToolData | ToolSet, boolean>();

	const _update = () => {
		ignoreEvent = true;
		try {
			const items = picks.filter((p): p is AnyPick => p.type === 'item' && Boolean(p.picked));
			lastSelectedItems = new Set(items);
			picker.selectedItems = items;
			let count = 0;

			result.clear();
			for (const item of picks) {
				if (item.type !== 'item') {
					continue;
				}
				if (isToolSetPick(item)) {
					result.set(item.toolset, item.picked);
					count += Iterable.length(item.toolset.getTools());
				} else if (isToolPick(item)) {
					result.set(item.tool, item.picked);
					count++;
				} else if (isBucketPick(item)) {
					if (item.toolset) {
						result.set(item.toolset, item.picked);
					}
					for (const child of item.children) {
						if (isToolSetPick(child)) {
							result.set(child.toolset, item.picked);
							count += Iterable.length(child.toolset.getTools());
						} else if (isToolPick(child)) {
							result.set(child.tool, item.picked);
							count++;
						}
					}
				}
			}

			if (toolLimit) {
				if (count > toolLimit) {
					picker.severity = Severity.Warning;
					picker.validationMessage = localize('toolLimitExceeded', "{0} tools are enabled. You may experience degraded tool calling above {1} tools.", count, toolLimit);
				} else {
					picker.severity = Severity.Ignore;
					picker.validationMessage = undefined;
				}
			}

			if (onUpdate) {
				let didChange = toolsEntries.size !== result.size;
				for (const [key, value] of toolsEntries) {
					if (didChange) {
						break;
					}
					didChange = result.get(key) !== value;
				}

				if (didChange) {
					onUpdate(result);
				}
			}

		} finally {
			ignoreEvent = false;
		}
	};

	_update();
	picker.items = picks;
	picker.show();

	store.add(picker.onDidTriggerItemButton(e => {
		if (isActionableButton(e.button)) {
			e.button.action();
			store.dispose();
		}
	}));

	store.add(picker.onDidChangeSelection(selectedPicks => {
		if (ignoreEvent) {
			return;
		}

		const addPick = selectedPicks.find(isCallbackPick);
		if (addPick) {
			return;
		}

		const { added, removed } = diffSets(lastSelectedItems, new Set(selectedPicks));

		for (const item of added) {
			item.picked = true;

			if (isBucketPick(item)) {
				// add server -> add back tools
				for (const toolPick of item.children) {
					toolPick.picked = true;
				}
			} else if (isToolPick(item) || isToolSetPick(item)) {
				// add server when tool is picked
				item.parent.picked = true;
			}
		}

		for (const item of removed) {
			item.picked = false;

			if (isBucketPick(item)) {
				// removed server -> remove tools
				for (const toolPick of item.children) {
					toolPick.picked = false;
				}
			} else if ((isToolPick(item) || isToolSetPick(item)) && item.parent.children.every(child => !child.picked)) {
				// remove LAST tool -> remove server
				item.parent.picked = false;
			}
		}

		_update();
	}));

	let didAccept = false;
	store.add(picker.onDidAccept(() => {
		const callbackPick = picker.activeItems.find(isCallbackPick);
		if (callbackPick) {
			callbackPick.run();
		} else {
			didAccept = true;
		}
	}));

	await Promise.race([Event.toPromise(Event.any(picker.onDidAccept, picker.onDidHide))]);

	store.dispose();

	// in the result, a MCP toolset is only enabled if all tools in the toolset are enabled
	for (const item of toolsService.toolSets.get()) {
		if (item.source.type === 'mcp') {
			const toolsInSet = Array.from(item.getTools());
			result.set(item, toolsInSet.every(tool => result.get(tool)));
		}
	}
	return didAccept ? result : undefined;
}
