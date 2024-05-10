/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { isWindows } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { IModelService } from 'vs/editor/common/services/model';
import { ModelService } from 'vs/editor/common/services/modelService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { MockContextKeyService } from 'vs/platform/keybinding/test/common/mockKeybindingService';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { TestThemeService } from 'vs/platform/theme/test/common/testThemeService';
import { INotebookEditorService } from 'vs/workbench/contrib/notebook/browser/services/notebookEditorService';
import { NotebookEditorWidgetService } from 'vs/workbench/contrib/notebook/browser/services/notebookEditorServiceImpl';
import { SearchResult } from 'vs/workbench/contrib/search/browser/searchModel';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IFileMatch } from 'vs/workbench/services/search/common/search';
import { TestEditorGroupsService, TestEditorService } from 'vs/workbench/test/browser/workbenchTestServices';

export function createFileUriFromPathFromRoot(path?: string): URI {
	const rootName = getRootName();
	if (path) {
		return URI.file(`${rootName}${path}`);
	} else {
		if (isWindows) {
			return URI.file(`${rootName}/`);
		} else {
			return URI.file(rootName);
		}
	}
}

export function getRootName(): string {
	if (isWindows) {
		return 'c:';
	} else {
		return '';
	}
}

export function stubModelService(instantiationService: TestInstantiationService, addDisposable: (e: IDisposable) => void): IModelService {
	instantiationService.stub(IThemeService, new TestThemeService());
	const config = new TestConfigurationService();
	config.setUserConfiguration('search', { searchOnType: true });
	instantiationService.stub(IConfigurationService, config);
	const modelService = instantiationService.createInstance(ModelService);
	addDisposable(modelService);
	return modelService;
}

export function stubNotebookEditorService(instantiationService: TestInstantiationService, addDisposable: (e: IDisposable) => void): INotebookEditorService {
	instantiationService.stub(IEditorGroupsService, new TestEditorGroupsService());
	instantiationService.stub(IContextKeyService, new MockContextKeyService());
	const es = new TestEditorService();
	addDisposable(es);
	instantiationService.stub(IEditorService, es);
	const notebookEditorWidgetService = instantiationService.createInstance(NotebookEditorWidgetService);
	addDisposable(notebookEditorWidgetService);
	return notebookEditorWidgetService;
}

export function addToSearchResult(searchResult: SearchResult, allRaw: IFileMatch[], searchInstanceID = '') {
	searchResult.add(allRaw, searchInstanceID, false);
}
