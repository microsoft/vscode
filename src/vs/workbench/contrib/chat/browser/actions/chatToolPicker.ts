/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { assertNever } from '../../../../../base/common/assert.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { diffSets } from '../../../../../base/common/collections.js';
import { Event } from '../../../../../base/common/event.js';
import { Iterable } from '../../../../../base/common/iterator.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { assertType } from '../../../../../base/common/types.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputButton, IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../../platform/quickinput/common/quickInput.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { McpCommandIds } from '../../../mcp/common/mcpCommandIds.js';
import { IMcpRegistry } from '../../../mcp/common/mcpRegistryTypes.js';
import { IMcpServer, IMcpService, McpConnectionState } from '../../../mcp/common/mcpTypes.js';
import { ILanguageModelToolsService, IToolData, ToolDataSource, ToolSet } from '../../common/languageModelToolsService.js';
import { ConfigureToolSets } from '../tools/toolSetsContribution.js';


const enum BucketOrdinal { User, BuiltIn, Mcp, Extension }
type BucketPick = IQuickPickItem & { picked: boolean; ordinal: BucketOrdinal; status?: string; toolset?: ToolSet; children: (ToolPick | ToolSetPick)[] };
type ToolSetPick = IQuickPickItem & { picked: boolean; toolset: ToolSet; parent: BucketPick };
type ToolPick = IQuickPickItem & { picked: boolean; tool: IToolData; parent: BucketPick };
type CallbackPick = IQuickPickItem & { pickable: false; run: () => void };
type MyPick = BucketPick | ToolSetPick | ToolPick | CallbackPick;
type ActionableButton = IQuickInputButton & { action: () => void };

function isBucketPick(obj: any): obj is BucketPick {
	return Boolean((obj as BucketPick).children);
}
function isToolSetPick(obj: MyPick): obj is ToolSetPick {
	return Boolean((obj as ToolSetPick).toolset);
}
function isToolPick(obj: MyPick): obj is ToolPick {
	return Boolean((obj as ToolPick).tool);
}
function isCallbackPick(obj: MyPick): obj is CallbackPick {
	return Boolean((obj as CallbackPick).run);
}
function isActionableButton(obj: IQuickInputButton): obj is ActionableButton {
	return typeof (obj as ActionableButton).action === 'function';
}

export async function showToolsPicker(
	accessor: ServicesAccessor,
	placeHolder: string,
	toolsEntries?: ReadonlyMap<ToolSet | IToolData, boolean>,
	onUpdate?: (toolsEntries: ReadonlyMap<ToolSet | IToolData, boolean>) => void
): Promise<ReadonlyMap<ToolSet | IToolData, boolean> | undefined> {

	const quickPickService = accessor.get(IQuickInputService);
	const mcpService = accessor.get(IMcpService);
	const mcpRegistry = accessor.get(IMcpRegistry);
	const commandService = accessor.get(ICommandService);
	const extensionWorkbenchService = accessor.get(IExtensionsWorkbenchService);
	const editorService = accessor.get(IEditorService);
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

	const addMcpPick: CallbackPick = { type: 'item', label: localize('addServer', "Add MCP Server..."), iconClass: ThemeIcon.asClassName(Codicon.add), pickable: false, run: () => commandService.executeCommand(McpCommandIds.AddConfiguration) };
	const configureToolSetsPick: CallbackPick = { type: 'item', label: localize('configToolSet', "Configure Tool Sets..."), iconClass: ThemeIcon.asClassName(Codicon.gear), pickable: false, run: () => commandService.executeCommand(ConfigureToolSets.ID) };
	const addExpPick: CallbackPick = { type: 'item', label: localize('addExtension', "Install Extension..."), iconClass: ThemeIcon.asClassName(Codicon.add), pickable: false, run: () => extensionWorkbenchService.openSearch('@tag:language-model-tools') };
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
			defaultEntries.set(tool, false);
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
			if (collection?.presentation?.origin) {
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

		if (picked) {
			bucket.picked = true;
		}
	}

	for (const bucket of [builtinBucket, userBucket]) {
		if (bucket.children.length > 0) {
			toolBuckets.set(generateUuid(), bucket);
		}
	}

	const store = new DisposableStore();

	const picks: (MyPick | IQuickPickSeparator)[] = [];

	for (const bucket of Array.from(toolBuckets.values()).sort((a, b) => a.ordinal - b.ordinal)) {
		picks.push({
			type: 'separator',
			label: bucket.status
		});

		picks.push(bucket);
		picks.push(...bucket.children.sort((a, b) => a.label.localeCompare(b.label)));
	}

	const picker = store.add(quickPickService.createQuickPick<MyPick>({ useSeparators: true }));
	picker.placeholder = placeHolder;
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

	let lastSelectedItems = new Set<MyPick>();
	let ignoreEvent = false;

	const result = new Map<IToolData | ToolSet, boolean>();

	const _update = () => {
		ignoreEvent = true;
		try {
			const items = picks.filter((p): p is MyPick => p.type === 'item' && Boolean(p.picked));
			lastSelectedItems = new Set(items);
			picker.selectedItems = items;

			result.clear();
			for (const item of picks) {
				if (item.type !== 'item') {
					continue;
				}
				if (isToolSetPick(item)) {
					result.set(item.toolset, item.picked);
				} else if (isToolPick(item)) {
					result.set(item.tool, item.picked);
				} else if (isBucketPick(item)) {
					if (item.toolset) {
						result.set(item.toolset, item.picked);
					}
					for (const child of item.children) {
						if (isToolSetPick(child)) {
							result.set(child.toolset, item.picked);
						} else if (isToolPick(child)) {
							result.set(child.tool, item.picked);
						}
					}
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
			addPick.run();
			picker.hide();
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
		picker.activeItems.find(isCallbackPick)?.run();
		didAccept = true;
	}));

	await Promise.race([Event.toPromise(Event.any(picker.onDidAccept, picker.onDidHide))]);

	store.dispose();

	const mcpToolSets = new Set<ToolSet>();

	for (const item of toolsService.toolSets.get()) {
		if (item.source.type === 'mcp') {
			mcpToolSets.add(item);

			if (Iterable.every(item.getTools(), tool => result.get(tool))) {
				// ALL tools from the MCP tool set are here, replace them with just the toolset
				// but only when computing the final result
				for (const tool of item.getTools()) {
					result.delete(tool);
				}
				result.set(item, true);
			}
		}
	}

	return didAccept ? result : undefined;
}
