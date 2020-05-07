/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import * as objects from 'vs/base/common/objects';
import { endsWith } from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { ToggleCaseSensitiveKeybinding, ToggleRegexKeybinding, ToggleWholeWordKeybinding } from 'vs/editor/contrib/find/findModel';
import { localize } from 'vs/nls';
import { MenuId, SyncActionDescriptor, registerAction2, Action2 } from 'vs/platform/actions/common/actions';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { EditorDescriptor, Extensions as EditorExtensions, IEditorRegistry } from 'vs/workbench/browser/editor';
import { Extensions as ActionExtensions, IWorkbenchActionRegistry } from 'vs/workbench/common/actions';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { Extensions as EditorInputExtensions, IEditorInputFactory, IEditorInputFactoryRegistry, ActiveEditorContext } from 'vs/workbench/common/editor';
import * as SearchConstants from 'vs/workbench/contrib/search/common/constants';
import * as SearchEditorConstants from 'vs/workbench/contrib/searchEditor/browser/constants';
import { SearchEditor } from 'vs/workbench/contrib/searchEditor/browser/searchEditor';
import { modifySearchEditorContextLinesCommand, OpenSearchEditorAction, selectAllSearchEditorMatchesCommand, toggleSearchEditorCaseSensitiveCommand, toggleSearchEditorContextLinesCommand, toggleSearchEditorRegexCommand, toggleSearchEditorWholeWordCommand, createEditorFromSearchResult, openNewSearchEditor } from 'vs/workbench/contrib/searchEditor/browser/searchEditorActions';
import { getOrMakeSearchEditorInput, SearchEditorInput, SearchConfiguration } from 'vs/workbench/contrib/searchEditor/browser/searchEditorInput';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { parseSavedSearchEditor } from 'vs/workbench/contrib/searchEditor/browser/searchEditorSerialization';
import { Range } from 'vs/editor/common/core/range';
import { searchRefreshIcon } from 'vs/workbench/contrib/search/browser/searchIcons';
import { IViewsService } from 'vs/workbench/common/views';
import { getSearchView } from 'vs/workbench/contrib/search/browser/searchActions';


const OpenInEditorCommandId = 'search.action.openInEditor';
const OpenNewEditorToSideCommandId = 'search.action.openNewEditorToSide';
const FocusQueryEditorWidgetCommandId = 'search.action.focusQueryEditorWidget';

const ToggleSearchEditorCaseSensitiveCommandId = 'toggleSearchEditorCaseSensitive';
const ToggleSearchEditorWholeWordCommandId = 'toggleSearchEditorWholeWord';
const ToggleSearchEditorRegexCommandId = 'toggleSearchEditorRegex';
const ToggleSearchEditorContextLinesCommandId = 'toggleSearchEditorContextLines';
const IncreaseSearchEditorContextLinesCommandId = 'increaseSearchEditorContextLines';
const DecreaseSearchEditorContextLinesCommandId = 'decreaseSearchEditorContextLines';

const RerunSearchEditorSearchCommandId = 'rerunSearchEditorSearch';
const CleanSearchEditorStateCommandId = 'cleanSearchEditorState';
const SelectAllSearchEditorMatchesCommandId = 'selectAllSearchEditorMatches';



//#region Editor Descriptior
Registry.as<IEditorRegistry>(EditorExtensions.Editors).registerEditor(
	EditorDescriptor.create(
		SearchEditor,
		SearchEditor.ID,
		localize('searchEditor', "Search Editor")
	),
	[
		new SyncDescriptor(SearchEditorInput)
	]
);
//#endregion

//#region Startup Contribution
class SearchEditorContribution implements IWorkbenchContribution {
	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@ITelemetryService protected readonly telemetryService: ITelemetryService,
		@IContextKeyService protected readonly contextKeyService: IContextKeyService,
	) {

		this.editorService.overrideOpenEditor({
			open: (editor, options, group) => {
				const resource = editor.resource;
				if (!resource) { return undefined; }

				if (!endsWith(resource.path, '.code-search')) {
					return undefined;
				}

				if (group.isOpened(editor) && editor instanceof SearchEditorInput) {
					return undefined;
				}

				this.telemetryService.publicLog2('searchEditor/openSavedSearchEditor');

				return {
					override: (async () => {
						const { config } = await instantiationService.invokeFunction(parseSavedSearchEditor, resource);
						const input = instantiationService.invokeFunction(getOrMakeSearchEditorInput, { backingUri: resource, config });
						return editorService.openEditor(input, { ...options, ignoreOverrides: true }, group);
					})()
				};
			}
		});
	}
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(SearchEditorContribution, LifecyclePhase.Starting);
//#endregion

//#region Input Factory
type SerializedSearchEditor = { modelUri: string, dirty: boolean, config: SearchConfiguration, name: string, matchRanges: Range[], backingUri: string };
class SearchEditorInputFactory implements IEditorInputFactory {

	canSerialize() { return true; }

	serialize(input: SearchEditorInput) {
		let modelUri = undefined;
		if (input.modelUri.path || input.modelUri.fragment) {
			modelUri = input.modelUri.toString();
		}
		if (!modelUri) { return undefined; }

		const config = input.config;
		const dirty = input.isDirty();
		const matchRanges = input.getMatchRanges();
		const backingUri = input.backingUri;

		return JSON.stringify({ modelUri: modelUri.toString(), dirty, config, name: input.getName(), matchRanges, backingUri: backingUri?.toString() } as SerializedSearchEditor);
	}

	deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): SearchEditorInput | undefined {
		const { modelUri, dirty, config, matchRanges, backingUri } = JSON.parse(serializedEditorInput) as SerializedSearchEditor;
		if (config && (config.query !== undefined) && (modelUri !== undefined)) {
			const input = instantiationService.invokeFunction(getOrMakeSearchEditorInput, { config, modelUri: URI.parse(modelUri), backingUri: backingUri ? URI.parse(backingUri) : undefined });
			input.setDirty(dirty);
			input.setMatchRanges(matchRanges);
			return input;
		}
		return undefined;
	}
}

Registry.as<IEditorInputFactoryRegistry>(EditorInputExtensions.EditorInputFactories).registerEditorInputFactory(
	SearchEditorInput.ID,
	SearchEditorInputFactory);
//#endregion

//#region Commands
KeybindingsRegistry.registerCommandAndKeybindingRule(objects.assign({
	id: ToggleSearchEditorCaseSensitiveCommandId,
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(SearchEditorConstants.InSearchEditor, SearchConstants.SearchInputBoxFocusedKey),
	handler: toggleSearchEditorCaseSensitiveCommand
}, ToggleCaseSensitiveKeybinding));

KeybindingsRegistry.registerCommandAndKeybindingRule(objects.assign({
	id: ToggleSearchEditorWholeWordCommandId,
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(SearchEditorConstants.InSearchEditor, SearchConstants.SearchInputBoxFocusedKey),
	handler: toggleSearchEditorWholeWordCommand
}, ToggleWholeWordKeybinding));

KeybindingsRegistry.registerCommandAndKeybindingRule(objects.assign({
	id: ToggleSearchEditorRegexCommandId,
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(SearchEditorConstants.InSearchEditor, SearchConstants.SearchInputBoxFocusedKey),
	handler: toggleSearchEditorRegexCommand
}, ToggleRegexKeybinding));

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: ToggleSearchEditorContextLinesCommandId,
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(SearchEditorConstants.InSearchEditor),
	handler: toggleSearchEditorContextLinesCommand,
	primary: KeyMod.Alt | KeyCode.KEY_L,
	mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_L }
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: IncreaseSearchEditorContextLinesCommandId,
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(SearchEditorConstants.InSearchEditor),
	handler: (accessor: ServicesAccessor) => modifySearchEditorContextLinesCommand(accessor, true),
	primary: KeyMod.Alt | KeyCode.US_EQUAL
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: DecreaseSearchEditorContextLinesCommandId,
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(SearchEditorConstants.InSearchEditor),
	handler: (accessor: ServicesAccessor) => modifySearchEditorContextLinesCommand(accessor, false),
	primary: KeyMod.Alt | KeyCode.US_MINUS
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: SelectAllSearchEditorMatchesCommandId,
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(SearchEditorConstants.InSearchEditor),
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_L,
	handler: selectAllSearchEditorMatchesCommand
});

CommandsRegistry.registerCommand(
	CleanSearchEditorStateCommandId,
	(accessor: ServicesAccessor) => {
		const activeEditorPane = accessor.get(IEditorService).activeEditorPane;
		if (activeEditorPane instanceof SearchEditor) {
			activeEditorPane.cleanState();
		}
	});
//#endregion

//#region Actions
const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
const category = localize('search', "Search Editor");

// TODO: Not an action2 becuase used in view pane container action bar, which uses actions
registry.registerWorkbenchAction(
	SyncActionDescriptor.from(OpenSearchEditorAction),
	'Search Editor: Open New Search Editor', category);

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: OpenInEditorCommandId,
			title: localize('search.openResultsInEditor', "Open Results in Editor"),
			category,
			f1: true,
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyCode.Enter,
				when: ContextKeyExpr.and(SearchConstants.HasSearchResults, SearchConstants.SearchViewFocusedKey),
				weight: KeybindingWeight.WorkbenchContrib
			},
		});
	}
	async run(accessor: ServicesAccessor) {
		const viewsService = accessor.get(IViewsService);
		const instantiationService = accessor.get(IInstantiationService);
		const searchView = getSearchView(viewsService);
		if (searchView) {
			await instantiationService.invokeFunction(createEditorFromSearchResult, searchView.searchResult, searchView.searchIncludePattern.getValue(), searchView.searchExcludePattern.getValue());
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: OpenNewEditorToSideCommandId,
			title: localize('search.openNewEditorToSide', "Open New Search Editor to Side"),
			category,
			f1: true,
		});
	}
	async run(accessor: ServicesAccessor) {
		const instantiationService = accessor.get(IInstantiationService);
		await instantiationService.invokeFunction(openNewSearchEditor, true);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: RerunSearchEditorSearchCommandId,
			title: localize('search.rerunSearchInEditor', "Search Again"),
			category,
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_R,
				when: SearchEditorConstants.InSearchEditor,
				weight: KeybindingWeight.EditorContrib
			},
			icon: searchRefreshIcon,
			menu: [{
				id: MenuId.EditorTitle,
				group: 'navigation',
				when: ActiveEditorContext.isEqualTo(SearchEditorConstants.SearchEditorID)
			},
			{
				id: MenuId.CommandPalette,
				when: ActiveEditorContext.isEqualTo(SearchEditorConstants.SearchEditorID)
			}]
		});
	}
	async run(accessor: ServicesAccessor) {
		const editorService = accessor.get(IEditorService);
		const input = editorService.activeEditor;
		if (input instanceof SearchEditorInput) {
			(editorService.activeEditorPane as SearchEditor).triggerSearch({ resetCursor: false });
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: FocusQueryEditorWidgetCommandId,
			title: localize('search.action.focusQueryEditorWidget', "Focus Search Editor Input"),
			category,
			menu: {
				id: MenuId.CommandPalette,
				when: ActiveEditorContext.isEqualTo(SearchEditorConstants.SearchEditorID)
			},
			keybinding: {
				primary: KeyCode.Escape,
				when: SearchEditorConstants.InSearchEditor,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}
	async run(accessor: ServicesAccessor) {
		const editorService = accessor.get(IEditorService);
		const input = editorService.activeEditor;
		if (input instanceof SearchEditorInput) {
			(editorService.activeEditorPane as SearchEditor).focusSearchInput();
		}
	}
});
//#endregion
