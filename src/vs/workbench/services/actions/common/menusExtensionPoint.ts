/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { isFalsyOrWhitespace } from 'vs/base/common/strings';
import * as resources from 'vs/base/common/resources';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { IExtensionPointUser, ExtensionMessageCollector, ExtensionsRegistry } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { MenuId, MenuRegistry, IMenuItem, ISubmenuItem } from 'vs/platform/actions/common/actions';
import { URI } from 'vs/base/common/uri';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ThemeIcon } from 'vs/base/common/themables';
import { index } from 'vs/base/common/arrays';
import { isProposedApiEnabled } from 'vs/workbench/services/extensions/common/extensions';
import { ApiProposalName } from 'vs/workbench/services/extensions/common/extensionsApiProposals';
import { ILocalizedString } from 'vs/platform/action/common/action';

interface IAPIMenu {
	readonly key: string;
	readonly id: MenuId;
	readonly description: string;
	readonly proposed?: ApiProposalName;
	readonly supportsSubmenus?: boolean; // defaults to true
}

const apiMenus: IAPIMenu[] = [
	{
		key: 'commandPalette',
		id: MenuId.CommandPalette,
		description: localize('menus.commandPalette', "The Command Palette"),
		supportsSubmenus: false
	},
	{
		key: 'touchBar',
		id: MenuId.TouchBarContext,
		description: localize('menus.touchBar', "The touch bar (macOS only)"),
		supportsSubmenus: false
	},
	{
		key: 'editor/title',
		id: MenuId.EditorTitle,
		description: localize('menus.editorTitle', "The editor title menu")
	},
	{
		key: 'editor/title/run',
		id: MenuId.EditorTitleRun,
		description: localize('menus.editorTitleRun', "Run submenu inside the editor title menu")
	},
	{
		key: 'editor/context',
		id: MenuId.EditorContext,
		description: localize('menus.editorContext', "The editor context menu")
	},
	{
		key: 'editor/context/copy',
		id: MenuId.EditorContextCopy,
		description: localize('menus.editorContextCopyAs', "'Copy as' submenu in the editor context menu")
	},
	{
		key: 'editor/context/share',
		id: MenuId.EditorContextShare,
		description: localize('menus.editorContextShare', "'Share' submenu in the editor context menu"),
		proposed: 'contribShareMenu'
	},
	{
		key: 'explorer/context',
		id: MenuId.ExplorerContext,
		description: localize('menus.explorerContext', "The file explorer context menu")
	},
	{
		key: 'explorer/context/share',
		id: MenuId.ExplorerContextShare,
		description: localize('menus.explorerContextShare', "'Share' submenu in the file explorer context menu"),
		proposed: 'contribShareMenu'
	},
	{
		key: 'editor/title/context',
		id: MenuId.EditorTitleContext,
		description: localize('menus.editorTabContext', "The editor tabs context menu")
	},
	{
		key: 'editor/title/context/share',
		id: MenuId.EditorTitleContextShare,
		description: localize('menus.editorTitleContextShare', "'Share' submenu inside the editor title context menu"),
		proposed: 'contribShareMenu'
	},
	{
		key: 'debug/callstack/context',
		id: MenuId.DebugCallStackContext,
		description: localize('menus.debugCallstackContext', "The debug callstack view context menu")
	},
	{
		key: 'debug/variables/context',
		id: MenuId.DebugVariablesContext,
		description: localize('menus.debugVariablesContext', "The debug variables view context menu")
	},
	{
		key: 'debug/toolBar',
		id: MenuId.DebugToolBar,
		description: localize('menus.debugToolBar', "The debug toolbar menu")
	},
	{
		key: 'menuBar/home',
		id: MenuId.MenubarHomeMenu,
		description: localize('menus.home', "The home indicator context menu (web only)"),
		proposed: 'contribMenuBarHome',
		supportsSubmenus: false
	},
	{
		key: 'menuBar/edit/copy',
		id: MenuId.MenubarCopy,
		description: localize('menus.opy', "'Copy as' submenu in the top level Edit menu")
	},
	{
		key: 'scm/title',
		id: MenuId.SCMTitle,
		description: localize('menus.scmTitle', "The Source Control title menu")
	},
	{
		key: 'scm/sourceControl',
		id: MenuId.SCMSourceControl,
		description: localize('menus.scmSourceControl', "The Source Control menu")
	},
	{
		key: 'scm/resourceState/context',
		id: MenuId.SCMResourceContext,
		description: localize('menus.resourceStateContext', "The Source Control resource state context menu")
	},
	{
		key: 'scm/resourceFolder/context',
		id: MenuId.SCMResourceFolderContext,
		description: localize('menus.resourceFolderContext', "The Source Control resource folder context menu")
	},
	{
		key: 'scm/resourceGroup/context',
		id: MenuId.SCMResourceGroupContext,
		description: localize('menus.resourceGroupContext', "The Source Control resource group context menu")
	},
	{
		key: 'scm/change/title',
		id: MenuId.SCMChangeContext,
		description: localize('menus.changeTitle', "The Source Control inline change menu")
	},
	{
		key: 'statusBar/remoteIndicator',
		id: MenuId.StatusBarRemoteIndicatorMenu,
		description: localize('menus.statusBarRemoteIndicator', "The remote indicator menu in the status bar"),
		supportsSubmenus: false
	},
	{
		key: 'terminal/context',
		id: MenuId.TerminalInstanceContext,
		description: localize('menus.terminalContext', "The terminal context menu"),
		proposed: 'terminalContextMenu'
	},
	{
		key: 'terminal/title/context',
		id: MenuId.TerminalTabContext,
		description: localize('menus.terminalTabContext', "The terminal tabs context menu"),
		proposed: 'terminalContextMenu'
	},
	{
		key: 'view/title',
		id: MenuId.ViewTitle,
		description: localize('view.viewTitle', "The contributed view title menu")
	},
	{
		key: 'view/item/context',
		id: MenuId.ViewItemContext,
		description: localize('view.itemContext', "The contributed view item context menu")
	},
	{
		key: 'comments/comment/editorActions',
		id: MenuId.CommentEditorActions,
		description: localize('commentThread.editorActions', "The contributed comment editor actions"),
		proposed: 'contribCommentEditorActionsMenu'
	},
	{
		key: 'comments/commentThread/title',
		id: MenuId.CommentThreadTitle,
		description: localize('commentThread.title', "The contributed comment thread title menu")
	},
	{
		key: 'comments/commentThread/context',
		id: MenuId.CommentThreadActions,
		description: localize('commentThread.actions', "The contributed comment thread context menu, rendered as buttons below the comment editor"),
		supportsSubmenus: false
	},
	{
		key: 'comments/commentThread/additionalActions',
		id: MenuId.CommentThreadAdditionalActions,
		description: localize('commentThread.actions', "The contributed comment thread context menu, rendered as buttons below the comment editor"),
		supportsSubmenus: false,
		proposed: 'contribCommentThreadAdditionalMenu'
	},
	{
		key: 'comments/commentThread/title/context',
		id: MenuId.CommentThreadTitleContext,
		description: localize('commentThread.titleContext', "The contributed comment thread title's peek context menu, rendered as a right click menu on the comment thread's peek title."),
		proposed: 'contribCommentPeekContext'
	},
	{
		key: 'comments/comment/title',
		id: MenuId.CommentTitle,
		description: localize('comment.title', "The contributed comment title menu")
	},
	{
		key: 'comments/comment/context',
		id: MenuId.CommentActions,
		description: localize('comment.actions', "The contributed comment context menu, rendered as buttons below the comment editor"),
		supportsSubmenus: false
	},
	{
		key: 'comments/commentThread/comment/context',
		id: MenuId.CommentThreadCommentContext,
		description: localize('comment.commentContext', "The contributed comment context menu, rendered as a right click menu on the an individual comment in the comment thread's peek view."),
		proposed: 'contribCommentPeekContext'
	},
	{
		key: 'notebook/toolbar',
		id: MenuId.NotebookToolbar,
		description: localize('notebook.toolbar', "The contributed notebook toolbar menu")
	},
	{
		key: 'notebook/kernelSource',
		id: MenuId.NotebookKernelSource,
		description: localize('notebook.kernelSource', "The contributed notebook kernel sources menu"),
		proposed: 'notebookKernelSource'
	},
	{
		key: 'notebook/cell/title',
		id: MenuId.NotebookCellTitle,
		description: localize('notebook.cell.title', "The contributed notebook cell title menu")
	},
	{
		key: 'notebook/cell/execute',
		id: MenuId.NotebookCellExecute,
		description: localize('notebook.cell.execute', "The contributed notebook cell execution menu")
	},
	{
		key: 'interactive/toolbar',
		id: MenuId.InteractiveToolbar,
		description: localize('interactive.toolbar', "The contributed interactive toolbar menu"),
	},
	{
		key: 'interactive/cell/title',
		id: MenuId.InteractiveCellTitle,
		description: localize('interactive.cell.title', "The contributed interactive cell title menu"),
	},
	{
		key: 'testing/item/context',
		id: MenuId.TestItem,
		description: localize('testing.item.context', "The contributed test item menu"),
	},
	{
		key: 'testing/item/gutter',
		id: MenuId.TestItemGutter,
		description: localize('testing.item.gutter.title', "The menu for a gutter decoration for a test item"),
	},
	{
		key: 'extension/context',
		id: MenuId.ExtensionContext,
		description: localize('menus.extensionContext', "The extension context menu")
	},
	{
		key: 'timeline/title',
		id: MenuId.TimelineTitle,
		description: localize('view.timelineTitle', "The Timeline view title menu")
	},
	{
		key: 'timeline/item/context',
		id: MenuId.TimelineItemContext,
		description: localize('view.timelineContext', "The Timeline view item context menu")
	},
	{
		key: 'ports/item/context',
		id: MenuId.TunnelContext,
		description: localize('view.tunnelContext', "The Ports view item context menu")
	},
	{
		key: 'ports/item/origin/inline',
		id: MenuId.TunnelOriginInline,
		description: localize('view.tunnelOriginInline', "The Ports view item origin inline menu")
	},
	{
		key: 'ports/item/port/inline',
		id: MenuId.TunnelPortInline,
		description: localize('view.tunnelPortInline', "The Ports view item port inline menu")
	},
	{
		key: 'file/newFile',
		id: MenuId.NewFile,
		description: localize('file.newFile', "The 'New File...' quick pick, shown on welcome page and File menu."),
		supportsSubmenus: false,
	},
	{
		key: 'webview/context',
		id: MenuId.WebviewContext,
		description: localize('webview.context', "The webview context menu")
	},
	{
		key: 'file/share',
		id: MenuId.MenubarShare,
		description: localize('menus.share', "Share submenu shown in the top level File menu."),
		proposed: 'contribShareMenu'
	},
	{
		key: 'editor/inlineCompletions/actions',
		id: MenuId.InlineCompletionsActions,
		description: localize('inlineCompletions.actions', "The actions shown when hovering on an inline completion"),
		supportsSubmenus: false,
		proposed: 'inlineCompletionsAdditions'
	},
	{
		key: 'editor/content',
		id: MenuId.EditorContent,
		description: localize('merge.toolbar', "The prominent button in an editor, overlays its content"),
		proposed: 'contribEditorContentMenu'
	},
	{
		key: 'editor/lineNumber/context',
		id: MenuId.EditorLineNumberContext,
		description: localize('editorLineNumberContext', "The contributed editor line number context menu")
	},
	{
		key: 'mergeEditor/result/title',
		id: MenuId.MergeInputResultToolbar,
		description: localize('menus.mergeEditorResult', "The result toolbar of the merge editor"),
		proposed: 'contribMergeEditorMenus'
	},
];

namespace schema {

	// --- menus, submenus contribution point

	export interface IUserFriendlyMenuItem {
		command: string;
		alt?: string;
		when?: string;
		group?: string;
	}

	export interface IUserFriendlySubmenuItem {
		submenu: string;
		when?: string;
		group?: string;
	}

	export interface IUserFriendlySubmenu {
		id: string;
		label: string;
		icon?: IUserFriendlyIcon;
	}

	export function isMenuItem(item: IUserFriendlyMenuItem | IUserFriendlySubmenuItem): item is IUserFriendlyMenuItem {
		return typeof (item as IUserFriendlyMenuItem).command === 'string';
	}

	export function isValidMenuItem(item: IUserFriendlyMenuItem, collector: ExtensionMessageCollector): boolean {
		if (typeof item.command !== 'string') {
			collector.error(localize('requirestring', "property `{0}` is mandatory and must be of type `string`", 'command'));
			return false;
		}
		if (item.alt && typeof item.alt !== 'string') {
			collector.error(localize('optstring', "property `{0}` can be omitted or must be of type `string`", 'alt'));
			return false;
		}
		if (item.when && typeof item.when !== 'string') {
			collector.error(localize('optstring', "property `{0}` can be omitted or must be of type `string`", 'when'));
			return false;
		}
		if (item.group && typeof item.group !== 'string') {
			collector.error(localize('optstring', "property `{0}` can be omitted or must be of type `string`", 'group'));
			return false;
		}

		return true;
	}

	export function isValidSubmenuItem(item: IUserFriendlySubmenuItem, collector: ExtensionMessageCollector): boolean {
		if (typeof item.submenu !== 'string') {
			collector.error(localize('requirestring', "property `{0}` is mandatory and must be of type `string`", 'submenu'));
			return false;
		}
		if (item.when && typeof item.when !== 'string') {
			collector.error(localize('optstring', "property `{0}` can be omitted or must be of type `string`", 'when'));
			return false;
		}
		if (item.group && typeof item.group !== 'string') {
			collector.error(localize('optstring', "property `{0}` can be omitted or must be of type `string`", 'group'));
			return false;
		}

		return true;
	}

	export function isValidItems(items: (IUserFriendlyMenuItem | IUserFriendlySubmenuItem)[], collector: ExtensionMessageCollector): boolean {
		if (!Array.isArray(items)) {
			collector.error(localize('requirearray', "submenu items must be an array"));
			return false;
		}

		for (const item of items) {
			if (isMenuItem(item)) {
				if (!isValidMenuItem(item, collector)) {
					return false;
				}
			} else {
				if (!isValidSubmenuItem(item, collector)) {
					return false;
				}
			}
		}

		return true;
	}

	export function isValidSubmenu(submenu: IUserFriendlySubmenu, collector: ExtensionMessageCollector): boolean {
		if (typeof submenu !== 'object') {
			collector.error(localize('require', "submenu items must be an object"));
			return false;
		}

		if (typeof submenu.id !== 'string') {
			collector.error(localize('requirestring', "property `{0}` is mandatory and must be of type `string`", 'id'));
			return false;
		}
		if (typeof submenu.label !== 'string') {
			collector.error(localize('requirestring', "property `{0}` is mandatory and must be of type `string`", 'label'));
			return false;
		}

		return true;
	}

	const menuItem: IJSONSchema = {
		type: 'object',
		required: ['command'],
		properties: {
			command: {
				description: localize('vscode.extension.contributes.menuItem.command', 'Identifier of the command to execute. The command must be declared in the \'commands\'-section'),
				type: 'string'
			},
			alt: {
				description: localize('vscode.extension.contributes.menuItem.alt', 'Identifier of an alternative command to execute. The command must be declared in the \'commands\'-section'),
				type: 'string'
			},
			when: {
				description: localize('vscode.extension.contributes.menuItem.when', 'Condition which must be true to show this item'),
				type: 'string'
			},
			group: {
				description: localize('vscode.extension.contributes.menuItem.group', 'Group into which this item belongs'),
				type: 'string'
			}
		}
	};

	const submenuItem: IJSONSchema = {
		type: 'object',
		required: ['submenu'],
		properties: {
			submenu: {
				description: localize('vscode.extension.contributes.menuItem.submenu', 'Identifier of the submenu to display in this item.'),
				type: 'string'
			},
			when: {
				description: localize('vscode.extension.contributes.menuItem.when', 'Condition which must be true to show this item'),
				type: 'string'
			},
			group: {
				description: localize('vscode.extension.contributes.menuItem.group', 'Group into which this item belongs'),
				type: 'string'
			}
		}
	};

	const submenu: IJSONSchema = {
		type: 'object',
		required: ['id', 'label'],
		properties: {
			id: {
				description: localize('vscode.extension.contributes.submenu.id', 'Identifier of the menu to display as a submenu.'),
				type: 'string'
			},
			label: {
				description: localize('vscode.extension.contributes.submenu.label', 'The label of the menu item which leads to this submenu.'),
				type: 'string'
			},
			icon: {
				description: localize({ key: 'vscode.extension.contributes.submenu.icon', comment: ['do not translate or change `\\$(zap)`, \\ in front of $ is important.'] }, '(Optional) Icon which is used to represent the submenu in the UI. Either a file path, an object with file paths for dark and light themes, or a theme icon references, like `\\$(zap)`'),
				anyOf: [{
					type: 'string'
				},
				{
					type: 'object',
					properties: {
						light: {
							description: localize('vscode.extension.contributes.submenu.icon.light', 'Icon path when a light theme is used'),
							type: 'string'
						},
						dark: {
							description: localize('vscode.extension.contributes.submenu.icon.dark', 'Icon path when a dark theme is used'),
							type: 'string'
						}
					}
				}]
			}
		}
	};

	export const menusContribution: IJSONSchema = {
		description: localize('vscode.extension.contributes.menus', "Contributes menu items to the editor"),
		type: 'object',
		properties: index(apiMenus, menu => menu.key, menu => ({
			markdownDescription: menu.proposed ? localize('proposed', "Proposed API, requires `enabledApiProposal: [\"{0}\"]` - {1}", menu.proposed, menu.description) : menu.description,
			type: 'array',
			items: menu.supportsSubmenus === false ? menuItem : { oneOf: [menuItem, submenuItem] }
		})),
		additionalProperties: {
			description: 'Submenu',
			type: 'array',
			items: { oneOf: [menuItem, submenuItem] }
		}
	};

	export const submenusContribution: IJSONSchema = {
		description: localize('vscode.extension.contributes.submenus', "Contributes submenu items to the editor"),
		type: 'array',
		items: submenu
	};

	// --- commands contribution point

	export interface IUserFriendlyCommand {
		command: string;
		title: string | ILocalizedString;
		shortTitle?: string | ILocalizedString;
		enablement?: string;
		category?: string | ILocalizedString;
		icon?: IUserFriendlyIcon;
	}

	export type IUserFriendlyIcon = string | { light: string; dark: string };

	export function isValidCommand(command: IUserFriendlyCommand, collector: ExtensionMessageCollector): boolean {
		if (!command) {
			collector.error(localize('nonempty', "expected non-empty value."));
			return false;
		}
		if (isFalsyOrWhitespace(command.command)) {
			collector.error(localize('requirestring', "property `{0}` is mandatory and must be of type `string`", 'command'));
			return false;
		}
		if (!isValidLocalizedString(command.title, collector, 'title')) {
			return false;
		}
		if (command.shortTitle && !isValidLocalizedString(command.shortTitle, collector, 'shortTitle')) {
			return false;
		}
		if (command.enablement && typeof command.enablement !== 'string') {
			collector.error(localize('optstring', "property `{0}` can be omitted or must be of type `string`", 'precondition'));
			return false;
		}
		if (command.category && !isValidLocalizedString(command.category, collector, 'category')) {
			return false;
		}
		if (!isValidIcon(command.icon, collector)) {
			return false;
		}
		return true;
	}

	function isValidIcon(icon: IUserFriendlyIcon | undefined, collector: ExtensionMessageCollector): boolean {
		if (typeof icon === 'undefined') {
			return true;
		}
		if (typeof icon === 'string') {
			return true;
		} else if (typeof icon.dark === 'string' && typeof icon.light === 'string') {
			return true;
		}
		collector.error(localize('opticon', "property `icon` can be omitted or must be either a string or a literal like `{dark, light}`"));
		return false;
	}

	function isValidLocalizedString(localized: string | ILocalizedString, collector: ExtensionMessageCollector, propertyName: string): boolean {
		if (typeof localized === 'undefined') {
			collector.error(localize('requireStringOrObject', "property `{0}` is mandatory and must be of type `string` or `object`", propertyName));
			return false;
		} else if (typeof localized === 'string' && isFalsyOrWhitespace(localized)) {
			collector.error(localize('requirestring', "property `{0}` is mandatory and must be of type `string`", propertyName));
			return false;
		} else if (typeof localized !== 'string' && (isFalsyOrWhitespace(localized.original) || isFalsyOrWhitespace(localized.value))) {
			collector.error(localize('requirestrings', "properties `{0}` and `{1}` are mandatory and must be of type `string`", `${propertyName}.value`, `${propertyName}.original`));
			return false;
		}

		return true;
	}

	const commandType: IJSONSchema = {
		type: 'object',
		required: ['command', 'title'],
		properties: {
			command: {
				description: localize('vscode.extension.contributes.commandType.command', 'Identifier of the command to execute'),
				type: 'string'
			},
			title: {
				description: localize('vscode.extension.contributes.commandType.title', 'Title by which the command is represented in the UI'),
				type: 'string'
			},
			shortTitle: {
				markdownDescription: localize('vscode.extension.contributes.commandType.shortTitle', '(Optional) Short title by which the command is represented in the UI. Menus pick either `title` or `shortTitle` depending on the context in which they show commands.'),
				type: 'string'
			},
			category: {
				description: localize('vscode.extension.contributes.commandType.category', '(Optional) Category string by which the command is grouped in the UI'),
				type: 'string'
			},
			enablement: {
				description: localize('vscode.extension.contributes.commandType.precondition', '(Optional) Condition which must be true to enable the command in the UI (menu and keybindings). Does not prevent executing the command by other means, like the `executeCommand`-api.'),
				type: 'string'
			},
			icon: {
				description: localize({ key: 'vscode.extension.contributes.commandType.icon', comment: ['do not translate or change `\\$(zap)`, \\ in front of $ is important.'] }, '(Optional) Icon which is used to represent the command in the UI. Either a file path, an object with file paths for dark and light themes, or a theme icon references, like `\\$(zap)`'),
				anyOf: [{
					type: 'string'
				},
				{
					type: 'object',
					properties: {
						light: {
							description: localize('vscode.extension.contributes.commandType.icon.light', 'Icon path when a light theme is used'),
							type: 'string'
						},
						dark: {
							description: localize('vscode.extension.contributes.commandType.icon.dark', 'Icon path when a dark theme is used'),
							type: 'string'
						}
					}
				}]
			}
		}
	};

	export const commandsContribution: IJSONSchema = {
		description: localize('vscode.extension.contributes.commands', "Contributes commands to the command palette."),
		oneOf: [
			commandType,
			{
				type: 'array',
				items: commandType
			}
		]
	};
}

const _commandRegistrations = new DisposableStore();

export const commandsExtensionPoint = ExtensionsRegistry.registerExtensionPoint<schema.IUserFriendlyCommand | schema.IUserFriendlyCommand[]>({
	extensionPoint: 'commands',
	jsonSchema: schema.commandsContribution,
	activationEventsGenerator: (contribs: schema.IUserFriendlyCommand[], result: { push(item: string): void }) => {
		for (const contrib of contribs) {
			if (contrib.command) {
				result.push(`onCommand:${contrib.command}`);
			}
		}
	}
});

commandsExtensionPoint.setHandler(extensions => {

	function handleCommand(userFriendlyCommand: schema.IUserFriendlyCommand, extension: IExtensionPointUser<any>) {

		if (!schema.isValidCommand(userFriendlyCommand, extension.collector)) {
			return;
		}

		const { icon, enablement, category, title, shortTitle, command } = userFriendlyCommand;

		let absoluteIcon: { dark: URI; light?: URI } | ThemeIcon | undefined;
		if (icon) {
			if (typeof icon === 'string') {
				absoluteIcon = ThemeIcon.fromString(icon) ?? { dark: resources.joinPath(extension.description.extensionLocation, icon), light: resources.joinPath(extension.description.extensionLocation, icon) };

			} else {
				absoluteIcon = {
					dark: resources.joinPath(extension.description.extensionLocation, icon.dark),
					light: resources.joinPath(extension.description.extensionLocation, icon.light)
				};
			}
		}

		const existingCmd = MenuRegistry.getCommand(command);
		if (existingCmd) {
			if (existingCmd.source) {
				extension.collector.info(localize('dup1', "Command `{0}` already registered by {1} ({2})", userFriendlyCommand.command, existingCmd.source.title, existingCmd.source.id));
			} else {
				extension.collector.info(localize('dup0', "Command `{0}` already registered", userFriendlyCommand.command));
			}
		}
		_commandRegistrations.add(MenuRegistry.addCommand({
			id: command,
			title,
			source: { id: extension.description.identifier.value, title: extension.description.displayName ?? extension.description.name },
			shortTitle,
			tooltip: title,
			category,
			precondition: ContextKeyExpr.deserialize(enablement),
			icon: absoluteIcon
		}));
	}

	// remove all previous command registrations
	_commandRegistrations.clear();

	for (const extension of extensions) {
		const { value } = extension;
		if (Array.isArray(value)) {
			for (const command of value) {
				handleCommand(command, extension);
			}
		} else {
			handleCommand(value, extension);
		}
	}
});

interface IRegisteredSubmenu {
	readonly id: MenuId;
	readonly label: string;
	readonly icon?: { dark: URI; light?: URI } | ThemeIcon;
}

const _submenus = new Map<string, IRegisteredSubmenu>();

const submenusExtensionPoint = ExtensionsRegistry.registerExtensionPoint<schema.IUserFriendlySubmenu[]>({
	extensionPoint: 'submenus',
	jsonSchema: schema.submenusContribution
});

submenusExtensionPoint.setHandler(extensions => {

	_submenus.clear();

	for (const extension of extensions) {
		const { value, collector } = extension;

		for (const [, submenuInfo] of Object.entries(value)) {

			if (!schema.isValidSubmenu(submenuInfo, collector)) {
				continue;
			}

			if (!submenuInfo.id) {
				collector.warn(localize('submenuId.invalid.id', "`{0}` is not a valid submenu identifier", submenuInfo.id));
				continue;
			}
			if (_submenus.has(submenuInfo.id)) {
				collector.info(localize('submenuId.duplicate.id', "The `{0}` submenu was already previously registered.", submenuInfo.id));
				continue;
			}
			if (!submenuInfo.label) {
				collector.warn(localize('submenuId.invalid.label', "`{0}` is not a valid submenu label", submenuInfo.label));
				continue;
			}

			let absoluteIcon: { dark: URI; light?: URI } | ThemeIcon | undefined;
			if (submenuInfo.icon) {
				if (typeof submenuInfo.icon === 'string') {
					absoluteIcon = ThemeIcon.fromString(submenuInfo.icon) || { dark: resources.joinPath(extension.description.extensionLocation, submenuInfo.icon) };
				} else {
					absoluteIcon = {
						dark: resources.joinPath(extension.description.extensionLocation, submenuInfo.icon.dark),
						light: resources.joinPath(extension.description.extensionLocation, submenuInfo.icon.light)
					};
				}
			}

			const item: IRegisteredSubmenu = {
				id: MenuId.for(`api:${submenuInfo.id}`),
				label: submenuInfo.label,
				icon: absoluteIcon
			};

			_submenus.set(submenuInfo.id, item);
		}
	}
});

const _apiMenusByKey = new Map(apiMenus.map(menu => ([menu.key, menu])));
const _menuRegistrations = new DisposableStore();
const _submenuMenuItems = new Map<string /* menu id */, Set<string /* submenu id */>>();

const menusExtensionPoint = ExtensionsRegistry.registerExtensionPoint<{ [loc: string]: (schema.IUserFriendlyMenuItem | schema.IUserFriendlySubmenuItem)[] }>({
	extensionPoint: 'menus',
	jsonSchema: schema.menusContribution,
	deps: [submenusExtensionPoint]
});

menusExtensionPoint.setHandler(extensions => {

	// remove all previous menu registrations
	_menuRegistrations.clear();
	_submenuMenuItems.clear();

	for (const extension of extensions) {
		const { value, collector } = extension;

		for (const entry of Object.entries(value)) {
			if (!schema.isValidItems(entry[1], collector)) {
				continue;
			}

			let menu = _apiMenusByKey.get(entry[0]);

			if (!menu) {
				const submenu = _submenus.get(entry[0]);

				if (submenu) {
					menu = {
						key: entry[0],
						id: submenu.id,
						description: ''
					};
				}
			}

			if (!menu) {
				continue;
			}

			if (menu.proposed && !isProposedApiEnabled(extension.description, menu.proposed)) {
				collector.error(localize('proposedAPI.invalid', "{0} is a proposed menu identifier. It requires 'package.json#enabledApiProposals: [\"{1}\"]' and is only available when running out of dev or with the following command line switch: --enable-proposed-api {2}", entry[0], menu.proposed, extension.description.identifier.value));
				continue;
			}

			for (const menuItem of entry[1]) {
				let item: IMenuItem | ISubmenuItem;

				if (schema.isMenuItem(menuItem)) {
					const command = MenuRegistry.getCommand(menuItem.command);
					const alt = menuItem.alt && MenuRegistry.getCommand(menuItem.alt) || undefined;

					if (!command) {
						collector.error(localize('missing.command', "Menu item references a command `{0}` which is not defined in the 'commands' section.", menuItem.command));
						continue;
					}
					if (menuItem.alt && !alt) {
						collector.warn(localize('missing.altCommand', "Menu item references an alt-command `{0}` which is not defined in the 'commands' section.", menuItem.alt));
					}
					if (menuItem.command === menuItem.alt) {
						collector.info(localize('dupe.command', "Menu item references the same command as default and alt-command"));
					}

					item = { command, alt, group: undefined, order: undefined, when: undefined };
				} else {
					if (menu.supportsSubmenus === false) {
						collector.error(localize('unsupported.submenureference', "Menu item references a submenu for a menu which doesn't have submenu support."));
						continue;
					}

					const submenu = _submenus.get(menuItem.submenu);

					if (!submenu) {
						collector.error(localize('missing.submenu', "Menu item references a submenu `{0}` which is not defined in the 'submenus' section.", menuItem.submenu));
						continue;
					}

					let submenuRegistrations = _submenuMenuItems.get(menu.id.id);

					if (!submenuRegistrations) {
						submenuRegistrations = new Set();
						_submenuMenuItems.set(menu.id.id, submenuRegistrations);
					}

					if (submenuRegistrations.has(submenu.id.id)) {
						collector.warn(localize('submenuItem.duplicate', "The `{0}` submenu was already contributed to the `{1}` menu.", menuItem.submenu, entry[0]));
						continue;
					}

					submenuRegistrations.add(submenu.id.id);

					item = { submenu: submenu.id, icon: submenu.icon, title: submenu.label, group: undefined, order: undefined, when: undefined };
				}

				if (menuItem.group) {
					const idx = menuItem.group.lastIndexOf('@');
					if (idx > 0) {
						item.group = menuItem.group.substr(0, idx);
						item.order = Number(menuItem.group.substr(idx + 1)) || undefined;
					} else {
						item.group = menuItem.group;
					}
				}

				item.when = ContextKeyExpr.deserialize(menuItem.when);
				_menuRegistrations.add(MenuRegistry.appendMenuItem(menu.id, item));
			}
		}
	}
});
