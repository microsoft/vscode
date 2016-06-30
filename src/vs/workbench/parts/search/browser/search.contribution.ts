/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/search.contribution';
import {Registry} from 'vs/platform/platform';
import {ViewletRegistry, Extensions as ViewletExtensions, ViewletDescriptor} from 'vs/workbench/browser/viewlet';
import {IConfigurationRegistry, Extensions as ConfigurationExtensions} from 'vs/platform/configuration/common/configurationRegistry';
import nls = require('vs/nls');
import {IAction} from 'vs/base/common/actions';
import {asFileResource} from 'vs/workbench/parts/files/common/files';
import {SyncActionDescriptor, DeferredAction} from 'vs/platform/actions/common/actions';
import {Separator} from 'vs/base/browser/ui/actionbar/actionbar';
import {Scope, IActionBarRegistry, Extensions as ActionBarExtensions, ActionBarContributor} from 'vs/workbench/browser/actionBarRegistry';
import {IWorkbenchActionRegistry, Extensions as ActionExtensions} from 'vs/workbench/common/actionRegistry';
import {QuickOpenHandlerDescriptor, IQuickOpenRegistry, Extensions as QuickOpenExtensions, QuickOpenAction} from 'vs/workbench/browser/quickopen';
import {KeybindingsRegistry} from 'vs/platform/keybinding/common/keybindingsRegistry';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {AsyncDescriptor} from 'vs/platform/instantiation/common/descriptors';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {KbExpr, IKeybindings} from 'vs/platform/keybinding/common/keybindingService';
import {IQuickOpenService} from 'vs/workbench/services/quickopen/common/quickOpenService';
import {IViewletService} from 'vs/workbench/services/viewlet/common/viewletService';
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';
import {OpenSearchViewletAction, ReplaceInFilesAction} from 'vs/workbench/parts/search/browser/searchActions';
import {VIEWLET_ID} from 'vs/workbench/parts/search/common/constants';
import { registerContributions } from 'vs/workbench/parts/search/browser/replaceContributions';

registerContributions();

KeybindingsRegistry.registerCommandDesc({
	id: 'workbench.action.search.toggleQueryDetails',
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: KbExpr.has('searchViewletVisible'),
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_J,
	handler: accessor => {
		let viewletService = accessor.get(IViewletService);
		viewletService.openViewlet(VIEWLET_ID, true)
			.then(viewlet => (<any>viewlet).toggleFileTypes());
	}
});

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
		let fileResource = asFileResource(element);
		if (!fileResource) {
			return false;
		}

		return fileResource.isDirectory;
	}

	public getSecondaryActions(context: any): IAction[] {
		let actions: IAction[] = [];

		if (this.hasSecondaryActions(context)) {
			let fileResource = asFileResource(context.element);

			let action = new DeferredAction(
				this._instantiationService,
				new AsyncDescriptor('vs/workbench/parts/search/browser/searchActions', 'FindInFolderAction', fileResource.resource),
				'workbench.search.action.findInFolder',
				nls.localize('findInFolder', "Find in Folder")
			);
			action.order = 55;
			actions.push(action);

			actions.push(new Separator('', 56));
		}

		return actions;
	}
}

const ACTION_ID = 'workbench.action.showAllSymbols';
const ACTION_LABEL = nls.localize('showTriggerActions', "Show All Symbols");
const ALL_SYMBOLS_PREFIX = '#';

class ShowAllSymbolsAction extends QuickOpenAction {

	constructor(actionId: string, actionLabel: string, @IQuickOpenService quickOpenService: IQuickOpenService) {
		super(actionId, actionLabel, ALL_SYMBOLS_PREFIX, quickOpenService);
	}
}

// Register Viewlet
(<ViewletRegistry>Registry.as(ViewletExtensions.Viewlets)).registerViewlet(new ViewletDescriptor(
	'vs/workbench/parts/search/browser/searchViewlet',
	'SearchViewlet',
	VIEWLET_ID,
	nls.localize('name', "Search"),
	'search',
	10
));

// Register Action to Open Viewlet
const openSearchViewletKb: IKeybindings = {
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_F
};

(<IWorkbenchActionRegistry>Registry.as(ActionExtensions.WorkbenchActions)).registerWorkbenchAction(
	new SyncActionDescriptor(OpenSearchViewletAction, OpenSearchViewletAction.ID, OpenSearchViewletAction.LABEL, openSearchViewletKb),
	'View: Show Search',
	nls.localize('view', "View")
);

(<IWorkbenchActionRegistry>Registry.as(ActionExtensions.WorkbenchActions)).registerWorkbenchAction(
	new SyncActionDescriptor(ReplaceInFilesAction, ReplaceInFilesAction.ID, ReplaceInFilesAction.LABEL, {
		primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_H
	}),
	'Edit: Replace in Files',
	nls.localize('edit', "Edit")
);

// Contribute to Explorer Viewer
const actionBarRegistry = <IActionBarRegistry>Registry.as(ActionBarExtensions.Actionbar);
actionBarRegistry.registerActionBarContributor(Scope.VIEWER, ExplorerViewerActionContributor);

// Register Quick Open Handler
(<IQuickOpenRegistry>Registry.as(QuickOpenExtensions.Quickopen)).registerDefaultQuickOpenHandler(
	new QuickOpenHandlerDescriptor(
		'vs/workbench/parts/search/browser/openAnythingHandler',
		'OpenAnythingHandler',
		'',
		nls.localize('openAnythingHandlerDescription', "Open Files and Global Symbols by Name")
	)
);

(<IQuickOpenRegistry>Registry.as(QuickOpenExtensions.Quickopen)).registerQuickOpenHandler(
	new QuickOpenHandlerDescriptor(
		'vs/workbench/parts/search/browser/openAnythingHandler',
		'OpenSymbolHandler',
		ALL_SYMBOLS_PREFIX,
		[
			{
				prefix: ALL_SYMBOLS_PREFIX,
				needsEditor: false,
				description: nls.localize('openSymbolDescriptionNormal', "Open Any Symbol By Name")
			}
		]
	)
);

// Actions
const registry = <IWorkbenchActionRegistry>Registry.as(ActionExtensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(ShowAllSymbolsAction, ACTION_ID, ACTION_LABEL, {
	primary: KeyMod.CtrlCmd | KeyCode.KEY_T
}), 'Show All Symbols');

// Configuration
const configurationRegistry = <IConfigurationRegistry>Registry.as(ConfigurationExtensions.Configuration);
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
		}
	}
});