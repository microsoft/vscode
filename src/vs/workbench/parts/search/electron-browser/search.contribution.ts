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
import { IAction, Action } from 'vs/base/common/actions';
import * as objects from 'vs/base/common/objects';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { explorerItemToFileResource } from 'vs/workbench/parts/files/common/files';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { Scope, IActionBarRegistry, Extensions as ActionBarExtensions, ActionBarContributor } from 'vs/workbench/browser/actions';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actions';
import { QuickOpenHandlerDescriptor, IQuickOpenRegistry, Extensions as QuickOpenExtensions } from 'vs/workbench/browser/quickopen';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { getSelectionSearchString } from 'vs/editor/contrib/find/findController';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { ITree } from 'vs/base/parts/tree/browser/tree';
import * as searchActions from 'vs/workbench/parts/search/browser/searchActions';
import { Model } from 'vs/workbench/parts/files/common/explorerModel';
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
import { illegalArgument } from 'vs/base/common/errors';
import { FindInFolderAction, findInFolderCommand, FindInWorkspaceAction } from 'vs/workbench/parts/search/electron-browser/searchActions';
import { WorkbenchListFocusContextKey } from 'vs/platform/list/browser/listService';

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

CommandsRegistry.registerCommand(FindInFolderAction.ID, findInFolderCommand);

class ExplorerViewerActionContributor extends ActionBarContributor {
	private _instantiationService: IInstantiationService;

	constructor( @IInstantiationService instantiationService: IInstantiationService, @IWorkspaceContextService contextService: IWorkspaceContextService) {
		super();

		this._instantiationService = instantiationService;
	}

	public hasSecondaryActions(context: any): boolean {
		let element = context.element;

		// Contribute only on file resources and model (context menu for multi root)
		if (element instanceof Model) {
			return true;
		}

		let fileResource = explorerItemToFileResource(element);
		if (!fileResource) {
			return false;
		}

		return fileResource.isDirectory && fileResource.resource.scheme === 'file';
	}

	public getSecondaryActions(context: any): IAction[] {
		let actions: IAction[] = [];

		if (this.hasSecondaryActions(context)) {
			let action: Action;
			if (context.element instanceof Model) {
				action = this._instantiationService.createInstance(FindInWorkspaceAction);
			} else {
				let fileResource = explorerItemToFileResource(context.element);
				action = this._instantiationService.createInstance(FindInFolderAction, fileResource.resource);
			}

			action.order = 55;
			actions.push(action);

			actions.push(new Separator('', 56));
		}

		return actions;
	}
}

const ACTION_ID = 'workbench.action.showAllSymbols';
const ACTION_LABEL = nls.localize('showTriggerActions', "Go to Symbol in Workspace...");
const ALL_SYMBOLS_PREFIX = '#';

class ShowAllSymbolsAction extends Action {

	constructor(
		actionId: string, actionLabel: string,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@ICodeEditorService private editorService: ICodeEditorService) {
		super(actionId, actionLabel);
		this.enabled = !!this.quickOpenService;
	}

	public run(context?: any): TPromise<void> {

		let prefix = ALL_SYMBOLS_PREFIX;
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

// "Show Search" and "Find in Files" are redundant, but we will inevitably break keybindings if we remove one
registry.registerWorkbenchAction(new SyncActionDescriptor(searchActions.FindInFilesAction, Constants.VIEWLET_ID, searchActions.SHOW_SEARCH_LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_F },
	ContextKeyExpr.and(Constants.SearchViewletVisibleKey.toNegated(), EditorContextKeys.focus.toNegated())), 'View: Show Search', nls.localize('view', "View"));
registry.registerWorkbenchAction(new SyncActionDescriptor(searchActions.FindInFilesAction, Constants.FindInFilesActionId, searchActions.FindInFilesAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_F },
	ContextKeyExpr.and(Constants.SearchInputBoxFocusedKey.toNegated(), EditorContextKeys.focus.toNegated())), 'Find in Files', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(searchActions.ReplaceInFilesAction, searchActions.ReplaceInFilesAction.ID, searchActions.ReplaceInFilesAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_H },
	EditorContextKeys.focus.toNegated()), 'Replace in Files', category);

registry.registerWorkbenchAction(new SyncActionDescriptor(searchActions.FindInFilesWithSelectedTextAction, searchActions.FindInFilesWithSelectedTextAction.ID, searchActions.FindInFilesWithSelectedTextAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_F },
	EditorContextKeys.focus), 'Find in Files With Selected Text', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(searchActions.ReplaceInFilesWithSelectedTextAction, searchActions.ReplaceInFilesWithSelectedTextAction.ID, searchActions.ReplaceInFilesWithSelectedTextAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_H },
	EditorContextKeys.focus), 'Replace in Files With Selected Text', category);

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: Constants.FocusActiveEditorCommandId,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ContextKeyExpr.and(Constants.SearchViewletVisibleKey, Constants.SearchInputBoxFocusedKey),
	handler: searchActions.FocusActiveEditorCommand,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_F
});

registry.registerWorkbenchAction(new SyncActionDescriptor(searchActions.FocusNextSearchResultAction, searchActions.FocusNextSearchResultAction.ID, searchActions.FocusNextSearchResultAction.LABEL, { primary: KeyCode.F4 }), 'Focus Next Search Result', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(searchActions.FocusPreviousSearchResultAction, searchActions.FocusPreviousSearchResultAction.ID, searchActions.FocusPreviousSearchResultAction.LABEL, { primary: KeyMod.Shift | KeyCode.F4 }), 'Focus Previous Search Result', category);

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

registry.registerWorkbenchAction(new SyncActionDescriptor(ShowAllSymbolsAction, ACTION_ID, ACTION_LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_T }), 'Go to Symbol in Workspace...');

// Contribute to Explorer Viewer
const actionBarRegistry = Registry.as<IActionBarRegistry>(ActionBarExtensions.Actionbar);
actionBarRegistry.registerActionBarContributor(Scope.VIEWER, ExplorerViewerActionContributor);

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
		ALL_SYMBOLS_PREFIX,
		'inWorkspaceSymbolsPicker',
		[
			{
				prefix: ALL_SYMBOLS_PREFIX,
				needsEditor: false,
				description: nls.localize('openSymbolDescriptionNormal', "Go to Symbol in Workspace")
			}
		]
	)
);

// Search output channel
const outputChannelRegistry = <IOutputChannelRegistry>Registry.as(OutputExt.OutputChannels);
outputChannelRegistry.registerChannel('search', nls.localize('searchOutputChannelTitle', "Search"));

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
