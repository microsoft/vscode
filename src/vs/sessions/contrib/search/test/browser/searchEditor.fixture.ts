/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../../../browser/parts/media/editorPart.css';
import { RUN_EMPTY_SEARCH_COMMAND_ID, SearchEditorEmptyStateContribution } from '../../browser/searchEditorEmptyState.contribution.js';
import { $, append, Dimension } from '../../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ITextResourceConfigurationService } from '../../../../../editor/common/services/textResourceConfiguration.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { IEditorProgressService } from '../../../../../platform/progress/common/progress.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { INotebookEditorService } from '../../../../../workbench/contrib/notebook/browser/services/notebookEditorService.js';
import { IReplaceService } from '../../../../../workbench/contrib/search/browser/replace.js';
import { SearchEditor } from '../../../../../workbench/contrib/searchEditor/browser/searchEditor.js';
import { SearchEditorScheme } from '../../../../../workbench/contrib/searchEditor/browser/constants.js';
import { getOrMakeSearchEditorInput } from '../../../../../workbench/contrib/searchEditor/browser/searchEditorInput.js';
import { IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { IPathService } from '../../../../../workbench/services/path/common/pathService.js';
import { ISearchService } from '../../../../../workbench/services/search/common/search.js';
import { ITextFileService } from '../../../../../workbench/services/textfile/common/textfiles.js';
import { IWorkingCopyBackupService } from '../../../../../workbench/services/workingCopy/common/workingCopyBackup.js';
import { IWorkingCopyService } from '../../../../../workbench/services/workingCopy/common/workingCopyService.js';
import { INotebookSearchService } from '../../../../../workbench/contrib/search/common/notebookSearch.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { TestEditorGroupsService, TestEditorGroupView, TestEditorService, TestPathService, TestTextResourceConfigurationService, TestWorkingCopyService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { TestFileService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { FixtureKeybindingService } from '../../../../test/browser/addTabFixtureUtils.js';
import { NEW_FILE_TAB_COMMAND_ID } from '../../../../common/sessionCommands.js';
import { Codicon } from '../../../../../base/common/codicons.js';

let modelCounter = 0;

async function renderSearchEditor({ container, disposableStore, theme }: ComponentFixtureContext, compact: boolean, results?: string, width = 600, query = '', minimap = false): Promise<void> {
	const height = results === undefined ? 200 : 400;
	container.style.width = `${width}px`;
	container.style.height = `${height}px`;
	container.classList.add('agent-sessions-workbench', 'dock-detail-panel');

	const part = append(container, $('.part.editor'));
	part.style.backgroundColor = 'var(--vscode-editor-background)';
	const groupContainer = append(part, $('.editor-group-container'));
	groupContainer.classList.toggle('editor-tabs-compact-height', compact);
	const group = new TestEditorGroupView(1);
	const configurationService = new TestConfigurationService({
		editor: { minimap: { enabled: minimap } },
		search: { searchOnType: false, searchEditor: { defaultNumberOfContextLines: 1 } },
	});
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: reg => {
			registerWorkbenchServices(reg);
			reg.define(IMenuService, MenuService);
			reg.defineInstance(IContextKeyService, new class extends MockContextKeyService {
				override contextMatchesRules(): boolean { return true; }
			});
			reg.defineInstance(IKeybindingService, new FixtureKeybindingService([
				{ id: RUN_EMPTY_SEARCH_COMMAND_ID, title: 'Run Search', icon: Codicon.search, keybinding: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyR },
				{ id: NEW_FILE_TAB_COMMAND_ID, title: 'Open Files', icon: Codicon.files, keybinding: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyE },
			]));
			reg.defineInstance(IConfigurationService, configurationService);
			reg.defineInstance(ITextResourceConfigurationService, new TestTextResourceConfigurationService(configurationService));
			reg.defineInstance(IEditorGroupsService, new TestEditorGroupsService([group]));
			reg.define(IEditorService, TestEditorService);
			reg.define(IFileService, TestFileService);
			reg.define(IUriIdentityService, UriIdentityService);
			reg.define(IWorkingCopyService, TestWorkingCopyService);
			reg.define(IPathService, TestPathService);
			reg.defineInstance(ITextFileService, new class extends mock<ITextFileService>() { }());
			reg.defineInstance(IFileDialogService, new class extends mock<IFileDialogService>() { }());
			reg.definePartialInstance(IWorkingCopyBackupService, { resolve: async () => undefined });
			reg.defineInstance(IEditorProgressService, new class extends mock<IEditorProgressService>() { }());
			reg.defineInstance(ISearchService, new class extends mock<ISearchService>() { }());
			reg.defineInstance(INotebookSearchService, new class extends mock<INotebookSearchService>() { }());
			reg.defineInstance(IReplaceService, new class extends mock<IReplaceService>() { }());
			reg.definePartialInstance(INotebookEditorService, { onDidAddNotebookEditor: Event.None });
		},
	});
	const editor = disposableStore.add(instantiationService.createInstance(SearchEditor, group));
	editor.create(groupContainer);
	if (results !== undefined) {
		const input = disposableStore.add(instantiationService.invokeFunction(getOrMakeSearchEditorInput, {
			from: 'rawData',
			resultsContents: results,
			config: { query },
			modelUri: URI.from({ scheme: SearchEditorScheme, fragment: `fixture-${modelCounter++}` }),
		}));
		await editor.setInput(input, { preserveFocus: true }, { newInGroup: true }, CancellationToken.None);
		editor.getControl().getContribution(SearchEditorEmptyStateContribution.ID);
	}
	editor.layout(new Dimension(width, height));
}

export default defineThemedFixtureGroup({ path: 'sessions/' }, {
	Default: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast'],
		expectedVisualDescriptions: ['The search input and context controls have visible breathing room above and below them, separating the controls from the horizontal results separator.'],
		render: context => renderSearchEditor(context, false),
	}),
	Compact: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast'],
		expectedVisualDescriptions: ['With compact editor tabs, the full-height search controls retain the same vertical breathing room and separation from the results separator as with default editor tabs.'],
		render: context => renderSearchEditor(context, true),
	}),
	Empty: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: ['Run Search aligns vertically with the main empty panel first action. A plain search field sits above the buttons, followed by Open Files, without case, word, regex, context-line, or search-details controls.'],
		render: context => renderSearchEditor(context, false, ''),
	}),
	EmptyCompact: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderSearchEditor(context, true, ''),
	}),
	EmptyWithMinimap: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: ['All shortcut chips remain fully visible and unobstructed even with the editor minimap enabled.'],
		render: context => renderSearchEditor(context, false, '', 600, '', true),
	}),
	EmptyNarrow: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderSearchEditor(context, false, '', 240),
	}),
	Results: defineComponentFixture({
		render: context => renderSearchEditor(context, false, '1 result - 1 file\n\nsrc/app.ts:\n  1: const message = "Hello";', 600, 'Hello'),
	}),
	NoResults: defineComponentFixture({
		render: context => renderSearchEditor(context, false, 'No Results\n', 600, 'missing'),
	}),
	RestoredQuery: defineComponentFixture({
		render: context => renderSearchEditor(context, false, '', 600, 'Hello'),
	}),
});
