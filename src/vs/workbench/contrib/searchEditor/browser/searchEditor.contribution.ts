/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import * as objects from 'vs/base/common/objects';
import { ToggleCaseSensitiveKeybinding, ToggleRegexKeybinding, ToggleWholeWordKeybinding } from 'vs/editor/contrib/find/findModel';
import { localize } from 'vs/nls';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorDescriptor, Extensions as EditorExtensions, IEditorRegistry } from 'vs/workbench/browser/editor';
import { Extensions as ActionExtensions, IWorkbenchActionRegistry } from 'vs/workbench/common/actions';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { Extensions as EditorInputExtensions, IEditorInputFactoryRegistry, IEditorInputFactory } from 'vs/workbench/common/editor';
import * as SearchEditorConstants from 'vs/workbench/contrib/searchEditor/browser/constants';
import * as SearchConstants from 'vs/workbench/contrib/search/common/constants';
import { SearchEditor } from 'vs/workbench/contrib/searchEditor/browser/searchEditor';
import { OpenResultsInEditorAction, OpenSearchEditorAction, ReRunSearchEditorSearchAction, toggleSearchEditorCaseSensitiveCommand, toggleSearchEditorContextLinesCommand, toggleSearchEditorRegexCommand, toggleSearchEditorWholeWordCommand } from 'vs/workbench/contrib/searchEditor/browser/searchEditorActions';
import { SearchEditorInput, getOrMakeSearchEditorInput } from 'vs/workbench/contrib/searchEditor/browser/searchEditorInput';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { endsWith } from 'vs/base/common/strings';
import { FileEditorInput } from 'vs/workbench/contrib/files/common/editors/fileEditorInput';
import { ISearchConfigurationProperties } from 'vs/workbench/services/search/common/search';
import { URI } from 'vs/base/common/uri';

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
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		const enableSearchEditorPreview = SearchEditorConstants.EnableSearchEditorPreview.bindTo(this.contextKeyService);

		enableSearchEditorPreview.set(this.searchConfig.enableSearchEditorPreview);
		configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('search.previewSearchEditor')) {
				enableSearchEditorPreview.set(this.searchConfig.enableSearchEditorPreview);
			}
		});

		this.editorService.overrideOpenEditor((editor, options, group) => {
			const resource = editor.getResource();
			if (!resource ||
				!(endsWith(resource.path, '.code-search') || resource.scheme === SearchEditorConstants.SearchEditorScheme) ||
				!(editor instanceof FileEditorInput || (resource.scheme === SearchEditorConstants.SearchEditorScheme))) {
				return undefined;
			}

			if (group.isOpened(editor)) {
				return undefined;
			}

			this.telemetryService.publicLog2('searchEditor/openSavedSearchEditor');
			const input = instantiationService.invokeFunction(getOrMakeSearchEditorInput, { uri: resource });
			const opened = editorService.openEditor(input, { ...options, pinned: resource.scheme === SearchEditorConstants.SearchEditorScheme, ignoreOverrides: true }, group);
			return { override: Promise.resolve(opened) };
		});
	}

	private get searchConfig(): ISearchConfigurationProperties {
		return this.configurationService.getValue<ISearchConfigurationProperties>('search');
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
		const highlights = input.highlights;

		return JSON.stringify({ resource, dirty, config, viewState: input.viewState, name: input.getName(), highlights });
	}

	deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): SearchEditorInput | undefined {
		const { resource, dirty, config, viewState, highlights } = JSON.parse(serializedEditorInput);
		if (config && (config.query !== undefined)) {
			const input = instantiationService.invokeFunction(getOrMakeSearchEditorInput, { config, uri: URI.parse(resource) });
			input.viewState = viewState;
			input.setDirty(dirty);
			input.setHighlights(highlights);
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
//#endregion

//#region Actions
const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
const category = localize('search', "Search Editor");

registry.registerWorkbenchAction(
	SyncActionDescriptor.create(ReRunSearchEditorSearchAction, ReRunSearchEditorSearchAction.ID, ReRunSearchEditorSearchAction.LABEL),
	'Search Editor: Rerun search', category, ContextKeyExpr.and(SearchEditorConstants.InSearchEditor)
);

registry.registerWorkbenchAction(
	SyncActionDescriptor.create(OpenResultsInEditorAction, OpenResultsInEditorAction.ID, OpenResultsInEditorAction.LABEL,
		{ mac: { primary: KeyMod.CtrlCmd | KeyCode.Enter } },
		ContextKeyExpr.and(SearchConstants.HasSearchResults, SearchConstants.SearchViewFocusedKey, SearchEditorConstants.EnableSearchEditorPreview)),
	'Search: Open Results in Editor', category,
	ContextKeyExpr.and(SearchEditorConstants.EnableSearchEditorPreview));

registry.registerWorkbenchAction(
	SyncActionDescriptor.create(OpenSearchEditorAction, OpenSearchEditorAction.ID, OpenSearchEditorAction.LABEL),
	'Search: Open New Search Editor', category,
	ContextKeyExpr.and(SearchEditorConstants.EnableSearchEditorPreview));
//#endregion
