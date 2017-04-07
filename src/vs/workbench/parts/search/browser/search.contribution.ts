/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/search.contribution';
import { Registry } from 'vs/platform/platform';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ViewletRegistry, Extensions as ViewletExtensions, ViewletDescriptor } from 'vs/workbench/browser/viewlet';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import nls = require('vs/nls');
import { IAction } from 'vs/base/common/actions';
import { explorerItemToFileResource } from 'vs/workbench/parts/files/common/files';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { Scope, IActionBarRegistry, Extensions as ActionBarExtensions, ActionBarContributor } from 'vs/workbench/browser/actionBarRegistry';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actionRegistry';
import { QuickOpenHandlerDescriptor, IQuickOpenRegistry, Extensions as QuickOpenExtensions, QuickOpenAction } from 'vs/workbench/browser/quickopen';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import * as searchActions from 'vs/workbench/parts/search/browser/searchActions';
import * as Constants from 'vs/workbench/parts/search/common/constants';
import { registerContributions as replaceContributions } from 'vs/workbench/parts/search/browser/replaceContributions';
import { registerContributions as searchWidgetContributions } from 'vs/workbench/parts/search/browser/searchWidget';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ToggleCaseSensitiveKeybinding, ToggleRegexKeybinding, ToggleWholeWordKeybinding, ShowPreviousFindTermKeybinding, ShowNextFindTermKeybinding } from 'vs/editor/contrib/find/common/findModel';
import { ISearchWorkbenchService, SearchWorkbenchService } from 'vs/workbench/parts/search/common/searchModel';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { SearchViewlet } from 'vs/workbench/parts/search/browser/searchViewlet';

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

CommandsRegistry.registerCommand(searchActions.FindInFolderAction.ID, searchActions.findInFolderCommand);

class ExplorerViewerActionContributor extends ActionBarContributor {
	private _instantiationService: IInstantiationService;
	private _contextService: IWorkspaceContextService;

	constructor( @IInstantiationService instantiationService: IInstantiationService, @IWorkspaceContextService contextService: IWorkspaceContextService) {
		super();

		this._instantiationService = instantiationService;
		this._contextService = contextService;
	}

	public hasSecondaryActions(context: any): boolean {
		let element = context.element;

		// Contribute only on file resources
		let fileResource = explorerItemToFileResource(element);
		if (!fileResource) {
			return false;
		}

		return fileResource.isDirectory;
	}

	public getSecondaryActions(context: any): IAction[] {
		let actions: IAction[] = [];

		if (this.hasSecondaryActions(context)) {
			let fileResource = explorerItemToFileResource(context.element);

			let action = this._instantiationService.createInstance(searchActions.FindInFolderAction, fileResource.resource);
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

class ShowAllSymbolsAction extends QuickOpenAction {

	constructor(actionId: string, actionLabel: string, @IQuickOpenService quickOpenService: IQuickOpenService) {
		super(actionId, actionLabel, ALL_SYMBOLS_PREFIX, quickOpenService);
	}
}

// Register Viewlet
Registry.as<ViewletRegistry>(ViewletExtensions.Viewlets).registerViewlet(new ViewletDescriptor(
	'vs/workbench/parts/search/browser/searchViewlet',
	'SearchViewlet',
	Constants.VIEWLET_ID,
	nls.localize('name', "Search"),
	'search',
	10
));

// Actions
const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);

registry.registerWorkbenchAction(new SyncActionDescriptor(searchActions.OpenSearchViewletAction, Constants.VIEWLET_ID, nls.localize('showSearchViewlet', "Show Search"), { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_F },
	Constants.SearchViewletVisibleKey.toNegated()), 'View: Show Search', nls.localize('view', "View"));
registry.registerWorkbenchAction(new SyncActionDescriptor(searchActions.FocusActiveEditorAction, Constants.FocusActiveEditorActionId, '', { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_F },
	ContextKeyExpr.and(Constants.SearchViewletVisibleKey, Constants.SearchInputBoxFocussedKey)), '');
registry.registerWorkbenchAction(new SyncActionDescriptor(searchActions.FindInFilesAction, Constants.FindInFilesActionId, nls.localize('findInFiles', "Find in Files"), { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_F },
	Constants.SearchInputBoxFocussedKey.toNegated()), 'Find in Files');

registry.registerWorkbenchAction(new SyncActionDescriptor(searchActions.FocusNextSearchResultAction, searchActions.FocusNextSearchResultAction.ID, searchActions.FocusNextSearchResultAction.LABEL, { primary: KeyCode.F4 }), '');
registry.registerWorkbenchAction(new SyncActionDescriptor(searchActions.FocusPreviousSearchResultAction, searchActions.FocusPreviousSearchResultAction.ID, searchActions.FocusPreviousSearchResultAction.LABEL, { primary: KeyMod.Shift | KeyCode.F4 }), '');

registry.registerWorkbenchAction(new SyncActionDescriptor(searchActions.ReplaceInFilesAction, searchActions.ReplaceInFilesAction.ID, searchActions.ReplaceInFilesAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_H }), 'Replace in Files');
registry.registerWorkbenchAction(new SyncActionDescriptor(searchActions.CloseReplaceAction, Constants.CloseReplaceWidgetActionId, '', { primary: KeyCode.Escape }, ContextKeyExpr.and(Constants.SearchViewletVisibleKey, Constants.ReplaceInputBoxFocussedKey)), '');

registry.registerWorkbenchAction(new SyncActionDescriptor(searchActions.ShowNextSearchTermAction, searchActions.ShowNextSearchTermAction.ID, searchActions.ShowNextSearchTermAction.LABEL, ShowNextFindTermKeybinding,
	ContextKeyExpr.and(Constants.SearchViewletVisibleKey, Constants.SearchInputBoxFocussedKey)), 'Show Next Search Term');
registry.registerWorkbenchAction(new SyncActionDescriptor(searchActions.ShowPreviousSearchTermAction, searchActions.ShowPreviousSearchTermAction.ID, searchActions.ShowPreviousSearchTermAction.LABEL, ShowPreviousFindTermKeybinding,
	ContextKeyExpr.and(Constants.SearchViewletVisibleKey, Constants.SearchInputBoxFocussedKey)), 'Show Previous Search Term');
registry.registerWorkbenchAction(new SyncActionDescriptor(searchActions.FocusNextInputAction, searchActions.FocusNextInputAction.ID, searchActions.FocusNextInputAction.LABEL, { primary: KeyCode.DownArrow },
	ContextKeyExpr.and(Constants.SearchViewletVisibleKey, Constants.InputBoxFocussedKey)), 'Focus Next Input Box');
registry.registerWorkbenchAction(new SyncActionDescriptor(searchActions.FocusPreviousInputAction, searchActions.FocusPreviousInputAction.ID, searchActions.FocusPreviousInputAction.LABEL, { primary: KeyCode.UpArrow },
	ContextKeyExpr.and(Constants.SearchViewletVisibleKey, Constants.InputBoxFocussedKey, Constants.SearchInputBoxFocussedKey.toNegated())), 'Focus Previous Input Box');

registry.registerWorkbenchAction(new SyncActionDescriptor(searchActions.ToggleCaseSensitiveAction, Constants.ToggleCaseSensitiveActionId, '', ToggleCaseSensitiveKeybinding, ContextKeyExpr.and(Constants.SearchViewletVisibleKey, Constants.SearchInputBoxFocussedKey)), '');
registry.registerWorkbenchAction(new SyncActionDescriptor(searchActions.ToggleWholeWordAction, Constants.ToggleWholeWordActionId, '', ToggleWholeWordKeybinding, ContextKeyExpr.and(Constants.SearchViewletVisibleKey, Constants.SearchInputBoxFocussedKey)), '');
registry.registerWorkbenchAction(new SyncActionDescriptor(searchActions.ToggleRegexAction, Constants.ToggleRegexActionId, '', ToggleRegexKeybinding, ContextKeyExpr.and(Constants.SearchViewletVisibleKey, Constants.SearchInputBoxFocussedKey)), '');

registry.registerWorkbenchAction(new SyncActionDescriptor(ShowAllSymbolsAction, ACTION_ID, ACTION_LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_T }), 'Go to Symbol in Workspace...');

// Contribute to Explorer Viewer
const actionBarRegistry = Registry.as<IActionBarRegistry>(ActionBarExtensions.Actionbar);
actionBarRegistry.registerActionBarContributor(Scope.VIEWER, ExplorerViewerActionContributor);

// Register Quick Open Handler
Registry.as<IQuickOpenRegistry>(QuickOpenExtensions.Quickopen).registerDefaultQuickOpenHandler(
	new QuickOpenHandlerDescriptor(
		'vs/workbench/parts/search/browser/openAnythingHandler',
		'OpenAnythingHandler',
		'',
		nls.localize('openAnythingHandlerDescription', "Go to File")
	)
);

Registry.as<IQuickOpenRegistry>(QuickOpenExtensions.Quickopen).registerQuickOpenHandler(
	new QuickOpenHandlerDescriptor(
		'vs/workbench/parts/search/browser/openAnythingHandler',
		'OpenSymbolHandler',
		ALL_SYMBOLS_PREFIX,
		[
			{
				prefix: ALL_SYMBOLS_PREFIX,
				needsEditor: false,
				description: nls.localize('openSymbolDescriptionNormal', "Go to Symbol in Workspace")
			}
		]
	)
);

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
			}
		},
		'search.useRipgrep': {
			'type': 'boolean',
			'description': nls.localize('useRipgrep', "Controls whether to use ripgrep in text search"),
			'default': true
		},
		'search.useIgnoreFilesByDefault': {
			'type': 'boolean',
			'description': nls.localize('useIgnoreFilesByDefault', "Controls whether to use .gitignore and .ignore files by default when searching in a new workspace."),
			'default': false
		},
		'search.quickOpen.includeSymbols': {
			'type': 'boolean',
			'description': nls.localize('search.quickOpen.includeSymbols', "Configure to include results from a global symbol search in the file results for Quick Open."),
			'default': false
		}
	}
});
