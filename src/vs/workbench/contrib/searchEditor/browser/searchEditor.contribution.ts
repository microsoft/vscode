/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import * as objects from 'vs/base/common/objects';
import { endsWith } from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';
import { ToggleCaseSensitiveKeybinding, ToggleRegexKeybinding, ToggleWholeWordKeybinding } from 'vs/editor/contrib/find/findModel';
import { localize } from 'vs/nls';
import { SyncActionDescriptor, MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
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
import { OpenResultsInEditorAction, OpenSearchEditorAction, toggleSearchEditorCaseSensitiveCommand, toggleSearchEditorContextLinesCommand, toggleSearchEditorRegexCommand, toggleSearchEditorWholeWordCommand, selectAllSearchEditorMatchesCommand, RerunSearchEditorSearchAction, OpenSearchEditorToSideAction, modifySearchEditorContextLinesCommand } from 'vs/workbench/contrib/searchEditor/browser/searchEditorActions';
import { getOrMakeSearchEditorInput, SearchEditorInput } from 'vs/workbench/contrib/searchEditor/browser/searchEditorInput';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { FileEditorInput } from 'vs/workbench/contrib/files/common/editors/fileEditorInput';

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

		this.editorService.overrideOpenEditor((editor, options, group) => {
			let resource = editor.resource;
			if (!resource) { return undefined; }

			if (resource.scheme === SearchEditorConstants.SearchEditorBodyScheme) {
				resource = resource.with({ scheme: SearchEditorConstants.SearchEditorScheme });
			}

			if (resource.scheme !== SearchEditorConstants.SearchEditorScheme
				&& !(endsWith(resource.path, '.code-search') && editor instanceof FileEditorInput)) {
				return undefined;
			}

			if (group.isOpened(editor)) {
				return undefined;
			}

			if (endsWith(resource.path, '.code-search')) {
				this.telemetryService.publicLog2('searchEditor/openSavedSearchEditor');
			}

			const input = instantiationService.invokeFunction(getOrMakeSearchEditorInput, { uri: resource });
			const opened = editorService.openEditor(input, { ...options, pinned: resource.scheme === SearchEditorConstants.SearchEditorScheme, ignoreOverrides: true }, group);
			return { override: Promise.resolve(opened) };
		});
	}
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(SearchEditorContribution, LifecyclePhase.Starting);
//#endregion

//#region Input Factory
class SearchEditorInputFactory implements IEditorInputFactory {

	canSerialize() { return true; }

	serialize(input: SearchEditorInput) {
		let resource = undefined;
		if (input.resource.path || input.resource.fragment) {
			resource = input.resource.toString();
		}

		const config = input.getConfigSync();
		const dirty = input.isDirty();
		const matchRanges = input.getMatchRanges();

		return JSON.stringify({ resource, dirty, config, name: input.getName(), matchRanges });
	}

	deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): SearchEditorInput | undefined {
		const { resource, dirty, config, matchRanges } = JSON.parse(serializedEditorInput);
		if (config && (config.query !== undefined)) {
			const input = instantiationService.invokeFunction(getOrMakeSearchEditorInput, { config, uri: URI.parse(resource) });
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
	id: SearchEditorConstants.ToggleSearchEditorCaseSensitiveCommandId,
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(SearchEditorConstants.InSearchEditor, SearchConstants.SearchInputBoxFocusedKey),
	handler: toggleSearchEditorCaseSensitiveCommand
}, ToggleCaseSensitiveKeybinding));

KeybindingsRegistry.registerCommandAndKeybindingRule(objects.assign({
	id: SearchEditorConstants.ToggleSearchEditorWholeWordCommandId,
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(SearchEditorConstants.InSearchEditor, SearchConstants.SearchInputBoxFocusedKey),
	handler: toggleSearchEditorWholeWordCommand
}, ToggleWholeWordKeybinding));

KeybindingsRegistry.registerCommandAndKeybindingRule(objects.assign({
	id: SearchEditorConstants.ToggleSearchEditorRegexCommandId,
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(SearchEditorConstants.InSearchEditor, SearchConstants.SearchInputBoxFocusedKey),
	handler: toggleSearchEditorRegexCommand
}, ToggleRegexKeybinding));

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: SearchEditorConstants.ToggleSearchEditorContextLinesCommandId,
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(SearchEditorConstants.InSearchEditor),
	handler: toggleSearchEditorContextLinesCommand,
	primary: KeyMod.Alt | KeyCode.KEY_L,
	mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_L }
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: SearchEditorConstants.IncreaseSearchEditorContextLinesCommandId,
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(SearchEditorConstants.InSearchEditor),
	handler: (accessor: ServicesAccessor) => modifySearchEditorContextLinesCommand(accessor, true),
	primary: KeyMod.Alt | KeyCode.KEY_L,
	mac: { primary: KeyMod.Alt | KeyCode.US_EQUAL }
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: SearchEditorConstants.DecreaseSearchEditorContextLinesCommandId,
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(SearchEditorConstants.InSearchEditor),
	handler: (accessor: ServicesAccessor) => modifySearchEditorContextLinesCommand(accessor, false),
	primary: KeyMod.Alt | KeyCode.KEY_L,
	mac: { primary: KeyMod.Alt | KeyCode.US_MINUS }
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: SearchEditorConstants.SelectAllSearchEditorMatchesCommandId,
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(SearchEditorConstants.InSearchEditor),
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_L,
	handler: selectAllSearchEditorMatchesCommand
});

CommandsRegistry.registerCommand(
	SearchEditorConstants.CleanSearchEditorStateCommandId,
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

registry.registerWorkbenchAction(
	SyncActionDescriptor.create(OpenResultsInEditorAction, OpenResultsInEditorAction.ID, OpenResultsInEditorAction.LABEL,
		{ mac: { primary: KeyMod.CtrlCmd | KeyCode.Enter } },
		ContextKeyExpr.and(SearchConstants.HasSearchResults, SearchConstants.SearchViewFocusedKey)),
	'Search Editor: Open Results in Editor', category);

registry.registerWorkbenchAction(
	SyncActionDescriptor.create(OpenSearchEditorAction, OpenSearchEditorAction.ID, OpenSearchEditorAction.LABEL),
	'Search Editor: Open New Search Editor', category);

registry.registerWorkbenchAction(
	SyncActionDescriptor.create(OpenSearchEditorToSideAction, OpenSearchEditorToSideAction.ID, OpenSearchEditorToSideAction.LABEL),
	'Search Editor: Open New Search Editor to Side', category);

registry.registerWorkbenchAction(SyncActionDescriptor.create(RerunSearchEditorSearchAction, RerunSearchEditorSearchAction.ID, RerunSearchEditorSearchAction.LABEL,
	{ mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_R } }, ContextKeyExpr.and(SearchEditorConstants.InSearchEditor)),
	'Search Editor: Search Again', category);
//#endregion


MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
	command: {
		id: RerunSearchEditorSearchAction.ID,
		title: RerunSearchEditorSearchAction.LABEL,
		icon: { id: 'codicon/refresh' },
	},
	group: 'navigation',
	when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(SearchEditorConstants.SearchEditorID))
});
