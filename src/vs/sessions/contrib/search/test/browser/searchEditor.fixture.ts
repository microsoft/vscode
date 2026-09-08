/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../../../browser/parts/media/editorPart.css';
import { $, append, Dimension } from '../../../../../base/browser/dom.js';
import { Event } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ITextResourceConfigurationService } from '../../../../../editor/common/services/textResourceConfiguration.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IEditorProgressService } from '../../../../../platform/progress/common/progress.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { INotebookEditorService } from '../../../../../workbench/contrib/notebook/browser/services/notebookEditorService.js';
import { IReplaceService } from '../../../../../workbench/contrib/search/browser/replace.js';
import { SearchEditor } from '../../../../../workbench/contrib/searchEditor/browser/searchEditor.js';
import { IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { ISearchService } from '../../../../../workbench/services/search/common/search.js';
import { INotebookSearchService } from '../../../../../workbench/contrib/search/common/notebookSearch.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { TestEditorGroupsService, TestEditorGroupView, TestEditorService, TestTextResourceConfigurationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { TestFileService } from '../../../../../workbench/test/common/workbenchTestServices.js';

function renderSearchEditor({ container, disposableStore, theme }: ComponentFixtureContext, compact: boolean): void {
	const width = 600;
	const height = 200;
	container.style.width = `${width}px`;
	container.style.height = `${height}px`;
	container.classList.add('agent-sessions-workbench', 'dock-detail-panel');

	const part = append(container, $('.part.editor'));
	const groupContainer = append(part, $('.editor-group-container'));
	groupContainer.classList.toggle('editor-tabs-compact-height', compact);
	const group = new TestEditorGroupView(1);
	const configurationService = new TestConfigurationService({
		editor: { minimap: { enabled: false } },
		search: { searchOnType: false, searchEditor: { defaultNumberOfContextLines: 1 } },
	});
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: reg => {
			registerWorkbenchServices(reg);
			reg.defineInstance(IConfigurationService, configurationService);
			reg.defineInstance(ITextResourceConfigurationService, new TestTextResourceConfigurationService(configurationService));
			reg.defineInstance(IEditorGroupsService, new TestEditorGroupsService([group]));
			reg.define(IEditorService, TestEditorService);
			reg.define(IFileService, TestFileService);
			reg.define(IUriIdentityService, UriIdentityService);
			reg.defineInstance(IEditorProgressService, new class extends mock<IEditorProgressService>() { }());
			reg.defineInstance(ISearchService, new class extends mock<ISearchService>() { }());
			reg.defineInstance(INotebookSearchService, new class extends mock<INotebookSearchService>() { }());
			reg.defineInstance(IReplaceService, new class extends mock<IReplaceService>() { }());
			reg.definePartialInstance(INotebookEditorService, { onDidAddNotebookEditor: Event.None });
		},
	});
	const editor = disposableStore.add(instantiationService.createInstance(SearchEditor, group));
	editor.create(groupContainer);
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
});
