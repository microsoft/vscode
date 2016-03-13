/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/search.contribution';
import {Registry} from 'vs/platform/platform';
import {ViewletRegistry, Extensions as ViewletExtensions, ViewletDescriptor, ToggleViewletAction} from 'vs/workbench/browser/viewlet';
import {IConfigurationRegistry, Extensions as ConfigurationExtensions} from 'vs/platform/configuration/common/configurationRegistry';
import nls = require('vs/nls');
import {IAction} from 'vs/base/common/actions';
import {asFileResource} from 'vs/workbench/parts/files/common/files';
import {SyncActionDescriptor, DeferredAction} from 'vs/platform/actions/common/actions';
import {Separator} from 'vs/base/browser/ui/actionbar/actionbar';
import {Scope, IActionBarRegistry, Extensions as ActionBarExtensions, ActionBarContributor} from 'vs/workbench/browser/actionBarRegistry';
import {IWorkbenchActionRegistry, Extensions as ActionExtensions} from 'vs/workbench/common/actionRegistry';
import {QuickOpenHandlerDescriptor, IQuickOpenRegistry, Extensions as QuickOpenExtensions} from 'vs/workbench/browser/quickopen';
import {QuickOpenAction} from 'vs/workbench/browser/actions/quickOpenAction';
import {KeybindingsRegistry} from 'vs/platform/keybinding/common/keybindingsRegistry';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {AsyncDescriptor} from 'vs/platform/instantiation/common/descriptors';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {KbExpr, IKeybindings} from 'vs/platform/keybinding/common/keybindingService';
import {IQuickOpenService} from 'vs/workbench/services/quickopen/common/quickOpenService';
import {IViewletService} from 'vs/workbench/services/viewlet/common/viewletService';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';

export const VIEWLET_ID = 'workbench.view.search';

KeybindingsRegistry.registerCommandDesc({
	id: 'workbench.action.search.toggleQueryDetails',
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	context: KbExpr.has('searchViewletVisible'),
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_J,
	handler: accessor => {
		let viewletService = accessor.get(IViewletService);
		viewletService.openViewlet(VIEWLET_ID, true)
			.then(viewlet => (<any>viewlet).toggleFileTypes());
	}
});

class OpenSearchViewletAction extends ToggleViewletAction {
	public static ID = VIEWLET_ID;
	public static LABEL = nls.localize('showSearchViewlet', "Show Search");

	constructor(id: string, label: string, @IViewletService viewletService: IViewletService, @IWorkbenchEditorService editorService: IWorkbenchEditorService) {
		super(id, label, VIEWLET_ID, viewletService, editorService);
	}
}

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
				new AsyncDescriptor('vs/workbench/parts/search/browser/searchViewlet', 'FindInFolderAction', fileResource.resource),
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
	nls.localize('view', "View")
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
		nls.localize('openAnythingHandlerDescription', "Open Files and Symbols by Name")
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
				description: nls.localize('openSymbolDescriptionNormal', "Open Symbol By Name")
			}
		]
	)
);

// Actions
const registry = <IWorkbenchActionRegistry>Registry.as(ActionExtensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(ShowAllSymbolsAction, ACTION_ID, ACTION_LABEL, {
	primary: KeyMod.CtrlCmd | KeyCode.KEY_T
}));

// Configuration
const configurationRegistry = <IConfigurationRegistry>Registry.as(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	'id': 'search',
	'order': 10,
	'title': nls.localize('searchConfigurationTitle', "Search configuration"),
	'type': 'object',
	'properties': {
		'search.exclude': {
			'type': 'object',
			'description': nls.localize('exclude', "Configure glob patterns for excluding files and folders in searches. Inherits all glob patterns from the file.exclude setting."),
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