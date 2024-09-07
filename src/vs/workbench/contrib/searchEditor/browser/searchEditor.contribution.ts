/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { extname, isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { Range } from '../../../../editor/common/core/range.js';
import { ToggleCaseSensitiveKeybinding, ToggleRegexKeybinding, ToggleWholeWordKeybinding } from '../../../../editor/contrib/find/browser/findModel.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { IEditorSerializer, IEditorFactoryRegistry, EditorExtensions, DEFAULT_EDITOR_ASSOCIATION } from '../../../common/editor.js';
import { ActiveEditorContext } from '../../../common/contextkeys.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { getSearchView } from '../../search/browser/searchActionsBase.js';
import { searchNewEditorIcon, searchRefreshIcon } from '../../search/browser/searchIcons.js';
import * as SearchConstants from '../../search/common/constants.js';
import * as SearchEditorConstants from './constants.js';
import { SearchEditor } from './searchEditor.js';
import { createEditorFromSearchResult, modifySearchEditorContextLinesCommand, openNewSearchEditor, openSearchEditor, selectAllSearchEditorMatchesCommand, toggleSearchEditorCaseSensitiveCommand, toggleSearchEditorContextLinesCommand, toggleSearchEditorRegexCommand, toggleSearchEditorWholeWordCommand } from './searchEditorActions.js';
import { getOrMakeSearchEditorInput, SearchConfiguration, SearchEditorInput, SEARCH_EDITOR_EXT } from './searchEditorInput.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { VIEW_ID } from '../../../services/search/common/search.js';
import { RegisteredEditorPriority, IEditorResolverService } from '../../../services/editor/common/editorResolverService.js';
import { IWorkingCopyEditorHandler, IWorkingCopyEditorService } from '../../../services/workingCopy/common/workingCopyEditorService.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkingCopyIdentifier } from '../../../services/workingCopy/common/workingCopy.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { getActiveElement } from '../../../../base/browser/dom.js';


const OpenInEditorCommandId = 'search.action.openInEditor';
const OpenNewEditorToSideCommandId = 'search.action.openNewEditorToSide';
const FocusQueryEditorWidgetCommandId = 'search.action.focusQueryEditorWidget';
const FocusQueryEditorFilesToIncludeCommandId = 'search.action.focusFilesToInclude';
const FocusQueryEditorFilesToExcludeCommandId = 'search.action.focusFilesToExclude';

const ToggleSearchEditorCaseSensitiveCommandId = 'toggleSearchEditorCaseSensitive';
const ToggleSearchEditorWholeWordCommandId = 'toggleSearchEditorWholeWord';
const ToggleSearchEditorRegexCommandId = 'toggleSearchEditorRegex';
const IncreaseSearchEditorContextLinesCommandId = 'increaseSearchEditorContextLines';
const DecreaseSearchEditorContextLinesCommandId = 'decreaseSearchEditorContextLines';

const RerunSearchEditorSearchCommandId = 'rerunSearchEditorSearch';
const CleanSearchEditorStateCommandId = 'cleanSearchEditorState';
const SelectAllSearchEditorMatchesCommandId = 'selectAllSearchEditorMatches';



//#region Editor Descriptior
Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
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

	static readonly ID = 'workbench.contrib.searchEditor';

	constructor(
		@IEditorResolverService editorResolverService: IEditorResolverService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		editorResolverService.registerEditor(
			'*' + SEARCH_EDITOR_EXT,
			{
				id: SearchEditorInput.ID,
				label: localize('promptOpenWith.searchEditor.displayName', "Search Editor"),
				detail: DEFAULT_EDITOR_ASSOCIATION.providerDisplayName,
				priority: RegisteredEditorPriority.default,
			},
			{
				singlePerResource: true,
				canSupportResource: resource => (extname(resource) === SEARCH_EDITOR_EXT)
			},
			{
				createEditorInput: ({ resource }) => {
					return { editor: instantiationService.invokeFunction(getOrMakeSearchEditorInput, { from: 'existingFile', fileUri: resource }) };
				}
			}
		);
	}
}

registerWorkbenchContribution2(SearchEditorContribution.ID, SearchEditorContribution, WorkbenchPhase.BlockStartup);
//#endregion

//#region Input Serializer
type SerializedSearchEditor = { modelUri: string | undefined; dirty: boolean; config?: SearchConfiguration; name: string; matchRanges: Range[]; backingUri?: string };

class SearchEditorInputSerializer implements IEditorSerializer {

	canSerialize(input: SearchEditorInput) {
		return !!input.tryReadConfigSync();
	}

	serialize(input: SearchEditorInput) {
		if (!this.canSerialize(input)) {
			return undefined;
		}

		if (input.isDisposed()) {
			return JSON.stringify({ modelUri: undefined, dirty: false, config: input.tryReadConfigSync(), name: input.getName(), matchRanges: [], backingUri: input.backingUri?.toString() } satisfies SerializedSearchEditor);
		}

		let modelUri = undefined;
		if (input.modelUri.path || input.modelUri.fragment && input.isDirty()) {
			modelUri = input.modelUri.toString();
		}

		const config = input.tryReadConfigSync();
		const dirty = input.isDirty();
		const matchRanges = dirty ? input.getMatchRanges() : [];
		const backingUri = input.backingUri;

		return JSON.stringify({ modelUri, dirty, config, name: input.getName(), matchRanges, backingUri: backingUri?.toString() } satisfies SerializedSearchEditor);
	}

	deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): SearchEditorInput | undefined {
		const { modelUri, dirty, config, matchRanges, backingUri } = JSON.parse(serializedEditorInput) as SerializedSearchEditor;
		if (config && (config.query !== undefined)) {
			if (modelUri) {
				const input = instantiationService.invokeFunction(getOrMakeSearchEditorInput,
					{ from: 'model', modelUri: URI.parse(modelUri), config, backupOf: backingUri ? URI.parse(backingUri) : undefined });
				input.setDirty(dirty);
				input.setMatchRanges(matchRanges);
				return input;
			} else {
				if (backingUri) {
					return instantiationService.invokeFunction(getOrMakeSearchEditorInput,
						{ from: 'existingFile', fileUri: URI.parse(backingUri) });
				} else {
					return instantiationService.invokeFunction(getOrMakeSearchEditorInput,
						{ from: 'rawData', resultsContents: '', config });
				}
			}
		}
		return undefined;
	}
}

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(
	SearchEditorInput.ID,
	SearchEditorInputSerializer);
//#endregion

//#region Commands
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
const category = localize2('search', 'Search Editor');

export type LegacySearchEditorArgs = Partial<{
	query: string;
	includes: string;
	excludes: string;
	contextLines: number;
	wholeWord: boolean;
	caseSensitive: boolean;
	regexp: boolean;
	useIgnores: boolean;
	showIncludesExcludes: boolean;
	triggerSearch: boolean;
	focusResults: boolean;
	location: 'reuse' | 'new';
}>;

const translateLegacyConfig = (legacyConfig: LegacySearchEditorArgs & OpenSearchEditorArgs = {}): OpenSearchEditorArgs => {
	const config: OpenSearchEditorArgs = {};
	const overrides: { [K in keyof LegacySearchEditorArgs]: keyof OpenSearchEditorArgs } = {
		includes: 'filesToInclude',
		excludes: 'filesToExclude',
		wholeWord: 'matchWholeWord',
		caseSensitive: 'isCaseSensitive',
		regexp: 'isRegexp',
		useIgnores: 'useExcludeSettingsAndIgnoreFiles',
	};
	Object.entries(legacyConfig).forEach(([key, value]) => {
		(config as any)[(overrides as any)[key] ?? key] = value;
	});
	return config;
};

export type OpenSearchEditorArgs = Partial<SearchConfiguration & { triggerSearch: boolean; focusResults: boolean; location: 'reuse' | 'new' }>;
const openArgMetadata = {
	description: 'Open a new search editor. Arguments passed can include variables like ${relativeFileDirname}.',
	args: [{
		name: 'Open new Search Editor args',
		schema: {
			properties: {
				query: { type: 'string' },
				filesToInclude: { type: 'string' },
				filesToExclude: { type: 'string' },
				contextLines: { type: 'number' },
				matchWholeWord: { type: 'boolean' },
				isCaseSensitive: { type: 'boolean' },
				isRegexp: { type: 'boolean' },
				useExcludeSettingsAndIgnoreFiles: { type: 'boolean' },
				showIncludesExcludes: { type: 'boolean' },
				triggerSearch: { type: 'boolean' },
				focusResults: { type: 'boolean' },
				onlyOpenEditors: { type: 'boolean' },
			}
		}
	}]
} as const;

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'search.searchEditor.action.deleteFileResults',
			title: localize2('searchEditor.deleteResultBlock', 'Delete File Results'),
			keybinding: {
				weight: KeybindingWeight.EditorContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Backspace,
			},
			precondition: SearchEditorConstants.InSearchEditor,
			category,
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor) {
		const contextService = accessor.get(IContextKeyService).getContext(getActiveElement());
		if (contextService.getValue(SearchEditorConstants.InSearchEditor.serialize())) {
			(accessor.get(IEditorService).activeEditorPane as SearchEditor).deleteResultBlock();
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: SearchEditorConstants.OpenNewEditorCommandId,
			title: localize2('search.openNewSearchEditor', 'New Search Editor'),
			category,
			f1: true,
			metadata: openArgMetadata
		});
	}
	async run(accessor: ServicesAccessor, args: LegacySearchEditorArgs | OpenSearchEditorArgs) {
		await accessor.get(IInstantiationService).invokeFunction(openNewSearchEditor, translateLegacyConfig({ location: 'new', ...args }));
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: SearchEditorConstants.OpenEditorCommandId,
			title: localize2('search.openSearchEditor', 'Open Search Editor'),
			category,
			f1: true,
			metadata: openArgMetadata
		});
	}
	async run(accessor: ServicesAccessor, args: LegacySearchEditorArgs | OpenSearchEditorArgs) {
		await accessor.get(IInstantiationService).invokeFunction(openNewSearchEditor, translateLegacyConfig({ location: 'reuse', ...args }));
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: OpenNewEditorToSideCommandId,
			title: localize2('search.openNewEditorToSide', 'Open New Search Editor to the Side'),
			category,
			f1: true,
			metadata: openArgMetadata
		});
	}
	async run(accessor: ServicesAccessor, args: LegacySearchEditorArgs | OpenSearchEditorArgs) {
		await accessor.get(IInstantiationService).invokeFunction(openNewSearchEditor, translateLegacyConfig(args), true);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: OpenInEditorCommandId,
			title: localize2('search.openResultsInEditor', 'Open Results in Editor'),
			category,
			f1: true,
			keybinding: {
				primary: KeyMod.Alt | KeyCode.Enter,
				when: ContextKeyExpr.and(SearchConstants.SearchContext.HasSearchResults, SearchConstants.SearchContext.SearchViewFocusedKey),
				weight: KeybindingWeight.WorkbenchContrib,
				mac: {
					primary: KeyMod.CtrlCmd | KeyCode.Enter
				}
			},
		});
	}
	async run(accessor: ServicesAccessor) {
		const viewsService = accessor.get(IViewsService);
		const instantiationService = accessor.get(IInstantiationService);
		const searchView = getSearchView(viewsService);
		if (searchView) {
			await instantiationService.invokeFunction(createEditorFromSearchResult, searchView.searchResult, searchView.searchIncludePattern.getValue(), searchView.searchExcludePattern.getValue(), searchView.searchIncludePattern.onlySearchInOpenEditors());
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: RerunSearchEditorSearchCommandId,
			title: localize2('search.rerunSearchInEditor', 'Search Again'),
			category,
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyR,
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
			title: localize2('search.action.focusQueryEditorWidget', 'Focus Search Editor Input'),
			category,
			f1: true,
			precondition: SearchEditorConstants.InSearchEditor,
			keybinding: {
				primary: KeyCode.Escape,
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

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: FocusQueryEditorFilesToIncludeCommandId,
			title: localize2('search.action.focusFilesToInclude', 'Focus Search Editor Files to Include'),
			category,
			f1: true,
			precondition: SearchEditorConstants.InSearchEditor,
		});
	}
	async run(accessor: ServicesAccessor) {
		const editorService = accessor.get(IEditorService);
		const input = editorService.activeEditor;
		if (input instanceof SearchEditorInput) {
			(editorService.activeEditorPane as SearchEditor).focusFilesToIncludeInput();
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: FocusQueryEditorFilesToExcludeCommandId,
			title: localize2('search.action.focusFilesToExclude', 'Focus Search Editor Files to Exclude'),
			category,
			f1: true,
			precondition: SearchEditorConstants.InSearchEditor,
		});
	}
	async run(accessor: ServicesAccessor) {
		const editorService = accessor.get(IEditorService);
		const input = editorService.activeEditor;
		if (input instanceof SearchEditorInput) {
			(editorService.activeEditorPane as SearchEditor).focusFilesToExcludeInput();
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: ToggleSearchEditorCaseSensitiveCommandId,
			title: localize2('searchEditor.action.toggleSearchEditorCaseSensitive', 'Toggle Match Case'),
			category,
			f1: true,
			precondition: SearchEditorConstants.InSearchEditor,
			keybinding: Object.assign({
				weight: KeybindingWeight.WorkbenchContrib,
				when: SearchConstants.SearchContext.SearchInputBoxFocusedKey,
			}, ToggleCaseSensitiveKeybinding)
		});
	}
	run(accessor: ServicesAccessor) {
		toggleSearchEditorCaseSensitiveCommand(accessor);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: ToggleSearchEditorWholeWordCommandId,
			title: localize2('searchEditor.action.toggleSearchEditorWholeWord', 'Toggle Match Whole Word'),
			category,
			f1: true,
			precondition: SearchEditorConstants.InSearchEditor,
			keybinding: Object.assign({
				weight: KeybindingWeight.WorkbenchContrib,
				when: SearchConstants.SearchContext.SearchInputBoxFocusedKey,
			}, ToggleWholeWordKeybinding)
		});
	}
	run(accessor: ServicesAccessor) {
		toggleSearchEditorWholeWordCommand(accessor);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: ToggleSearchEditorRegexCommandId,
			title: localize2('searchEditor.action.toggleSearchEditorRegex', "Toggle Use Regular Expression"),
			category,
			f1: true,
			precondition: SearchEditorConstants.InSearchEditor,
			keybinding: Object.assign({
				weight: KeybindingWeight.WorkbenchContrib,
				when: SearchConstants.SearchContext.SearchInputBoxFocusedKey,
			}, ToggleRegexKeybinding)
		});
	}
	run(accessor: ServicesAccessor) {
		toggleSearchEditorRegexCommand(accessor);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: SearchEditorConstants.ToggleSearchEditorContextLinesCommandId,
			title: localize2('searchEditor.action.toggleSearchEditorContextLines', "Toggle Context Lines"),
			category,
			f1: true,
			precondition: SearchEditorConstants.InSearchEditor,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.Alt | KeyCode.KeyL,
				mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyL }
			}
		});
	}
	run(accessor: ServicesAccessor) {
		toggleSearchEditorContextLinesCommand(accessor);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: IncreaseSearchEditorContextLinesCommandId,
			title: localize2('searchEditor.action.increaseSearchEditorContextLines', "Increase Context Lines"),
			category,
			f1: true,
			precondition: SearchEditorConstants.InSearchEditor,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.Alt | KeyCode.Equal
			}
		});
	}
	run(accessor: ServicesAccessor) { modifySearchEditorContextLinesCommand(accessor, true); }
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: DecreaseSearchEditorContextLinesCommandId,
			title: localize2('searchEditor.action.decreaseSearchEditorContextLines', "Decrease Context Lines"),
			category,
			f1: true,
			precondition: SearchEditorConstants.InSearchEditor,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.Alt | KeyCode.Minus
			}
		});
	}
	run(accessor: ServicesAccessor) { modifySearchEditorContextLinesCommand(accessor, false); }
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: SelectAllSearchEditorMatchesCommandId,
			title: localize2('searchEditor.action.selectAllSearchEditorMatches', "Select All Matches"),
			category,
			f1: true,
			precondition: SearchEditorConstants.InSearchEditor,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyL,
			}
		});
	}
	run(accessor: ServicesAccessor) {
		selectAllSearchEditorMatchesCommand(accessor);
	}
});

registerAction2(class OpenSearchEditorAction extends Action2 {
	constructor() {
		super({
			id: 'search.action.openNewEditorFromView',
			title: localize('search.openNewEditor', "Open New Search Editor"),
			category,
			icon: searchNewEditorIcon,
			menu: [{
				id: MenuId.ViewTitle,
				group: 'navigation',
				order: 2,
				when: ContextKeyExpr.equals('view', VIEW_ID),
			}]
		});
	}
	run(accessor: ServicesAccessor, ...args: any[]) {
		return openSearchEditor(accessor);
	}
});
//#endregion

//#region Search Editor Working Copy Editor Handler
class SearchEditorWorkingCopyEditorHandler extends Disposable implements IWorkbenchContribution, IWorkingCopyEditorHandler {

	static readonly ID = 'workbench.contrib.searchEditorWorkingCopyEditorHandler';

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkingCopyEditorService workingCopyEditorService: IWorkingCopyEditorService,
	) {
		super();

		this._register(workingCopyEditorService.registerHandler(this));
	}

	handles(workingCopy: IWorkingCopyIdentifier): boolean {
		return workingCopy.resource.scheme === SearchEditorConstants.SearchEditorScheme;
	}

	isOpen(workingCopy: IWorkingCopyIdentifier, editor: EditorInput): boolean {
		if (!this.handles(workingCopy)) {
			return false;
		}

		return editor instanceof SearchEditorInput && isEqual(workingCopy.resource, editor.modelUri);
	}

	createEditor(workingCopy: IWorkingCopyIdentifier): EditorInput {
		const input = this.instantiationService.invokeFunction(getOrMakeSearchEditorInput, { from: 'model', modelUri: workingCopy.resource });
		input.setDirty(true);

		return input;
	}
}

registerWorkbenchContribution2(SearchEditorWorkingCopyEditorHandler.ID, SearchEditorWorkingCopyEditorHandler, WorkbenchPhase.BlockRestore);
//#endregion
