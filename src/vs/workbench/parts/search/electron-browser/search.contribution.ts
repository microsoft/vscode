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
import nls = require('vs/nls');
import { TPromise } from 'vs/base/common/winjs.base';
import { Action } from 'vs/base/common/actions';
import * as objects from 'vs/base/common/objects';
import { explorerItemToFileResource, ExplorerFolderContext, ExplorerRootContext } from 'vs/workbench/parts/files/common/files';
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
import * as searchActions from 'vs/workbench/parts/search/browser/searchActions';
import * as Constants from 'vs/workbench/parts/search/common/constants';
import { registerContributions as replaceContributions } from 'vs/workbench/parts/search/browser/replaceContributions';
import { registerContributions as searchWidgetContributions } from 'vs/workbench/parts/search/browser/searchWidget';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ToggleCaseSensitiveKeybinding, ToggleRegexKeybinding, ToggleWholeWordKeybinding, ShowPreviousFindTermKeybinding, ShowNextFindTermKeybinding } from 'vs/editor/contrib/find/findModel';
import { ISearchWorkbenchService, SearchWorkbenchService } from 'vs/workbench/parts/search/common/searchModel';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { SearchViewlet } from 'vs/workbench/parts/search/browser/searchViewlet';
import { IOutputChannelRegistry, Extensions as OutputExt } from 'vs/workbench/parts/output/common/output';
import { defaultQuickOpenContextKey } from 'vs/workbench/browser/parts/quickopen/quickopen';
import { OpenSymbolHandler } from 'vs/workbench/parts/search/browser/openSymbolHandler';
import { OpenAnythingHandler } from 'vs/workbench/parts/search/browser/openAnythingHandler';
import { registerLanguageCommand } from 'vs/editor/browser/editorExtensions';
import { getWorkspaceSymbols } from 'vs/workbench/parts/search/common/search';
import { illegalArgument, onUnexpectedError } from 'vs/base/common/errors';
import { WorkbenchListFocusContextKey, IListService } from 'vs/platform/list/browser/listService';
import URI from 'vs/base/common/uri';
import { relative } from 'path';
import { dirname } from 'vs/base/common/resources';
import { ResourceContextKey } from 'vs/workbench/common/resources';

registerSingleton(ISearchWorkbenchService, SearchWorkbenchService);
replaceContributions();
searchWidgetContributions();

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'workbench.action.search.toggleQueryDetails',
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: Constants.SearchViewletVisibleKey,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_J,
	handler: accessor => {
		let viewletService = accessor.get(IViewletService);
		viewletService.openViewlet(Constants.VIEWLET_ID, true)
			.then((viewlet: SearchViewlet) => viewlet.toggleQueryDetails());
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: Constants.FocusSearchFromResults,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ContextKeyExpr.and(Constants.SearchViewletVisibleKey, Constants.FirstMatchFocusKey),
	primary: KeyCode.UpArrow,
	handler: (accessor, args: any) => {
		const searchViewlet: SearchViewlet = <SearchViewlet>accessor.get(IViewletService).getActiveViewlet();
		searchViewlet.focusPreviousInputBox();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: Constants.OpenMatchToSide,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ContextKeyExpr.and(Constants.SearchViewletVisibleKey, Constants.FileMatchOrMatchFocusKey),
	primary: KeyMod.CtrlCmd | KeyCode.Enter,
	mac: {
		primary: KeyMod.WinCtrl | KeyCode.Enter
	},
	handler: (accessor, args: any) => {
		const searchViewlet: SearchViewlet = <SearchViewlet>accessor.get(IViewletService).getActiveViewlet();
		const tree: ITree = searchViewlet.getControl();
		searchViewlet.open(tree.getFocus(), false, true, true);
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: Constants.CancelActionId,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ContextKeyExpr.and(Constants.SearchViewletVisibleKey, WorkbenchListFocusContextKey),
	primary: KeyCode.Escape,
	handler: (accessor, args: any) => {
		const searchViewlet: SearchViewlet = <SearchViewlet>accessor.get(IViewletService).getActiveViewlet();
		searchViewlet.cancelSearch();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: Constants.RemoveActionId,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ContextKeyExpr.and(Constants.SearchViewletVisibleKey, Constants.FileMatchOrMatchFocusKey),
	primary: KeyCode.Delete,
	mac: {
		primary: KeyMod.CtrlCmd | KeyCode.Backspace,
	},
	handler: (accessor, args: any) => {
		const searchViewlet: SearchViewlet = <SearchViewlet>accessor.get(IViewletService).getActiveViewlet();
		const tree: ITree = searchViewlet.getControl();
		accessor.get(IInstantiationService).createInstance(searchActions.RemoveAction, tree, tree.getFocus(), searchViewlet).run();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: Constants.ReplaceActionId,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ContextKeyExpr.and(Constants.SearchViewletVisibleKey, Constants.ReplaceActiveKey, Constants.MatchFocusKey),
	primary: KeyMod.Shift | KeyMod.CtrlCmd | KeyCode.KEY_1,
	handler: (accessor, args: any) => {
		const searchViewlet: SearchViewlet = <SearchViewlet>accessor.get(IViewletService).getActiveViewlet();
		const tree: ITree = searchViewlet.getControl();
		accessor.get(IInstantiationService).createInstance(searchActions.ReplaceAction, tree, tree.getFocus(), searchViewlet).run();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: Constants.ReplaceAllInFileActionId,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ContextKeyExpr.and(Constants.SearchViewletVisibleKey, Constants.ReplaceActiveKey, Constants.FileFocusKey),
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Enter,
	handler: (accessor, args: any) => {
		const searchViewlet: SearchViewlet = <SearchViewlet>accessor.get(IViewletService).getActiveViewlet();
		const tree: ITree = searchViewlet.getControl();
		accessor.get(IInstantiationService).createInstance(searchActions.ReplaceAllAction, tree, tree.getFocus(), searchViewlet).run();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: Constants.ReplaceAllInFolderActionId,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ContextKeyExpr.and(Constants.SearchViewletVisibleKey, Constants.ReplaceActiveKey, Constants.FolderFocusKey),
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Enter,
	handler: (accessor, args: any) => {
		const searchViewlet: SearchViewlet = <SearchViewlet>accessor.get(IViewletService).getActiveViewlet();
		const tree: ITree = searchViewlet.getControl();
		accessor.get(IInstantiationService).createInstance(searchActions.ReplaceAllInFolderAction, tree, tree.getFocus()).run();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: Constants.CloseReplaceWidgetActionId,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ContextKeyExpr.and(Constants.SearchViewletVisibleKey, Constants.ReplaceInputBoxFocusedKey),
	primary: KeyCode.Escape,
	handler: (accessor, args: any) => {
		accessor.get(IInstantiationService).createInstance(searchActions.CloseReplaceAction, Constants.CloseReplaceWidgetActionId, '').run();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: searchActions.FocusNextInputAction.ID,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ContextKeyExpr.and(Constants.SearchViewletVisibleKey, Constants.InputBoxFocusedKey),
	primary: KeyCode.DownArrow,
	handler: (accessor, args: any) => {
		accessor.get(IInstantiationService).createInstance(searchActions.FocusNextInputAction, searchActions.FocusNextInputAction.ID, '').run();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: searchActions.FocusPreviousInputAction.ID,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ContextKeyExpr.and(Constants.SearchViewletVisibleKey, Constants.InputBoxFocusedKey, Constants.SearchInputBoxFocusedKey.toNegated()),
	primary: KeyCode.UpArrow,
	handler: (accessor, args: any) => {
		accessor.get(IInstantiationService).createInstance(searchActions.FocusPreviousInputAction, searchActions.FocusPreviousInputAction.ID, '').run();
	}
});

const FIND_IN_FOLDER_ID = 'filesExplorer.findInFolder';
CommandsRegistry.registerCommand({
	id: FIND_IN_FOLDER_ID,
	handler: (accessor, resource?: URI) => {
		const listService = accessor.get(IListService);
		const viewletService = accessor.get(IViewletService);

		if (!URI.isUri(resource)) {
			const lastFocusedList = listService.lastFocusedList;
			const focus = lastFocusedList ? lastFocusedList.getFocus() : void 0;
			if (focus) {
				const file = explorerItemToFileResource(focus);
				if (file) {
					resource = file.isDirectory ? file.resource : dirname(file.resource);
				}
			}
		}

		viewletService.openViewlet(Constants.VIEWLET_ID, true).then(viewlet => {
			if (resource) {
				(viewlet as SearchViewlet).searchInFolder(resource, (from, to) => relative(from, to));
			}
		}).done(null, onUnexpectedError);
	}
});

const FIND_IN_WORKSPACE_ID = 'filesExplorer.findInWorkspace';
CommandsRegistry.registerCommand({
	id: FIND_IN_WORKSPACE_ID,
	handler: (accessor, ) => {
		const viewletService = accessor.get(IViewletService);
		return viewletService.openViewlet(Constants.VIEWLET_ID, true).then(viewlet => {
			(viewlet as SearchViewlet).searchInFolder(null, (from, to) => relative(from, to));
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
	when: ContextKeyExpr.and(ExplorerFolderContext, ResourceContextKey.Scheme.isEqualTo('file'))
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

// Register Viewlet
Registry.as<ViewletRegistry>(ViewletExtensions.Viewlets).registerViewlet(new ViewletDescriptor(
	SearchViewlet,
	Constants.VIEWLET_ID,
	nls.localize('name', "Search"),
	'search',
	10
));

// Actions
const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
const category = nls.localize('search', "Search");

registry.registerWorkbenchAction(new SyncActionDescriptor(searchActions.FindInFilesAction, Constants.VIEWLET_ID, nls.localize('showSearchViewlet', "Show Search"), { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_F },
	Constants.SearchViewletVisibleKey.toNegated()), 'View: Show Search', nls.localize('view', "View"));
registry.registerWorkbenchAction(new SyncActionDescriptor(searchActions.FindInFilesAction, Constants.FindInFilesActionId, nls.localize('findInFiles', "Find in Files"), { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_F },
	Constants.SearchInputBoxFocusedKey.toNegated()), 'Find in Files', category);

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: Constants.FocusActiveEditorCommandId,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ContextKeyExpr.and(Constants.SearchViewletVisibleKey, Constants.SearchInputBoxFocusedKey),
	handler: searchActions.FocusActiveEditorCommand,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_F
});

registry.registerWorkbenchAction(new SyncActionDescriptor(searchActions.FocusNextSearchResultAction, searchActions.FocusNextSearchResultAction.ID, searchActions.FocusNextSearchResultAction.LABEL, { primary: KeyCode.F4 }), 'Focus Next Search Result', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(searchActions.FocusPreviousSearchResultAction, searchActions.FocusPreviousSearchResultAction.ID, searchActions.FocusPreviousSearchResultAction.LABEL, { primary: KeyMod.Shift | KeyCode.F4 }), 'Focus Previous Search Result', category);

registry.registerWorkbenchAction(new SyncActionDescriptor(searchActions.ReplaceInFilesAction, searchActions.ReplaceInFilesAction.ID, searchActions.ReplaceInFilesAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_H }), 'Replace in Files', category);

KeybindingsRegistry.registerCommandAndKeybindingRule(objects.assign({
	id: Constants.ToggleCaseSensitiveCommandId,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ContextKeyExpr.and(Constants.SearchViewletVisibleKey, Constants.SearchInputBoxFocusedKey),
	handler: searchActions.toggleCaseSensitiveCommand
}, ToggleCaseSensitiveKeybinding));

KeybindingsRegistry.registerCommandAndKeybindingRule(objects.assign({
	id: Constants.ToggleWholeWordCommandId,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ContextKeyExpr.and(Constants.SearchViewletVisibleKey, Constants.SearchInputBoxFocusedKey),
	handler: searchActions.toggleWholeWordCommand
}, ToggleWholeWordKeybinding));

KeybindingsRegistry.registerCommandAndKeybindingRule(objects.assign({
	id: Constants.ToggleRegexCommandId,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ContextKeyExpr.and(Constants.SearchViewletVisibleKey, Constants.SearchInputBoxFocusedKey),
	handler: searchActions.toggleRegexCommand
}, ToggleRegexKeybinding));

// Terms navigation actions
registry.registerWorkbenchAction(new SyncActionDescriptor(searchActions.ShowNextSearchTermAction, searchActions.ShowNextSearchTermAction.ID, searchActions.ShowNextSearchTermAction.LABEL, ShowNextFindTermKeybinding, searchActions.ShowNextSearchTermAction.CONTEXT_KEY_EXPRESSION), 'Search: Show Next Search Term', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(searchActions.ShowPreviousSearchTermAction, searchActions.ShowPreviousSearchTermAction.ID, searchActions.ShowPreviousSearchTermAction.LABEL, ShowPreviousFindTermKeybinding, searchActions.ShowPreviousSearchTermAction.CONTEXT_KEY_EXPRESSION), 'Search: Show Previous Search Term', category);

registry.registerWorkbenchAction(new SyncActionDescriptor(searchActions.ShowNextSearchIncludeAction, searchActions.ShowNextSearchIncludeAction.ID, searchActions.ShowNextSearchIncludeAction.LABEL, ShowNextFindTermKeybinding, searchActions.ShowNextSearchIncludeAction.CONTEXT_KEY_EXPRESSION), 'Search: Show Next Search Include Pattern', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(searchActions.ShowPreviousSearchIncludeAction, searchActions.ShowPreviousSearchIncludeAction.ID, searchActions.ShowPreviousSearchIncludeAction.LABEL, ShowPreviousFindTermKeybinding, searchActions.ShowPreviousSearchIncludeAction.CONTEXT_KEY_EXPRESSION), 'Search: Show Previous Search Include Pattern', category);

registry.registerWorkbenchAction(new SyncActionDescriptor(searchActions.ShowNextSearchExcludeAction, searchActions.ShowNextSearchExcludeAction.ID, searchActions.ShowNextSearchExcludeAction.LABEL, ShowNextFindTermKeybinding, searchActions.ShowNextSearchExcludeAction.CONTEXT_KEY_EXPRESSION), 'Search: Show Next Search Exclude Pattern', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(searchActions.ShowPreviousSearchExcludeAction, searchActions.ShowPreviousSearchExcludeAction.ID, searchActions.ShowPreviousSearchExcludeAction.LABEL, ShowPreviousFindTermKeybinding, searchActions.ShowPreviousSearchExcludeAction.CONTEXT_KEY_EXPRESSION), 'Search: Show Previous Search Exclude Pattern', category);

registry.registerWorkbenchAction(new SyncActionDescriptor(searchActions.CollapseDeepestExpandedLevelAction, searchActions.CollapseDeepestExpandedLevelAction.ID, searchActions.CollapseDeepestExpandedLevelAction.LABEL), 'Search: Collapse All', category);

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

// Search output channel
const outputChannelRegistry = <IOutputChannelRegistry>Registry.as(OutputExt.OutputChannels);
outputChannelRegistry.registerChannel(Constants.SEARCH_OUTPUT_CHANNEL_ID, nls.localize('searchOutputChannelTitle', "Search"));

// Configuration
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	'id': 'search',
	'order': 13,
	'title': nls.localize('searchConfigurationTitle', "Search"),
	'type': 'object',
	'properties': {
		'search.exclude': {
			'type': 'object',
			'description': nls.localize('exclude', "Configure glob patterns for excluding files and folders in searches. Inherits all glob patterns from the files.exclude setting."),
			'default': { '**/node_modules': true, '**/bower_components': true },
			'additionalProperties': {
				'anyOf': [
					{
						'type': 'boolean',
						'description': nls.localize('exclude.boolean', "The glob pattern to match file paths against. Set to true or false to enable or disable the pattern."),
					},
					{
						'type': 'object',
						'properties': {
							'when': {
								'type': 'string', // expression ({ "**/*.js": { "when": "$(basename).js" } })
								'pattern': '\\w*\\$\\(basename\\)\\w*',
								'default': '$(basename).ext',
								'description': nls.localize('exclude.when', 'Additional check on the siblings of a matching file. Use $(basename) as variable for the matching file name.')
							}
						}
					}
				]
			},
			'scope': ConfigurationScope.RESOURCE
		},
		'search.useRipgrep': {
			'type': 'boolean',
			'description': nls.localize('useRipgrep', "Controls whether to use ripgrep in text and file search"),
			'default': true
		},
		'search.useIgnoreFiles': {
			'type': 'boolean',
			'description': nls.localize('useIgnoreFiles', "Controls whether to use .gitignore and .ignore files when searching for files."),
			'default': true,
			'scope': ConfigurationScope.RESOURCE
		},
		'search.quickOpen.includeSymbols': {
			'type': 'boolean',
			'description': nls.localize('search.quickOpen.includeSymbols', "Configure to include results from a global symbol search in the file results for Quick Open."),
			'default': false
		},
		'search.followSymlinks': {
			'type': 'boolean',
			'description': nls.localize('search.followSymlinks', "Controls whether to follow symlinks while searching."),
			'default': true
		},
		'search.smartCase': {
			'type': 'boolean',
			'description': nls.localize('search.smartCase', "Searches case-insensitively if the pattern is all lowercase, otherwise, searches case-sensitively"),
			'default': false
		}
	}
});

registerLanguageCommand('_executeWorkspaceSymbolProvider', function (accessor, args: { query: string; }) {
	let { query } = args;
	if (typeof query !== 'string') {
		throw illegalArgument();
	}
	return getWorkspaceSymbols(query);
});
