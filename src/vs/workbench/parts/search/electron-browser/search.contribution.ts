/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/search.contribution';
import { Registry } from 'vs/platform/registry/common/platform';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ViewletRegistry, Extensions as ViewletExtensions, ViewletDescriptor } from 'vs/workbench/browser/viewlet';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import * as nls from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { Action } from 'vs/base/common/actions';
import * as objects from 'vs/base/common/objects';
import * as platform from 'vs/base/common/platform';
import { ExplorerFolderContext, ExplorerRootContext } from 'vs/workbench/parts/files/common/files';
import { SyncActionDescriptor, MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actions';
import { QuickOpenHandlerDescriptor, IQuickOpenRegistry, Extensions as QuickOpenExtensions } from 'vs/workbench/browser/quickopen';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { getSelectionSearchString } from 'vs/editor/contrib/find/findController';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { ITree } from 'vs/base/parts/tree/browser/tree';
import * as Constants from 'vs/workbench/parts/search/common/constants';
import { registerContributions as replaceContributions } from 'vs/workbench/parts/search/browser/replaceContributions';
import { registerContributions as searchWidgetContributions } from 'vs/workbench/parts/search/browser/searchWidget';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ToggleCaseSensitiveKeybinding, ToggleRegexKeybinding, ToggleWholeWordKeybinding, ShowPreviousFindTermKeybinding, ShowNextFindTermKeybinding } from 'vs/editor/contrib/find/findModel';
import { ISearchWorkbenchService, SearchWorkbenchService } from 'vs/workbench/parts/search/common/searchModel';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { SearchView } from 'vs/workbench/parts/search/browser/searchView';
import { defaultQuickOpenContextKey } from 'vs/workbench/browser/parts/quickopen/quickopen';
import { OpenSymbolHandler } from 'vs/workbench/parts/search/browser/openSymbolHandler';
import { OpenAnythingHandler } from 'vs/workbench/parts/search/browser/openAnythingHandler';
import { registerLanguageCommand } from 'vs/editor/browser/editorExtensions';
import { getWorkspaceSymbols } from 'vs/workbench/parts/search/common/search';
import { illegalArgument } from 'vs/base/common/errors';
import { WorkbenchListFocusContextKey, IListService } from 'vs/platform/list/browser/listService';
import URI from 'vs/base/common/uri';
import { relative } from 'path';
import { dirname } from 'vs/base/common/resources';
import { ResourceContextKey } from 'vs/workbench/common/resources';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IFileService } from 'vs/platform/files/common/files';
import { distinct } from 'vs/base/common/arrays';
import { getMultiSelectedResources } from 'vs/workbench/parts/files/browser/files';
import { Schemas } from 'vs/base/common/network';
import { PanelRegistry, Extensions as PanelExtensions, PanelDescriptor } from 'vs/workbench/browser/panel';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { openSearchView, getSearchView, ReplaceAllInFolderAction, ReplaceAllAction, CloseReplaceAction, FocusNextInputAction, FocusPreviousInputAction, FocusNextSearchResultAction, FocusPreviousSearchResultAction, ReplaceInFilesAction, FindInFilesAction, FocusActiveEditorCommand, toggleCaseSensitiveCommand, ShowNextSearchTermAction, ShowPreviousSearchTermAction, toggleRegexCommand, ShowPreviousSearchIncludeAction, ShowNextSearchIncludeAction, CollapseDeepestExpandedLevelAction, toggleWholeWordCommand, RemoveAction, ReplaceAction } from 'vs/workbench/parts/search/browser/searchActions';
import { VIEW_ID } from 'vs/platform/search/common/search';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { SearchViewLocationUpdater } from 'vs/workbench/parts/search/browser/searchViewLocationUpdater';

registerSingleton(ISearchWorkbenchService, SearchWorkbenchService);
replaceContributions();
searchWidgetContributions();

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'workbench.action.search.toggleQueryDetails',
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: Constants.SearchViewVisibleKey,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_J,
	handler: accessor => {
		openSearchView(accessor.get(IViewletService), accessor.get(IPanelService), true)
			.then(view => view.toggleQueryDetails());
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: Constants.FocusSearchFromResults,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ContextKeyExpr.and(Constants.SearchViewVisibleKey, Constants.FirstMatchFocusKey),
	primary: KeyCode.UpArrow,
	handler: (accessor, args: any) => {
		const searchView = getSearchView(accessor.get(IViewletService), accessor.get(IPanelService));
		searchView.focusPreviousInputBox();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: Constants.OpenMatchToSide,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ContextKeyExpr.and(Constants.SearchViewVisibleKey, Constants.FileMatchOrMatchFocusKey),
	primary: KeyMod.CtrlCmd | KeyCode.Enter,
	mac: {
		primary: KeyMod.WinCtrl | KeyCode.Enter
	},
	handler: (accessor, args: any) => {
		const searchView = getSearchView(accessor.get(IViewletService), accessor.get(IPanelService));
		const tree: ITree = searchView.getControl();
		searchView.open(tree.getFocus(), false, true, true);
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: Constants.CancelActionId,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ContextKeyExpr.and(Constants.SearchViewVisibleKey, WorkbenchListFocusContextKey),
	primary: KeyCode.Escape,
	handler: (accessor, args: any) => {
		const searchView = getSearchView(accessor.get(IViewletService), accessor.get(IPanelService));
		searchView.cancelSearch();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: Constants.RemoveActionId,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ContextKeyExpr.and(Constants.SearchViewVisibleKey, Constants.FileMatchOrMatchFocusKey),
	primary: KeyCode.Delete,
	mac: {
		primary: KeyMod.CtrlCmd | KeyCode.Backspace,
	},
	handler: (accessor, args: any) => {
		const searchView = getSearchView(accessor.get(IViewletService), accessor.get(IPanelService));
		const tree: ITree = searchView.getControl();
		accessor.get(IInstantiationService).createInstance(RemoveAction, tree, tree.getFocus(), searchView).run();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: Constants.ReplaceActionId,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ContextKeyExpr.and(Constants.SearchViewVisibleKey, Constants.ReplaceActiveKey, Constants.MatchFocusKey),
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Enter,
	secondary: [KeyMod.Shift | KeyMod.CtrlCmd | KeyCode.KEY_1],
	handler: (accessor, args: any) => {
		const searchView = getSearchView(accessor.get(IViewletService), accessor.get(IPanelService));
		const tree: ITree = searchView.getControl();
		accessor.get(IInstantiationService).createInstance(ReplaceAction, tree, tree.getFocus(), searchView).run();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: Constants.ReplaceAllInFileActionId,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ContextKeyExpr.and(Constants.SearchViewVisibleKey, Constants.ReplaceActiveKey, Constants.FileFocusKey),
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Enter,
	handler: (accessor, args: any) => {
		const searchView = getSearchView(accessor.get(IViewletService), accessor.get(IPanelService));
		const tree: ITree = searchView.getControl();
		accessor.get(IInstantiationService).createInstance(ReplaceAllAction, tree, tree.getFocus(), searchView).run();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: Constants.ReplaceAllInFolderActionId,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ContextKeyExpr.and(Constants.SearchViewVisibleKey, Constants.ReplaceActiveKey, Constants.FolderFocusKey),
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Enter,
	handler: (accessor, args: any) => {
		const searchView = getSearchView(accessor.get(IViewletService), accessor.get(IPanelService));
		const tree: ITree = searchView.getControl();
		accessor.get(IInstantiationService).createInstance(ReplaceAllInFolderAction, tree, tree.getFocus()).run();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: Constants.CloseReplaceWidgetActionId,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ContextKeyExpr.and(Constants.SearchViewVisibleKey, Constants.ReplaceInputBoxFocusedKey),
	primary: KeyCode.Escape,
	handler: (accessor, args: any) => {
		accessor.get(IInstantiationService).createInstance(CloseReplaceAction, Constants.CloseReplaceWidgetActionId, '').run();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: FocusNextInputAction.ID,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ContextKeyExpr.and(Constants.SearchViewVisibleKey, Constants.InputBoxFocusedKey),
	primary: KeyCode.DownArrow,
	handler: (accessor, args: any) => {
		accessor.get(IInstantiationService).createInstance(FocusNextInputAction, FocusNextInputAction.ID, '').run();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: FocusPreviousInputAction.ID,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ContextKeyExpr.and(Constants.SearchViewVisibleKey, Constants.InputBoxFocusedKey, Constants.SearchInputBoxFocusedKey.toNegated()),
	primary: KeyCode.UpArrow,
	handler: (accessor, args: any) => {
		accessor.get(IInstantiationService).createInstance(FocusPreviousInputAction, FocusPreviousInputAction.ID, '').run();
	}
});

const FIND_IN_FOLDER_ID = 'filesExplorer.findInFolder';
CommandsRegistry.registerCommand({
	id: FIND_IN_FOLDER_ID,
	handler: (accessor, resource?: URI) => {
		const listService = accessor.get(IListService);
		const viewletService = accessor.get(IViewletService);
		const panelService = accessor.get(IPanelService);
		const fileService = accessor.get(IFileService);
		const resources = getMultiSelectedResources(resource, listService, accessor.get(IWorkbenchEditorService));

		return openSearchView(viewletService, panelService, true).then(searchView => {
			if (resources && resources.length) {
				return fileService.resolveFiles(resources.map(resource => ({ resource }))).then(results => {
					const folders: URI[] = [];

					results.forEach(result => {
						if (result.success) {
							folders.push(result.stat.isDirectory ? result.stat.resource : dirname(result.stat.resource));
						}
					});

					searchView.searchInFolders(distinct(folders, folder => folder.toString()), (from, to) => relative(from, to));
				});
			}

			return void 0;
		});
	}
});

const FIND_IN_WORKSPACE_ID = 'filesExplorer.findInWorkspace';
CommandsRegistry.registerCommand({
	id: FIND_IN_WORKSPACE_ID,
	handler: (accessor) => {
		return openSearchView(accessor.get(IViewletService), accessor.get(IPanelService), true).then(searchView => {
			searchView.searchInFolders(null, (from, to) => relative(from, to));
		});
	}
});

MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
	group: '4_search',
	order: 10,
	command: {
		id: FIND_IN_FOLDER_ID,
		title: nls.localize('findInFolder', "Find in Folder...")
	},
	when: ContextKeyExpr.and(ExplorerFolderContext, ResourceContextKey.Scheme.isEqualTo(Schemas.file)) // todo@remote
});

MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
	group: '4_search',
	order: 10,
	command: {
		id: FIND_IN_WORKSPACE_ID,
		title: nls.localize('findInWorkspace', "Find in Workspace...")
	},
	when: ContextKeyExpr.and(ExplorerRootContext, ExplorerFolderContext.toNegated())
});


class ShowAllSymbolsAction extends Action {
	static readonly ID = 'workbench.action.showAllSymbols';
	static readonly LABEL = nls.localize('showTriggerActions', "Go to Symbol in Workspace...");
	static readonly ALL_SYMBOLS_PREFIX = '#';

	constructor(
		actionId: string, actionLabel: string,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@ICodeEditorService private editorService: ICodeEditorService) {
		super(actionId, actionLabel);
		this.enabled = !!this.quickOpenService;
	}

	public run(context?: any): TPromise<void> {

		let prefix = ShowAllSymbolsAction.ALL_SYMBOLS_PREFIX;
		let inputSelection: { start: number; end: number; } = void 0;
		let editor = this.editorService.getFocusedCodeEditor();
		const word = editor && getSelectionSearchString(editor);
		if (word) {
			prefix = prefix + word;
			inputSelection = { start: 1, end: word.length + 1 };
		}

		this.quickOpenService.show(prefix, { inputSelection });

		return TPromise.as(null);
	}
}

// Register View in Viewlet and Panel area
Registry.as<ViewletRegistry>(ViewletExtensions.Viewlets).registerViewlet(new ViewletDescriptor(
	SearchView,
	VIEW_ID,
	nls.localize('name', "Search"),
	'search',
	10
));

Registry.as<PanelRegistry>(PanelExtensions.Panels).registerPanel(new PanelDescriptor(
	SearchView,
	VIEW_ID,
	nls.localize('name', "Search"),
	'search',
	10
));

// Register view location updater
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(SearchViewLocationUpdater, LifecyclePhase.Running);

// Actions
const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
const category = nls.localize('search', "Search");

registry.registerWorkbenchAction(new SyncActionDescriptor(FindInFilesAction, VIEW_ID, nls.localize('showSearchViewl', "Show Search"), { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_F },
	Constants.SearchViewVisibleKey.toNegated()), 'View: Show Search', nls.localize('view', "View"));
registry.registerWorkbenchAction(new SyncActionDescriptor(FindInFilesAction, Constants.FindInFilesActionId, nls.localize('findInFiles', "Find in Files"), { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_F },
	Constants.SearchInputBoxFocusedKey.toNegated()), 'Find in Files', category);

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: Constants.FocusActiveEditorCommandId,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ContextKeyExpr.and(Constants.SearchViewVisibleKey, Constants.SearchInputBoxFocusedKey),
	handler: FocusActiveEditorCommand,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_F
});

registry.registerWorkbenchAction(new SyncActionDescriptor(FocusNextSearchResultAction, FocusNextSearchResultAction.ID, FocusNextSearchResultAction.LABEL, { primary: KeyCode.F4 }, ContextKeyExpr.and(Constants.HasSearchResults)), 'Focus Next Search Result', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusPreviousSearchResultAction, FocusPreviousSearchResultAction.ID, FocusPreviousSearchResultAction.LABEL, { primary: KeyMod.Shift | KeyCode.F4 }, ContextKeyExpr.and(Constants.HasSearchResults)), 'Focus Previous Search Result', category);

registry.registerWorkbenchAction(new SyncActionDescriptor(ReplaceInFilesAction, ReplaceInFilesAction.ID, ReplaceInFilesAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_H }), 'Replace in Files', category);

KeybindingsRegistry.registerCommandAndKeybindingRule(objects.assign({
	id: Constants.ToggleCaseSensitiveCommandId,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ContextKeyExpr.and(Constants.SearchViewVisibleKey, Constants.SearchInputBoxFocusedKey),
	handler: toggleCaseSensitiveCommand
}, ToggleCaseSensitiveKeybinding));

KeybindingsRegistry.registerCommandAndKeybindingRule(objects.assign({
	id: Constants.ToggleWholeWordCommandId,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ContextKeyExpr.and(Constants.SearchViewVisibleKey, Constants.SearchInputBoxFocusedKey),
	handler: toggleWholeWordCommand
}, ToggleWholeWordKeybinding));

KeybindingsRegistry.registerCommandAndKeybindingRule(objects.assign({
	id: Constants.ToggleRegexCommandId,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ContextKeyExpr.and(Constants.SearchViewVisibleKey, Constants.SearchInputBoxFocusedKey),
	handler: toggleRegexCommand
}, ToggleRegexKeybinding));

// Terms navigation actions
registry.registerWorkbenchAction(new SyncActionDescriptor(ShowNextSearchTermAction, ShowNextSearchTermAction.ID, ShowNextSearchTermAction.LABEL, ShowNextFindTermKeybinding, ContextKeyExpr.and(Constants.SearchViewVisibleKey, Constants.SearchInputBoxFocusedKey)), 'Search: Show Next Search Term', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(ShowPreviousSearchTermAction, ShowPreviousSearchTermAction.ID, ShowPreviousSearchTermAction.LABEL, ShowPreviousFindTermKeybinding, ContextKeyExpr.and(Constants.SearchViewVisibleKey, Constants.SearchInputBoxFocusedKey)), 'Search: Show Previous Search Term', category);

registry.registerWorkbenchAction(new SyncActionDescriptor(ShowNextSearchIncludeAction, ShowNextSearchIncludeAction.ID, ShowNextSearchIncludeAction.LABEL, ShowNextFindTermKeybinding, ContextKeyExpr.and(Constants.SearchViewVisibleKey, Constants.PatternIncludesFocusedKey)), 'Search: Show Next Search Include Pattern', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(ShowPreviousSearchIncludeAction, ShowPreviousSearchIncludeAction.ID, ShowPreviousSearchIncludeAction.LABEL, ShowPreviousFindTermKeybinding, ContextKeyExpr.and(Constants.SearchViewVisibleKey, Constants.PatternIncludesFocusedKey)), 'Search: Show Previous Search Include Pattern', category);

registry.registerWorkbenchAction(new SyncActionDescriptor(CollapseDeepestExpandedLevelAction, CollapseDeepestExpandedLevelAction.ID, CollapseDeepestExpandedLevelAction.LABEL), 'Search: Collapse All', category);

registry.registerWorkbenchAction(new SyncActionDescriptor(ShowAllSymbolsAction, ShowAllSymbolsAction.ID, ShowAllSymbolsAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_T }), 'Go to Symbol in Workspace...');


// Register Quick Open Handler
Registry.as<IQuickOpenRegistry>(QuickOpenExtensions.Quickopen).registerDefaultQuickOpenHandler(
	new QuickOpenHandlerDescriptor(
		OpenAnythingHandler,
		OpenAnythingHandler.ID,
		'',
		defaultQuickOpenContextKey,
		nls.localize('openAnythingHandlerDescription', "Go to File")
	)
);

Registry.as<IQuickOpenRegistry>(QuickOpenExtensions.Quickopen).registerQuickOpenHandler(
	new QuickOpenHandlerDescriptor(
		OpenSymbolHandler,
		OpenSymbolHandler.ID,
		ShowAllSymbolsAction.ALL_SYMBOLS_PREFIX,
		'inWorkspaceSymbolsPicker',
		[
			{
				prefix: ShowAllSymbolsAction.ALL_SYMBOLS_PREFIX,
				needsEditor: false,
				description: nls.localize('openSymbolDescriptionNormal', "Go to Symbol in Workspace")
			}
		]
	)
);

// Configuration
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	id: 'search',
	order: 13,
	title: nls.localize('searchConfigurationTitle', "Search"),
	type: 'object',
	properties: {
		'search.exclude': {
			type: 'object',
			description: nls.localize('exclude', "Configure glob patterns for excluding files and folders in searches. Inherits all glob patterns from the files.exclude setting."),
			default: { '**/node_modules': true, '**/bower_components': true },
			additionalProperties: {
				anyOf: [
					{
						type: 'boolean',
						description: nls.localize('exclude.boolean', "The glob pattern to match file paths against. Set to true or false to enable or disable the pattern."),
					},
					{
						type: 'object',
						properties: {
							when: {
								type: 'string', // expression ({ "**/*.js": { "when": "$(basename).js" } })
								pattern: '\\w*\\$\\(basename\\)\\w*',
								default: '$(basename).ext',
								description: nls.localize('exclude.when', 'Additional check on the siblings of a matching file. Use $(basename) as variable for the matching file name.')
							}
						}
					}
				]
			},
			scope: ConfigurationScope.RESOURCE
		},
		'search.useRipgrep': {
			type: 'boolean',
			description: nls.localize('useRipgrep', "Controls whether to use ripgrep in text and file search"),
			default: true
		},
		'search.useIgnoreFiles': {
			type: 'boolean',
			description: nls.localize('useIgnoreFiles', "Controls whether to use .gitignore and .ignore files when searching for files."),
			default: true,
			scope: ConfigurationScope.RESOURCE
		},
		'search.quickOpen.includeSymbols': {
			type: 'boolean',
			description: nls.localize('search.quickOpen.includeSymbols', "Configure to include results from a global symbol search in the file results for Quick Open."),
			default: false
		},
		'search.followSymlinks': {
			type: 'boolean',
			description: nls.localize('search.followSymlinks', "Controls whether to follow symlinks while searching."),
			default: true
		},
		'search.smartCase': {
			type: 'boolean',
			description: nls.localize('search.smartCase', "Searches case-insensitively if the pattern is all lowercase, otherwise, searches case-sensitively"),
			default: false
		},
		'search.globalFindClipboard': {
			type: 'boolean',
			default: false,
			description: nls.localize('search.globalFindClipboard', "Controls if the search view should read or modify the shared find clipboard on macOS"),
			included: platform.isMacintosh
		},
		'search.location': {
			enum: ['sidebar', 'panel'],
			default: 'sidebar',
			description: nls.localize('search.location', "Preview: controls if the search will be shown as a view in the sidebar or as a panel in the panel area for more horizontal space. Next release search in panel will have improved horizontal layout and this will no longer be a preview."),
		},
	}
});

registerLanguageCommand('_executeWorkspaceSymbolProvider', function (accessor, args: { query: string; }) {
	let { query } = args;
	if (typeof query !== 'string') {
		throw illegalArgument();
	}
	return getWorkspaceSymbols(query);
});
