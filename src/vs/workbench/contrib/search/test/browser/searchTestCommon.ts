/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isWindows } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { IModelService } from 'vs/editor/common/services/model';
import { ModelService } from 'vs/editor/common/services/modelService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { TestThemeService } from 'vs/platform/theme/test/common/testThemeService';
import { INotebookEditorService } from 'vs/workbench/contrib/notebook/browser/services/notebookEditorService';
import { NotebookEditorWidgetService } from 'vs/workbench/contrib/notebook/browser/services/notebookEditorServiceImpl';
import { SearchResult } from 'vs/workbench/contrib/search/browser/searchModel';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IFileMatch } from 'vs/workbench/services/search/common/search';
import { TestEditorGroupsService } from 'vs/workbench/test/browser/workbenchTestServices';

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

export function stubModelService(instantiationService: TestInstantiationService): IModelService {
	instantiationService.stub(IThemeService, new TestThemeService());
	const config = new TestConfigurationService();
	config.setUserConfiguration('search', { searchOnType: true });
	instantiationService.stub(IConfigurationService, config);
	return instantiationService.createInstance(ModelService);
}

export function stubNotebookEditorService(instantiationService: TestInstantiationService): INotebookEditorService {
	instantiationService.stub(IEditorGroupsService, new TestEditorGroupsService());
	return instantiationService.createInstance(NotebookEditorWidgetService);
}

export function addToSearchResult(searchResult: SearchResult, allRaw: IFileMatch[], searchInstanceID = '') {
	searchResult.add(allRaw, searchInstanceID);
}
