/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { assertNever } from '../../../../../base/common/assert.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { markdownCommandLink } from '../../../../../base/common/htmlContent.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import Severity from '../../../../../base/common/severity.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputButton, IQuickInputService, IQuickPickItem, IQuickTreeItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ExtensionEditorTab, IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { McpCommandIds } from '../../../mcp/common/mcpCommandIds.js';
import { IMcpRegistry } from '../../../mcp/common/mcpRegistryTypes.js';
import { IMcpServer, IMcpService, IMcpWorkbenchService, McpConnectionState, McpServerCacheState, McpServerEditorTab } from '../../../mcp/common/mcpTypes.js';
import { startServerAndWaitForLiveTools } from '../../../mcp/common/mcpTypesUtils.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { ILanguageModelToolsService, IToolData, ToolDataSource, ToolSet } from '../../common/languageModelToolsService.js';
import { ConfigureToolSets } from '../tools/toolSetsContribution.js';

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
	checked: boolean | 'mixed' | undefined;
	readonly sortOrder: number;
}

/**
 * ToolSet tree item - represents a collection of tools that can be managed together.
 * Used for regular (non-MCP) toolsets that appear as intermediate nodes in the tree.
 */
interface IToolSetTreeItem extends IToolTreeItem {
	readonly itemType: 'toolset';
	readonly toolset: ToolSet;
	children: AnyTreeItem[] | undefined;
	checked: boolean | 'mixed';
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
 * These are non-selectable items that execute actions when clicked. Can return
 * false to keep the picker open.
 */
interface ICallbackTreeItem extends IToolTreeItem {
	readonly itemType: 'callback';
	readonly run: () => boolean | void;
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

function createToolSetTreeItem(toolset: ToolSet, checked: boolean, editorService: IEditorService): IToolSetTreeItem {
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
 * @param onUpdate - Optional callback fired when the selection changes
 * @returns Promise resolving to the final selection map, or undefined if cancelled
 */
export async function showToolsPicker(
	accessor: ServicesAccessor,
	placeHolder: string,
	description?: string,
	getToolsEntries?: () => ReadonlyMap<ToolSet | IToolData, boolean>
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

	function computeItems(previousToolsEntries?: ReadonlyMap<ToolSet | IToolData, boolean>) {
		// Create default entries if none provided
		let toolsEntries = getToolsEntries ? new Map(getToolsEntries()) : undefined;
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
		previousToolsEntries?.forEach((value, key) => {
			toolsEntries.set(key, value);
		});

		// Build tree structure
		const treeItems: AnyTreeItem[] = [];
		const bucketMap = new Map<string, IBucketTreeItem>();

		const getKey = (source: ToolDataSource): string => {
			switch (source.type) {
				case 'mcp':
				case 'extension':
					return ToolDataSource.toKey(source);
				case 'internal':
					return BucketOrdinal.BuiltIn.toString();
				case 'user':
					return BucketOrdinal.User.toString();
				case 'external':
					throw new Error('should not be reachable');
				default:
					assertNever(source);
			}
		};

		const mcpServers = new Map(mcpService.servers.get().map(s => [s.definition.id, { server: s, seen: false }]));
		const createBucket = (source: ToolDataSource, key: string): IBucketTreeItem | undefined => {
			if (source.type === 'mcp') {
				const mcpServerEntry = mcpServers.get(source.definitionId);
				if (!mcpServerEntry) {
					return undefined;
				}
				mcpServerEntry.seen = true;
				const mcpServer = mcpServerEntry.server;
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
				const cacheState = mcpServer.cacheState.get();
				const children: AnyTreeItem[] = [];
				let collapsed = true;
				if (cacheState === McpServerCacheState.Unknown || cacheState === McpServerCacheState.Outdated) {
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
				const bucket: IBucketTreeItem = {
					itemType: 'bucket',
					ordinal: BucketOrdinal.Mcp,
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
				} else {
					bucket.iconClass = ThemeIcon.asClassName(Codicon.mcp);
				}
				return bucket;
			} else if (source.type === 'extension') {
				return {
					itemType: 'bucket',
					ordinal: BucketOrdinal.Extension,
					id: key,
					label: source.label,
					checked: undefined,
					children: [],
					buttons: [],
					collapsed: true,
					iconClass: ThemeIcon.asClassName(Codicon.extensions),
					sortOrder: 3,
				};
			} else if (source.type === 'internal') {
				return {
					itemType: 'bucket',
					ordinal: BucketOrdinal.BuiltIn,
					id: key,
					label: localize('defaultBucketLabel', "Built-In"),
					checked: undefined,
					children: [],
					buttons: [],
					collapsed: false,
					sortOrder: 1,
				};
			} else {
				return {
					itemType: 'bucket',
					ordinal: BucketOrdinal.User,
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

		const getBucket = (source: ToolDataSource): IBucketTreeItem | undefined => {
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

		for (const toolSet of toolsService.toolSets.get()) {
			if (!toolsEntries.has(toolSet)) {
				continue;
			}
			const bucket = getBucket(toolSet.source);
			if (!bucket) {
				continue;
			}
			const toolSetChecked = toolsEntries.get(toolSet) === true;
			if (toolSet.source.type === 'mcp') {
				// bucket represents the toolset
				bucket.toolset = toolSet;
				if (toolSetChecked) {
					bucket.checked = toolSetChecked;
				}
				// all mcp tools are part of toolsService.getTools()
			} else {
				const treeItem = createToolSetTreeItem(toolSet, toolSetChecked, editorService);
				bucket.children.push(treeItem);
				const children = [];
				for (const tool of toolSet.getTools()) {
					const toolChecked = toolSetChecked || toolsEntries.get(tool) === true;
					const toolTreeItem = createToolTreeItemFromData(tool, toolChecked);
					children.push(toolTreeItem);
				}
				if (children.length > 0) {
					treeItem.children = children;
				}
			}
		}
		for (const tool of toolsService.getTools()) {
			if (!tool.canBeReferencedInPrompt || !toolsEntries.has(tool)) {
				continue;
			}
			const bucket = getBucket(tool.source);
			if (!bucket) {
				continue;
			}
			const toolChecked = bucket.checked === true || toolsEntries.get(tool) === true;
			const toolTreeItem = createToolTreeItemFromData(tool, toolChecked);
			bucket.children.push(toolTreeItem);
		}

		// Show entries for MCP servers that don't have any tools in them and might need to be started.
		for (const { server, seen } of mcpServers.values()) {
			const cacheState = server.cacheState.get();
			if (!seen && (cacheState === McpServerCacheState.Unknown || cacheState === McpServerCacheState.Outdated)) {
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
		if (treeItems.length === 0) {
			treePicker.placeholder = localize('noTools', "Add tools to chat");
		} else {
			treePicker.placeholder = placeHolder;
		}
		treePicker.setItemTree(treeItems);
	}

	// Create and configure the tree picker
	const store = new DisposableStore();
	const treePicker = store.add(quickPickService.createQuickTree<AnyTreeItem>());

	treePicker.placeholder = placeHolder;
	treePicker.ignoreFocusOut = true;
	treePicker.description = description;
	treePicker.matchOnDescription = true;
	treePicker.matchOnLabel = true;
	treePicker.sortByLabel = false;

	computeItems();

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
						if (item.children) {
							traverse(item.children);
						}
					} else if (isToolTreeItem(item) && item.checked) {
						count++;
					}
				}
			};
			traverse(treePicker.itemTree);
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
					if (item.children) {
						traverse(item.children);
					}
				} else if (isToolTreeItem(item)) {
					result.set(item.tool, item.checked || result.get(item.tool) === true); // tools can be in user tool sets and other buckets
				}
			}
		};

		traverse(treePicker.itemTree);
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
	const didAcceptFinalItem = store.add(new Emitter<void>());
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
			commandService.executeCommand(McpCommandIds.AddConfiguration);
		} else if (button === installExtension) {
			extensionsWorkbenchService.openSearch('@tag:language-model-tools');
		} else if (button === configureToolSets) {
			commandService.executeCommand(ConfigureToolSets.ID);
		}
		treePicker.hide();
	}));

	treePicker.show();

	await Promise.race([Event.toPromise(Event.any(treePicker.onDidHide, didAcceptFinalItem.event), store)]);

	store.dispose();

	return didAccept ? collectResults() : undefined;
}
