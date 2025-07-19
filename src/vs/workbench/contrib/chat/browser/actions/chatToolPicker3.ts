/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickTreeItem, TreeItemCollapsibleState } from '../../../../../platform/quickinput/common/quickInput.js';
import { IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { McpCommandIds } from '../../../mcp/common/mcpCommandIds.js';
import { IMcpService } from '../../../mcp/common/mcpTypes.js';
import { ILanguageModelToolsService, IToolData, ToolDataSource, ToolSet } from '../../common/languageModelToolsService.js';
import { ConfigureToolSets } from '../tools/toolSetsContribution.js';

/*
Expected behavior... A multi select QuickTree is shown with the following data:

Built-In                # Where source is internal
* Individual Tool 1
* ToolSet A.            # ToolSets have children
	* Tool 2
	* Tool 3
* Individual Tool 4

MCP Server: my-server   # Where source is mcp. MCP servers, which are toolsets, are pulled up to the top level
* Tool 1
* Tool 2

Extension: foo.         # Where source is extension. Extensions, are shown at the top level
* Individual Tool 1
* ToolSet B
	* Tool 2

User Defined Tool Sets  # Where source is user
* ToolSet C             # ToolSets have children
	* Tool 4
	* Tool 5
* ToolSet D
	* Tool 6

What is returned is a Map<ToolSet | IToolData, boolean> where the keys are the selected tools and the values are their selection states (true for selected, false for not selected).
*/

interface IToolTreeItem extends IQuickTreeItem {
	itemType: 'bucket' | 'toolset' | 'tool';
	tool?: IToolData;
	toolset?: ToolSet;
	bucket?: string;
}

export async function showToolsPickerTree(
	accessor: ServicesAccessor,
	placeHolder: string,
	description?: string,
	toolsEntries?: ReadonlyMap<ToolSet | IToolData, boolean>,
	onUpdate?: (toolsEntries: ReadonlyMap<ToolSet | IToolData, boolean>) => void
): Promise<ReadonlyMap<ToolSet | IToolData, boolean> | undefined> {
	// Use createQuickTree
	const quickPickService = accessor.get(IQuickInputService);
	const mcpService = accessor.get(IMcpService);
	const commandService = accessor.get(ICommandService);
	const extensionWorkbenchService = accessor.get(IExtensionsWorkbenchService);
	const toolsService = accessor.get(ILanguageModelToolsService);

	const quickTree = quickPickService.createQuickTree<IToolTreeItem>();
	quickTree.placeholder = placeHolder;
	quickTree.canSelectMany = true;
	quickTree.title = localize('toolsPickerTitle', 'Select Tools');
	quickTree.description = description;
	quickTree.matchOnDescription = true;
	quickTree.matchOnLabel = true;

	let didAccept = false;

	// Create initial tool selection map if none provided
	if (!toolsEntries) {
		const defaultEntries = new Map<ToolSet | IToolData, boolean>();
		for (const tool of toolsService.getTools()) {
			defaultEntries.set(tool, false);
		}
		for (const toolSet of toolsService.toolSets.get()) {
			defaultEntries.set(toolSet, false);
		}
		toolsEntries = defaultEntries;
	}

	// Build tree structure
	const buckets = new Map<string, IToolTreeItem>();
	const toolSetToTreeItem = new Map<ToolSet, IToolTreeItem>();
	const toolToTreeItem = new Map<IToolData, IToolTreeItem>();

	// Helper function to get tool icon class
	const getToolIconClass = (tool: IToolData): string => {
		if (tool.icon) {
			if (ThemeIcon.isThemeIcon(tool.icon)) {
				return ThemeIcon.asClassName(tool.icon);
			}
			// For URI-based icons, we'd need additional handling, fall back to default for now
		}
		return ThemeIcon.asClassName(ThemeIcon.fromId('tools'));
	};

	// Helper function to get or create bucket
	function getOrCreateBucket(key: string, label: string, ordinal: number, collapsibleState: TreeItemCollapsibleState = TreeItemCollapsibleState.Expanded, iconId?: string): IToolTreeItem {
		if (buckets.has(key)) {
			return buckets.get(key)!;
		}

		const bucket: IToolTreeItem = {
			type: 'item',
			itemType: 'bucket',
			bucket: key,
			label,
			collapsibleState,
			iconClass: iconId ? ThemeIcon.asClassName(ThemeIcon.fromId(iconId)) : undefined
			// No checked property - state managed automatically for parent items
		};
		buckets.set(key, bucket);
		return bucket;
	}

	// Process all tools and tool sets
	const allItems = new Set<ToolSet | IToolData>();
	for (const [item] of toolsEntries) {
		allItems.add(item);
	}

	// Add any tools/toolsets that aren't in the entries map
	for (const tool of toolsService.getTools()) {
		allItems.add(tool);
	}
	for (const toolSet of toolsService.toolSets.get()) {
		allItems.add(toolSet);
	}

	// Create a lookup map to find the correct tool instance from toolsEntries
	// This helps when toolSet.getTools() returns different instances than what's in toolsEntries
	const toolLookup = new Map<string, IToolData>();
	for (const [item] of toolsEntries) {
		if (!(item instanceof ToolSet)) {
			toolLookup.set(item.id, item);
		}
	}


	const rootItems: IToolTreeItem[] = [];

	// Group items by source type
	const itemsBySource = new Map<string, (ToolSet | IToolData)[]>();

	for (const item of allItems) {
		const sourceKey = ToolDataSource.toKey(item.source);
		if (!itemsBySource.has(sourceKey)) {
			itemsBySource.set(sourceKey, []);
		}
		itemsBySource.get(sourceKey)!.push(item);
	}

	// Create bucket hierarchy
	for (const [sourceKey, items] of itemsBySource) {
		let bucket: IToolTreeItem;
		const bucketChildren: IToolTreeItem[] = [];

		// Determine bucket properties based on source type
		const firstItem = items[0];
		switch (firstItem.source.type) {
			case 'internal': {
				bucket = getOrCreateBucket('builtin', localize('builtIn', 'Built-In'), 0, TreeItemCollapsibleState.Expanded, 'vscode'); // Built-in top level
				break;
			}
			case 'mcp': {
				const mcpServer = mcpService.servers.get().find(s => s.definition.id === (firstItem.source as any).definitionId);
				const serverLabel = (mcpServer?.definition as any)?.name || firstItem.source.label;
				bucket = getOrCreateBucket(sourceKey, localize('mcpServer', 'MCP Server: {0}', serverLabel), 1, TreeItemCollapsibleState.Collapsed, 'mcp'); // MCP toolsets (top level)
				break;
			}
			case 'extension': {
				bucket = getOrCreateBucket(sourceKey, localize('extension', 'Extension: {0}', firstItem.source.label), 2, TreeItemCollapsibleState.Collapsed, 'extensions'); // Top level extensions
				break;
			}
			case 'user': {
				bucket = getOrCreateBucket('user', localize('userDefinedToolSets', 'User Defined Tool Sets'), 3, TreeItemCollapsibleState.Expanded, 'folder'); // User defined tool sets
				break;
			}
			default: {
				bucket = getOrCreateBucket(sourceKey, (firstItem.source as any).label || 'Unknown', 4, TreeItemCollapsibleState.Expanded, 'question'); // Unknown sources
				break;
			}
		}

		// First, collect all tools that are part of toolsets to avoid duplication
		// But only for non-MCP sources, since MCP shows individual tools instead of toolsets
		const toolsInToolsets = new Set<IToolData>();
		if (firstItem.source.type !== 'mcp') {
			const toolsets = items.filter(item => item instanceof ToolSet) as ToolSet[];

			for (const toolset of toolsets) {
				for (const tool of toolset.getTools()) {
					toolsInToolsets.add(tool);
				}
			}
		}

		// Process items in this bucket
		for (const item of items) {
			if (item instanceof ToolSet) {
				// For MCP sources, don't show the toolset since tools are already shown individually
				if (firstItem.source.type === 'mcp') {
					continue;
				}

				// Create toolset item
				const label = item.referenceName || item.id || 'Unnamed Toolset';
				if (!label.trim()) {
					continue; // Skip items with empty labels
				}

				const toolsetItem: IToolTreeItem = {
					type: 'item',
					itemType: 'toolset',
					toolset: item,
					label,
					description: item.description,
					collapsibleState: firstItem.source.type === 'internal' ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.Expanded,
					iconClass: ThemeIcon.asClassName(item.icon || ThemeIcon.fromId('package'))
					// No checked property - state managed automatically for parent items
				};
				toolSetToTreeItem.set(item, toolsetItem);
				bucketChildren.push(toolsetItem);

				// Add tools within this toolset as children
				const toolsetChildren: IToolTreeItem[] = [];
				for (const tool of item.getTools()) {
					const toolLabel = tool.toolReferenceName || tool.displayName || tool.id || 'Unnamed Tool';
					if (!toolLabel.trim()) {
						continue; // Skip tools with empty labels
					}

					// Use the tool instance from toolsEntries if it exists, otherwise use the current tool
					const correctToolInstance = toolLookup.get(tool.id) || tool;

					// Get checkbox state: first try the tool directly, then check if the parent toolset is selected
					let checkboxState = toolsEntries?.get(correctToolInstance);
					if (checkboxState === undefined) {
						// If the tool isn't in toolsEntries but the toolset is selected, inherit from toolset
						checkboxState = toolsEntries?.get(item);
					}


					const toolItem: IToolTreeItem = {
						type: 'item',
						itemType: 'tool',
						tool: correctToolInstance,
						label: toolLabel,
						description: tool.modelDescription,
						checked: checkboxState,
						iconClass: getToolIconClass(tool)
					};
					toolToTreeItem.set(correctToolInstance, toolItem);
					toolsetChildren.push(toolItem);
				}
				quickTree.setChildren(toolsetItem, toolsetChildren);
			} else {
				// Individual tool - only add if it's not already part of a toolset (except for MCP)
				if (firstItem.source.type !== 'mcp' && toolsInToolsets.has(item)) {
					continue; // Skip tools that are already shown in toolsets
				}

				const label = item.toolReferenceName || item.displayName || item.id || 'Unnamed Tool';
				if (!label.trim()) {
					continue; // Skip tools with empty labels
				}

				const checkboxState = toolsEntries?.get(item);
				if (checkboxState === undefined) {
					continue; // Skip tools not in toolsEntries
				}


				const toolItem: IToolTreeItem = {
					type: 'item',
					itemType: 'tool',
					tool: item,
					label,
					description: item.modelDescription,
					checked: checkboxState,
					iconClass: getToolIconClass(item)
				};
				toolToTreeItem.set(item, toolItem);
				bucketChildren.push(toolItem);
			}
		}

		quickTree.setChildren(bucket, bucketChildren);

		// Only add buckets that have children
		if (bucketChildren.length > 0) {
			rootItems.push(bucket);
		}
	}

	// Sort buckets by ordinal (built-in, MCP, extensions, user)
	rootItems.sort((a, b) => {
		const getOrdinal = (bucket: IToolTreeItem) => {
			if (bucket.bucket === 'builtin') {
				return 0;
			}
			if (bucket.bucket === 'user') {
				return 3;
			}
			if (bucket.label?.includes('MCP Server')) {
				return 1;
			}
			if (bucket.label?.includes('Extension')) {
				return 2;
			}
			return 4;
		};
		return getOrdinal(a) - getOrdinal(b);
	});

	// Set root items
	quickTree.setChildren(null, rootItems);

	// Handle checkbox state changes
	quickTree.onDidChangeCheckboxState(e => {
		if (e.item.itemType === 'tool' && e.item.tool) {
			const newEntries = new Map(toolsEntries);
			newEntries.set(e.item.tool, e.checked === true);
			toolsEntries = newEntries;
			onUpdate?.(toolsEntries);
		} else if (e.item.itemType === 'toolset' && e.item.toolset) {
			const newEntries = new Map(toolsEntries);
			newEntries.set(e.item.toolset, e.checked === true);

			// Also update all tools in the toolset
			for (const tool of e.item.toolset.getTools()) {
				newEntries.set(tool, e.checked === true);
				const toolItem = toolToTreeItem.get(tool);
				if (toolItem) {
					toolItem.checked = e.checked === true;
					quickTree.setCheckboxState(toolItem, e.checked === true);
				}
			}

			toolsEntries = newEntries;
			onUpdate?.(toolsEntries);
		}
	});

	// Add action buttons
	quickTree.buttons = [
		{
			iconClass: ThemeIcon.asClassName(Codicon.mcp),
			tooltip: localize('addMcpServer', 'Add MCP Server...')
		},
		{
			iconClass: ThemeIcon.asClassName(Codicon.extensions),
			tooltip: localize('addExtension', 'Install Extension...')
		},
		{
			iconClass: ThemeIcon.asClassName(Codicon.gear),
			tooltip: localize('configToolSets', 'Configure Tool Sets...')
		}
	];

	// Handle button clicks
	quickTree.onDidTriggerButton(button => {
		if (button.tooltip?.includes('MCP Server')) {
			commandService.executeCommand(McpCommandIds.AddConfiguration);
		} else if (button.tooltip?.includes('Extension')) {
			extensionWorkbenchService.openSearch('@tag:language-model-tools');
		} else if (button.tooltip?.includes('Configure')) {
			commandService.executeCommand(ConfigureToolSets.ID);
		}
		quickTree.hide();
	});

	// Handle accept
	quickTree.onDidAccept(() => {
		didAccept = true;
		quickTree.hide();
	});

	// Show the tree
	quickTree.show();

	return new Promise<ReadonlyMap<ToolSet | IToolData, boolean> | undefined>(resolve => {
		quickTree.onDidHide(() => {
			resolve(didAccept ? toolsEntries : undefined);
		});
	});
}
